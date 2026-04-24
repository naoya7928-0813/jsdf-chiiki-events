import { useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, splitDate } from './Shared';
import { SUPPORTED_PREFECTURES, PREFECTURE_INFO } from '../data/regionMap';

// ─── お気に入り一覧画面 ───────────────────────────────────────
// DetailScreen でスター登録したイベントを一覧表示する。
// ListScreen と同じカード形式を使用。
export default function FavoritesScreen({
  events, favorites, theme,
  onOpenDetail, onBack,
  onOpenHome, onOpenRegion, onOpenSettings,
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

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
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
          else if (id === 'list') onOpenRegion(null);
          else if (id === 'settings') onOpenSettings();
        }}
        primary={primary}
      />
    </div>
  );
}

// ─── お気に入りカード（ListScreen と同形式） ─────────────────
function FavCard({ ev, primary, accent, onTap }) {
  const { m, d } = splitDate(ev.date);
  const isWeekend  = /[土日祝]/.test(ev.weekday);
  const dateColor  = isWeekend ? accent : primary;

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
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: F.mono, letterSpacing: 1 }}>{m}月</div>
          <div style={{ fontFamily: F.serif, fontSize: 26, fontWeight: 600, lineHeight: 1, color: dateColor, marginTop: 2 }}>{d}</div>
          <div style={{ fontSize: 9, marginTop: 3, color: dateColor, fontWeight: 500 }}>({ev.weekday})</div>
        </div>

        {/* テキスト */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 3, background: 'var(--tag-bg)', color: primary, letterSpacing: 0.5,
            }}>{ev.category}</span>
            {ev.tag && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{ev.tag}</span>}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-sub)' }}>
            {ICO.pin('var(--text-sub)', 12)} {ev.place}
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
        marginTop: 8, lineHeight: 1.7,
      }}>
        イベント詳細画面の{' '}
        <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
          {ICO.star(accent, 14, 'none')}
        </span>
        {' '}をタップすると<br />ここに保存されます
      </div>
    </div>
  );
}
