import { useEffect, useMemo, useState } from 'react';
import { ICO } from './Icons';
import { F, ScreenHeader, splitDate } from './Shared';
import { NTFY_URL } from '../config';
import NtfyGuideModal from './NtfyGuideModal';
import { deadlineDaysUntil, daysLabel } from '../utils/date';

// ─── 通知一覧画面 ─────────────────────────────────────────────
export default function NotificationScreen({
  events, seenIds, theme, favorites, onMarkAllRead, onOpenDetail, onBack,
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
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
        return new Date(a.date) - new Date(b.date);
      });
  }, [events, seenIds]);

  // 画面を開いたとき全IDを既読化
  useEffect(() => {
    const ids = [
      ...(events.kanagawa ?? []),
      ...(events.tokyo    ?? []),
    ].map(e => e.id);
    onMarkAllRead(ids);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadItems = items.filter(i => i.isNew);

  // ── 締切リマインダー（お気に入り × 締切7日以内） ────────────
  const reminders = useMemo(() => {
    if (!favorites || favorites.size === 0) return [];
    const all = [
      ...(events.kanagawa ?? []),
      ...(events.tokyo    ?? []),
    ];
    return all
      .filter(ev => {
        if (!favorites.has(ev.id) || !ev.deadline) return false;
        const days = deadlineDaysUntil(ev.deadline);
        return days != null && days >= 0 && days <= 7;
      })
      .sort((a, b) => {
        const da = deadlineDaysUntil(a.deadline) ?? 99;
        const db = deadlineDaysUntil(b.deadline) ?? 99;
        return da - db;
      });
  }, [events, favorites]);

  // ── プッシュ通知購読状態 ──────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return localStorage.getItem('jsdf-push-enabled') === '1'; } catch { return false; }
  });
  const [showNtfyGuide, setShowNtfyGuide] = useState(false);

  const handleSubscribe = () => {
    setShowNtfyGuide(true);
    setPushEnabled(true);
    try { localStorage.setItem('jsdf-push-enabled', '1'); } catch {}
  };

  const handleUnsubscribe = () => {
    setPushEnabled(false);
    try { localStorage.removeItem('jsdf-push-enabled'); } catch {}
  };

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

        {/* ── プッシュ通知カード ── */}
        <div style={{ margin: '0 16px 12px' }}>
          <div style={{
            borderRadius: 12, border: `1px solid ${primary}33`,
            background: `${primary}08`, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: `${primary}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {ICO.bell(primary, 18)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  プッシュ通知
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {pushEnabled
                    ? 'ntfy アプリで購読中 — 更新時に通知が届きます'
                    : 'イベント更新時にスマホへ通知を受け取る'}
                </div>
              </div>
            </div>
            {pushEnabled ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowNtfyGuide(true)}
                  style={{
                    flex: 1, height: 36, borderRadius: 8,
                    background: `${primary}18`,
                    border: 'none', color: primary, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: F.sans,
                  }}
                >
                  設定方法を確認
                </button>
                <button
                  onClick={handleUnsubscribe}
                  style={{
                    height: 36, padding: '0 14px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--card)', color: 'var(--text-muted)', fontSize: 12,
                    cursor: 'pointer', fontFamily: F.sans,
                  }}
                >
                  解除
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                style={{
                  width: '100%', height: 38, borderRadius: 8, border: 'none',
                  background: primary, color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: F.sans, letterSpacing: 0.5,
                }}
              >
                通知を受け取る
              </button>
            )}
          </div>
        </div>

        {/* ── 締切リマインダー（お気に入り × 7日以内） ── */}
        {reminders.length > 0 && (
          <div style={{ margin: '0 0 4px' }}>
            <SectionLabel color="#f97316">締切リマインダー</SectionLabel>
            {reminders.map(ev => {
              const days = deadlineDaysUntil(ev.deadline);
              return (
                <div
                  key={`reminder-${ev.id}`}
                  onClick={() => onOpenDetail(ev)}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onOpenDetail(ev)}
                  style={{
                    margin: '0 16px 8px',
                    borderRadius: 12,
                    border: '1px solid #f9731644',
                    background: '#f9731608',
                    cursor: 'pointer', overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', padding: '12px 14px', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      fontSize: 9, fontFamily: F.mono, fontWeight: 700,
                      color: '#f97316', minWidth: 44, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18, fontFamily: F.serif }}>{days}</div>
                      <div>日後締切</div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: '#f9731633', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#f97316', fontWeight: 700, marginBottom: 3 }}>
                        {daysLabel(days, 'deadline')} — {ev.deadline}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
                        {ev.title}
                      </div>
                    </div>
                    {ICO.chev('var(--icon-muted)', 12)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── イベント通知一覧 ── */}
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {unreadItems.length > 0 && <SectionLabel>新着</SectionLabel>}

            {items.map((ev, idx) => {
              const prevIsNew   = idx > 0 ? items[idx - 1].isNew : ev.isNew;
              const showReadLabel = !ev.isNew && prevIsNew && items.some(i => !i.isNew);
              return (
                <div key={ev.id}>
                  {showReadLabel && <SectionLabel>既読</SectionLabel>}
                  <NotifCard ev={ev} primary={primary} accent={accent} onTap={onOpenDetail} />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ntfy 設定ガイドモーダル */}
      {showNtfyGuide && (
        <NtfyGuideModal primary={primary} onClose={() => setShowNtfyGuide(false)} />
      )}
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
        margin: '0 16px 8px', borderRadius: 12,
        border: `1px solid ${ev.isNew ? `${primary}33` : 'var(--border)'}`,
        background: ev.isNew ? `${primary}0a` : 'var(--card)',
        cursor: 'pointer', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', padding: '12px 14px', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
          {ev.isNew
            ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, marginBottom: 6 }} />
            : <div style={{ width: 8, height: 8, marginBottom: 6 }} />}
          <div style={{ fontSize: 9, color: isWeekend ? accent : primary, fontFamily: F.mono, letterSpacing: 0.5 }}>{m}月</div>
          <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, lineHeight: 1, color: isWeekend ? accent : primary, marginTop: 1 }}>{d}</div>
          <div style={{ fontSize: 9, color: isWeekend ? accent : primary, marginTop: 2 }}>{ev.weekday}</div>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

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
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
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
function SectionLabel({ children, color }) {
  return (
    <div style={{
      padding: '4px 24px 6px',
      fontSize: 11, fontWeight: 600, letterSpacing: 2,
      color: color ?? 'var(--text-muted)', fontFamily: F.sans,
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
      <div style={{ fontSize: 15, color: 'var(--text-muted)', fontFamily: F.sans, marginTop: 16, fontWeight: 500 }}>
        新しい通知はありません
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
        新しいイベントが追加されると<br />ここに表示されます
      </div>
    </div>
  );
}
