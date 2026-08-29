import { useState, useMemo, useRef, useEffect } from 'react';
import { ICO } from './Icons';
import { useIsShortViewport } from '../hooks/useBreakpoint';
import { Emblem, BottomTabBar, F, splitDate, parseYM, Spinner, ErrorBanner, iconBtnStyle, StatusBadge } from './Shared';
import FilterBar, { STANDARD_CATEGORIES, calcPeriodCounts, weekendRange, matchesTag, matchesBranch, APPLIED_TAG_ID, ENDED_TAG_ID } from './FilterBar';
import CalendarView from './CalendarView';
import { daysUntil, deadlineDaysUntil, daysLabel, daysColor } from '../utils/date';
import { REGIONS, SUPPORTED_PREFECTURES, PREFECTURE_INFO, NEIGHBORS } from '../data/regionMap';

// ── 地方タブ（第1段）─────────────────────────────────────────
const REGION_TABS = [
  { id: 'all',      label: '全国',  short: '全' },
  { id: 'hokkaido', label: '北海道', short: '道' },
  { id: 'tohoku',   label: '東北',  short: '東' },
  { id: 'kanto',    label: '関東',  short: '関' },
  { id: 'chubu',    label: '中部',  short: '中' },
  { id: 'kinki',    label: '近畿',  short: '近' },
  { id: 'chugoku',  label: '中国',  short: '国' },
  { id: 'shikoku',  label: '四国',  short: '四' },
  { id: 'kyushu',   label: '九州',  short: '九' },
];

// region prop から activeRegionId / activePrefId を導出するヘルパー
function deriveRegionAndPref(region) {
  if (region === 'all') return { regionId: 'all', prefId: 'all' };
  if (REGIONS.find(r => r.id === region)) return { regionId: region, prefId: 'all' };
  const info = PREFECTURE_INFO[region];
  if (info) return { regionId: info.region, prefId: region };
  return { regionId: 'all', prefId: 'all' };
}

function officeSourceLabel(ev) {
  if (!ev?.source_type) return null;
  if (ev.source_type === 'office_notice') return '公式確認';
  if (ev.source_type.startsWith('office_')) return '募集案内所';
  return null;
}

export default function ListScreen({
  events, loading, error, updatedAt, checkedAt, onRefresh,
  stale, lastSyncedAt,   // 表示中のデータが最新でない（オフライン・取得失敗）／最後に取得できた日時
  region, onRegionChange,
  favorites, applied, onToggleApplied,
  onOpenHome, onOpenDetail, onOpenSettings, onOpenFavorites,
  theme,
  selectedId,   // デスクトップ2ペイン時に右ペインで開いているイベントID（一覧で強調表示）
}) {
  // 横向きスマホなど高さの足りない画面ではヘッダーを詰める
  const shortVp = useIsShortViewport();
  // region prop から2段タブの状態を導出
  const { regionId: activeRegionId, prefId: activePrefId } = deriveRegionAndPref(region);

  // アクティブ地方の都道府県タブ一覧
  const prefTabs = useMemo(() => {
    if (activeRegionId === 'all') return [];
    return (REGIONS.find(r => r.id === activeRegionId)?.prefectures ?? [])
      .filter(p => SUPPORTED_PREFECTURES.has(p.id));
  }, [activeRegionId]);

  // 地方別イベント数（第1段タブのバッジ用）
  const regionCounts = useMemo(() => {
    const counts = {};
    counts['all'] = Object.entries(events)
      .filter(([k]) => SUPPORTED_PREFECTURES.has(k))
      .reduce((s, [, evs]) => s + (Array.isArray(evs) ? evs.length : 0), 0);
    for (const r of REGIONS) {
      counts[r.id] = r.prefectures
        .filter(p => SUPPORTED_PREFECTURES.has(p.id))
        .reduce((s, p) => s + (Array.isArray(events[p.id]) ? events[p.id].length : 0), 0);
    }
    return counts;
  }, [events]);

  const list = useMemo(() => {
    if (region === 'all') {
      return Object.entries(events)
        .filter(([key]) => SUPPORTED_PREFECTURES.has(key))
        .flatMap(([, evs]) => Array.isArray(evs) ? evs : []);
    }
    // 地方レベル選択（region = region ID）
    const regionData = REGIONS.find(r => r.id === region);
    if (regionData) {
      const prefIds = new Set(regionData.prefectures.filter(p => SUPPORTED_PREFECTURES.has(p.id)).map(p => p.id));
      return Object.entries(events)
        .filter(([k]) => prefIds.has(k))
        .flatMap(([, evs]) => Array.isArray(evs) ? evs : []);
    }
    // 都道府県レベル選択
    return events[region] ?? [];
  }, [region, events]);

  // 第1段（地方）タブ横スクロール
  const regionTabScrollRef = useRef(null);
  const activeRegionTabRef = useRef(null);
  useEffect(() => {
    const c = regionTabScrollRef.current, b = activeRegionTabRef.current;
    if (!c || !b) return;
    c.scrollLeft = Math.max(0, b.offsetLeft - c.clientWidth / 2 + b.offsetWidth / 2);
  }, [activeRegionId]);

  // 第2段（都道府県）タブ横スクロール
  const prefTabScrollRef = useRef(null);
  const activePrefTabRef = useRef(null);
  useEffect(() => {
    const c = prefTabScrollRef.current, b = activePrefTabRef.current;
    if (!c || !b) return;
    c.scrollLeft = Math.max(0, b.offsetLeft - c.clientWidth / 2 + b.offsetWidth / 2);
  }, [activePrefId]);

  // タブ切り替え時にリストを先頭へ
  const tabScrollRef    = useRef(null);  // 後方互換のため残す（listScrollRef の別名）
  const activeTabRef    = useRef(null);

  // タブ切り替え時にイベントリストを先頭へスクロール
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [region]);

  // 地方タブクリック時の処理
  const handleRegionClick = (rId) => {
    onRegionChange(rId);
    setActiveCategory('all'); setActiveTag('all'); setActivePeriod('all'); setSearchQuery('');
  };
  // 都道府県タブクリック時の処理（地方IDまたは都道府県ID）
  const handlePrefClick = (pId) => {
    onRegionChange(pId);
    setActiveCategory('all'); setActiveTag('all'); setActivePeriod('all'); setSearchQuery('');
  };

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

  // ── フィルターバー 折り畳み状態 ──────────────────────────
  // 既定は収納。上部にコントロールが積み上がりイベントカードへの到達が遅れるのを避け、
  // 収納時は適用中のフィルタだけをチップで表示する（フィードバック§4-2⑥）。
  // 以前に自分で開いた利用者は展開状態を保持する。
  const [filterOpen, setFilterOpen] = useState(() => {
    try { return localStorage.getItem('jsdf-filter-open') === 'true'; } catch { return false; }
  });
  const handleToggleFilter = () => {
    setFilterOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('jsdf-filter-open', String(next)); } catch {}
      return next;
    });
  };

  // ── 表示形式（カード / カレンダー）── 設定画面で選択・保持する（localStorage）。
  // マウント時に読み込む（設定変更後に一覧へ戻ると再マウントされ反映される）。
  const [viewMode] = useState(() => {
    try { return localStorage.getItem('jsdf-view-mode') === 'calendar' ? 'calendar' : 'card'; } catch { return 'card'; }
  });

  // ── 免責バナー 折り畳み ──────────────────────────────────
  // 初回のみ全文表示し、以降は1行に畳む（詳細画面に免責文言があるため役割は保たれる）。
  // 既読フラグは localStorage に置く（フィードバック§4-2⑥）。
  const [noticeRead] = useState(() => {
    try { return localStorage.getItem('jsdf-notice-read') === '1'; } catch { return false; }
  });
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  useEffect(() => {
    // 今回の表示をもって既読とし、次回以降は畳む（当回は全文のまま見せる）
    if (!noticeRead) { try { localStorage.setItem('jsdf-notice-read', '1'); } catch {} }
  }, [noticeRead]);
  // 高さが足りない画面では、未読でも1行に畳む（タップで全文を表示できる）。
  const noticeFolded = (noticeRead || shortVp) && !noticeExpanded;

  // ── カテゴリ・タグ・期間・種別 フィルター ─────────────────
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag,      setActiveTag]      = useState('all');
  const [activePeriod,   setActivePeriod]   = useState('all');
  const [activeBranch,   setActiveBranch]   = useState('all');

  // カテゴリ・タグ・期間・種別を変更しても検索テキストはリセットしない（同時適用）
  const handleCategoryChange = (cat)    => setActiveCategory(cat);
  const handleTagChange      = (tag)    => setActiveTag(tag);
  const handlePeriodChange   = (period) => setActivePeriod(period);
  const handleBranchChange   = (branch) => setActiveBranch(branch);

  // ── フィルター適用済みリスト（期間×カテゴリ×タグ×種別、開催日昇順） ──
  const filteredList = useMemo(() => {
    // JST の今日を YYYY-MM-DD 文字列で取得
    const tStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const Y  = Number(tStr.slice(0, 4));
    const Mo = Number(tStr.slice(5, 7)); // 1-indexed

    // n 日後の YYYY-MM-DD（UTC 基準で計算→ TZ 影響なし）
    const addDays = (s, n) => {
      const d = new Date(s + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    // 月の末日（1-indexed month）
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pad = n => String(n).padStart(2, '0');

    const wStr = addDays(tStr, 6);
    // 来週＝今週（今日〜6日後）の続きの7日間。暦の月〜日にすると今週との間に
    // 隙間・重なりができるため、相対期間で揃える（FilterBar の件数計算と同じ）
    const nwS  = addDays(tStr, 7);
    const nwE  = addDays(tStr, 13);
    const mStr = `${Y}-${pad(Mo)}-${pad(lastDay(Y, Mo))}`;
    const { sat: satStr, sun: sunStr } = weekendRange(tStr);

    // 来月（年またぎ対応）
    const nmY = Mo === 12 ? Y + 1 : Y;
    const nmM = Mo === 12 ? 1 : Mo + 1;
    const nmS = `${nmY}-${pad(nmM)}-01`;
    const nmE = `${nmY}-${pad(nmM)}-${pad(lastDay(nmY, nmM))}`;

    const isEndedFilter = activeTag === ENDED_TAG_ID;
    return list
      .filter(ev => {
        const catOk = activeCategory === 'all'
          || (activeCategory === 'その他' ? !STANDARD_CATEGORIES.includes(ev.category) : ev.category === activeCategory);
        const tagOk = activeTag === 'all' || isEndedFilter
          || (activeTag === APPLIED_TAG_ID ? (applied?.has(ev.id) ?? false) : matchesTag(ev, activeTag));
        // 陸・海・空。判定できないイベントは種別を選ぶと外れる（推測で見せない）
        const branchOk = matchesBranch(ev, activeBranch);

        // 終了済みの表示制御:
        //  - 「終了済み」タグ選択時 → 終了済みのみ表示
        //  - 通常時 → 終了済みは非表示。ただしお気に入り登録済みは7日間は表示
        const endedOk = isEndedFilter
          ? !!ev.ended
          : (!ev.ended || (favorites?.has(ev.id) ?? false));

        const ee = ev.endDate ?? ev.date;
        let periodOk = true;
        if (activePeriod === 'today')     periodOk = ev.date <= tStr && ee >= tStr;
        if (activePeriod === 'weekend')   periodOk = ev.date <= sunStr && ee >= satStr && ee >= tStr;
        if (activePeriod === 'thisWeek')  periodOk = ev.date <= wStr && ee >= tStr;
        if (activePeriod === 'nextWeek')  periodOk = ev.date <= nwE && ee >= nwS;
        if (activePeriod === 'thisMonth') periodOk = ev.date <= mStr && ee >= tStr;
        // 来月：開始日が来月の範囲に入るイベントのみ（今月開始来月終了のイベントは除外）
        if (activePeriod === 'nextMonth') periodOk = ev.date >= nmS && ev.date <= nmE;

        return catOk && tagOk && branchOk && periodOk && endedOk;
      })
      .sort((a, b) => {
        // 日程未定（date=""）は常に末尾へ
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });
  }, [list, activeCategory, activeTag, activePeriod, activeBranch, favorites, applied]);

  // ── イベントグループ化 ─────────────────────────────────────
  const grouped = useMemo(() => {
    const g = {};
    for (const e of filteredList) {
      // date が空（日程未定）の場合は専用グループへ（filteredList は末尾に並ぶ）
      const k = e.date ? parseYM(e.date) : '日程未定';
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
  const todayStr = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
  // checkedAt: 更新ボタンを押した（または自動フェッチした）時刻（ローカル）
  // updatedAt: スクレイパーがデータを書いた時刻（JSON内）
  const checkedLabel = checkedAt ?? updatedAt ?? new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).replace(',', '');
  // オフライン・取得失敗のときに「確認 <今の時刻>」を出すと、最新を取れたように読める。
  // その場合は最後に取得できた日時を示す（見えている情報がいつ時点かを取り違えさせない）。
  const staleLabel   = stale && lastSyncedAt ? lastSyncedAt : null;

  // 更新ボタンの回転アニメーション（spin は main.jsx で定義済み）
  const spinStyle = (isRefreshing || loading)
    ? { display: 'inline-flex', animation: 'spin 0.7s linear infinite' }
    : { display: 'inline-flex' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: shortVp ? 'calc(env(safe-area-inset-top, 0px) + 6px)'
                            : 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: shortVp ? 6 : 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: shortVp ? '0 20px 6px' : '0 20px 10px' }}>
          <div>
            {!shortVp && (
              <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>EVENTS</div>
            )}
            <div style={{ fontFamily: F.serif, fontSize: shortVp ? 16 : 19, fontWeight: 600, letterSpacing: 1, marginTop: shortVp ? 0 : 2 }}>イベント一覧</div>
            {/* ⑥ 更新時刻をヘッダーに表示（高さが足りないときは省く） */}
            {!shortVp && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 3, fontFamily: F.mono }}>
                {staleLabel ? `最終取得 ${staleLabel}` : `確認 ${checkedLabel}`}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* ② 検索ボタン — アイコン＋ラベルで目立たせる */}
            <button
              aria-label={isSearching ? '検索を閉じる' : '検索'}
              onClick={() => isSearching ? closeSearch() : setIsSearching(true)}
              style={{
                ...iconBtnStyle,
                width: 'auto', padding: '0 12px', gap: 5,
                fontFamily: F.sans, fontSize: 12, color: '#fff', fontWeight: 500,
                background: isSearching ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
              }}
            >
              {isSearching
                ? <><span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✕</span><span>閉じる</span></>
                : <>{ICO.search('#fff', 15)}<span>検索</span></>
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

        {/* ── 第1段: 地方タブ ── */}
        <div ref={regionTabScrollRef} className="jsdf-hscroll" style={{
          display: 'flex', overflowX: 'auto', gap: 4, padding: '0 16px 6px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
          onWheel={e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }}
        >
          {REGION_TABS.map(rt => {
            const isA = activeRegionId === rt.id;
            const cnt = regionCounts[rt.id] ?? 0;
            return (
              <button
                key={rt.id}
                ref={isA ? activeRegionTabRef : null}
                onClick={() => handleRegionClick(rt.id)}
                style={{
                  flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 20,
                  background: isA ? '#fff' : 'rgba(255,255,255,0.1)',
                  color: isA ? primary : 'rgba(255,255,255,0.82)',
                  padding: '6px 12px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: isA ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: isA ? 700 : 500, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                  {rt.label}
                </span>
                <span style={{ fontSize: 10, fontFamily: F.mono, opacity: 0.75 }}>{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* ── 第2段: 都道府県タブ（地方選択時のみ表示） ── */}
        {activeRegionId !== 'all' && prefTabs.length > 0 && (
          <div ref={prefTabScrollRef} className="jsdf-hscroll" style={{
            display: 'flex', overflowX: 'auto', gap: 3, padding: '4px 16px 8px',
            scrollbarWidth: 'none', msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            borderTop: '1px solid rgba(255,255,255,0.12)',
          }}
            onWheel={e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }}
          >
            {/* 全地域ボタン */}
            {(() => {
              const isA = activePrefId === 'all';
              const cnt = regionCounts[activeRegionId] ?? 0;
              return (
                <button
                  ref={isA ? activePrefTabRef : null}
                  onClick={() => handlePrefClick(activeRegionId)}
                  style={{
                    flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 6,
                    background: isA ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.08)',
                    color: isA ? primary : 'rgba(255,255,255,0.7)',
                    padding: '5px 9px', minWidth: 44,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: isA ? 700 : 500 }}>全地域</span>
                  <span style={{ fontSize: 9, fontFamily: F.mono, opacity: 0.75 }}>{cnt}件</span>
                </button>
              );
            })()}
            {/* 個別都道府県 */}
            {prefTabs.map(p => {
              const isA = activePrefId === p.id;
              const cnt = (events[p.id] ?? []).length;
              return (
                <button
                  key={p.id}
                  ref={isA ? activePrefTabRef : null}
                  onClick={() => handlePrefClick(p.id)}
                  style={{
                    flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 6,
                    background: isA ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.08)',
                    color: isA ? primary : 'rgba(255,255,255,0.7)',
                    padding: '5px 9px', minWidth: 44,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  <Emblem ch={p.emblem} size={14} primary={isA ? primary : 'rgba(255,255,255,0.6)'} />
                  <span style={{ fontSize: 10, fontWeight: isA ? 700 : 500, whiteSpace: 'nowrap' }}>{p.label}</span>
                  <span style={{ fontSize: 9, fontFamily: F.mono, opacity: 0.75 }}>{cnt}件</span>
                </button>
              );
            })}
          </div>
        )}

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
            {/* 検索ヒット数 or アクティブフィルター状況 */}
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6,
              paddingLeft: 2, fontFamily: F.mono,
              display: 'flex', gap: 10, flexWrap: 'wrap',
            }}>
              {searchQuery && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {ICO.search('rgba(255,255,255,0.65)', 12)} {Object.values(filteredGrouped).flat().length} 件ヒット
                </span>
              )}
              {activePeriod !== 'all' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {ICO.cal('rgba(255,255,255,0.65)', 12)} 期間フィルター適用中
                </span>
              )}
              {(activeCategory !== 'all' || activeTag !== 'all' || activeBranch !== 'all') && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {ICO.tag('rgba(255,255,255,0.65)', 12)} カテゴリ絞り込み中
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* フィルターバー（期間 / カテゴリ / タグ） ── 検索と同時適用可 */}
      <FilterBar
        events={list}
        applied={applied}
        activeCategory={activeCategory}
        activeTag={activeTag}
        activePeriod={activePeriod}
        activeBranch={activeBranch}
        onCategoryChange={handleCategoryChange}
        onTagChange={handleTagChange}
        onPeriodChange={handlePeriodChange}
        onBranchChange={handleBranchChange}
        primary={primary}
        collapsed={!filterOpen}
        onToggleCollapsed={handleToggleFilter}
      />

      {/* 非公式サービス注意バナー（初回のみ全文・以降は1行に畳む／タップで展開） */}
      {noticeFolded ? (
        <button
          onClick={() => setNoticeExpanded(true)}
          aria-label="免責事項を表示"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            padding: '5px 14px', background: 'var(--notice-bg, rgba(120,100,0,0.07))',
            borderBottom: '1px solid var(--notice-border, rgba(120,100,0,0.13))',
            border: 'none', cursor: 'pointer', textAlign: 'left', flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', flexShrink: 0 }}>{ICO.warn(undefined, 12)}</span>
          <span style={{
            fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0,
          }}>
            非公式の情報まとめです。最新情報は公式ページでご確認ください
          </span>
        </button>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          padding: '7px 14px', background: 'var(--notice-bg, rgba(120,100,0,0.07))',
          borderBottom: '1px solid var(--notice-border, rgba(120,100,0,0.13))',
          flexShrink: 0,
        }}>
          <span style={{ display: 'flex', marginTop: 1, flexShrink: 0 }}>{ICO.warn(undefined, 12)}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            当サービスは非公式の情報まとめです。参加・申込・中止・変更などの最新情報は、各地方協力本部の公式ページで必ずご確認ください。
          </span>
        </div>
      )}

      <div ref={listScrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)' }}>
        <ErrorBanner message={error} />

        {/* 初回ローディング中はスピナー（既にデータがある場合は出さない） */}
        {loading && list.length === 0 ? <Spinner primary={primary} /> : (
          viewMode === 'calendar' ? (
            <CalendarView
              events={filteredList}
              onOpenDetail={onOpenDetail}
              primary={primary}
              accent={accent}
              favorites={favorites}
              applied={applied}
              activePrefId={activePrefId}
            />
          ) :
          Object.keys(filteredGrouped).length === 0 ? (
            <EmptyState
              searchQuery={searchQuery}
              primary={primary}
              prefId={activePrefId}
              events={events}
              onSelectPref={handlePrefClick}
            />
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

                {evs.map((ev, evIdx) => {
                  const { m, d }   = ev.date ? splitDate(ev.date) : { m: null, d: null };
                  const endSplit   = ev.endDate ? splitDate(ev.endDate) : null;
                  const isWeekend  = /[土日祝]/.test(ev.weekday);
                  const dateColor  = isWeekend ? accent : primary;
                  const isOngoing  = !!(ev.endDate && ev.date < todayStr);
                  const eventDays  = daysUntil(ev.endDate || ev.date);
                  const dlDays     = deadlineDaysUntil(ev.deadline);
                  const sourceLabel = officeSourceLabel(ev);
                  // 開催まで7日以内、または締切まで7日以内のときバッジ表示。
                  // 締切は一覧を眺めるだけで優先度が分かるよう表示窓を広げ、
                  // 残り日数に応じて色（近いほど赤→橙）を変える（フィードバック§2-2-7）。
                  const showEvent  = !isOngoing && eventDays >= 0 && eventDays <= 7;
                  const showDl     = dlDays != null && dlDays >= 0 && dlDays <= 7;
                  const dlColor    = dlDays != null ? daysColor(dlDays, '#f97316', '#f97316') : '#f97316';
                  // key には id だけでなく月内インデックスも含める。
                  // 同一日・同名イベントや稀なハッシュ衝突で id が重複しても、
                  // React の key 衝突（リスト縮小時に旧DOMが残る不具合）を防ぐ。
                  return (
                    <div key={`${ev.id}#${evIdx}`} onClick={() => onOpenDetail(ev)} role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onOpenDetail(ev)}
                      style={{
                        background: 'var(--card)', margin: '0 16px 10px', borderRadius: 'var(--radius-container)', minHeight: 72,
                        cursor: 'pointer',
                        boxShadow: selectedId === ev.id
                          ? `0 0 0 2px ${primary}`
                          : '0 1px 2px rgba(11,37,69,0.04),0 2px 8px rgba(11,37,69,0.05)',
                        border: `1px solid ${selectedId === ev.id ? primary : (showDl && dlDays <= 3) ? '#f9731644' : showEvent ? `${primary}33` : 'var(--border)'}`,
                      }}>
                      <div style={{ display: 'flex', padding: '14px 16px', gap: 14 }}>
                        {/* 日付バッジ */}
                        <div style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          minWidth: 48, borderRight: '1px solid var(--border)', paddingRight: 12,
                        }}>
                          {m !== null ? (
                            <>
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
                            </>
                          ) : (
                            /* 日程未定イベント（CF ブロックで日付取得不能） */
                            <div style={{
                              fontSize: 10, color: 'var(--text-muted)', fontFamily: F.sans,
                              textAlign: 'center', lineHeight: 1.5, fontWeight: 500,
                            }}>
                              日程<br/>未定
                            </div>
                          )}
                        </div>
                        {/* テキスト */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* 中止/受付終了は終了済みより優先して目立たせる */}
                            <StatusBadge status={ev.status} size="sm" />
                            {ev.ended && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#6b7280', color: '#fff', letterSpacing: 0.5, flexShrink: 0 }}>終了済み</span>
                            )}
                            {/* カテゴリは角ばったタグ型（装備品の規格ラベル調・フィードバック§4-2⑤） */}
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-tag)', background: 'var(--tag-bg)', color: primary, letterSpacing: 0.5 }}>
                              {ev.category}
                            </span>
                            {ev.tag && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{ev.tag}</span>}
                            {sourceLabel && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                                background: `${primary}12`, color: primary,
                                letterSpacing: 0.5, flexShrink: 0,
                              }}>
                                {sourceLabel}
                              </span>
                            )}
                            {favorites?.has(ev.id) && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                                background: `${accent}22`, color: accent,
                                letterSpacing: 0.5, flexShrink: 0,
                              }}>★</span>
                            )}
                            {applied?.has(ev.id) && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                                background: '#16a34a', color: '#fff',
                                fontFamily: F.mono, letterSpacing: 0.5, flexShrink: 0,
                              }}>✓ 申請済</span>
                            )}
                            {isOngoing && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#22c55e22', color: '#15803d', fontFamily: F.mono }}>
                                開催中
                              </span>
                            )}
                            {/* 締切カウントダウン（3日以内） */}
                            {showDl && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                                background: `${dlColor}22`, color: dlColor,
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
                            {/* 全国・地方タブ時：掲載元の地本名を小さく表示 */}
                            {activePrefId === 'all' && ev.pref && (
                              <span style={{
                                fontSize: 10, color: 'var(--text-muted)', fontFamily: F.mono,
                                marginLeft: 'auto', flexShrink: 0,
                              }}>
                                {(PREFECTURE_INFO[ev.pref]?.label ?? ev.pref)}地本
                              </span>
                            )}
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{
                              fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, letterSpacing: 0.2,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                              overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word',
                            }}>
                              {ev.title}
                            </div>
                          </div>
                          {ev.place && String(ev.place).trim() && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, color: 'var(--text-sub)' }}>
                              <span style={{ flexShrink: 0, display: 'flex', marginTop: 1 }}>{ICO.pin('var(--text-sub)', 12)}</span>
                              <span style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{ev.place}</span>
                            </div>
                          )}
                          {/* ④ URLあり → 公式ページ確認バッジ */}
                          {ev.url && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5, fontSize: 10, color: primary, fontWeight: 600 }}>
                              {ICO.extLink(primary, 10)} 公式ページで確認
                            </div>
                          )}
                        </div>
                        {/* 申請済みトグルボタン */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={e => { e.stopPropagation(); onToggleApplied?.(ev.id); }}
                            aria-label={applied?.has(ev.id) ? '申請済みを解除' : '申請済みにする'}
                            style={{
                              width: 34, height: 34, borderRadius: 8, border: 'none', padding: 0,
                              background: applied?.has(ev.id) ? '#16a34a18' : 'var(--tag-bg)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            {ICO.applied(applied?.has(ev.id) ? '#16a34a' : 'var(--icon-muted)', 17, applied?.has(ev.id))}
                          </button>
                          {ICO.chev('var(--icon-muted)', 12)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )
        )}

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
function EmptyState({ searchQuery, primary, prefId, events, onSelectPref }) {
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

  // 特定の地本を選んでいて、その地本にイベントが1件も無いときは近隣を案内する
  // （フィルタで0件になった場合＝地本自体には掲載あり、は対象外）。
  const isSpecificPref = prefId && prefId !== 'all' && SUPPORTED_PREFECTURES.has(prefId);
  const prefEmpty = isSpecificPref && (events?.[prefId]?.length ?? 0) === 0;
  const nearby = prefEmpty
    ? (NEIGHBORS[prefId] || [])
        .map(id => ({ id, count: events?.[id]?.length ?? 0, label: PREFECTURE_INFO[id]?.label ?? id }))
        .filter(n => n.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
    : [];

  const prefLabel = isSpecificPref ? (PREFECTURE_INFO[prefId]?.label ?? prefId) : '';

  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, fontFamily: F.sans }}>
      <div>
        {prefEmpty ? `${prefLabel}地本は現在、公開中のイベントがありません` : '現在公開中のイベントはありません'}
      </div>
      {nearby.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-sub)', marginBottom: 10 }}>
            近隣の地本で開催予定があります
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {nearby.map(n => (
              <button
                key={n.id}
                onClick={() => onSelectPref?.(n.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${primary}33`, background: 'var(--card)',
                  color: 'var(--text)', borderRadius: 999, padding: '7px 14px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.sans,
                }}
              >
                <Emblem ch={PREFECTURE_INFO[n.id]?.emblem ?? n.label.charAt(0)} size={15} primary={primary} />
                <span>{n.label}</span>
                <span style={{ fontSize: 11, fontFamily: F.mono, color: primary, fontWeight: 700 }}>{n.count}件</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
