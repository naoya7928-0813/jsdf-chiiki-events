import { useState, useEffect, useCallback, useMemo } from 'react';
import { F } from './Shared';
import { PREFECTURE_INFO } from '../data/regionMap';

// 過去イベント閲覧パネル（閲覧専用）。
// 「現在・今後のイベント」「監査履歴」とは別の画面として、終了済みイベントを権限範囲内で確認する。
// 権限・スコープはサーバー側（/api/admin/past-events）で強制。ここでの絞り込みは表示の補助のみ。

const STATUS_LABEL = { published: '公開中', draft: '下書き', closed: '締切', cancelled: '中止' };
const STATUS_COLOR = { published: '#16a34a', draft: '#888', closed: '#b45309', cancelled: '#ef4444' };
const PAGE = 50;

function fmtUpdated(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }); }
  catch { return String(s); }
}

export default function PastEventsPanel({ adminFetch, account, primary }) {
  const role = account?.role || '';
  const org = account?.organization ?? account?.pref ?? '*';
  const isNational = role === 'national_admin' || org === '*';
  const officeScoped = role === 'office_editor' || role === 'office_manager';

  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [prefFilter, setPrefFilter] = useState(''); // national のみ任意
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ events: [], total: 0, hasMore: false, note: '', reason: '' });
  const [state, setState] = useState('idle'); // idle|loading|ok|error|auth

  const input = { width: '100%', boxSizing: 'border-box', fontFamily: F.sans, fontSize: 13, color: 'var(--text)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', outline: 'none' };
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 4 };

  const query = useMemo(() => ({ q, from, to, status, pref: isNational ? prefFilter : '', limit: PAGE, offset }), [q, from, to, status, prefFilter, isNational, offset]);

  const load = useCallback(async (qy) => {
    if (!adminFetch) return; // 認証(adminFetch)確定前は取得しない（空結果を確定させない）
    setState('loading');
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(qy)) if (v !== '' && v != null) params.set(k, String(v));
      const r = await adminFetch(`/api/admin/past-events?${params.toString()}`);
      if (r.status === 401 || r.status === 403) { setState('auth'); return; }
      if (!r.ok) { setState('error'); return; }
      const j = await r.json();
      setData({ events: j.events || [], total: j.total || 0, hasMore: !!j.hasMore, note: j.note || '', reason: j.reason || '' });
      setState('ok');
    } catch { setState('error'); }
  }, [adminFetch]);

  // 初回 + offset 変更 + 認証(adminFetch)確定時に取得。
  // load は adminFetch を依存に持つため、account 確定で adminFetch が変わると再取得される
  // （account 確定前に空結果を読んだまま固定される問題を防ぐ）。
  useEffect(() => { load(query); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [offset, load]);

  const search = () => { if (offset !== 0) setOffset(0); else load(query); };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>過去イベント（閲覧専用）</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
        終了したイベントを確認できます（監査履歴・削除済みイベントとは別です）。終了後はアーカイブに保存され、後からも確認できます。
      </div>

      {/* 絞り込み */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={label}>タイトル・会場で検索</div>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search(); }} placeholder="キーワード" style={input} />
        </div>
        {/* 開始・終了は横並びだと日付入力が重なるため、それぞれ全幅で上下に分ける */}
        <div style={{ gridColumn: '1 / -1' }}><div style={label}>開始（以降）</div><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...input, minWidth: 0 }} /></div>
        <div style={{ gridColumn: '1 / -1' }}><div style={label}>終了（以前）</div><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...input, minWidth: 0 }} /></div>
        <div>
          <div style={label}>状態</div>
          <select value={status} onChange={e => setStatus(e.target.value)} style={input}>
            <option value="">すべて</option>
            {Object.entries(STATUS_LABEL).map(([v, jp]) => <option key={v} value={v}>{jp}</option>)}
          </select>
        </div>
        {isNational && (
          <div>
            <div style={label}>地本（任意）</div>
            <select value={prefFilter} onChange={e => setPrefFilter(e.target.value)} style={input}>
              <option value="">全国</option>
              {Object.entries(PREFECTURE_INFO).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <button onClick={search} style={{ width: '100%', padding: 11, borderRadius: 10, border: 'none', fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', background: primary, cursor: 'pointer', marginBottom: 14 }}>検索</button>
      {officeScoped && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>※ あなたの担当事務所のイベントのみ表示されます。</div>}

      {/* 状態表示（該当なし／範囲になし／保存期間外/取得失敗／認証を区別） */}
      {state === 'loading' && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>読み込み中…</div>}
      {state === 'auth' && <div style={{ fontSize: 12.5, color: '#ef4444', padding: '8px 0' }}>認証の有効期限が切れた可能性があります。再度ログインしてください。</div>}
      {state === 'error' && <div style={{ fontSize: 12.5, color: '#ef4444', padding: '8px 0' }}>過去イベントを取得できませんでした。通信状況を確認し、時間をおいて再度お試しください。</div>}
      {state === 'ok' && data.events.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0', lineHeight: 1.7 }}>
          {data.reason === 'data_unavailable'
            ? '現在、イベントデータを取得できませんでした。時間をおいて再度お試しください（データ取得の一時的な問題の可能性があります）。'
            : data.reason === 'filtered_empty'
              ? '検索条件に一致する過去イベントはありません。条件を変えて再検索してください。'
              : officeScoped
                ? '担当事務所に紐づく過去イベントはありません。中央で掲載されたイベントの担当割り当ては、地本管理者にご相談ください。'
                : '権限範囲内に、保存されている過去イベントはまだありません。（この機能の運用開始より前に終了したイベントは含まれない場合があります）'}
        </div>
      )}

      {/* 一覧（閲覧専用） */}
      {state === 'ok' && data.events.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>全 {data.total} 件中 {offset + 1}〜{offset + data.events.length} 件</div>
          {data.events.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: STATUS_COLOR[ev.status] || '#888', borderRadius: 5, padding: '2px 6px' }}>{STATUS_LABEL[ev.status] || ev.status || '—'}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: primary, background: `${primary}14`, borderRadius: 5, padding: '2px 6px' }}>{ev.source === 'manual' ? '手動' : 'スクレイピング'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{ev.title || '（無題）'}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 2px' }}>
                {(PREFECTURE_INFO[ev.pref]?.label || ev.pref || '—')}{ev.office ? `／${ev.office}` : ''}・{ev.date}{ev.endDate ? `〜${ev.endDate}` : ''}{ev.place ? `・${ev.place}` : ''}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.85, wordBreak: 'break-all' }}>
                ID: {ev.id}{ev.updatedAt ? `・最終更新 ${fmtUpdated(ev.updatedAt)}` : ''}
                {ev.url ? <> ・<a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: primary }}>公式ページ</a></> : ''}
              </div>
            </div>
          ))}
          {/* ページング */}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} style={{ flex: 1, padding: 10, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: offset === 0 ? 'default' : 'pointer', border: '1px solid var(--border)', background: 'var(--card)', color: offset === 0 ? 'var(--text-muted)' : 'var(--text)' }}>← 前へ</button>
            <button disabled={!data.hasMore} onClick={() => setOffset(offset + PAGE)} style={{ flex: 1, padding: 10, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: data.hasMore ? 'pointer' : 'default', border: '1px solid var(--border)', background: 'var(--card)', color: data.hasMore ? 'var(--text)' : 'var(--text-muted)' }}>次へ →</button>
          </div>
        </>
      )}

      {data.note && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--sep)' }}>{data.note}</div>}
    </div>
  );
}
