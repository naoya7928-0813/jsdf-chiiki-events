// 運営画面: イベント別の閲覧数。
//   ViewStatsPanel  … 「閲覧数」タブ。担当範囲のイベントを閲覧数で並べ替えて一覧する
//   EventViewStats  … イベント編集画面の閲覧統計（今日・7日・30日・累計と30日の推移）
// 数値は /api/admin/view-stats（担当範囲だけをサーバー側で絞り込み済み）。閲覧回数でありユニーク人数ではない。
import { useState, useEffect, useMemo } from 'react';
import { F } from './Shared';
import { PREFECTURE_INFO } from '../data/regionMap';
import { sortRows } from '../../shared/viewStats.cjs';
import ReportExport from './ReportExport';

const COLS = [
  ['title', 'イベント名'], ['pref', '開催地域'], ['date', '開催日'],
  ['total', '累計'], ['d7', '7日間'], ['d30', '30日間'],
];
const NUM = new Set(['total', 'today', 'd7', 'd30']);

export default function ViewStatsPanel({ adminFetch, primary, scopeLabel }) {
  const [data, setData] = useState(null);
  const [sortKey, setSortKey] = useState('d7');
  const [dir, setDir] = useState('desc');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await adminFetch('/api/admin/view-stats');
        const j = await r.json().catch(() => ({}));
        if (alive) setData(r.ok ? j : { error: j.error || '読み込めませんでした' });
      } catch { if (alive) setData({ error: '通信に失敗しました' }); }
    })();
    return () => { alive = false; };
  }, [adminFetch]);

  const rows = useMemo(() => {
    if (!data || !Array.isArray(data.rows)) return [];
    const s = q.trim();
    const filtered = s ? data.rows.filter(r => r.title.includes(s) || (PREFECTURE_INFO[r.pref]?.label || r.pref).includes(s)) : data.rows;
    // 地域は表示名で並べる
    const withLabel = filtered.map(r => ({ ...r, prefLabel: PREFECTURE_INFO[r.pref]?.label || r.pref }));
    if (sortKey === 'pref') {
      return [...withLabel].sort((a, b) => a.prefLabel.localeCompare(b.prefLabel, 'ja') * (dir === 'asc' ? 1 : -1));
    }
    return sortRows(withLabel, sortKey, dir);
  }, [data, q, sortKey, dir]);

  const clickSort = (k) => {
    if (k === sortKey) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setDir(NUM.has(k) ? 'desc' : 'asc'); }
  };

  if (!data) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>閲覧数を読み込み中…</div>;
  if (data.error) return <div style={{ fontSize: 12.5, color: '#ef4444' }}>{data.error}</div>;

  // 矢印の幅は常に確保する（選んだボタンだけ幅が変わると折り返し位置がずれ、
  // 「30日間」を選ぶと「7日間」が上の段へ移る不具合があった）
  const arrow = (k) => (
    <span aria-hidden="true" style={{ display: 'inline-block', width: '1em', textAlign: 'center', visibility: k === sortKey ? 'visible' : 'hidden' }}>
      {k === sortKey && dir === 'asc' ? '▲' : '▼'}
    </span>
  );
  return (
    <div>
      <ReportExport adminFetch={adminFetch} primary={primary} scopeLabel={scopeLabel} />
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>イベント別の閲覧数（{rows.length}件）</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 10 }}>
        イベント詳細が開かれた回数です（同じ人が開き直した回数も含むため、人数ではありません）。
        同じ端末・同じイベントは30分に1回まで数え、運営者の閲覧・検索エンジン等は数えません。日付は日本時間です。
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="イベント名・地域で絞り込み" aria-label="絞り込み"
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', marginBottom: 10 }} />
      {/* 並べ替え: 1行で横にスクロール（折り返さないので、選択しても並びが動かない） */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', marginBottom: 10, paddingBottom: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', flexShrink: 0 }}>並べ替え:</span>
        {COLS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => clickSort(k)} aria-pressed={k === sortKey}
            aria-label={k === sortKey ? `${l}（${dir === 'asc' ? '昇順' : '降順'}）` : l}
            style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, padding: '6px 8px 6px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${k === sortKey ? primary : 'var(--border)'}`, background: k === sortKey ? `${primary}18` : 'var(--card)',
              color: k === sortKey ? 'var(--brand-fg)' : 'var(--text-sub)' }}>{l}{arrow(k)}</button>
        ))}
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>該当するイベントがありません。</div> : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ padding: '10px 12px', borderTop: i ? '1px solid var(--sep)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>{r.title || r.id}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginTop: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>
                <span>{r.prefLabel}・{r.date}</span>
                <span style={{ marginLeft: 'auto', fontFamily: F.mono, color: 'var(--text)' }}>
                  累計 <strong>{r.total}</strong>　7日 <strong>{r.d7}</strong>　30日 <strong>{r.d30}</strong>　今日 {r.today}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** イベント編集画面の閲覧統計（30日の推移を棒で示す） */
export function EventViewStats({ eventId, adminFetch, primary }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await adminFetch(`/api/admin/view-stats?id=${encodeURIComponent(eventId)}`);
        const j = await r.json().catch(() => ({}));
        if (alive) setData(r.ok ? j : { error: j.error || '読み込めませんでした' });
      } catch { if (alive) setData({ error: '通信に失敗しました' }); }
    })();
    return () => { alive = false; };
  }, [adminFetch, eventId]);

  if (!data) return <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>閲覧統計を読み込み中…</div>;
  if (data.error) return <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>閲覧統計: {data.error}</div>;
  const series = Array.isArray(data.series) ? data.series : [];
  const max = Math.max(1, ...series.map(s => s.count));
  const cell = (label, v) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'var(--tag-bg)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: F.mono }}>{v ?? 0}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {cell('今日', data.today)}{cell('7日間', data.d7)}{cell('30日間', data.d30)}{cell('累計', data.total)}
      </div>
      <div role="img" aria-label={`過去30日の閲覧数の推移（最大 ${max} 回/日）`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44, padding: '0 2px' }}>
        {series.map(s => (
          <div key={s.day} title={`${s.day}: ${s.count}回`}
            style={{ flex: 1, minWidth: 0, height: `${Math.max(4, (s.count / max) * 100)}%`, borderRadius: 2, background: s.count ? primary : 'var(--border)', opacity: s.count ? 0.85 : 0.6 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
        <span>{series[0]?.day || ''}</span><span>今日</span>
      </div>
    </div>
  );
}
