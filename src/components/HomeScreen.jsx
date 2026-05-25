import { useState, useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, Spinner, ErrorBanner } from './Shared';
import JapanMap from './JapanMap';
import { REGION_BY_ID, SUPPORTED_PREFECTURES, countEventsByRegion, getSupportedPrefsByRegion } from '../data/regionMap';

// ─── 自衛隊制服迷彩パレット（ホーム画面ヘッダー用） ──────────
const CAMO_PALETTES = {
  jgsdf: { bg: '#4e5c38', d1: '#29390f', d2: '#3c5020', d3: '#5a2e18', d4: '#181a0a' },
  jmsdf: { bg: '#182540', d1: '#0c1828', d2: '#1e3558', d3: '#2e4d78', d4: '#081018' },
  jasdf: { bg: '#3e4a56', d1: '#252c34', d2: '#38444e', d3: '#4c3c36', d4: '#586670' },
};
function getCamoPalette(primary) {
  if (primary === '#0b2545') return CAMO_PALETTES.jmsdf;
  if (primary === '#2a4a6b') return CAMO_PALETTES.jasdf;
  return CAMO_PALETTES.jgsdf;
}

// ─── 地図ホーム画面 ───────────────────────────────────────────
export default function HomeScreen({
  events, loading, error, theme,
  favorites, unreadCount,
  onOpenNotifications, onOpenRegion, onOpenList, onOpenSettings, onOpenFavorites,
  initialRegionId,
}) {
  const { primary } = theme;
  const c = getCamoPalette(primary);

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

      {/* ─ ヘッダー（陸海空 迷彩パターン） ─ */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, color: '#fff', flexShrink: 0,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* ── 制服迷彩タイルパターン（陸=緑/海=紺/空=灰青） ── */}
        <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <pattern id="hdr-camo" x="0" y="0" width="120" height="60" patternUnits="userSpaceOnUse">
              <rect width="120" height="60" fill={c.bg}/>
              <ellipse cx="18"  cy="14" rx="15" ry="8"  fill={c.d1} transform="rotate(-20 18 14)"/>
              <ellipse cx="72"  cy="38" rx="21" ry="11" fill={c.d2} transform="rotate(15 72 38)"/>
              <ellipse cx="105" cy="16" rx="13" ry="7"  fill={c.d1} transform="rotate(-10 105 16)"/>
              <ellipse cx="48"  cy="52" rx="17" ry="8"  fill={c.d3} transform="rotate(25 48 52)"/>
              <ellipse cx="0"   cy="30" rx="10" ry="14" fill={c.d2} transform="rotate(5 0 30)"/>
              <ellipse cx="34"  cy="44" rx="14" ry="7"  fill={c.d4} transform="rotate(10 34 44)"/>
              <ellipse cx="86"  cy="10" rx="12" ry="6"  fill={c.d3} transform="rotate(-25 86 10)"/>
              <ellipse cx="116" cy="48" rx="12" ry="6"  fill={c.d1} transform="rotate(20 116 48)"/>
              <ellipse cx="60"  cy="55" rx="10" ry="5"  fill={c.d4} transform="rotate(-8 60 55)"/>
              <ellipse cx="58"  cy="24" rx="14" ry="7"  fill={c.d2} transform="rotate(-15 58 24)"/>
              <ellipse cx="100" cy="50" rx="15" ry="7"  fill={c.d3} transform="rotate(18 100 50)"/>
              <ellipse cx="8"   cy="52" rx="10" ry="5"  fill={c.d1} transform="rotate(-20 8 52)"/>
              <ellipse cx="120" cy="28" rx="9"  ry="12" fill={c.d2} transform="rotate(8 120 28)"/>
            </pattern>
            <linearGradient id="hdr-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="60%" stopColor="transparent"/>
              <stop offset="100%" stopColor="#000" stopOpacity="0.18"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#hdr-camo)"/>
          <rect width="100%" height="100%" fill={primary} fillOpacity="0.14"/>
          <rect width="100%" height="100%" fill="url(#hdr-fade)"/>
        </svg>

        {/* ── コンテンツ（前面） ── */}
        <div style={{
          position: 'relative', zIndex: 1,
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
          </div>

          {/* 通知ベルボタン */}
          <button
            onClick={onOpenNotifications}
            aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ''}`}
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, position: 'relative',
            }}
          >
            {ICO.bell('#fff', 17)}
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', border: '2px solid rgba(0,0,0,0.4)',
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

