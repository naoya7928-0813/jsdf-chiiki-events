import { useState } from 'react';
import { ICO } from './Icons';
import { Emblem, BottomTabBar, F, splitDate, Spinner, ErrorBanner } from './Shared';

export default function HomeScreen({
  events, loading, error, theme,
  favorites, unreadCount,
  onOpenNotifications, onOpenList, onOpenDetail, onOpenSettings, onOpenFavorites,
}) {
  const [region, setRegion] = useState('kanagawa');
  const list     = events[region] ?? [];
  const upcoming = list.slice(0, 3);
  const featured = list[1] ?? list[0];

  const { primary, accent } = theme;

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', fontFamily: F.sans,
    }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 16, background: primary, color: '#fff',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px 14px',
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
              JSDF REGIONAL · COOPERATION
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, letterSpacing: 1, marginTop: 4 }}>
              地本イベント情報
            </div>
          </div>

          {/* ベルボタン（未読バッジ付き） */}
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
            {/* 未読件数バッジ */}
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', border: `2px solid ${primary}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#fff', fontFamily: F.mono, fontWeight: 700,
                padding: '0 3px', letterSpacing: 0,
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </button>
        </div>

        {/* 地本セレクタ */}
        <div style={{
          margin: '0 20px', padding: 10,
          background: 'rgba(255,255,255,0.08)', borderRadius: 10, display: 'flex', gap: 4,
        }}>
          {[{ id: 'kanagawa', label: '神奈川地本', ch: '神' }, { id: 'tokyo', label: '東京地本', ch: '都' }].map(r => {
            const isA = region === r.id;
            return (
              <button key={r.id} onClick={() => setRegion(r.id)} style={{
                flex: 1, minHeight: 44, border: 'none', cursor: 'pointer', borderRadius: 7,
                padding: '8px',
                background: isA ? '#fff' : 'transparent',
                color: isA ? primary : 'rgba(255,255,255,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: F.sans, fontSize: 13, fontWeight: 600, letterSpacing: 1,
              }}>
                <Emblem ch={r.ch} size={20} primary={isA ? primary : '#fff'} />
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <ErrorBanner message={error} />

        {loading ? <Spinner primary={primary} /> : (
          <>
            {/* 注目イベント */}
            {featured && (
              <div style={{ padding: '18px 20px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontFamily: F.serif, fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: 1 }}>
                    注目のイベント
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono, letterSpacing: 1 }}>FEATURED</div>
                </div>
                <div onClick={() => onOpenDetail(featured)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onOpenDetail(featured)}
                  style={{
                    borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                    background: primary, color: '#fff',
                    position: 'relative', minHeight: 130,
                    boxShadow: '0 4px 14px rgba(11,37,69,0.18)',
                  }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0 12px,transparent 12px 24px)' }} />
                  <div style={{ position: 'relative', padding: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-block', fontSize: 10, fontFamily: F.mono, padding: '3px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
                        {featured.category.toUpperCase()}
                      </div>
                      {/* お気に入り済みスター */}
                      {favorites.has(featured.id) && (
                        <div style={{ opacity: 0.9 }}>{ICO.star('#fff', 14, '#fff')}</div>
                      )}
                    </div>
                    <div style={{ fontFamily: F.serif, fontSize: 20, fontWeight: 600, marginTop: 10, lineHeight: 1.35 }}>
                      {featured.title}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.85)', fontFamily: F.mono }}>
                      {featured.date} ({featured.weekday})
                    </div>
                    <div style={{ fontSize: 12, marginTop: 3, color: 'rgba(255,255,255,0.7)' }}>
                      {featured.place}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 今後の予定 */}
            <div style={{ padding: '14px 20px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily: F.serif, fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: 1 }}>
                  今後の予定
                </div>
                <button onClick={onOpenList} style={{
                  border: 'none', background: 'transparent',
                  fontSize: 11, color: primary, cursor: 'pointer',
                  fontFamily: F.sans, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 2, padding: '4px 0',
                }}>
                  すべて見る {ICO.chev(primary, 10)}
                </button>
              </div>
              <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(11,37,69,0.04)', overflow: 'hidden' }}>
                {upcoming.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    イベントがありません
                  </div>
                ) : upcoming.map((ev, i) => {
                  const { m, d } = splitDate(ev.date);
                  const isFav = favorites.has(ev.id);
                  return (
                    <div key={ev.id} onClick={() => onOpenDetail(ev)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onOpenDetail(ev)}
                      style={{
                        display: 'flex', alignItems: 'center', minHeight: 64,
                        padding: '12px 14px', cursor: 'pointer',
                        borderBottom: i < upcoming.length - 1 ? '1px solid var(--sep)' : 'none', gap: 12,
                      }}>
                      <div style={{ minWidth: 42, textAlign: 'center', borderRight: '1px solid var(--border)', paddingRight: 10 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: F.mono }}>{m}月</div>
                        <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 600, lineHeight: 1, color: primary, marginTop: 2 }}>{d}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* タイトル行：お気に入りはスターアイコンを末尾に表示 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, letterSpacing: 0.2, flex: 1, minWidth: 0 }}>
                            {ev.title}
                          </div>
                          {isFav && ICO.star(accent, 12, accent)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ICO.pin('var(--text-sub)', 12)} {ev.place}
                        </div>
                      </div>
                      {ICO.chev('var(--icon-muted)', 12)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* サマリーカード */}
            <div style={{ padding: '10px 20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SummaryCard value={list.length} label="今後の予定件数" color={primary} />
                <SummaryCard value={list.filter(e => e.tag === '入場無料').length} label="入場無料イベント" color={accent} />
              </div>
            </div>
          </>
        )}
      </div>

      <BottomTabBar active="home" onChange={id => {
        if (id === 'list')      onOpenList();
        else if (id === 'settings')  onOpenSettings();
        else if (id === 'favorites') onOpenFavorites();
      }} primary={primary} />
    </div>
  );
}

function SummaryCard({ value, label, color }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', padding: 14, minHeight: 60, boxShadow: '0 1px 2px rgba(11,37,69,0.03)' }}>
      <div style={{ fontSize: 26, fontFamily: F.serif, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
