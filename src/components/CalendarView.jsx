import { useMemo, useState } from 'react';
import { F } from './Shared';
import { ICO } from './Icons';
import { PREFECTURE_INFO } from '../data/regionMap';

// ── JST 日付ユーティリティ（YYYY-MM-DD 文字列ベース。TZ非依存） ──
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function ymd(y, m, d) {
  const p = n => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}
function addDaysStr(s, n) {
  const dt = new Date(s + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * カレンダー表示。カード表示と同じ（フィルタ適用済みの）イベント配列を受け取り、
 * 月グリッド上に開催日を点で示す。日をタップするとその日のイベント一覧を下に表示する。
 * 連日開催（endDate）は期間中の各日に表示する。
 */
export default function CalendarView({ events, onOpenDetail, primary, accent, favorites, applied, activePrefId }) {
  const today = jstToday();

  // 表示中の月（既定は今日の月）。矢印で前後に移動。
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));

  // 日付 → イベント配列 のマップ（連日は各日に登録）
  const byDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      if (!ev?.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) continue;
      const end = (ev.endDate && /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) && ev.endDate >= ev.date) ? ev.endDate : ev.date;
      let cur = ev.date, guard = 0;
      while (cur <= end && guard < 60) {
        (map[cur] = map[cur] || []).push(ev);
        cur = addDaysStr(cur, 1);
        guard++;
      }
    }
    return map;
  }, [events]);

  // 月内でイベントのある最初の日（初期選択・自動ジャンプ用）
  const monthPrefix = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const firstEventDayInMonth = useMemo(() => {
    const days = Object.keys(byDate).filter(d => d.startsWith(monthPrefix)).sort();
    return days[0] || null;
  }, [byDate, monthPrefix]);

  // 選択中の日（利用者がタップした日。未タップなら下の既定日を使う）
  const [selected, setSelected] = useState(null);

  // 月グリッド（日曜始まり）
  const cells = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
    const startWeekday = new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay(); // 0=日
    const arr = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(ymd(ym.y, ym.m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [ym]);

  const goMonth = (delta) => {
    setYm(prev => {
      let y = prev.y, m = prev.m + delta;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      // 月移動時はタップ選択を解除し、下の一覧は既定日（今日 or 先頭のイベント日）を出す
      setSelected(null);
      return { y, m };
    });
  };

  // 既定の表示日：今月かつ今日にイベントがあれば今日、無ければイベントのある最初の日
  const defaultDay = (today.startsWith(monthPrefix) && byDate[today]?.length)
    ? today
    : (firstEventDayInMonth || (today.startsWith(monthPrefix) ? today : null));
  const selDay = selected || defaultDay;
  const selEvents = selDay ? (byDate[selDay] || []) : [];

  const cellBtn = {
    border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
    aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 8,
    fontFamily: F.sans, position: 'relative',
  };

  return (
    <div style={{ padding: '4px 12px 12px' }}>
      {/* 月ナビゲーション */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '10px 0 8px' }}>
        <button onClick={() => goMonth(-1)} aria-label="前の月" style={navBtn}>
          <svg width="9" height="15" viewBox="0 0 8 14"><path d="M7 1L1 7l6 6" stroke="var(--brand-fg)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: 1, minWidth: 130, textAlign: 'center' }}>
          {ym.y}年 {ym.m}月
        </div>
        <button onClick={() => goMonth(1)} aria-label="次の月" style={navBtn}>
          <svg width="9" height="15" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke="var(--brand-fg)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* 曜日見出し */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {WEEK.map((w, i) => (
          <div key={w} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0',
            color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--text-muted)',
          }}>{w}</div>
        ))}
      </div>

      {/* 日グリッド */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, idx) => {
          if (!d) return <div key={`b${idx}`} />;
          const dayNum = Number(d.slice(8, 10));
          const wd = idx % 7;
          const cnt = (byDate[d] || []).length;
          const isToday = d === today;
          const isSel = d === selDay;
          const numColor = isToday ? '#fff' : wd === 0 ? '#dc2626' : wd === 6 ? '#2563eb' : 'var(--text)';
          return (
            <button key={d} onClick={() => setSelected(d)} style={{
              ...cellBtn,
              background: isSel ? `${primary}14` : 'transparent',
              boxShadow: isSel ? `inset 0 0 0 1.5px ${primary}` : 'none',
            }}>
              <span style={{
                fontSize: 13, fontWeight: isToday ? 700 : 500, lineHeight: 1,
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isToday ? primary : 'transparent', color: numColor,
                fontFamily: F.mono,
              }}>{dayNum}</span>
              {/* イベント数インジケータ（点＋件数） */}
              {cnt > 0 ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#fff', background: accent || primary,
                  minWidth: 15, height: 15, borderRadius: 8, padding: '0 4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.mono,
                }}>{cnt}</span>
              ) : (
                <span style={{ height: 15 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 選択日のイベント一覧 */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 8px' }}>
          <div style={{ fontFamily: F.serif, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {selDay ? `${Number(selDay.slice(5, 7))}月${Number(selDay.slice(8, 10))}日（${WEEK[new Date(selDay + 'T00:00:00Z').getUTCDay()]}）` : '—'}
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--month-sep)' }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono }}>{selEvents.length}件</div>
        </div>

        {selEvents.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            この日のイベントはありません
          </div>
        ) : (
          selEvents.map((ev, i) => (
            <div key={`${ev.id}#${i}`} onClick={() => onOpenDetail(ev)} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onOpenDetail(ev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-container, 12px)', padding: '11px 13px', marginBottom: 8,
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-tag, 2px)', background: 'var(--tag-bg)', color: 'var(--brand-fg)', letterSpacing: 0.5 }}>
                    {ev.category}
                  </span>
                  {ev.endDate && ev.endDate !== ev.date && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-fg)', fontFamily: F.mono }}>連日開催</span>
                  )}
                  {ev.ended && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#6b7280', color: '#fff' }}>終了済み</span>
                  )}
                  {applied?.has(ev.id) && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#16a34a', color: '#fff', fontFamily: F.mono }}>✓ 申請済</span>
                  )}
                  {favorites?.has(ev.id) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-fg)' }}>★</span>
                  )}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere',
                }}>{ev.title}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11.5, color: 'var(--text-sub)', flexWrap: 'wrap' }}>
                  {ev.time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{ICO.clock('var(--text-sub)', 11)}{ev.time}</span>}
                  {ev.place && String(ev.place).trim() && (
                    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
                      <span style={{ flexShrink: 0, marginTop: 1, display: 'flex' }}>{ICO.pin('var(--text-sub)', 11)}</span>
                      <span style={{ overflowWrap: 'anywhere' }}>{ev.place}</span>
                    </span>
                  )}
                  {activePrefId === 'all' && ev.pref && (
                    <span style={{ color: 'var(--text-muted)', fontFamily: F.mono }}>{(PREFECTURE_INFO[ev.pref]?.label ?? ev.pref)}地本</span>
                  )}
                </div>
              </div>
              {ICO.chev('var(--icon-muted)', 12)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const navBtn = {
  width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--tag-bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
};
