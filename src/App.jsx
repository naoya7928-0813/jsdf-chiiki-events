import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useEvents } from './hooks/useEvents';
// 遅延読込は lazyWithRecovery 経由（旧チャンクが消えた時に自動復旧する。utils/lazyChunk.js）
import { lazyWithRecovery } from './utils/lazyChunk';
import { COLOR_SCHEMES, DEFAULT_SCHEME } from './config';
import { PREFECTURE_INFO } from './data/regionMap';
import { OperatorNavContext } from './components/Shared';
import { useBreakpoint, LayoutModeContext, isPhoneSized } from './hooks/useBreakpoint';
import { applyOrientationPreference } from './utils/orientation';
import SideNav from './components/SideNav';
import { ICO }           from './components/Icons';
import HomeScreen        from './components/HomeScreen';
import ListScreen        from './components/ListScreen';
import RegionScreen       from './components/RegionScreen';
import SplashScreen       from './components/SplashScreen';
// 初期表示に不要な画面は遅延読込でバンドル分割（フィードバック§1-2③）。
// トップを開いただけで詳細・設定・報告等のコードまで落とさない。
const DetailScreen       = lazyWithRecovery(() => import('./components/DetailScreen'));
const SettingsScreen     = lazyWithRecovery(() => import('./components/SettingsScreen'));
const NotificationScreen = lazyWithRecovery(() => import('./components/NotificationScreen'));
const FavoritesScreen    = lazyWithRecovery(() => import('./components/FavoritesScreen'));
const LegalScreen        = lazyWithRecovery(() => import('./components/LegalScreen'));
const ReportScreen       = lazyWithRecovery(() => import('./components/ReportScreen'));
// 管理画面は運営者ページ(/admin.html)でのみ使う。遅延読込で公開バンドルから分離する。
const AdminScreen = lazyWithRecovery(() => import('./components/AdminScreen'));

// ─── localStorage 復元ヘルパー ────────────────────────────────
function loadScheme()       { try { return localStorage.getItem('jsdf-scheme') || DEFAULT_SCHEME; } catch { return DEFAULT_SCHEME; } }
function loadRegion()       { try { return localStorage.getItem('jsdf-region') || 'all';          } catch { return 'all';          } }
function loadDarkMode()     { try { return localStorage.getItem('jsdf-dark')   || 'system';       } catch { return 'system';       } }
function loadLastMapRegion(){ try { return localStorage.getItem('jsdf-last-region') || null;       } catch { return null;           } }
function loadLastPrefId()   { try { return localStorage.getItem('jsdf-last-pref')   || null;       } catch { return null;           } }
function loadAutoMode()     { try { return localStorage.getItem('jsdf-auto-mode') !== 'false';    } catch { return true;           } }
function loadLayoutMode()   { try { return localStorage.getItem('jsdf-layout-mode') || 'auto';    } catch { return 'auto';         } }

// favorites: イベントIDの Set として管理
function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('jsdf-favorites') || '[]')); } catch { return new Set(); }
}

// applied: 申請済みイベントIDの Set として管理
function loadApplied() {
  try { return new Set(JSON.parse(localStorage.getItem('jsdf-applied') || '[]')); } catch { return new Set(); }
}

// 既知イベントID（新着検出用）
function loadKnownIds() {
  try { return new Set(JSON.parse(localStorage.getItem('jsdf-known-ids') || '[]')); } catch { return new Set(); }
}
// 通知履歴
function loadNotifHistory() {
  try { return JSON.parse(localStorage.getItem('jsdf-notif-history') || '[]'); } catch { return []; }
}

// OS のカラースキームを考慮してダークモードを解決する
function resolveIsDark(mode) {
  if (mode === 'dark')  return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── URL同期（イベント個別URL・戻るボタン・リロード復元） ─────────
// 画面状態を history/URL に反映する薄いルーティング。
// /event/:id で個別イベントへ直接リンクでき、共有・SNS・リロードに対応する。
// Vercel 側の SPA rewrite（vercel.json）が任意パスで index.html を返すため
// サーバー設定は不要。運営者ページ(/admin.html)は URL 体系が別のため対象外。
const ROUTE_SCREENS = {
  home: '/', list: '/list', favorites: '/favorites',
  settings: '/settings', notifications: '/notifications',
};

export default function App({ operator = false }) {
  // ── スプラッシュ ──────────────────────────────────────────
  // 世界観の演出だが毎回2〜3秒は毎日使う利用者の負担になるため、
  // セッション内の初回のみ表示する（同一セッションのリロード・画面遷移では再生しない。
  // 運営者ページでは表示しない）。（フィードバック§2-2-1）
  const [showSplash, setShowSplash] = useState(() => {
    if (operator) return false;
    try { return sessionStorage.getItem('jsdf-splash-shown') !== '1'; } catch { return true; }
  });
  const handleSplashDone = useCallback(() => {
    try { sessionStorage.setItem('jsdf-splash-shown', '1'); } catch {}
    setShowSplash(false);
  }, []);

  // ── デスクトップ2ペイン判定（フィードバック§2-2-8） ──────────────
  // 広い画面では一覧の余白が大きいため、一覧（左）＋詳細（右）の2ペインにする。
  // 運営者ページは対象外。
  const [isWide, setIsWide] = useState(() => {
    try { return !operator && window.matchMedia('(min-width: 1000px)').matches; } catch { return false; }
  });
  useEffect(() => {
    if (operator) return;
    const mq = window.matchMedia('(min-width: 1000px)');
    const apply = () => setIsWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [operator]);

  // 画面幅の区分。デスクトップ(1024px～)では左サイドナビ + 各画面の横幅活用に切り替える。
  // 運営者ページは従来の縦長レイアウトのままにする。
  // 表示の向き（自動 / 横向き / 縦向き）。スマホでの見え方を利用者が選べる。
  const [layoutMode, setLayoutMode] = useState(loadLayoutMode);
  const handleLayoutModeChange = useCallback((mode) => {
    setLayoutMode(mode);
    try { localStorage.setItem('jsdf-layout-mode', mode); } catch {}
    // 端末の向きそのもののロックは、対応環境でのみ試みる（iOS は非対応）
    applyOrientationPreference(mode);
  }, []);
  useEffect(() => { applyOrientationPreference(layoutMode); }, [layoutMode]);

  const breakpoint      = useBreakpoint(layoutMode);
  const isDesktopLayout = !operator && breakpoint === 'desktop';

  // ── ナビゲーション ────────────────────────────────────────
  const [screen,      setScreen]      = useState('home');
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailBack,  setDetailBack]  = useState('region');
  const [legalDoc,    setLegalDoc]    = useState(null);
  const [reportTarget, setReportTarget] = useState(null);  // 報告対象イベント（詳細から報告時）
  const [reportBack,   setReportBack]   = useState('settings'); // 報告画面の戻り先

  // 地図で選択中の地域ID（null = 未選択）
  // 起動時は常に未選択（前回セッションの選択を引き継がない）
  const [mapRegionId,  setMapRegionId]  = useState(null);
  // RegionScreen で選択中の都道府県ID
  const [activePrefId, setActivePrefId] = useState(loadLastPrefId);

  // 最後に開いた地域を保存して BottomTabBar「イベント」から復帰可能にする
  const saveLastRegion = useCallback((regionId, prefId) => {
    setMapRegionId(regionId);
    setActivePrefId(prefId);
    try {
      if (regionId) localStorage.setItem('jsdf-last-region', regionId);
      if (prefId)   localStorage.setItem('jsdf-last-pref',   prefId);
    } catch {}
  }, []);

  const openDetail = useCallback((ev, backTo = 'region') => {
    setDetailEvent(ev);
    setDetailBack(backTo);
    // 広い画面で一覧から開いた場合は、画面遷移せず右ペインに詳細を表示する
    if (isWide && backTo === 'list') setScreen('list');
    else setScreen('detail');
  }, [isWide]);

  // イベント詳細から「情報の誤りを報告」: 対象イベントを引き継いで報告画面へ
  const openReportForEvent = useCallback((ev, regionKey) => {
    const prefLabel = PREFECTURE_INFO[regionKey]?.label || regionKey || '';
    setReportTarget({ id: ev.id, pref: regionKey || '', prefLabel, title: ev.title || '', date: ev.date || '' });
    setReportBack('detail');
    setScreen('report');
  }, []);

  // 地図から地域画面へ遷移
  const openRegion = useCallback((regionId) => {
    if (regionId) {
      setMapRegionId(regionId);           // RegionScreen に正しい regionId を確実に渡す
      saveLastRegion(regionId, activePrefId);
      setScreen('region');
    } else {
      // regionId=null: 最後に開いた地域へ、未訪問なら地図画面へ
      const last = loadLastMapRegion();
      if (last) {
        setMapRegionId(last);
        setScreen('region');
      } else {
        setScreen('home');
      }
    }
  }, [activePrefId, saveLastRegion]);

  // ── カラーテーマ ──────────────────────────────────────────
  const [schemeKey, setSchemeKey] = useState(loadScheme);
  const handleColorChange = useCallback((key) => {
    setSchemeKey(key);
    try { localStorage.setItem('jsdf-scheme', key); } catch {}
  }, []);

  // ── 地本設定（ListScreen 用） ─────────────────────────────
  // 起動時・画面遷移時は常に「全国」から開始（前回選択した都道府県を引き継がない）
  const [region, setRegion] = useState('all');
  const handleRegionChange = useCallback((id) => {
    setRegion(id);
  }, []);

  // ── ダークモード ──────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const handleDarkModeChange = useCallback((mode) => {
    setDarkMode(mode);
    try { localStorage.setItem('jsdf-dark', mode); } catch {}
  }, []);

  // ── オートモード（自動更新） ──────────────────────────────
  const [autoMode, setAutoMode] = useState(loadAutoMode);
  const handleAutoModeChange = useCallback((enabled) => {
    setAutoMode(enabled);
    try { localStorage.setItem('jsdf-auto-mode', String(enabled)); } catch {}
  }, []);

  // data-theme 属性を documentElement に適用
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveIsDark(darkMode) ? 'dark' : 'light';
    };
    apply();
    if (darkMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [darkMode]);

  // ── テーマオブジェクト ────────────────────────────────────
  const scheme = COLOR_SCHEMES[schemeKey] ?? COLOR_SCHEMES[DEFAULT_SCHEME];
  const theme  = { ...scheme, schemeKey, darkMode };

  // 運営者ログイン状態。運営者ページ(/admin.html, operator=true)でのみ意味を持つ。
  // 公開アプリ(operator=false)では常に false 扱いで、編集機能・管理タブは一切出ない。
  const [adminAuthed, setAdminAuthed] = useState(() => {
    if (!operator) return false;
    // セッションは HttpOnly Cookie。非機密のアカウント情報の有無で初期表示を決め、
    // 実際の有効性は AdminScreen がサーバーに確認して onAuthChange で反映する。
    try { return !!localStorage.getItem('jsdf-admin-account'); } catch { return false; }
  });
  // 詳細の「編集」: 同じ運営者サイト内で管理画面を開き、対象イベントを編集する
  const [adminEditEvent, setAdminEditEvent] = useState(null);
  const editEventAsAdmin = useCallback((ev) => {
    setAdminEditEvent(ev);
    setScreen('admin');
  }, []);
  // 管理タブ／編集から戻るときの遷移先
  const closeAdmin = useCallback(() => {
    const back = adminEditEvent ? 'detail' : 'home';
    setAdminEditEvent(null);
    setScreen(back);
  }, [adminEditEvent]);

  // Safari のステータスバー theme-color をテーマに合わせて更新
  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', scheme.primary);
  }, [scheme.primary]);

  // ── データ取得 ────────────────────────────────────────────
  const { events, loading, error, updatedAt, checkedAt, refresh } = useEvents(autoMode);

  // ── URL同期（イベント個別URL /event/:id・戻るボタン・リロード復元） ──
  const popNav = useRef(false);       // popstate/初期解決による遷移中は pushState しない
  const pendingPath = useRef(
    operator ? null : (window.location.pathname !== '/' ? window.location.pathname : null)
  );

  const findEventById = useCallback((id) => {
    for (const v of Object.values(events)) {
      if (!Array.isArray(v)) continue;
      const hit = v.find(e => e && e.id === id);
      if (hit) return hit;
    }
    return null;
  }, [events]);

  // パス → 画面状態（不明なパスは notfound）
  const applyPath = useCallback((pathname) => {
    const evm = pathname.match(/^\/event\/([^/]+)\/?$/);
    if (evm) {
      const ev = findEventById(decodeURIComponent(evm[1]));
      if (ev) { setDetailEvent(ev); setDetailBack('home'); setScreen('detail'); }
      else if (loading) pendingPath.current = pathname; // データ到着後に再解決
      else setScreen('notfound');
      return;
    }
    const rgm = pathname.match(/^\/region\/([a-z]+)\/?$/);
    if (rgm) { setMapRegionId(rgm[1]); setScreen('region'); return; }
    const entry = Object.entries(ROUTE_SCREENS).find(([, p]) => p === pathname);
    if (entry) { if (entry[0] === 'list') setRegion('all'); setScreen(entry[0]); return; }
    setScreen('notfound');
  }, [findEventById, loading]);

  // 初回ディープリンクの解決（イベントデータ到着後）
  useEffect(() => {
    if (operator || !pendingPath.current || loading) return;
    const p = pendingPath.current;
    pendingPath.current = null;
    popNav.current = true; // URL は既に正しいので push しない
    applyPath(p);
  }, [loading, applyPath, operator]);

  // 画面状態 → URL（pushState）。ディープリンク解決前は URL を壊さない
  useEffect(() => {
    if (operator || pendingPath.current) return;
    if (popNav.current) { popNav.current = false; return; }
    let path = null;
    // detail 画面、または広い画面の2ペインで右に詳細を表示中は /event/:id を反映
    if ((screen === 'detail' || (isWide && screen === 'list')) && detailEvent?.id) path = `/event/${encodeURIComponent(detailEvent.id)}`;
    else if (screen === 'region' && mapRegionId) path = `/region/${mapRegionId}`;
    else if (ROUTE_SCREENS[screen]) path = ROUTE_SCREENS[screen];
    if (path && window.location.pathname !== path) window.history.pushState({}, '', path);
  }, [screen, detailEvent, mapRegionId, operator, isWide]);

  // ブラウザ/スマホの戻る・進む
  useEffect(() => {
    if (operator) return;
    const onPop = () => { popNav.current = true; applyPath(window.location.pathname); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [applyPath, operator]);

  // 画面タイトル（共有・履歴・タブ表示用）
  useEffect(() => {
    if (operator) return;
    const base = '地本イベントナビ（非公式）';
    const showingDetail = screen === 'detail' || (isWide && screen === 'list' && detailEvent);
    document.title = (showingDetail && detailEvent?.title) ? `${detailEvent.title} | ${base}` : base;
  }, [screen, detailEvent, operator, isWide]);

  // ── お気に入り ────────────────────────────────────────────
  const [favorites, setFavorites] = useState(loadFavorites);

  const handleToggleFavorite = useCallback((id) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('jsdf-favorites', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── 申請済み ──────────────────────────────────────────────
  const [applied, setApplied] = useState(loadApplied);

  const handleToggleApplied = useCallback((id) => {
    setApplied(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('jsdf-applied', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // 公式サイトを開いたとき自動で申請済みにする（設定でON/OFF・既定ON）
  const [autoApply, setAutoApply] = useState(() => {
    try { return localStorage.getItem('jsdf-auto-apply') !== '0'; } catch { return true; }
  });
  const handleAutoApplyChange = useCallback((on) => {
    setAutoApply(on);
    try { localStorage.setItem('jsdf-auto-apply', on ? '1' : '0'); } catch {}
  }, []);
  const handleMarkApplied = useCallback((id) => {
    if (!id) return;
    setApplied(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem('jsdf-applied', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── 通知履歴 ──────────────────────────────────────────────
  const [notifHistory, setNotifHistory] = useState(loadNotifHistory);
  const lastProcessedAt = useRef(null);

  // updatedAt が変わったとき（新しいスクレイプ結果）に新着イベントを検出
  useEffect(() => {
    if (loading || !updatedAt) return;
    if (lastProcessedAt.current === updatedAt) return;
    lastProcessedAt.current = updatedAt;

    const allCurrentEvents = Object.entries(events)
      .filter(([, v]) => Array.isArray(v))
      .flatMap(([, evs]) => evs);
    const allCurrentIds = allCurrentEvents.map(e => e.id);

    const knownIds = loadKnownIds();
    if (knownIds.size === 0) {
      // 初回インストール：全イベントを既知として登録するだけ（通知なし）
      try { localStorage.setItem('jsdf-known-ids', JSON.stringify(allCurrentIds)); } catch {}
      return;
    }

    const newEvents = allCurrentEvents.filter(e => !knownIds.has(e.id));
    if (newEvents.length > 0) {
      const addedAt = new Date().toISOString();
      const newNotifs = newEvents.map(ev => ({
        ...ev,
        addedAt,
        read: false,
        regionLabel: (PREFECTURE_INFO[ev.pref]?.label ?? ev.pref) + '地本',
      }));
      setNotifHistory(prev => {
        const updated = [...newNotifs, ...prev].slice(0, 200);
        try { localStorage.setItem('jsdf-notif-history', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }

    const nextKnownIds = [...new Set([...knownIds, ...allCurrentIds])];
    try { localStorage.setItem('jsdf-known-ids', JSON.stringify(nextKnownIds)); } catch {}
  }, [updatedAt, loading, events]);

  const unreadCount = notifHistory.filter(n => !n.read).length;

  const handleMarkAllRead = useCallback(() => {
    setNotifHistory(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      try { localStorage.setItem('jsdf-notif-history', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const handleDeleteNotif = useCallback((id) => {
    setNotifHistory(prev => {
      const updated = prev.filter(n => n.id !== id);
      try { localStorage.setItem('jsdf-notif-history', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const handleClearNotifHistory = useCallback(() => {
    setNotifHistory([]);
    try { localStorage.removeItem('jsdf-notif-history'); } catch {}
  }, []);

  // 広い画面かつ一覧表示中は 2 ペイン（一覧＋詳細）。それ以外は従来の 430px フレーム。
  const showTwoPane = isWide && screen === 'list';

  // ── 画面幅ごとの外枠 ───────────────────────────────────────
  //  mobile  : 従来どおり 430px 枠
  //  tablet  : 1カラムのまま 560px まで広げる（余白が間延びしすぎない範囲）
  //  desktop : 左サイドナビ + 本文。1600px を上限に画面幅を使い切る
  const containerStyle = isDesktopLayout
    ? {
        width: '100%', maxWidth: 1600, margin: '0 auto',
        height: '100dvh',
        display: 'flex', flexDirection: 'row',
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg)',
        boxShadow: '0 0 40px rgba(0,0,0,0.12)',
      }
    : {
        maxWidth: showTwoPane ? 1040 : (breakpoint === 'tablet' ? 560 : 430), margin: '0 auto',
        height: '100dvh',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg)',
        boxShadow: '0 0 40px rgba(0,0,0,0.12)',
      };

  // 画面本体。デスクトップではサイドナビの右側、それ以外は外枠いっぱい。
  // height ではなく flex:1 で伸ばすことで、縦(モバイル)・横(デスクトップ)
  // どちらの外枠でも同じ指定が使える。
  const mainStyle = {
    flex: 1, minWidth: 0, minHeight: 0,
    display: 'flex', flexDirection: 'column',
    position: 'relative', overflow: 'hidden',
  };

  // ── 運営者サイトはログイン必須。未ログインならログイン画面のみ表示 ──
  if (operator && !adminAuthed) {
    return (
      <div style={containerStyle}>
        <Suspense fallback={null}>
          <AdminScreen
            theme={theme}
            mode="login"
            onLoggedIn={() => setAdminAuthed(true)}
            onAuthChange={(ok) => setAdminAuthed(ok)}
            onBack={() => { window.location.href = '/'; }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <LayoutModeContext.Provider value={layoutMode}>
    <OperatorNavContext.Provider value={{ operator, openAdmin: () => { setAdminEditEvent(null); setScreen('admin'); } }}>
    <div style={containerStyle}>

      {/* ── スプラッシュ画面（テーマに応じた乗り物アニメーション） ── */}
      {showSplash && (
        <SplashScreen schemeKey={schemeKey} onDone={handleSplashDone} />
      )}

      {/* ── デスクトップの左サイドナビ（下部タブバーの代替） ── */}
      {isDesktopLayout && (
        <SideNav
          active={screen}
          onChange={setScreen}
          primary={theme.primary}
          unreadCount={unreadCount}
          onOpenNotifications={() => setScreen('notifications')}
        />
      )}

      <div style={mainStyle}>
      {/* 遅延読込画面のフォールバックは null（既存画面が残らないよう軽量に） */}
      <Suspense fallback={null}>
      {screen === 'home' && (
        <HomeScreen
          events={events} loading={loading} error={error}
          theme={theme}
          favorites={favorites}
          unreadCount={unreadCount}
          initialRegionId={mapRegionId}
          onOpenNotifications={() => setScreen('notifications')}
          onOpenList={(prefId) => {
            // prefId あり → その都道府県タブを選択、なし → 全国（all）にリセット
            handleRegionChange(prefId || 'all');
            setScreen('list');
          }}
          onOpenRegion={openRegion}
          onOpenSettings={() => setScreen('settings')}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenDetail={(ev) => openDetail(ev, 'home')}
        />
      )}

      {screen === 'region' && (
        <RegionScreen
          regionId={mapRegionId}
          events={events}
          theme={theme}
          favorites={favorites}
          applied={applied}
          onBack={() => setScreen('home')}
          onOpenDetail={(ev) => openDetail(ev, 'region')}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => { handleRegionChange('all'); setScreen('list'); }}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}

      {screen === 'list' && (
        showTwoPane ? (
          // ── デスクトップ2ペイン：左=一覧 / 右=詳細（フィードバック§2-2-8） ──
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{
              // 一覧側の幅。固定 500px にすると 1024px 幅で
              // 「サイドナビ232 + 一覧500」で詳細に 292px しか残らず潰れる。
              // 画面が広いほど広げ、狭いときは詳細に譲る。
              //   1024px → 一覧380 / 詳細412
              //   1440px → 一覧411 / 詳細797
              //   1600px → 一覧465 / 詳細903
              width: isDesktopLayout ? 'clamp(380px, 34%, 500px)' : 430,
              flexShrink: 0, height: '100%',
              display: 'flex', flexDirection: 'column',
              borderRight: '1px solid var(--border)', position: 'relative',
            }}>
              <ListScreen
                events={events} loading={loading} error={error}
                updatedAt={updatedAt} checkedAt={checkedAt} onRefresh={refresh}
                theme={theme}
                region={region} onRegionChange={handleRegionChange}
                favorites={favorites}
                applied={applied}
                onToggleApplied={handleToggleApplied}
                onOpenHome={() => setScreen('home')}
                onOpenDetail={(ev) => openDetail(ev, 'list')}
                onOpenSettings={() => setScreen('settings')}
                onOpenFavorites={() => setScreen('favorites')}
                selectedId={detailEvent?.id}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', background: 'var(--bg)' }}>
              {detailEvent ? (
                <DetailScreen
                  key={detailEvent.id}
                  event={detailEvent}
                  theme={theme}
                  favorites={favorites}
                  applied={applied}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleApplied={handleToggleApplied}
                  autoApply={autoApply}
                  onMarkApplied={handleMarkApplied}
                  adminAuthed={adminAuthed}
                  onEditEvent={editEventAsAdmin}
                  onBack={() => setDetailEvent(null)}
                  onReport={openReportForEvent}
                />
              ) : (
                <div style={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                  color: 'var(--text-muted)', padding: 32, textAlign: 'center',
                }}>
                  {ICO.cal('var(--icon-muted, #9ca3af)', 44)}
                  <div style={{ fontSize: 14 }}>左の一覧からイベントを選ぶと<br />ここに詳細が表示されます</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ListScreen
            events={events} loading={loading} error={error}
            updatedAt={updatedAt} checkedAt={checkedAt} onRefresh={refresh}
            theme={theme}
            region={region} onRegionChange={handleRegionChange}
            favorites={favorites}
            applied={applied}
            onToggleApplied={handleToggleApplied}
            onOpenHome={() => setScreen('home')}
            onOpenDetail={(ev) => openDetail(ev, 'list')}
            onOpenSettings={() => setScreen('settings')}
            onOpenFavorites={() => setScreen('favorites')}
          />
        )
      )}

      {screen === 'detail' && (
        <DetailScreen
          event={detailEvent}
          theme={theme}
          favorites={favorites}
          applied={applied}
          onToggleFavorite={handleToggleFavorite}
          onToggleApplied={handleToggleApplied}
          autoApply={autoApply}
          onMarkApplied={handleMarkApplied}
          adminAuthed={adminAuthed}
          onEditEvent={editEventAsAdmin}
          onBack={() => setScreen(detailBack)}
          onReport={openReportForEvent}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          theme={theme}
          onColorChange={handleColorChange}
          onDarkModeChange={handleDarkModeChange}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutModeChange}
          showLayoutSetting={isPhoneSized()}
          autoMode={autoMode}
          onAutoModeChange={handleAutoModeChange}
          autoApply={autoApply}
          onAutoApplyChange={handleAutoApplyChange}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => { handleRegionChange('all'); setScreen('list'); }}
          onOpenRegion={openRegion}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenLegal={(doc) => { setLegalDoc(doc); setScreen('legal'); }}
          onOpenReport={() => { setReportTarget(null); setReportBack('settings'); setScreen('report'); }}
        />
      )}

      {screen === 'report' && (
        <ReportScreen
          theme={theme}
          updatedAt={updatedAt}
          target={reportTarget}
          onBack={() => setScreen(reportBack)}
        />
      )}

      {screen === 'notifications' && (
        <NotificationScreen
          events={events}
          notifHistory={notifHistory}
          favorites={favorites}
          theme={theme}
          onMarkAllRead={handleMarkAllRead}
          onDeleteNotif={handleDeleteNotif}
          onClearAll={handleClearNotifHistory}
          onOpenDetail={(ev) => openDetail(ev, 'notifications')}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'legal' && (
        <LegalScreen
          doc={legalDoc}
          theme={theme}
          onBack={() => setScreen('settings')}
        />
      )}

      {/* ── 404（不明なURL・掲載終了イベントの共有リンク） ── */}
      {screen === 'notfound' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{ICO.search('var(--icon-muted, #9ca3af)', 40)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>ページが見つかりません</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 20 }}>
            お探しのページ・イベントが見つかりませんでした。<br />
            掲載期間が終了したイベントの可能性があります。
          </div>
          <button onClick={() => setScreen('home')} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, color: '#fff', background: scheme.primary, cursor: 'pointer' }}>
            ホームへ戻る
          </button>
        </div>
      )}

      {screen === 'favorites' && (
        <FavoritesScreen
          events={events}
          favorites={favorites}
          applied={applied}
          theme={theme}
          onOpenDetail={(ev) => openDetail(ev, 'favorites')}
          onBack={() => setScreen('home')}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => { handleRegionChange('all'); setScreen('list'); }}
          onOpenRegion={openRegion}
          onOpenSettings={() => setScreen('settings')}
        />
      )}

      {/* ── 管理画面（運営者サイトのみ・「管理」タブ／詳細の編集から） ── */}
      {operator && screen === 'admin' && (
        <Suspense fallback={null}>
          <AdminScreen
            theme={theme}
            mode="manage"
            initialFilter="all"
            initialEditEvent={adminEditEvent}
            showTabs
            onAuthChange={(ok) => setAdminAuthed(ok)}
            onBack={closeAdmin}
          />
        </Suspense>
      )}
      </Suspense>
      </div>
    </div>
    </OperatorNavContext.Provider>
    </LayoutModeContext.Provider>
  );
}
