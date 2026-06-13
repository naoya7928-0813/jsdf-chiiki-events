import { useState, useCallback, useEffect, useRef } from 'react';
import { useEvents } from './hooks/useEvents';
import { COLOR_SCHEMES, DEFAULT_SCHEME } from './config';
import { PREFECTURE_INFO } from './data/regionMap';
import HomeScreen        from './components/HomeScreen';
import ListScreen        from './components/ListScreen';
import DetailScreen      from './components/DetailScreen';
import SettingsScreen    from './components/SettingsScreen';
import NotificationScreen from './components/NotificationScreen';
import FavoritesScreen   from './components/FavoritesScreen';
import LegalScreen        from './components/LegalScreen';
import ReportScreen       from './components/ReportScreen';
import RegionScreen       from './components/RegionScreen';
import SplashScreen       from './components/SplashScreen';

// ─── localStorage 復元ヘルパー ────────────────────────────────
function loadScheme()       { try { return localStorage.getItem('jsdf-scheme') || DEFAULT_SCHEME; } catch { return DEFAULT_SCHEME; } }
function loadRegion()       { try { return localStorage.getItem('jsdf-region') || 'all';          } catch { return 'all';          } }
function loadDarkMode()     { try { return localStorage.getItem('jsdf-dark')   || 'system';       } catch { return 'system';       } }
function loadLastMapRegion(){ try { return localStorage.getItem('jsdf-last-region') || null;       } catch { return null;           } }
function loadLastPrefId()   { try { return localStorage.getItem('jsdf-last-pref')   || null;       } catch { return null;           } }
function loadAutoMode()     { try { return localStorage.getItem('jsdf-auto-mode') !== 'false';    } catch { return true;           } }

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

export default function App() {
  // ── スプラッシュ ──────────────────────────────────────────
  // ページロード（再起動）のたびに毎回表示する
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

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
    setScreen('detail');
  }, []);

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

  // 運営者としてログイン済みか（詳細の「編集」表示制御）。運営者ページ(/admin.html)で
  // ログインすると localStorage に認証が入り、同一オリジンの公開アプリでも参照できる。
  const [adminAuthed] = useState(() => {
    try { return !!localStorage.getItem('jsdf-admin-auth'); } catch { return false; }
  });
  // 詳細の「編集」: 別口の運営者ページへ対象イベントを引き継いで遷移する
  const editEventAsAdmin = useCallback((ev) => {
    try { sessionStorage.setItem('jsdf-admin-edit', JSON.stringify(ev)); } catch { /* noop */ }
    window.location.href = '/admin.html';
  }, []);

  // Safari のステータスバー theme-color をテーマに合わせて更新
  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', scheme.primary);
  }, [scheme.primary]);

  // ── データ取得 ────────────────────────────────────────────
  const { events, loading, error, updatedAt, checkedAt, refresh } = useEvents(autoMode);

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

  return (
    <div style={{
      maxWidth: 430, margin: '0 auto',
      height: '100dvh',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      background: 'var(--bg)',
      boxShadow: '0 0 40px rgba(0,0,0,0.12)',
    }}>

      {/* ── スプラッシュ画面（テーマに応じた乗り物アニメーション） ── */}
      {showSplash && (
        <SplashScreen schemeKey={schemeKey} onDone={handleSplashDone} />
      )}

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
    </div>
  );
}
