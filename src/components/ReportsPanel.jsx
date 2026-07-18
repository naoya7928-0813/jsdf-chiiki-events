import { useState, useEffect, useCallback } from 'react';
import { F } from './Shared';

// 利用者からの報告（バグ・表記の誤り・要望等）の運営閲覧パネル。
// 認可はサーバー側（/api/report, report:read 必須）で強制。
// 個人情報保護: 連絡先は既定で伏字。実値の表示・削除はサーバーで監査ログに残る。
// 本文・連絡先・端末情報は公開型サービス（ntfy）には送られず、ここでのみ閲覧する。

const CAT_COLOR = {
  'バグ': '#ef4444', '表示崩れ': '#f59e0b', 'イベント情報の誤り': '#3b82f6',
  '表記の誤り': '#8b5cf6', '要望': '#16a34a', 'その他': '#6b7280', '未分類': '#6b7280',
};

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    });
  } catch { return ''; }
}

export default function ReportsPanel({ adminFetch, primary }) {
  const [reports, setReports] = useState([]);
  const [unread, setUnread] = useState(0);
  const [ttlDays, setTtlDays] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);      // 展開中の報告 id
  const [revealed, setRevealed] = useState({});        // id -> 連絡先実値（表示要求済み）

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await adminFetch('/api/report?limit=200');
      if (r.status === 403) { setError('この画面を表示する権限がありません。'); setReports([]); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setReports(j.reports || []);
      setUnread(j.unread || 0);
      setTtlDays(j.ttlDays || 60);
    } catch {
      setError('報告の取得に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id, read) {
    try {
      const r = await adminFetch('/api/report', { method: 'PATCH', body: JSON.stringify({ id, read }) });
      if (r.ok) {
        setReports(rs => rs.map(x => x.id === id ? { ...x, read } : x));
        setUnread(u => Math.max(0, u + (read ? -1 : 1)));
      }
    } catch { /* noop */ }
  }

  async function setResolved(id, status) {
    try {
      const r = await adminFetch('/api/report', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      if (r.ok) setReports(rs => rs.map(x => x.id === id ? { ...x, status } : x));
    } catch { /* noop */ }
  }

  async function reveal(id) {
    try {
      const r = await adminFetch(`/api/report?reveal=1&limit=200`);
      if (r.ok) {
        const j = await r.json();
        const found = (j.reports || []).find(x => x.id === id);
        setRevealed(m => ({ ...m, [id]: (found && found.contact) || '（未記入）' }));
      }
    } catch { /* noop */ }
  }

  async function remove(id) {
    if (!window.confirm('この報告を削除します。連絡先などの個人情報も消去され、元に戻せません。よろしいですか？')) return;
    try {
      const r = await adminFetch('/api/report', { method: 'DELETE', body: JSON.stringify({ id }) });
      if (r.ok) {
        setReports(rs => rs.filter(x => x.id !== id));
        setRevealed(m => { const n = { ...m }; delete n[id]; return n; });
      }
    } catch { /* noop */ }
  }

  const card = {
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '12px 14px', marginBottom: 10,
  };
  const chip = (bg, color) => ({
    display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    background: bg, color,
  });
  const miniBtn = (on) => ({
    padding: '5px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: F.sans,
    border: `1px solid ${on ? primary : 'var(--border)'}`,
    background: on ? `${primary}14` : 'var(--card)', color: on ? primary : 'var(--text-sub)',
  });

  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          利用者からの報告
          {unread > 0 && (
            <span style={{ ...chip('#ef4444', '#fff'), marginLeft: 8 }}>未読 {unread}</span>
          )}
        </div>
        <button onClick={load} style={{ ...miniBtn(false), marginLeft: 'auto' }}>更新</button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 14 }}>
        本文・連絡先・端末情報はこの運営画面でのみ閲覧できます（外部通知には含まれません）。
        各報告は約{ttlDays}日後に自動削除されます。連絡先は既定で伏字表示です。
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>読み込み中…</div>
      ) : error ? (
        <div style={{ fontSize: 12.5, color: '#ef4444' }}>{error}</div>
      ) : reports.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>報告はまだありません。</div>
      ) : reports.map((r) => {
        const open = expanded === r.id;
        const catColor = CAT_COLOR[r.category] || '#6b7280';
        return (
          <div key={r.id} style={{ ...card, opacity: r.read ? 0.72 : 1, borderLeft: `3px solid ${r.read ? 'var(--border)' : catColor}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={chip(`${catColor}18`, catColor)}>{r.category}</span>
              {!r.read && <span style={chip('#ef444418', '#ef4444')}>未読</span>}
              {r.status === 'resolved' && <span style={chip('#16a34a18', '#16a34a')}>対応済み</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: F.mono }}>
                {fmtWhen(r.at)}
              </span>
            </div>

            <div
              onClick={() => setExpanded(open ? null : r.id)}
              style={{
                fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginTop: 8, cursor: 'pointer',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
              }}
            >
              {r.message}
            </div>

            {open && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                {/* 連絡先（伏字→要求時のみ実値） */}
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>連絡先: </span>
                  {r.hasContact ? (
                    revealed[r.id] != null ? (
                      <span style={{ fontFamily: F.mono, color: 'var(--text)' }}>{revealed[r.id]}</span>
                    ) : (
                      <>
                        <span style={{ fontFamily: F.mono, color: 'var(--text-sub)' }}>{r.contactMasked}</span>
                        <button onClick={() => reveal(r.id)} style={{ ...miniBtn(false), marginLeft: 8, padding: '2px 9px' }}>表示</button>
                      </>
                    )
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>未記入</span>
                  )}
                </div>

                {/* 対象イベント（詳細から報告された場合） */}
                {r.context?.eventTitle && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 6 }}>
                    対象イベント: {r.context.eventTitle}
                    {r.context.eventDate ? `（${r.context.eventDate}）` : ''}
                    {r.context.pref ? ` / ${r.context.pref}` : ''}
                  </div>
                )}

                {/* 状況（端末・環境） */}
                <div style={{
                  fontSize: 10.5, color: 'var(--text-muted)', fontFamily: F.mono, lineHeight: 1.7,
                  wordBreak: 'break-all', background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 10px', marginBottom: 10,
                }}>
                  {r.context?.url && <>URL: {r.context.url}<br /></>}
                  {r.context?.version && <>バージョン: {r.context.version}<br /></>}
                  {r.context?.ua && <>端末: {r.context.ua}<br /></>}
                  {r.context?.size && <>画面: {r.context.size}<br /></>}
                  {r.context?.updatedAt && <>データ更新: {r.context.updatedAt}</>}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => markRead(r.id, !r.read)} style={miniBtn(false)}>
                    {r.read ? '未読に戻す' : '既読にする'}
                  </button>
                  <button onClick={() => setResolved(r.id, r.status === 'resolved' ? 'open' : 'resolved')} style={miniBtn(r.status === 'resolved')}>
                    {r.status === 'resolved' ? '未対応に戻す' : '対応済みにする'}
                  </button>
                  <button onClick={() => remove(r.id)} style={{ ...miniBtn(false), color: '#ef4444', borderColor: '#ef444455', marginLeft: 'auto' }}>
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
