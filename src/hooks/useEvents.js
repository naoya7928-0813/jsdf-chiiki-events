import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';

const EMPTY = { updatedAt: null };

// ── 募集案内所イベントの表記ゆれ・ノイズ対策 ──────────────────
const isOfficeEvent = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');
// 過去の実施報告・採用制度の説明文・お知らせ/合格発表など「イベントではない」もの
const OFFICE_NONEVENT_RE = /しました|されました|制度です|養成する|養成課程|修業期間|受付期間|応募資格|教育訓練|合格発表|合格者|VIEW\s*ALL|を養成|の紹介/;

/** 募集案内所イベントのタイトルから表ヘッダー・時間/場所・注記などの余計な文章を除去 */
function cleanOfficeTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  // 先頭に並ぶ表ヘッダー語（月日（曜日） イベント名 場 所 …）を除去
  t = t.replace(/^(?:月日\s*[（(]?\s*曜日\s*[）)]?|イベント名|開催\s*日時?|場\s*所|時\s*間|種\s*類|区\s*分|内\s*容|[（()）\s])+/, '');
  // 「時間／…」「場所／…」「日時／…」「受付…」以降は本文ではないので切り落とす
  t = t.split(/\s*(?:時間|場所|日時|受付期間|受付|開場|開演|問合せ|お問[い合]*せ|連絡先|TEL|電話)\s*[／/:：]/)[0];
  // 公式ページ参照などの注記
  t = t.replace(/[（(][^（()）]*(?:公式ページ|日程|ページ参照|参照)[^（()）]*[）)]/g, '');
  // 案内系の語
  t = t.replace(/詳しくはこちら|詳しくみる|詳細はこちら|VIEW\s*ALL|お知らせ|NEWS|一覧/gi, '')
       .replace(/[｜|»>]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
  t = t.replace(/^[\s／/:：、,．.\-–—~〜]+|[\s／/:：、,．.\-–—~〜]+$/g, '').trim();
  return t || raw;
}

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
      // 募集案内所イベントのうち、過去報告・制度説明・お知らせ等の非イベントを除外
      .filter(ev => !(isOfficeEvent(ev) && OFFICE_NONEVENT_RE.test(ev.title || '')))
      .map(ev => {
        // 募集案内所イベントはタイトルの余計な文章を除去（curatedイベントは触らない）
        let e = ev;
        if (isOfficeEvent(ev)) {
          const cleaned = cleanOfficeTitle(ev.title);
          if (cleaned !== ev.title) e = { ...ev, title: cleaned };
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
