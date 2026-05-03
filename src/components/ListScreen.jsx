import { useState, useMemo, useRef, useEffect } from 'react';
import { ICO } from './Icons';
import { Emblem, BottomTabBar, F, splitDate, parseYM, Spinner, ErrorBanner, iconBtnStyle } from './Shared';
import FilterBar from './FilterBar';
import { daysUntil, deadlineDaysUntil, daysLabel, daysColor } from '../utils/date';
import { REGIONS, SUPPORTED_PREFECTURES } from '../data/regionMap';

const ALL_PREF_TABS = REGIONS.flatMap(r =>
  r.prefectures.filter(p => SUPPORTED_PREFECTURES.has(p.id))
);

export default function ListScreen({
  events, loading, error, updatedAt, checkedAt, onRefresh,
  region, onRegionChange,
  favorites,
  onOpenHome, onOpenDetail, onOpenSettings, onOpenFavorites,
  theme,
}) {
  const list = events[region] ?? [];

  // アクティブなタブを横スクロールでセンタリング（垂直方向には影響させない）
  const tabScrollRef = useRef(null);
  const activeTabRef = useRef(null);
  useEffect(() => {
    const container = tabScrollRef.current;
    const btn       = activeTabRef.current;
    if (!container || !btn) return;
    const target = btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
    container.scrollLeft = Math.max(0, target);
  }, [region]);

  // ── 検索 ─────────────────────────────────────────────────
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // 検索バーを開いたらフォーカス
  useEffect(() => {
    if (isSearching) searchInputRef.current?.focus();
  }, [isSearching]);

  // 検索バーを閉じるときクリア
  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  // ── 更新ローディング ──────────────────────────────────────
  // onRefresh() が返す Promise の完了でスピナーを止める
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    Promise.resolve(onRefresh()).finally(() => setIsRefreshing(false));
  };

  // ── カテゴリ・タグ フィルター ────────────────────────────
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag,      setActiveTag]      = useState('all');

  // カテゴリ or タグが変わったら検索をリセット
  const handleCategoryChange = (cat) => { setActiveCategory(cat); closeSearch(); };
  const handleTagChange      = (tag) => { setActiveTag(tag);      closeSearch(); };

  // ── フィルター適用済みリスト（開催日昇順） ───────────────
  const filteredList = useMemo(() => {
    return list
      .filter(ev => {
        const catOk = activeCategory === 'all' || ev.category === activeCategory;
        const tagOk = activeTag      === 'all' || ev.tag      === activeTag;
        return catOk && tagOk;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [list, activeCategory, activeTag]);

  // ── イベントグループ化 ─────────────────────────────────────
  const grouped = useMemo(() => {
    const g = {};
    for (const e of filteredList) {
      const k = parseYM(e.date);
      (g[k] = g[k] || []).push(e);
    }
    return g;
  }, [filteredList]);

  // ── 検索フィルタ ──────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return grouped;
    const result = {};
    for (const [month, evs] of Object.entries(grouped)) {
      const matched = evs.filter(ev =>
        [ev.title, ev.place, ev.address, ev.category, ev.tag].filter(Boolean).some(f =>
          f.toLowerCase().includes(q)
        )
      );
      if (matched.length > 0) result[month] = matched;
    }
    return result;
  }, [grouped, searchQuery]);

  const { primary, accent } = theme;
  // checkedAt: 更新ボタンを押した（または自動フェッチした）時刻（ローカル）
  // updatedAt: スクレイパーがデータを書いた時刻（JSON内）
  const checkedLabel = checkedAt ?? updatedAt ?? new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');

  // 更新ボタンの回転アニメーション（spin は main.jsx で定義済み）
  const spinStyle = (isRefreshing || loading)
    ? { display: 'inline-flex', animation: 'spin 0.7s linear infinite' }
    : { display: 'inline-flex' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 10px' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>EVENTS</div>
            <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: 1, marginTop: 2 }}>イベント一覧</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* 検索ボタン（開いているときは × アイコン） */}
            <button
              aria-label={isSearching ? '検索を閉じる' : '検索'}
              onClick={() => isSearching ? closeSearch() : setIsSearching(true)}
              style={{
                ...iconBtnStyle,
                background: isSearching ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {isSearching
                ? <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>✕</span>
                : ICO.search('#fff', 17)
              }
            </button>

            {/* 更新ボタン（取得中は回転） */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              aria-label="更新"
              style={{
                ...iconBtnStyle, width: 'auto', padding: '0 12px', gap: 6,
                fontFamily: F.sans, fontSize: 12, color: '#fff', fontWeight: 500,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <span style={spinStyle}>{ICO.refresh('#fff', 13)}</span>
              <span>{(isRefreshing || loading) ? '更新中' : '更新'}</span>
            </button>
          </div>
        </div>

        {/* 地本タブ（全地本・横スクロール） */}
        <div ref={tabScrollRef} style={{
          display: 'flex', overflowX: 'auto', gap: 4, padding: '0 16px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}>
          {ALL_PREF_TABS.map(t => {
            const isA = region === t.id;
            const count = (events[t.id] ?? []).length;
            return (
              <button
                key={t.id}
                ref={isA ? activeTabRef : null}
                onClick={() => { onRegionChange(t.id); closeSearch(); }}
                style={{
                  flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 8,
                  background: isA ? '#fff' : 'rgba(255,255,255,0.08)',
                  color: isA ? primary : 'rgba(255,255,255,0.75)',
                  padding: '8px 10px', minWidth: 56,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                <Emblem ch={t.emblem} size={16} primary={isA ? primary : '#fff'} />
                <span style={{ fontSize: 11, fontWeight: isA ? 700 : 500, letterSpacing: 0.5 }}>{t.label}</span>
                <span style={{ fontSize: 9, fontFamily: F.mono, opacity: 0.8 }}>{count}件</span>
              </button>
            );
          })}
        </div>

        {/* 検索バー（isSearching のときのみ表示） */}
        {isSearching && (
          <div style={{ padding: '10px 16px 0' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              {ICO.search('rgba(255,255,255,0.6)', 15)}
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="タイトル・場所・カテゴリで検索..."
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#fff', fontSize: 14, fontFamily: F.sans,
                  '::placeholder': { color: 'rgba(255,255,255,0.5)' },
                }}
              />
              {/* 入力があるときだけクリアボタン */}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="検索をクリア"
                  style={{
                    background: 'rgba(255,255,255,0.2)', border: 'none',
                    borderRadius: '50%', width: 18, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, padding: 0,
                    fontSize: 10, color: '#fff', fontWeight: 700,
                  }}
                >✕</button>
              )}
            </div>
            {/* 検索件数 */}
            {searchQuery && (
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6,
                paddingLeft: 2, fontFamily: F.mono,
              }}>
                {Object.values(filteredGrouped).flat().length} 件ヒット
              </div>
            )}
          </div>
        )}
      </div>

      {/* フィルターバー（検索中は非表示） */}
      {!isSearching && (
        <FilterBar
          events={list}
          activeCategory={activeCategory}
          activeTag={activeTag}
          onCategoryChange={handleCategoryChange}
          onTagChange={handleTagChange}
          primary={primary}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)' }}>
        <ErrorBanner message={error} />

        {/* 初回ローディング中はスピナー（既にデータがある場合は出さない） */}
        {loading && list.length === 0 ? <Spinner primary={primary} /> : (
          Object.keys(filteredGrouped).length === 0 ? (
            <EmptyState searchQuery={searchQuery} primary={primary} />
          ) : (
            Object.entries(filteredGrouped).map(([month, evs]) => (
              <div key={month}>
                {/* 月区切り */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 8px' }}>
                  <div style={{ fontFamily: F.serif, fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: 1 }}>
                    {month}
                  </div>
                  <div style={{ flex: 1, height: 1, background: 'var(--month-sep)' }} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono }}>{evs.length}件</div>
                </div>

                {evs.map(ev => {
                  const { m, d }   = splitDate(ev.date);
                  const endSplit   = ev.endDate ? splitDate(ev.endDate) : null;
                  const isWeekend  = /[土日祝]/.test(ev.weekday);
                  const dateColor  = isWeekend ? accent : primary;
                  const todayStr   = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
                  const isOngoing  = !!(ev.endDate && ev.date < todayStr);
                  const eventDays  = daysUntil(ev.endDate || ev.date);
                  const dlDays     = deadlineDaysUntil(ev.deadline);
                  // 開催まで7日以内、または締切まで3日以内のときバッジ表示
                  const showEvent  = !isOngoing && eventDays >= 0 && eventDays <= 7;
                  const showDl     = dlDays != null && dlDays >= 0 && dlDays <= 3;
                  return (
                    <div key={ev.id} onClick={() => onOpenDetail(ev)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onOpenDetail(ev)}
                      style={{
                        background: 'var(--card)', margin: '0 16px 10px', borderRadius: 12, minHeight: 72,
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(11,37,69,0.04),0 2px 8px rgba(11,37,69,0.05)',
                        border: `1px solid ${showDl ? '#f9731644' : showEvent ? `${primary}33` : 'var(--border)'}`,
                      }}>
                      <div style={{ display: 'flex', padding: '14px 16px', gap: 14 }}>
                        {/* 日付バッジ */}
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          minWidth: 48, borderRight: '1px solid var(--border)', paddingRight: 12,
                        }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: F.mono, letterSpacing: 1 }}>
                            {endSplit && endSplit.m !== m ? `${m}〜${endSplit.m}月` : `${m}月`}
                          </div>
                          <div style={{ fontFamily: F.serif, fontSize: endSplit ? 16 : 26, fontWeight: 600, lineHeight: 1, color: dateColor, marginTop: 2 }}>
                            {endSplit ? `${d}〜${endSplit.d}日` : d}
                          </div>
                          {ev.weekday && (
                            <div style={{ fontSize: 9, marginTop: 3, color: dateColor, fontWeight: 500 }}>
                              ({ev.endWeekday ? `${ev.weekday}〜${ev.endWeekday}` : ev.weekday})
                            </div>
                          )}
                        </div>
                        {/* テキスト */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 3, background: 'var(--tag-bg)', color: primary, letterSpacing: 0.5 }}>
                              {ev.category}
                            </span>
                            {ev.tag && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{ev.tag}</span>}
                            {isOngoing && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#22c55e22', color: '#15803d', fontFamily: F.mono }}>
                                開催中
                              </span>
                            )}
                            {/* 締切カウントダウン（3日以内） */}
                            {showDl && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                                background: '#f9731622', color: '#f97316',
                                fontFamily: F.mono, letterSpacing: 0.5,
                              }}>
                                締切 {daysLabel(dlDays, 'deadline')}
                              </span>
                            )}
                            {/* 開催カウントダウン（7日以内・締切バッジ非表示時） */}
                            {showEvent && !showDl && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                                background: `${daysColor(eventDays, primary, accent)}18`,
                                color: daysColor(eventDays, primary, accent),
                                fontFamily: F.mono, letterSpacing: 0.5,
                              }}>
                                {daysLabel(eventDays, 'event')}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, letterSpacing: 0.2, flex: 1, minWidth: 0 }}>
                              {ev.title}
                            </div>
                            {favorites && favorites.has(ev.id) && ICO.star(accent, 12, accent)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-sub)' }}>
                            {ICO.pin('var(--text-sub)', 12)} {ev.place}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>{ICO.chev('var(--icon-muted)', 12)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )
        )}

        {/* 最終確認日時（更新ボタンを押すたびに現在時刻に更新） */}
        <div style={{ textAlign: 'center', padding: '10px 20px 16px', fontSize: 10, color: 'var(--text-muted)' }}>
          最終確認 <span style={{ fontFamily: F.mono, color: 'var(--text)' }}>{checkedLabel}</span>
        </div>
      </div>

      <BottomTabBar active="list" onChange={id => {
        if (id === 'home')           onOpenHome();
        else if (id === 'settings')  onOpenSettings();
        else if (id === 'favorites') onOpenFavorites();
      }} primary={primary} />
    </div>
  );
}

// ─── 空状態（検索ヒットなし or イベントなし） ──────────────
function EmptyState({ searchQuery, primary }) {
  if (searchQuery) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        {ICO.search('var(--icon-muted)', 36)}
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, fontWeight: 500, fontFamily: F.sans }}>
          「{searchQuery}」に一致するイベントはありません
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          別のキーワードで検索してみてください
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, fontFamily: F.sans }}>
      現在公開中のイベントはありません
    </div>
  );
}
