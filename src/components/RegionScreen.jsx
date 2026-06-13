import { useState, useMemo } from 'react';
import { ICO } from './Icons';
import { F, ScreenHeader, BottomTabBar, splitDate } from './Shared';
import { REGION_BY_ID, SUPPORTED_PREFECTURES } from '../data/regionMap';
import { deadlineDaysUntil, daysUntil, daysLabel, daysColor } from '../utils/date';

// ─── 地域画面（都道府県タブ + イベント一覧） ─────────────────────
export default function RegionScreen({
  regionId, events, theme, favorites, applied,
  onBack, onOpenDetail, onOpenHome, onOpenList, onOpenFavorites, onOpenSettings,
}) {
  const { primary, accent } = theme;
  const region = REGION_BY_ID[regionId];

  const prefectures = region?.prefectures ?? [];

  // 初期タブ：対応済み都道府県の先頭
  const defaultPrefId = prefectures.find(p => SUPPORTED_PREFECTURES.has(p.id))?.id ?? prefectures[0]?.id;
  const [activePrefId, setActivePrefId] = useState(defaultPrefId);

  const activeList = useMemo(
    () => {
      const evs = SUPPORTED_PREFECTURES.has(activePrefId) ? (events[activePrefId] ?? []) : [];
      // 終了済みは非表示（お気に入り登録済みのみ7日間は表示）
      return [...evs]
        .filter(ev => !ev.ended || (favorites?.has(ev.id) ?? false))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    },
    [activePrefId, events, favorites]
  );

  if (!region) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>地域が見つかりません</div>
        <button
          onClick={onBack}
          style={{
            marginTop: 16, padding: '8px 20px', borderRadius: 8, border: 'none',
            background: 'var(--border)', color: 'var(--text)', fontSize: 13,
            cursor: 'pointer', fontFamily: F.sans,
          }}
        >ホームに戻る</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>

      {/* ─ ヘッダー ─ */}
      <ScreenHeader
        primary={primary}
        title={region.label}
        subtitle="REGION"
        onBack={onBack}
        trailing={
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: F.mono, letterSpacing: 0.5 }}>
            {prefectures.filter(p => SUPPORTED_PREFECTURES.has(p.id)).length} 地本対応
          </div>
        }
      />

      {/* ─ 都道府県タブ（横スクロール） ─ */}
      <div style={{ background: primary, paddingBottom: 10, flexShrink: 0 }}>
        <div style={{
          display: 'flex', overflowX: 'auto', padding: '0 16px', gap: 6,
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        }}>
          {prefectures.map(pref => {
            const isSupported = SUPPORTED_PREFECTURES.has(pref.id);
            const isActive    = activePrefId === pref.id;
            const count       = isSupported ? (events[pref.id] ?? []).length : 0;

            return (
              <button
                key={pref.id}
                disabled={!isSupported}
                onClick={() => isSupported && setActivePrefId(pref.id)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive
                    ? '#fff'
                    : isSupported
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.05)',
                  color: isActive
                    ? primary
                    : isSupported
                      ? '#fff'
                      : 'rgba(255,255,255,0.3)',
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  fontFamily: F.sans, cursor: isSupported ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {pref.label}
                {/* 件数バッジ */}
                {isSupported && count > 0 && (
                  <span style={{
                    fontSize: 10, fontFamily: F.mono, fontWeight: 700,
                    padding: '1px 5px', borderRadius: 6,
                    background: isActive ? primary : 'rgba(255,255,255,0.25)',
                    color: '#fff',
                    minWidth: 18, textAlign: 'center',
                  }}>
                    {count}
                  </span>
                )}
                {/* 未対応バッジ */}
                {!isSupported && (
                  <span style={{
                    fontSize: 9, fontFamily: F.mono,
                    padding: '1px 4px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.25)',
                  }}>
                    準備中
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─ イベント一覧 ─ */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 0 0' }}>
        {!SUPPORTED_PREFECTURES.has(activePrefId) ? (
          <ComingSoon primary={primary} prefLabel={prefectures.find(p => p.id === activePrefId)?.label} />
        ) : activeList.length === 0 ? (
          <EmptyEvents />
        ) : (
          activeList.map(ev => (
            <EventCard
              key={ev.id}
              ev={ev}
              isFav={favorites.has(ev.id)}
              primary={primary}
              accent={accent}
              onTap={() => onOpenDetail(ev)}
            />
          ))
        )}
      </div>

      {/* ─ タブバー ─ */}
      <BottomTabBar
        active="list"
        onChange={id => {
          if (id === 'home')           onOpenHome();
          else if (id === 'list')      onOpenList?.();
          else if (id === 'favorites') onOpenFavorites?.();
          else if (id === 'settings')  onOpenSettings?.();
        }}
        primary={primary}
      />
    </div>
  );
}

// ─── イベントカード ───────────────────────────────────────────
function EventCard({ ev, isFav, primary, accent, onTap }) {
  const TODAY_STR = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
  const { m, d }  = splitDate(ev.date);
  const endSplit  = ev.endDate ? splitDate(ev.endDate) : null;
  const isWeekend = /[土日祝]/.test(ev.weekday);
  const dayColor  = isWeekend ? accent : primary;
  const isOngoing = !!(ev.endDate && ev.date < TODAY_STR);
  const dlDays       = deadlineDaysUntil(ev.deadline);
  const showUrgent   = dlDays != null && dlDays >= 0 && dlDays <= 3;
  const showDeadline = dlDays != null && dlDays >= 0 && dlDays <= 7;
  const eventDays    = daysUntil(ev.endDate || ev.date);
  const showEvent    = !isOngoing && eventDays >= 0 && eventDays <= 7;

  return (
    <div
      onClick={onTap}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onTap()}
      style={{
        margin: '0 16px 10px',
        background: 'var(--card)',
        borderRadius: 12,
        border: showUrgent
          ? `1px solid ${daysColor(dlDays, primary, accent)}44`
          : '1px solid var(--border)',
        cursor: 'pointer', overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px', gap: 12, alignItems: 'center' }}>
        {/* 日付列 */}
        <div style={{ minWidth: 46, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: dayColor, fontFamily: F.mono }}>
            {endSplit && endSplit.m !== m ? `${m}〜${endSplit.m}月` : `${m}月`}
          </div>
          <div style={{ fontFamily: F.serif, fontSize: endSplit ? 14 : 22, fontWeight: 600, lineHeight: 1, color: dayColor, marginTop: 2 }}>
            {endSplit ? `${d}〜${endSplit.d}日` : d}
          </div>
          <div style={{ fontSize: 9, color: dayColor, marginTop: 2 }}>
            {ev.endWeekday ? `${ev.weekday}〜${ev.endWeekday}` : ev.weekday}
          </div>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

        {/* 内容列 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            {ev.ended && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#6b7280', color: '#fff', letterSpacing: 0.5 }}>終了済み</span>
            )}
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 3,
              background: `${primary}18`, color: primary,
              fontWeight: 600, letterSpacing: 0.5,
            }}>
              {ev.category}
            </span>
            {ev.tag && (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 3,
                background: ev.tag === '応募終了' ? '#fee2e2' : 'var(--tag-bg)',
                color: ev.tag === '応募終了' ? '#b91c1c' : 'var(--text-muted)',
                fontWeight: 500,
              }}>
                {ev.tag}
              </span>
            )}
            {isOngoing && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#22c55e22', color: '#15803d', fontFamily: F.mono }}>
                開催中
              </span>
            )}
          </div>

          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text)',
            lineHeight: 1.4, marginBottom: 5,
            display: 'flex', alignItems: 'flex-start', gap: 4,
          }}>
            <span style={{ flex: 1 }}>{ev.title}</span>
            {isFav && ICO.star(accent, 12, accent)}
            {applied?.has(ev.id) && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                background: '#16a34a', color: '#fff',
                fontFamily: F.mono, letterSpacing: 0.5, flexShrink: 0,
              }}>✓ 申請済</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-sub)' }}>
            {ICO.pin('var(--text-sub)', 11)} {ev.place}
          </div>

          {/* 締切バッジ（7日以内） */}
          {showDeadline && (
            <div style={{
              marginTop: 6,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600,
              color: daysColor(dlDays, primary, accent),
              background: `${daysColor(dlDays, primary, accent)}14`,
              padding: '2px 8px', borderRadius: 4,
            }}>
              {ICO.clock(daysColor(dlDays, primary, accent), 11)}
              締切 {daysLabel(dlDays, 'deadline')} — {ev.deadline}
            </div>
          )}
          {/* 開催カウントダウン（7日以内・締切バッジ非表示時） */}
          {showEvent && !showDeadline && (
            <div style={{
              marginTop: 6,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 600,
              color: daysColor(eventDays, primary, accent),
              background: `${daysColor(eventDays, primary, accent)}14`,
              padding: '2px 8px', borderRadius: 4,
            }}>
              {ICO.clock(daysColor(eventDays, primary, accent), 11)}
              {daysLabel(eventDays, 'event')}
            </div>
          )}
        </div>

        {ICO.chev('var(--icon-muted)', 12)}
      </div>
    </div>
  );
}

// ─── 準備中 ───────────────────────────────────────────────────
function ComingSoon({ primary, prefLabel }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 32px', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: `${primary}10`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={primary} strokeWidth="1.5" strokeOpacity="0.4"/>
          <path d="M12 8v4l3 3" stroke={primary} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4"/>
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>
        {prefLabel ? `${prefLabel}のデータは準備中` : 'この都道府県は準備中'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
        順次対応予定です
      </div>
    </div>
  );
}

// ─── イベントなし ─────────────────────────────────────────────
function EmptyEvents() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 32px', textAlign: 'center',
    }}>
      {ICO.cal('var(--icon-muted)', 40)}
      <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 16, fontWeight: 500 }}>
        現在イベントはありません
      </div>
    </div>
  );
}
