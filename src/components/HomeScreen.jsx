import { useState, useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, Spinner, ErrorBanner } from './Shared';
import JapanMap from './JapanMap';
import { REGIONS, REGION_BY_ID, countEventsByRegion, getSupportedPrefsByRegion } from '../data/regionMap';

// ─── 地図ホーム画面 ───────────────────────────────────────────
export default function HomeScreen({
  events, loading, error, theme,
  favorites, unreadCount,
  onOpenNotifications, onOpenRegion, onOpenList, onOpenSettings, onOpenFavorites,
  initialRegionId,
}) {
  const { primary, accent } = theme;

  // 地図上で選択中の地域ID
  const [selectedRegionId, setSelectedRegionId] = useState(initialRegionId ?? null);

  // 地域ごとのイベント件数を集計
  const eventCounts = useMemo(() => countEventsByRegion(events), [events]);

  // 選択中地域の情報
  const selectedRegion    = selectedRegionId ? REGION_BY_ID[selectedRegionId] : null;
  const supportedPrefs    = selectedRegionId ? getSupportedPrefsByRegion(selectedRegionId, events) : [];
  const totalEventCount   = supportedPrefs.reduce((s, p) => s + p.count, 0);
  const hasEvents         = totalEventCount > 0;

  // 地域タップ：同じ地域を再タップしたら選択解除
  const handleRegionSelect = (id) => {
    setSelectedRegionId(prev => prev === id ? null : id);
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', fontFamily: F.sans,
    }}>

      {/* ─ ヘッダー ─ */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
              JSDF REGIONAL · COOPERATION
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, letterSpacing: 1, marginTop: 4 }}>
              地本イベント情報
            </div>
          </div>

          {/* 通知ベルボタン */}
          <button
            onClick={onOpenNotifications}
            aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ''}`}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, position: 'relative',
            }}
          >
            {ICO.bell('#fff', 17)}
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', border: `2px solid ${primary}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#fff', fontFamily: F.mono, fontWeight: 700,
                padding: '0 3px',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ─ コンテンツ ─ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ErrorBanner message={error} />

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner primary={primary} />
          </div>
        ) : (
          <>
            {/* ─ 地図エリア ─ */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 12px 4px',
              overflow: 'hidden',
            }}>
              <JapanMap
                eventCounts={eventCounts}
                selectedRegionId={selectedRegionId}
                onSelect={handleRegionSelect}
                primary={primary}
              />
            </div>

            {/* ─ 凡例 ─ */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 16,
              padding: '0 16px 6px', flexShrink: 0,
            }}>
              <LegendItem color={primary} label="イベントあり" />
              <LegendItem color="var(--map-gray, #d1d5db)" label="準備中" />
            </div>

            {/* ─ 下部カード ─ */}
            <div style={{
              flexShrink: 0,
              margin: '0 16px 8px',
              borderRadius: 14,
              border: `1px solid ${selectedRegion ? `${primary}33` : 'var(--border)'}`,
              background: selectedRegion ? `${primary}08` : 'var(--card)',
              overflow: 'hidden',
              transition: 'all 0.2s',
            }}>
              {selectedRegion ? (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: 0.5 }}>
                        {selectedRegion.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {hasEvents
                          ? `${supportedPrefs.length} 地本対応 · ${totalEventCount} 件のイベント`
                          : 'この地域は準備中です'}
                      </div>
                    </div>
                    {/* 対応地本のバッジ列 */}
                    {hasEvents && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {supportedPrefs.map(p => (
                          <div key={p.id} style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: `${primary}18`,
                            border: `1px solid ${primary}33`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: primary, fontFamily: F.serif,
                          }}>
                            {p.emblem}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* イベントを見るボタン */}
                  <button
                    onClick={() => hasEvents && onOpenRegion(selectedRegionId)}
                    disabled={!hasEvents}
                    style={{
                      width: '100%', height: 40, borderRadius: 10, border: 'none',
                      background: hasEvents ? primary : 'var(--border)',
                      color: hasEvents ? '#fff' : 'var(--text-muted)',
                      fontSize: 14, fontWeight: 600, fontFamily: F.sans,
                      cursor: hasEvents ? 'pointer' : 'default',
                      letterSpacing: 0.5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {hasEvents ? (
                      <>{ICO.cal('#fff', 15)} イベントを見る</>
                    ) : (
                      '準備中'
                    )}
                  </button>
                </div>
              ) : (
                /* 地域未選択時のガイド */
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: `${primary}10`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {ICO.map(primary, 18)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        地域を選択
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        地図をタップしてイベントを確認
                      </div>
                    </div>

                    {/* 全体サマリー */}
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: primary, lineHeight: 1 }}>
                        {Object.values(eventCounts).reduce((s, c) => s + c, 0)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>件</div>
                    </div>
                  </div>
                  {/* 全イベント一覧へのショートカット */}
                  <button
                    onClick={onOpenList}
                    style={{
                      width: '100%', height: 36, borderRadius: 8, border: `1px solid ${primary}44`,
                      background: `${primary}08`, color: primary,
                      fontSize: 13, fontWeight: 600, fontFamily: F.sans,
                      cursor: 'pointer', letterSpacing: 0.5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {ICO.cal(primary, 14)} 全イベント一覧を見る
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <BottomTabBar
        active="home"
        onChange={id => {
          if (id === 'list')      onOpenList();
          else if (id === 'favorites') onOpenFavorites();
          else if (id === 'settings')  onOpenSettings();
        }}
        primary={primary}
      />
    </div>
  );
}

// ─── 凡例アイテム ────────────────────────────────────────────
function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.sans }}>{label}</span>
    </div>
  );
}
