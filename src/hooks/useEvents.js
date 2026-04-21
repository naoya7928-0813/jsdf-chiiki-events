import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS, MOCK_EVENTS } from '../config';

export function useEvents() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const hasData = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      // cache: 'no-cache' で静的ファイルの古いキャッシュを無視する
      const res = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.kanagawa || !json.tokyo) throw new Error('invalid response shape');
      setData(json);
      hasData.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
      // 初回取得失敗時はモックデータで表示を継続
      if (!hasData.current) setData(MOCK_EVENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();

    // 5分ごとに自動再取得
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL_MS);

    // タブがアクティブになったときも再取得（バックグラウンド復帰）
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchEvents();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchEvents]);

  return {
    events:    data ?? MOCK_EVENTS,
    loading:   loading && !data,
    error,
    refresh:   fetchEvents,
    updatedAt: data?.updatedAt ?? null,
    isMock:    !hasData.current,
  };
}
