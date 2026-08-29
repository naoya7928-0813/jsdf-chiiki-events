import { useState, useMemo } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F, Spinner, ErrorBanner, splitDate } from './Shared';
import JapanMap from './JapanMap';
import { useIsDesktop } from '../hooks/useBreakpoint';
import NearbyOfficesModal from './NearbyOfficesModal';
import { REGION_BY_ID, SUPPORTED_PREFECTURES, countEventsByRegion, getSupportedPrefsByRegion } from '../data/regionMap';


// ─── 地図ホーム画面 ───────────────────────────────────────────
export default function HomeScreen({
  events, loading, error, theme,
  favorites, unreadCount,
  onOpenNotifications, onOpenRegion, onOpenList, onOpenSettings, onOpenFavorites, onOpenDetail,
  initialRegionId,
}) {
  const { primary } = theme;
  const isDesktop = useIsDesktop();

  // 近くの施設モーダル
  const [nearbyOpen, setNearbyOpen] = useState(false);

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
        paddingBottom: 14, color: '#fff', flexShrink: 0,
        background: primary,
      }}>
        {/* ── コンテンツ ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px',
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
              Main Page
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, letterSpacing: 1, marginTop: 4 }}>
              地本イベントナビ
            </div>
          </div>

          {/* ヘッダー右側ボタン群 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

            {/* 現在地検索ボタン */}
            <button
              onClick={() => setNearbyOpen(true)}
              aria-label="近くの施設を検索"
              style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0,
              }}
            >
              {ICO.locator('#fff', 18)}
            </button>

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
      </div>

      {/* ─ コンテンツ ─
           デスクトップは 地図（左） + 地域パネル（右）の2カラム。
           モバイル／タブレットは従来どおり 地図の下にカードを敷く1カラム。 */}
      <div style={{
        flex: 1, display: 'flex',
        flexDirection: isDesktop ? 'row' : 'column',
        overflow: 'hidden',
      }}>
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


            {/* ─ 地域パネル ─
                 モバイル: 地図下の帯（高さ固定でマップリサイズを防ぐ）
                 デスクトップ: 右側の縦パネル。横に伸びきった帯にしない */}
            <div style={{
              flexShrink: 0,
              ...(isDesktop
                ? { width: 360, margin: '12px 16px 16px 0', alignSelf: 'stretch', overflowY: 'auto' }
                : { margin: '0 16px 8px' }),
              borderRadius: 14,
              border: `1px solid ${selectedRegion ? `${primary}33` : 'var(--border)'}`,
              background: selectedRegion ? `${primary}08` : 'var(--card)',
              overflow: isDesktop ? 'auto' : 'hidden',
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
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand-fg)', lineHeight: 1.3 }}>
                          {totalEventCount} 件のイベント
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>現在イベントなし</div>
                    )}
                  </div>

                  {/* イベントを見るボタン → 地方タブ（全地域）へ */}
                  <button
                    onClick={() => hasEvents && onOpenList(selectedRegion.id)}
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

                  {/* デスクトップの縦パネルは下が大きく余るので、
                      「地本を選ぶ」と「直近のイベント」で埋める。
                      モバイルの帯レイアウトでは高さが足りないため出さない。 */}
                  {isDesktop && hasEvents && (
                    <RegionPanelDetail
                      prefs={supportedPrefs}
                      events={events}
                      primary={primary}
                      onOpenList={onOpenList}
                      onOpenDetail={onOpenDetail}
                    />
                  )}
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
                      {ICO.map('var(--brand-fg)', 18)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        地域を選択してください
                      </div>
                      {/* 地図の位置は幅で変わる（下=モバイル / 左=デスクトップ）ので
                          案内の矢印と操作語もそれに合わせる */}
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {isDesktop ? '← 左の地図をクリック' : '↑ 上の地図をタップ'}
                      </div>
                    </div>
                    {/* 全体サマリー */}
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, color: 'var(--brand-fg)', lineHeight: 1 }}>
                        {totalEvents}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        件
                      </div>
                    </div>
                  </div>
                  {/* 全イベント一覧へのショートカット：引数なしで呼ぶことで全国（all）を確実に設定 */}
                  <button
                    onClick={() => onOpenList()}
                    style={{
                      width: '100%', height: 38, borderRadius: 8, border: `1px solid ${primary}44`,
                      background: `${primary}08`, color: 'var(--brand-fg)',
                      fontSize: 13, fontWeight: 600, fontFamily: F.sans,
                      cursor: 'pointer', letterSpacing: 0.5, marginTop: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {ICO.cal('var(--brand-fg)', 14)} 全イベント一覧を見る
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

      {/* ── 近くの施設モーダル（ボトムシート） ── */}
      <NearbyOfficesModal
        isOpen={nearbyOpen}
        onClose={() => setNearbyOpen(false)}
        theme={theme}
      />
    </div>
  );
}


// ─── 地域パネルの詳細（デスクトップのみ） ─────────────────────
// 地図右のパネルは縦に長く、地域名と «イベントを見る» だけでは大きく余る。
// 「どの地本か選ぶ」導線と「今すぐ見たい直近のイベント」を置いて埋める。
function RegionPanelDetail({ prefs, events, primary, onOpenList, onOpenDetail }) {
  // 開催予定のみを日付順に。上位5件をパネルに出す。
  const upcoming = useMemo(() => {
    const rows = [];
    for (const p of prefs) {
      for (const ev of (events[p.id] ?? [])) {
        if (!ev.ended && ev.date) rows.push({ ...ev, _prefLabel: p.label });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  }, [prefs, events]);

  return (
    <div style={{ marginTop: 16 }}>
      {/* ─ 地本を選ぶ ─
           イベント0件の地本も一覧に出す。見出しの「N 地本対応」と行数が
           食い違うと「対応しているのに出てこない」と誤解されるため。
           0件の行は淡色・非活性にして、押せる行と区別する。 */}
      {prefs.length > 0 && (
        <>
          <SectionLabel>地本を選ぶ</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 18 }}>
            {prefs.map(p => {
              const empty = p.count === 0;
              return (
                <button
                  key={p.id}
                  onClick={() => !empty && onOpenList(p.id)}
                  disabled={empty}
                  title={empty ? '現在このエリアの掲載イベントはありません' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '9px 10px',
                    border: 'none', background: 'transparent',
                    cursor: empty ? 'default' : 'pointer',
                    borderRadius: 'var(--radius-element)',
                    fontFamily: F.sans, textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!empty) e.currentTarget.style.background = 'var(--sep)'; }}
                  onMouseLeave={e => { if (!empty) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    fontSize: 13.5, fontWeight: 500,
                    color: empty ? 'var(--text-muted)' : 'var(--text)',
                  }}>{p.label}地本</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {empty ? (
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>イベントなし</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, color: 'var(--brand-fg)', fontWeight: 700, fontFamily: F.mono }}>{p.count}</span>
                        {ICO.chev('var(--icon-muted)', 14)}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ─ 直近のイベント ─ */}
      {upcoming.length > 0 && (
        <>
          <SectionLabel>直近のイベント</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map(ev => {
              const { m, d } = splitDate(ev.date);
              return (
                <button
                  key={ev.id}
                  onClick={() => onOpenDetail?.(ev)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    width: '100%', padding: '9px 10px',
                    border: '1px solid var(--border)', background: 'var(--card)',
                    cursor: 'pointer', borderRadius: 'var(--radius-container)',
                    fontFamily: F.sans, textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${primary}55`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  {/* 日付 */}
                  <span style={{
                    flexShrink: 0, minWidth: 34, textAlign: 'center',
                    display: 'flex', flexDirection: 'column', lineHeight: 1.1,
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono }}>{m}月</span>
                    <span style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 600, color: 'var(--brand-fg)' }}>{d}</span>
                  </span>
                  {/* 本文 */}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{
                      display: 'block', fontSize: 13, color: 'var(--text)', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{ev.title}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {ev._prefLabel}地本{ev.place ? ` ・ ${ev.place}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: 1,
      color: 'var(--text-muted)', margin: '0 0 6px 2px',
      fontFamily: F.sans,
    }}>{children}</div>
  );
}
