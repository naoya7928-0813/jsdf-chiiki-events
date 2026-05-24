import { useState, useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, Spinner, ErrorBanner } from './Shared';
import JapanMap from './JapanMap';
import { REGION_BY_ID, SUPPORTED_PREFECTURES, countEventsByRegion, getSupportedPrefsByRegion } from '../data/regionMap';

// ─── 地図ホーム画面 ───────────────────────────────────────────
export default function HomeScreen({
  events, loading, error, theme,
  favorites, unreadCount,
  onOpenNotifications, onOpenRegion, onOpenList, onOpenSettings, onOpenFavorites,
  initialRegionId,
}) {
  const { primary } = theme;

  // 地図上で選択中の地域ID
  const [selectedRegionId, setSelectedRegionId] = useState(initialRegionId ?? null);

  // 地域ごとのイベント件数を集計
  const eventCounts = useMemo(() => countEventsByRegion(events), [events]);

  // 全国合計（ホーム画面サマリー表示用）
  const totalEvents = Object.values(eventCounts).reduce((s, c) => s + c, 0);

  // 選択中地域の情報
  const selectedRegion    = selectedRegionId ? REGION_BY_ID[selectedRegionId] : null;
  const supportedPrefs    = selectedRegionId ? getSupportedPrefsByRegion(selectedRegionId, events) : [];
  const totalEventCount   = supportedPrefs.reduce((s, p) => s + p.count, 0);
  const hasEvents         = totalEventCount > 0;

  // 選択中地域の「最初の対応都道府県ID」（イベントを見るボタン用）
  const firstSupportedPref = selectedRegionId
    ? (REGION_BY_ID[selectedRegionId]?.prefectures.find(p => SUPPORTED_PREFECTURES.has(p.id))?.id ?? null)
    : null;

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
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
              有志による非公式情報まとめ
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, letterSpacing: 1, marginTop: 4 }}>
              地本イベント情報
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.55, maxWidth: 240 }}>
              全国の地方協力本部（地本）が公開するイベントをまとめた非公式サービスです
            </div>
          </div>

          {/* 通知ベルボタン */}
          <button
            onClick={onOpenNotifications}
            aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ''}`}
            style={{
              width: 44, height: 44, borderRadius: 10,
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


            {/* ─ 下部カード（高さ固定でマップリサイズを防ぐ） ─ */}
            <div style={{
              flexShrink: 0,
              margin: '0 16px 8px',
              borderRadius: 14,
              border: `1px solid ${selectedRegion ? `${primary}33` : 'var(--border)'}`,
              background: selectedRegion ? `${primary}08` : 'var(--card)',
              overflow: 'hidden',
            }}>
              {selectedRegion ? (
                <div style={{ padding: '12px 16px', minHeight: 104, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  {/* 地域名 + 2段数値 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: 0.5 }}>
                      {selectedRegion.label}
                    </div>
                    {hasEvents ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          {supportedPrefs.length} 地本対応
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: primary, lineHeight: 1.3 }}>
                          {totalEventCount} 件のイベント
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>現在イベントなし</div>
                    )}
                  </div>

                  {/* イベントを見るボタン → 地域の最初の都道府県でイベント一覧へ */}
                  <button
                    onClick={() => hasEvents && onOpenList(firstSupportedPref)}
                    disabled={!hasEvents}
                    style={{
                      width: '100%', height: 38, borderRadius: 10, border: 'none',
                      background: hasEvents ? primary : 'var(--border)',
                      color: hasEvents ? '#fff' : 'var(--text-muted)',
                      fontSize: 14, fontWeight: 600, fontFamily: F.sans,
                      cursor: hasEvents ? 'pointer' : 'default',
                      letterSpacing: 0.5, marginTop: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {hasEvents ? (
                      <>{ICO.cal('#fff', 15)} イベントを見る</>
                    ) : (
                      '現在イベントなし'
                    )}
                  </button>
                </div>
              ) : (
                /* 地域未選択時のガイド */
                <div style={{ padding: '12px 16px', minHeight: 104, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                        地域を選択してください
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        ↑ 上の地図をタップ
                      </div>
                    </div>
                    {/* 全体サマリー */}
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: primary, lineHeight: 1 }}>
                        {totalEvents >= 100 ? '100+' : totalEvents}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {totalEvents >= 100 ? '件以上' : '件'}
                      </div>
                    </div>
                  </div>
                  {/* 全イベント一覧へのショートカット：引数なしで呼ぶことで全国（all）を確実に設定 */}
                  <button
                    onClick={() => onOpenList()}
                    style={{
                      width: '100%', height: 38, borderRadius: 8, border: `1px solid ${primary}44`,
                      background: `${primary}08`, color: primary,
                      fontSize: 13, fontWeight: 600, fontFamily: F.sans,
                      cursor: 'pointer', letterSpacing: 0.5, marginTop: 10,
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

