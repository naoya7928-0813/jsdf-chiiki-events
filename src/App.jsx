import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEvents } from './hooks/useEvents';
import { COLOR_SCHEMES, DEFAULT_SCHEME } from './config';
import HomeScreen        from './components/HomeScreen';
import ListScreen        from './components/ListScreen';
import DetailScreen      from './components/DetailScreen';
import SettingsScreen    from './components/SettingsScreen';
import NotificationScreen from './components/NotificationScreen';
import FavoritesScreen   from './components/FavoritesScreen';
import LegalScreen        from './components/LegalScreen';
import RegionScreen       from './components/RegionScreen';

// ─── localStorage 復元ヘルパー ────────────────────────────────
function loadScheme()       { try { return localStorage.getItem('jsdf-scheme') || DEFAULT_SCHEME; } catch { return DEFAULT_SCHEME; } }
function loadRegion()       { try { return localStorage.getItem('jsdf-region') || 'tokyo';        } catch { return 'tokyo';        } }
function loadDarkMode()     { try { return localStorage.getItem('jsdf-dark')   || 'system';       } catch { return 'system';       } }
function loadLastMapRegion(){ try { return localStorage.getItem('jsdf-last-region') || null;       } catch { return null;           } }
function loadLastPrefId()   { try { return localStorage.getItem('jsdf-last-pref')   || null;       } catch { return null;           } }

// favorites: イベントIDの Set として管理
function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('jsdf-favorites') || '[]')); } catch { return new Set(); }
}

// seenIds: 通知画面で確認済みのイベントID配列
function loadSeenIds() {
  try { return JSON.parse(localStorage.getItem('jsdf-seen-ids') || '[]'); } catch { return []; }
}

// OS のカラースキームを考慮してダークモードを解決する
function resolveIsDark(mode) {
  if (mode === 'dark')  return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function App() {
  // ── ナビゲーション ────────────────────────────────────────
  const [screen,      setScreen]      = useState('home');
  const [detailEvent, setDetailEvent] = useState(null);
  const [detailBack,  setDetailBack]  = useState('region');
  const [legalDoc,    setLegalDoc]    = useState(null);

  // 地図で選択中の地域ID（null = 未選択）
  const [mapRegionId,  setMapRegionId]  = useState(loadLastMapRegion);
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

  // 地図から地域画面へ遷移
  const openRegion = useCallback((regionId) => {
    if (regionId) {
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
  const [region, setRegion] = useState(loadRegion);
  const handleRegionChange = useCallback((id) => {
    setRegion(id);
    try { localStorage.setItem('jsdf-region', id); } catch {}
  }, []);

  // ── ダークモード ──────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(loadDarkMode);
  const handleDarkModeChange = useCallback((mode) => {
    setDarkMode(mode);
    try { localStorage.setItem('jsdf-dark', mode); } catch {}
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

  // Safari のステータスバー theme-color をテーマに合わせて更新
  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', scheme.primary);
  }, [scheme.primary]);

  // ── データ取得 ────────────────────────────────────────────
  const { events, loading, error, updatedAt, checkedAt, refresh } = useEvents();

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

  // ── 通知（既読管理） ──────────────────────────────────────
  const [seenIds, setSeenIds] = useState(loadSeenIds);

  const allEventIds = useMemo(
    () => Object.values(events).filter(Array.isArray).flatMap(evs => evs.map(e => e.id)),
    [events]
  );
  const unreadCount = allEventIds.filter(id => !seenIds.includes(id)).length;

  const handleMarkAllRead = useCallback((ids) => {
    setSeenIds(prev => {
      const next = [...new Set([...prev, ...ids])];
      try { localStorage.setItem('jsdf-seen-ids', JSON.stringify(next)); } catch {}
      return next;
    });
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

      {screen === 'home' && (
        <HomeScreen
          events={events} loading={loading} error={error}
          theme={theme}
          favorites={favorites}
          unreadCount={unreadCount}
          initialRegionId={mapRegionId}
          onOpenNotifications={() => setScreen('notifications')}
          onOpenList={() => setScreen('list')}
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
          onBack={() => setScreen('home')}
          onOpenDetail={(ev) => openDetail(ev, 'region')}
          onOpenHome={() => setScreen('home')}
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
          onToggleFavorite={handleToggleFavorite}
          onBack={() => setScreen(detailBack)}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          theme={theme}
          onColorChange={handleColorChange}
          onDarkModeChange={handleDarkModeChange}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => setScreen('list')}
          onOpenRegion={openRegion}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenLegal={(doc) => { setLegalDoc(doc); setScreen('legal'); }}
        />
      )}

      {screen === 'notifications' && (
        <NotificationScreen
          events={events}
          seenIds={seenIds}
          favorites={favorites}
          theme={theme}
          onMarkAllRead={handleMarkAllRead}
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
          theme={theme}
          onOpenDetail={(ev) => openDetail(ev, 'favorites')}
          onBack={() => setScreen('home')}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => setScreen('list')}
          onOpenRegion={openRegion}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
    </div>
  );
}
