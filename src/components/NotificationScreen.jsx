import { useEffect, useMemo } from 'react';
import { ICO } from './Icons';
import { F, ScreenHeader, splitDate } from './Shared';

// ─── 通知一覧画面 ─────────────────────────────────────────────
// ベルアイコンから遷移。全イベントを通知アイテムとして表示し、
// 未読（前回アクセス以降に追加されたもの）を強調表示する。
export default function NotificationScreen({
  events, seenIds, theme, onMarkAllRead, onOpenDetail, onBack,
}) {
  const { primary, accent } = theme;

  // ── 通知アイテム生成（両地本合算 → 日付昇順 → 未読を先頭へ）──
  const items = useMemo(() => {
    const all = [
      ...(events.kanagawa ?? []).map(ev => ({ ...ev, regionLabel: '神奈川地本' })),
      ...(events.tokyo    ?? []).map(ev => ({ ...ev, regionLabel: '東京地本'   })),
    ];
    return all
      .map(ev => ({ ...ev, isNew: !seenIds.includes(ev.id) }))
      .sort((a, b) => {
        // 未読を先頭に、同じ既読状態なら日付順
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
        return new Date(a.date) - new Date(b.date);
      });
  }, [events, seenIds]);

  // 画面が開かれた時点で全IDを既読化
  useEffect(() => {
    const ids = [
      ...(events.kanagawa ?? []),
      ...(events.tokyo    ?? []),
    ].map(e => e.id);
    onMarkAllRead(ids);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadItems = items.filter(i => i.isNew);

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', fontFamily: F.sans,
    }}>
      <ScreenHeader
        primary={primary}
        title="通知"
        subtitle="NOTIFICATIONS"
        onBack={onBack}
        trailing={
          unreadItems.length > 0 ? (
            <div style={{
              padding: '3px 10px', borderRadius: 12,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              fontSize: 11, color: '#fff', fontFamily: F.mono, letterSpacing: 0.5,
            }}>
              {unreadItems.length} NEW
            </div>
          ) : null
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 0 8px' }}>
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 未読セクション */}
            {unreadItems.length > 0 && (
              <SectionLabel>新着</SectionLabel>
            )}

            {items.map((ev, idx) => {
              // 未読→既読の境目にセクションラベルを挿入
              const prevIsNew = idx > 0 ? items[idx - 1].isNew : ev.isNew;
              const showReadLabel = !ev.isNew && prevIsNew && items.some(i => !i.isNew);
              return (
                <div key={ev.id}>
                  {showReadLabel && <SectionLabel>既読</SectionLabel>}
                  <NotifCard
                    ev={ev}
                    primary={primary}
                    accent={accent}
                    onTap={onOpenDetail}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 通知カード ───────────────────────────────────────────────
function NotifCard({ ev, primary, accent, onTap }) {
  const { m, d } = splitDate(ev.date);
  const isWeekend = /[土日祝]/.test(ev.weekday);

  return (
    <div
      onClick={() => onTap(ev)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onTap(ev)}
      style={{
        margin: '0 16px 8px',
        borderRadius: 12,
        border: `1px solid ${ev.isNew ? `${primary}33` : 'var(--border)'}`,
        background: ev.isNew ? `${primary}0a` : 'var(--card)',
        cursor: 'pointer', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px', gap: 12, alignItems: 'center' }}>
        {/* 未読ドット + 日付バッジ */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
          {ev.isNew ? (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: accent, marginBottom: 6, flexShrink: 0,
            }} />
          ) : (
            <div style={{ width: 8, height: 8, marginBottom: 6 }} />
          )}
          <div style={{
            fontSize: 9, color: isWeekend ? accent : primary,
            fontFamily: F.mono, letterSpacing: 0.5, textAlign: 'center',
          }}>{m}月</div>
          <div style={{
            fontFamily: F.serif, fontSize: 20, fontWeight: 600,
            lineHeight: 1, color: isWeekend ? accent : primary, marginTop: 1,
          }}>{d}</div>
          <div style={{ fontSize: 9, color: isWeekend ? accent : primary, marginTop: 2 }}>
            {ev.weekday}
          </div>
        </div>

        {/* 区切り線 */}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

        {/* テキスト */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 3,
              background: ev.isNew ? `${primary}1a` : 'var(--tag-bg)',
              color: primary, fontWeight: 600, letterSpacing: 0.5,
            }}>{ev.category}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono }}>
              {ev.regionLabel}
            </span>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text)',
            lineHeight: 1.4, marginBottom: 4, letterSpacing: 0.2,
          }}>
            {ev.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-sub)' }}>
            {ICO.pin('var(--text-sub)', 11)} {ev.place}
          </div>
        </div>

        {ICO.chev('var(--icon-muted)', 12)}
      </div>
    </div>
  );
}

// ─── セクションラベル ─────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      padding: '4px 24px 6px',
      fontSize: 11, fontWeight: 600, letterSpacing: 2,
      color: 'var(--text-muted)', fontFamily: F.sans,
    }}>
      {children}
    </div>
  );
}

// ─── 空状態 ───────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 32px', textAlign: 'center',
    }}>
      {ICO.bell('var(--icon-muted)', 40)}
      <div style={{
        fontSize: 15, color: 'var(--text-muted)',
        fontFamily: F.sans, marginTop: 16, fontWeight: 500,
      }}>
        新しい通知はありません
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
        新しいイベントが追加されると<br />ここに表示されます
      </div>
    </div>
  );
}
