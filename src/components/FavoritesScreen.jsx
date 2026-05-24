import { useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, splitDate } from './Shared';
import { SUPPORTED_PREFECTURES, PREFECTURE_INFO } from '../data/regionMap';
import { deadlineDaysUntil, daysUntil, daysLabel, daysColor } from '../utils/date';

// ─── お気に入り一覧画面 ───────────────────────────────────────
// DetailScreen でスター登録したイベントを一覧表示する。
// ListScreen と同じカード形式を使用。
export default function FavoritesScreen({
  events, favorites, applied, theme,
  onOpenDetail, onBack,
  onOpenHome, onOpenList, onOpenRegion, onOpenSettings,
}) {
  const { primary, accent } = theme;

  // favorites は Set<string>（イベントID）
  const favEvents = useMemo(() => {
    const all = [];
    for (const prefId of SUPPORTED_PREFECTURES) {
      const info  = PREFECTURE_INFO[prefId];
      const label = info ? `${info.label}地本` : prefId;
      for (const ev of (events[prefId] ?? [])) {
        all.push({ ...ev, regionLabel: label });
      }
    }
    return all
      .filter(ev => favorites.has(ev.id))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, favorites]);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', fontFamily: F.sans,
    }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 10px' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>FAVORITES</div>
            <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: 1, marginTop: 2 }}>お気に入り</div>
          </div>
          {/* 件数バッジ */}
          {favEvents.length > 0 && (
            <div style={{
              padding: '4px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              fontSize: 12, color: '#fff', fontFamily: F.mono, fontWeight: 600,
            }}>
              {favEvents.length}件
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)' }}>
        {favEvents.length === 0 ? (
          <EmptyState primary={primary} accent={accent} />
        ) : (
          <div style={{ padding: '12px 0 8px' }}>
            {favEvents.map(ev => (
              <FavCard
                key={ev.id}
                ev={ev}
                primary={primary}
                accent={accent}
                applied={applied}
                onTap={onOpenDetail}
              />
            ))}
          </div>
        )}
      </div>

      <BottomTabBar
        active="favorites"
        onChange={id => {
          if (id === 'home')     onOpenHome();
          else if (id === 'list') onOpenList();
          else if (id === 'settings') onOpenSettings();
        }}
        primary={primary}
      />
    </div>
  );
}

// ─── お気に入りカード（ListScreen と同形式） ─────────────────
function FavCard({ ev, primary, accent, applied, onTap }) {
  const { m, d }  = splitDate(ev.date);
  const endSplit  = ev.endDate ? splitDate(ev.endDate) : null;
  const isWeekend = /[土日祝]/.test(ev.weekday);
  const dateColor = isWeekend ? accent : primary;
  const todayStr  = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
  const isOngoing = !!(ev.endDate && ev.date < todayStr);
  const dlDays    = deadlineDaysUntil(ev.deadline);
  const showDl    = dlDays != null && dlDays >= 0 && dlDays <= 3;
  const eventDays = daysUntil(ev.endDate || ev.date);
  const showEvent = !isOngoing && eventDays >= 0 && eventDays <= 7;

  return (
    <div
      onClick={() => onTap(ev)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onTap(ev)}
      style={{
        background: 'var(--card)', margin: '0 16px 10px', borderRadius: 12,
        border: '1px solid var(--border)', cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(11,37,69,0.04),0 2px 8px rgba(11,37,69,0.05)',
      }}
    >
      <div style={{ display: 'flex', padding: '14px 16px', gap: 14 }}>
        {/* 日付バッジ */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minWidth: 48, borderRight: '1px solid var(--border)', paddingRight: 12,
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: F.mono, letterSpacing: 1 }}>
            {endSplit && endSplit.m !== m ? `${m}〜${endSplit.m}月` : `${m}月`}
          </div>
          <div style={{ fontFamily: F.serif, fontSize: endSplit ? 16 : 26, fontWeight: 600, lineHeight: 1, color: dateColor, marginTop: 2 }}>
            {endSplit ? `${d}〜${endSplit.d}日` : d}
          </div>
          {ev.weekday && (
            <div style={{ fontSize: 9, marginTop: 3, color: dateColor, fontWeight: 500 }}>
              ({ev.endWeekday ? `${ev.weekday}〜${ev.endWeekday}` : ev.weekday})
            </div>
          )}
        </div>

        {/* テキスト */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 3, background: 'var(--tag-bg)', color: primary, letterSpacing: 0.5,
            }}>{ev.category}</span>
            {ev.tag && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{ev.tag}</span>}
            {applied?.has(ev.id) && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: '#16a34a', color: '#fff',
                fontFamily: F.mono, letterSpacing: 0.5, flexShrink: 0,
              }}>✓ 申請済</span>
            )}
            {isOngoing && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#22c55e22', color: '#15803d', fontFamily: F.mono }}>
                開催中
              </span>
            )}
            {showDl && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: '#f9731622', color: '#f97316', fontFamily: F.mono, letterSpacing: 0.5,
              }}>
                締切 {daysLabel(dlDays, 'deadline')}
              </span>
            )}
            {showEvent && !showDl && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: `${daysColor(eventDays, primary, accent)}18`,
                color: daysColor(eventDays, primary, accent), fontFamily: F.mono, letterSpacing: 0.5,
              }}>
                {daysLabel(eventDays, 'event')}
              </span>
            )}
            {/* 地本ラベル */}
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono, marginLeft: 'auto' }}>
              {ev.regionLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, letterSpacing: 0.2 }}>
              {ev.title}
            </div>
            {/* 塗りつぶしスター（お気に入り済みを明示） */}
            {ICO.star(accent, 13, accent)}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, color: 'var(--text-sub)' }}>
            <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}>{ICO.pin('var(--text-sub)', 12)}</span>
            {ev.place}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>{ICO.chev('var(--icon-muted)', 12)}</div>
      </div>
    </div>
  );
}

// ─── 空状態 ───────────────────────────────────────────────────
function EmptyState({ primary, accent }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 32px', textAlign: 'center',
    }}>
      {ICO.star('var(--icon-muted)', 44)}
      <div style={{
        fontSize: 15, color: 'var(--text-muted)',
        fontFamily: F.sans, marginTop: 16, fontWeight: 500,
      }}>
        お気に入りはまだありません
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-muted)',
        marginTop: 12, lineHeight: 1.9, textAlign: 'left',
        background: 'var(--card)', borderRadius: 10, padding: '12px 16px',
        border: '1px solid var(--border)',
      }}>
        <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text)', fontSize: 11 }}>登録方法</div>
        <div>① 一覧からイベントをタップ</div>
        <div>② 詳細画面の右上{' '}
          <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
            {ICO.star(accent, 13, 'none')}
          </span>
          {' '}をタップして登録
        </div>
        <div>③ このページに保存されます</div>
      </div>
    </div>
  );
}
