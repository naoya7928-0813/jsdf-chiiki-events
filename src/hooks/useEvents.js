import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';

const EMPTY = { kanagawa: [], tokyo: [], updatedAt: null };

export function useEvents() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const hasData = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.kanagawa || !json.tokyo) throw new Error('invalid response shape');
      setData(json);
      hasData.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
      if (!hasData.current) setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL_MS);
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
    events:    data ?? EMPTY,
    loading:   loading && !data,
    error,
    refresh:   fetchEvents,
    updatedAt: data?.updatedAt ?? null,
    isMock:    !hasData.current,
  };
}
