import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';

const EMPTY = { updatedAt: null };

// ── JST 日付ユーティリティ ────────────────────────────────────
/** 現在の JST 日付を "YYYY-MM-DD" で返す */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 終了日（endDate ?? date）が今日以降のイベントのみ残す。
 * スクレイパーが深夜0時〜8時の間に走らなくても
 * クライアント側で即座に前日イベントを非表示にする。
 */
function filterPastEvents(rawData, today) {
  if (!rawData || typeof rawData !== 'object') return EMPTY;
  const out = {};
  for (const [k, v] of Object.entries(rawData)) {
    if (!Array.isArray(v)) { out[k] = v; continue; }
    out[k] = v.filter(ev => ev.date && (ev.endDate || ev.date) >= today);
  }
  return out;
}

/** 現在時刻を "YYYY/MM/DD HH:mm" 形式で返す（JST 固定） */
function fmtNow() {
  return new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).replace(',', '');
}

export function useEvents(autoMode = true) {
  const [rawData,   setRawData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  /** JST 今日の日付。深夜0時に更新することでフィルターを再適用する */
  const [jstDate,   setJstDate]   = useState(jstToday);
  const hasData = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (typeof json !== 'object' || json === null) throw new Error('invalid response shape');
      setRawData(json);
      hasData.current = true;
      setError(null);
    } catch (err) {
      setError(err.message);
      if (!hasData.current) setRawData(EMPTY);
    } finally {
      setLoading(false);
      setCheckedAt(fmtNow());
    }
  }, []);

  // ── 定期フェッチ + 画面復帰時フェッチ ───────────────────────
  useEffect(() => {
    fetchEvents();
    if (!autoMode) return;
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchEvents(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchEvents, autoMode]);

  // ── JST 深夜0時タイマー：日付が変わったら自動でフィルター更新 ─
  useEffect(() => {
    function scheduleNext() {
      const now              = Date.now();
      const jstMs            = now + 9 * 3600 * 1000;
      const todayMidnightJST = Math.floor(jstMs / 86400000) * 86400000;
      // 次の JST 深夜0時を UTC ミリ秒で計算
      const nextMidnightUTC  = todayMidnightJST + 86400000 - 9 * 3600 * 1000;
      const delay            = Math.max(nextMidnightUTC - now, 1000);

      return setTimeout(() => {
        setJstDate(jstToday()); // フィルター日付を翌日に更新 → 当日終了イベントが消える
        fetchEvents();          // サーバーからも最新データを取得
      }, delay);
    }

    const t = scheduleNext();
    return () => clearTimeout(t);
  }, [fetchEvents]);

  // rawData × jstDate でフィルターを掛けて返す
  const events = rawData ? filterPastEvents(rawData, jstDate) : EMPTY;

  return {
    events,
    loading:   loading && !rawData,
    error,
    refresh:   fetchEvents,
    updatedAt: rawData?.updatedAt ?? null,
    checkedAt,
    isMock:    !hasData.current,
  };
}
