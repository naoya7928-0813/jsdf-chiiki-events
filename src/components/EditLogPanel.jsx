// 運営画面: イベントの編集記録（誰が追加・修正したか）。/api/admin/history?targetId= から取得する。
// 記録はイベント本体／上書きの _log（最大50件）。監査権限があれば監査ログの該当分も表示する。
import { useEffect, useState } from 'react';
import { describeLog } from '../../shared/editLog.cjs';

const fmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // 日本時間で表示
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '/');
};

const AUDIT_LABEL = {
  'event.create': '追加', 'event.update': '修正', 'event.delete': '削除', 'override.save': '上書き修正', 'override.clear': '上書き取消',
  'event.change': '変更・中止の登録', 'event.change.visibility': '変更記録の公開切替', 'event.change.delete': '変更記録の取消',
  'event.change.notify': '変更の通知', 'event.guide': 'FAQ・ガイドの保存', 'event.image': '画像', 'audit.read': '記録の閲覧',
};

export default function EditLogPanel({ eventId, adminFetch, styles = {} }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    (async () => {
      try {
        const r = await adminFetch(`/api/admin/history?targetId=${encodeURIComponent(eventId)}`);
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setData(j); else setErr(j.error || '読み込めませんでした');
      } catch { if (alive) setErr('通信に失敗しました'); }
    })();
    return () => { alive = false; };
  }, [eventId, adminFetch]);

  const box = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 };
  return (
    <div>
      <div style={{ ...(styles.label || {}), marginTop: 14 }}>編集記録（誰が追加・修正したか）</div>
      <div style={box}>
        {err ? <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>
          : !data ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>読み込み中…</div>
          : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.7 }}>
                {data.kind === 'manual'
                  ? <>追加: <strong>{data.createdBy || '—'}</strong>（{fmt(data.createdAt)}）<br /></>
                  : <>自動収集イベント（運営による上書きの記録）<br /></>}
                最終更新: <strong>{data.updatedBy || '—'}</strong>（{fmt(data.updatedAt)}）
              </div>
              {data.log?.length > 0 ? (
                <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', maxHeight: 220, overflowY: 'auto' }}>
                  {data.log.map((e, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: 'var(--text-sub)', padding: '5px 0', borderTop: '1px solid var(--sep)' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(e.at)}</span>{' '}
                      <strong style={{ color: 'var(--text)' }}>{e.by || '—'}</strong>{' '}{describeLog(e)}
                    </li>
                  ))}
                </ul>
              ) : <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>この画面からの編集記録はまだありません（2026-10-13 以前の操作は監査ログにのみ残っています）。</div>}
              {Array.isArray(data.audit) && (
                <>
                  <button type="button" onClick={() => setShowAudit(v => !v)}
                    style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, background: 'none', border: 'none', color: 'var(--brand-fg)', cursor: 'pointer', padding: 0 }}>
                    {showAudit ? '監査ログを閉じる' : `監査ログ（${data.audit.length}件）を表示`}
                  </button>
                  {showAudit && (
                    <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', maxHeight: 220, overflowY: 'auto' }}>
                      {data.audit.map((h, i) => (
                        <li key={i} style={{ fontSize: 11, color: 'var(--text-sub)', padding: '4px 0', borderTop: '1px solid var(--sep)' }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(h.at)}</span>{' '}
                          <strong style={{ color: 'var(--text)' }}>{h.actorId || '—'}</strong>{' '}
                          {AUDIT_LABEL[h.action] || h.action}{h.result && h.result !== 'success' ? `（${h.result === 'denied' ? '拒否' : h.result}）` : ''}{h.note ? ` ${h.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
      </div>
    </div>
  );
}
