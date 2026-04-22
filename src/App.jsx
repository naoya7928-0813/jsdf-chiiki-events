import { useState, useCallback, useEffect } from 'react';
import { useEvents } from './hooks/useEvents';
import { COLOR_SCHEMES, DEFAULT_SCHEME } from './config';
import HomeScreen        from './components/HomeScreen';
import ListScreen        from './components/ListScreen';
import DetailScreen      from './components/DetailScreen';
import SettingsScreen    from './components/SettingsScreen';
import NotificationScreen from './components/NotificationScreen';
import FavoritesScreen   from './components/FavoritesScreen';
import LegalScreen        from './components/LegalScreen';

// ─── localStorage 復元ヘルパー ────────────────────────────────
function loadScheme()   { try { return localStorage.getItem('jsdf-scheme') || DEFAULT_SCHEME; } catch { return DEFAULT_SCHEME; } }
function loadRegion()   { try { return localStorage.getItem('jsdf-region') || 'kanagawa';     } catch { return 'kanagawa';     } }
function loadDarkMode() { try { return localStorage.getItem('jsdf-dark')   || 'system';       } catch { return 'system';       } }

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
  const [screen,     setScreen]     = useState('home');
  const [detailEvent, setDetailEvent] = useState(null);
  // detail から戻る画面を動的に決定する
  const [detailBack,  setDetailBack]  = useState('list');
  // 法的情報画面で表示するドキュメント種別 ('terms' | 'privacy')
  const [legalDoc, setLegalDoc] = useState(null);

  const openDetail = useCallback((ev, backTo = 'list') => {
    setDetailEvent(ev);
    setDetailBack(backTo);
    setScreen('detail');
  }, []);

  // ── カラーテーマ ──────────────────────────────────────────
  const [schemeKey, setSchemeKey] = useState(loadScheme);
  const handleColorChange = useCallback((key) => {
    setSchemeKey(key);
    try { localStorage.setItem('jsdf-scheme', key); } catch {}
  }, []);

  // ── 地本設定 ──────────────────────────────────────────────
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

  // data-theme 属性を documentElement に適用（CSS変数切替トリガー）
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
  // Set<string> でイベントIDを管理。変更のたびに localStorage を同期する。
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
  // seenIds: 通知画面で一度でも表示されたイベントIDの配列
  const [seenIds, setSeenIds] = useState(loadSeenIds);

  // 全イベントIDの中で未読のものを数える
  const allEventIds = [
    ...(events.kanagawa ?? []),
    ...(events.tokyo    ?? []),
  ].map(e => e.id);
  const unreadCount = allEventIds.filter(id => !seenIds.includes(id)).length;

  // 通知画面から呼ばれる：渡された ID を全て既読化
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
          onOpenNotifications={() => setScreen('notifications')}
          onOpenList={() => setScreen('list')}
          onOpenDetail={(ev) => openDetail(ev, 'home')}
          onOpenSettings={() => setScreen('settings')}
          onOpenFavorites={() => setScreen('favorites')}
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
          region={region} onRegionChange={handleRegionChange}
          onColorChange={handleColorChange}
          onDarkModeChange={handleDarkModeChange}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => setScreen('list')}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenLegal={(doc) => { setLegalDoc(doc); setScreen('legal'); }}
        />
      )}

      {screen === 'notifications' && (
        <NotificationScreen
          events={events}
          seenIds={seenIds}
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
          onBack={() => setScreen('list')}
          onOpenHome={() => setScreen('home')}
          onOpenList={() => setScreen('list')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
    </div>
  );
}
