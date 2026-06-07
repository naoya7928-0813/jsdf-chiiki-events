import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';
// 募集案内所イベントの整形・非イベント判定は共通モジュールに一本化（scraper/スクリプトと共有）
import { officeIsJunk, cleanOfficeTitle, cleanOfficePlace, stripTrailingCta } from '../../shared/officeTitle.cjs';

const EMPTY = { updatedAt: null };

const isOfficeEvent = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');

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
  // 全県横断でイベントIDの重複（ハッシュ衝突・スキーム揺れ）を一意化する。
  // 同一IDが複数イベントに付くと、お気に入り(★)が同IDの別イベントへ誤って
  // 連動してしまうため、2件目以降にだけ接尾辞を付けて分離する。
  const seenIds = new Set();
  for (const [k, v] of Object.entries(rawData)) {
    if (!Array.isArray(v)) { out[k] = v; continue; }
    out[k] = v
      .filter(ev => ev.date && (ev.endDate || ev.date) >= today)
      // 募集案内所イベントのうち、整形しても綺麗にならない非イベント（過去報告・制度説明・
      // お知らせ・ナビメニュー塊・メール/住所/電話混入・カレンダー塊・常時開催の案内など）を除外。
      // さらに、整形した結果ほとんど中身が残らない（救済不能な）ものも除外する。
      .filter(ev => {
        if (!isOfficeEvent(ev)) return true;
        if (officeIsJunk(ev.title)) return false;
        const c = cleanOfficeTitle(ev.title).replace(/[\s　]/g, '');
        return c.length >= 4;
      })
      .map(ev => {
        // タイトル・場所の余計な文章を除去（募集案内所イベントのみ場所も整形）
        const cleaned = isOfficeEvent(ev)
          ? stripTrailingCta(cleanOfficeTitle(ev.title))
          : stripTrailingCta(ev.title);
        const cleanedPlace = isOfficeEvent(ev) ? cleanOfficePlace(ev.place) : ev.place;
        let e = ev;
        if (cleaned !== ev.title || cleanedPlace !== ev.place) {
          e = { ...ev, title: cleaned, place: cleanedPlace };
        }
        // 同一IDの誤連動を防ぐためIDを一意化
        if (!e.id) return e;
        if (!seenIds.has(e.id)) { seenIds.add(e.id); return e; }
        let uid = e.id, n = 2;
        while (seenIds.has(uid)) uid = `${e.id}~${n++}`;
        seenIds.add(uid);
        return { ...e, id: uid };
      });
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
