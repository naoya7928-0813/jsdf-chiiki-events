import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';

const EMPTY = { updatedAt: null };

/** 現在時刻を "YYYY/MM/DD HH:mm" 形式で返す */
function fmtNow() {
  return new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
}

export function useEvents() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  // フェッチ完了のたびに更新するローカル確認時刻
  const [checkedAt, setCheckedAt] = useState(null);
  const hasData = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (typeof json !== 'object' || json === null) throw new Error('invalid response shape');
      setData(json);
      hasData.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
      if (!hasData.current) setData(EMPTY);
    } finally {
      setLoading(false);
      // 成否に関わらず確認時刻を現在時刻に更新
      setCheckedAt(fmtNow());
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
    checkedAt,
    isMock:    !hasData.current,
  };
}
