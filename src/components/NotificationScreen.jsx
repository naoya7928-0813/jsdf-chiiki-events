import { useEffect, useMemo, useState } from 'react';
import { ICO } from './Icons';
import { F, ScreenHeader, splitDate } from './Shared';
import { NTFY_URL } from '../config';
import NtfyGuideModal from './NtfyGuideModal';
import { deadlineDaysUntil, daysLabel } from '../utils/date';
import { PREFECTURE_INFO, REGIONS } from '../data/regionMap';

function loadNotifRegion() {
  try { return localStorage.getItem('jsdf-notif-region') || 'all'; } catch { return 'all'; }
}

// ─── 通知一覧画面 ─────────────────────────────────────────────
export default function NotificationScreen({
  events, notifHistory, favorites, theme,
  onMarkAllRead, onDeleteNotif, onClearAll, onOpenDetail, onBack,
}) {
  const { primary, accent } = theme;

  // 画面を開いたとき全件既読化
  useEffect(() => {
    onMarkAllRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = notifHistory.filter(n => !n.read).length;

  // ── 締切リマインダー（お気に入り × 締切7日以内） ────────────
  const reminders = useMemo(() => {
    if (!favorites || favorites.size === 0) return [];
    const all = Object.values(events).filter(Array.isArray).flat();
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

  // ── 地区フィルター ────────────────────────────────────────
  const [notifRegion, setNotifRegion] = useState(loadNotifRegion);
  const handleNotifRegion = (id) => {
    setNotifRegion(id);
    try { localStorage.setItem('jsdf-notif-region', id); } catch {}
  };

  const filteredItems = useMemo(() => {
    if (notifRegion === 'all') return notifHistory;
    const region = REGIONS.find(r => r.id === notifRegion);
    if (!region) return notifHistory;
    const prefIds = new Set(region.prefectures.map(p => p.id));
    return notifHistory.filter(item => prefIds.has(item.pref));
  }, [notifHistory, notifRegion]);

  const unreadFiltered = filteredItems.filter(i => !i.read);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unreadCount > 0 && (
              <div style={{
                padding: '3px 10px', borderRadius: 12,
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
                fontSize: 11, color: '#fff', fontFamily: F.mono, letterSpacing: 0.5,
              }}>
                {unreadCount} NEW
              </div>
            )}
            {notifHistory.length > 0 && (
              <button
                onClick={onClearAll}
                aria-label="通知履歴を全削除"
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {ICO.trash('#fff', 15)}
              </button>
            )}
          </div>
        }
      />

      {/* ── 地区フィルター ── */}
      <div style={{ background: primary, paddingBottom: 10, flexShrink: 0 }}>
        <div style={{
          display: 'flex', overflowX: 'auto', gap: 6, padding: '0 16px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}>
          {[{ id: 'all', label: '全地区' }, ...REGIONS].map(r => {
            const isA = notifRegion === r.id;
            return (
              <button
                key={r.id}
                onClick={() => handleNotifRegion(r.id)}
                style={{
                  flexShrink: 0, border: 'none', borderRadius: 20, padding: '5px 12px',
                  background: isA ? '#fff' : 'rgba(255,255,255,0.15)',
                  color: isA ? primary : 'rgba(255,255,255,0.85)',
                  fontSize: 12, fontWeight: isA ? 700 : 400,
                  cursor: 'pointer', fontFamily: F.sans, letterSpacing: 0.3,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

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
                    background: `${primary}18`, border: 'none',
                    color: primary, fontSize: 12, fontWeight: 600,
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

        {/* ── 締切リマインダー ── */}
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
                    margin: '0 16px 8px', borderRadius: 12,
                    border: '1px solid #f9731644', background: '#f9731608',
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

        {/* ── 通知履歴 ── */}
        {filteredItems.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {unreadFiltered.length > 0 && <SectionLabel>新着</SectionLabel>}

            {filteredItems.map((item, idx) => {
              const prevRead   = idx > 0 ? filteredItems[idx - 1].read : item.read;
              const showReadLbl = item.read && !prevRead && filteredItems.some(i => i.read);
              return (
                <div key={item.id}>
                  {showReadLbl && <SectionLabel>既読</SectionLabel>}
                  <NotifCard
                    item={item}
                    primary={primary}
                    accent={accent}
                    onTap={onOpenDetail}
                    onDelete={onDeleteNotif}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>

      {showNtfyGuide && (
        <NtfyGuideModal primary={primary} onClose={() => setShowNtfyGuide(false)} />
      )}
    </div>
  );
}

// ─── 通知カード ───────────────────────────────────────────────
function NotifCard({ item, primary, accent, onTap, onDelete }) {
  const { m, d } = splitDate(item.date);
  const isWeekend = /[土日祝]/.test(item.weekday);
  const regionLabel = item.regionLabel
    ?? ((PREFECTURE_INFO[item.pref]?.label ?? item.pref) + '地本');

  return (
    <div style={{ margin: '0 16px 8px', borderRadius: 12, overflow: 'hidden' }}>
      <div
        onClick={() => onTap(item)}
        role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onTap(item)}
        style={{
          border: `1px solid ${!item.read ? `${primary}33` : 'var(--border)'}`,
          background: !item.read ? `${primary}0a` : 'var(--card)',
          cursor: 'pointer', borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', padding: '12px 14px', gap: 12, alignItems: 'center' }}>
          {/* 日付 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
            {!item.read
              ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, marginBottom: 6 }} />
              : <div style={{ width: 8, height: 8, marginBottom: 6 }} />}
            <div style={{ fontSize: 9, color: isWeekend ? accent : primary, fontFamily: F.mono, letterSpacing: 0.5 }}>{m}月</div>
            <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, lineHeight: 1, color: isWeekend ? accent : primary, marginTop: 1 }}>{d}</div>
            <div style={{ fontSize: 9, color: isWeekend ? accent : primary, marginTop: 2 }}>{item.weekday}</div>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

          {/* 本文 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 3,
                background: !item.read ? `${primary}1a` : 'var(--tag-bg)',
                color: primary, fontWeight: 600, letterSpacing: 0.5,
              }}>{item.category}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono }}>
                {regionLabel}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-sub)' }}>
              {ICO.pin('var(--text-sub)', 11)} {item.place}
            </div>
          </div>

          {/* 削除ボタン */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            aria-label="この通知を削除"
            style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: 6,
              border: 'none', background: 'var(--tag-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}
          >
            {ICO.close('var(--text-muted)', 12)}
          </button>
        </div>
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
        通知はありません
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
        新しいイベントが追加されると<br />ここに表示されます
      </div>
    </div>
  );
}
