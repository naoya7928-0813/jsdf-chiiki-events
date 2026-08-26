import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';
// 募集案内所イベントの整形・非イベント判定は共通モジュールに一本化（scraper/スクリプトと共有）
import { officeIsJunk, cleanOfficeTitle, cleanOfficePlace, stripTrailingCta } from '../../shared/officeTitle.cjs';
// 時間・締切・場所の書式整形（旧データ／CDN・SWキャッシュ由来の "null" 等への防御）
import { cleanTimeText, cleanDeadlineText, cleanPlaceText, splitPlaceAddress } from '../../shared/titleQuality.cjs';

const EMPTY = { updatedAt: null };

const isOfficeEvent = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');

// ── JST 日付ユーティリティ ────────────────────────────────────
/** 現在の JST 日付を "YYYY-MM-DD" で返す */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENDED_KEEP_DAYS = 7; // 終了したイベントを「終了済み」として公開表示し続ける日数

/** "YYYY-MM-DD" の n 日前を "YYYY-MM-DD" で返す */
function daysBefore(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * イベント1件をカードが安全に描画できる形に正規化する。
 * 描画不能（日付不正・タイトル空）なら null を返して除外する。
 * スクレイパー側にも防御はあるが、配信済みデータや経路漏れに備えて
 * カードへ渡す直前でも保証する（エラーバウンダリより手前の防御）。
 */
function normalizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (typeof ev.date !== 'string' || !DATE_RE.test(ev.date)) return null;
  const title = typeof ev.title === 'string' ? ev.title.trim() : '';
  if (!title) return null;
  const str = v => (typeof v === 'string' ? v : '');
  // place に住所が連結した古い/キャッシュ由来データでも会場名だけを表示する
  const sp = splitPlaceAddress(cleanPlaceText(str(ev.place)), ev.address);
  return {
    ...ev,
    title,
    place:    sp.place,
    address:  sp.address || str(ev.address),
    time:     cleanTimeText(ev.time),
    deadline: cleanDeadlineText(ev.deadline) || undefined,
    category: str(ev.category),
    tag:      str(ev.tag),
    url:      str(ev.url),
    weekday:  str(ev.weekday),
    // endDate は形式不正・開始日より前なら無かったことにする（期間表示の崩れ防止）
    endDate:    (typeof ev.endDate === 'string' && DATE_RE.test(ev.endDate) && ev.endDate >= ev.date) ? ev.endDate : undefined,
    endWeekday: (typeof ev.endDate === 'string' && DATE_RE.test(ev.endDate) && ev.endDate >= ev.date) ? str(ev.endWeekday) : undefined,
  };
}

/**
 * 終了したイベントは即非表示にせず「終了済み」として ENDED_KEEP_DAYS 日間は表示する。
 * 終了日（endDate ?? date）が「今日 − 7日」以降のものを残し、
 * 終了済み（end < today）には ended フラグを付けてカードでタグ表示する。
 */
function filterPastEvents(rawData, today) {
  if (!rawData || typeof rawData !== 'object') return EMPTY;
  const cutoff = daysBefore(today, ENDED_KEEP_DAYS); // これ以前に終了したものは非表示
  const out = {};
  // 全県横断でイベントIDの重複（ハッシュ衝突・スキーム揺れ）を一意化する。
  // 同一IDが複数イベントに付くと、お気に入り(★)が同IDの別イベントへ誤って
  // 連動してしまうため、2件目以降にだけ接尾辞を付けて分離する。
  const seenIds = new Set();
  for (const [k, v] of Object.entries(rawData)) {
    if (!Array.isArray(v)) { out[k] = v; continue; }
    out[k] = v
      .map(normalizeEvent)
      // 「公式確認」スタブ（office_notice）は表示しない。偽の開催日（スクレイプ当日）で
      // 「本日開催」と誤表示されるため生成を廃止済み。CDN/SWキャッシュの旧データ防御。
      .filter(ev => ev && ev.source_type !== 'office_notice')
      .filter(ev => ev && (ev.endDate || ev.date) >= cutoff)
      .map(ev => ({ ...ev, ended: (ev.endDate || ev.date) < today }))
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

// ── オフライン用のデータ保持 ───────────────────────────────────
// Service Worker のランタイムキャッシュだけでは、有効期限切れ・キャッシュ破棄・
// 初回起動直後などにイベントが1件も出ない「空のアプリ」になる。
// 取得に成功したデータを端末内にも残し、通信できないときはそれを表示する。
const CACHE_KEY     = 'jsdf-events-cache';
const CACHE_VERSION = 1;

/** 保存済みイベントデータを読み出す（壊れていれば null） */
function loadCachedEvents() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION) return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return {
      data:    parsed.data,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
    };
  } catch { return null; }
}

/** 取得に成功したデータを端末内に保存する（容量超過等は無視して表示を優先） */
function saveCachedEvents(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      v: CACHE_VERSION, savedAt: new Date().toISOString(), data,
    }));
  } catch { /* 保存できなくても表示は続行する */ }
}

/** ISO 文字列を "YYYY/MM/DD HH:mm"（JST）にする。不正なら null */
function fmtIso(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).replace(',', '');
}

/** ブラウザがオンラインと報告しているか（判定できない環境では true 扱い） */
function navigatorOnline() {
  try { return navigator.onLine !== false; } catch { return true; }
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
  // 前回取得したデータを初期値にする（オフライン起動でも中身のある画面から始まる）
  const cachedInit = useRef(undefined);
  if (cachedInit.current === undefined) cachedInit.current = loadCachedEvents();

  const [rawData,   setRawData]   = useState(() => cachedInit.current?.data ?? null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  // 表示中のデータが「取得できた最新」ではない状態（オフライン・取得失敗）
  const [stale,      setStale]      = useState(() => Boolean(cachedInit.current));
  const [online,     setOnline]     = useState(navigatorOnline);
  const [syncedAtIso, setSyncedAtIso] = useState(() => cachedInit.current?.savedAt ?? null);
  /** JST 今日の日付。深夜0時に更新することでフィルターを再適用する */
  const [jstDate,   setJstDate]   = useState(jstToday);
  const hasData = useRef(Boolean(cachedInit.current));

  const fetchEvents = useCallback(async () => {
    try {
      // 本体（events.json）と運営の手動追加イベント＋上書き修正を並行取得してマージする。
      // 取得失敗は無視し、本体表示を妨げない。
      const [res, manualResp] = await Promise.all([
        fetch(API_URL, { cache: 'no-cache' }),
        fetch('/api/manual-events', { cache: 'no-cache' })
          .then(r => (r.ok ? r.json() : null))
          .then(j => ({ events: Array.isArray(j?.events) ? j.events : [], overrides: (j && j.overrides) || {} }))
          .catch(() => ({ events: [], overrides: {} })),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fromCache = res.headers.get('x-from-cache') === '1';
      const json = await res.json();
      if (typeof json !== 'object' || json === null) throw new Error('invalid response shape');
      const { events: manual, overrides } = manualResp;
      // 手動イベントを地本ごとに合流（既存配列の末尾に追加）
      const merged = { ...json };
      for (const ev of manual) {
        const k = ev?.pref;
        if (!k) continue;
        merged[k] = Array.isArray(merged[k]) ? [...merged[k], ev] : [ev];
      }
      // 運営の上書き修正をイベントID一致で再適用（スクレイプ上書き後も反映）
      const hasOverrides = overrides && Object.keys(overrides).length > 0;
      if (hasOverrides) {
        for (const k of Object.keys(merged)) {
          if (!Array.isArray(merged[k])) continue;
          merged[k] = merged[k].map(ev => (ev && overrides[ev.id]) ? { ...ev, ...overrides[ev.id] } : ev);
        }
      }
      setRawData(merged);
      hasData.current = true;
      setError(null);
      // Service Worker がキャッシュから返した応答は「取得成功」ではない。
      // 印（X-From-Cache）が付いていれば、最新ではないものを表示していると扱う。
      if (fromCache) {
        setStale(true);
        setOnline(navigatorOnline());
      } else {
        // 取得できたデータを端末内にも残す（次回オフライン起動時の表示に使う）
        saveCachedEvents(merged);
        setSyncedAtIso(new Date().toISOString());
        setStale(false);
        setOnline(true);
      }
    } catch (err) {
      setError(err.message);
      // 取得に失敗しても、持っているデータは消さずに「最新ではない」印だけ付ける
      if (!hasData.current) setRawData(EMPTY);
      else setStale(true);
      if (!navigatorOnline()) setOnline(false);
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

  // ── オンライン復帰の検知 ───────────────────────────────────
  // 圏外から戻ったら自動で取り直す（利用者が手動で更新しなくても最新に戻る）。
  useEffect(() => {
    const goOnline  = () => { setOnline(true); fetchEvents(); };
    const goOffline = () => { setOnline(false); if (hasData.current) setStale(true); };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [fetchEvents]);

  // ── JST 深夜0時タイマー：日付が変わったら自動でフィルター更新 ─
  // 発火後は必ず翌日の0時を再スケジュールする（連鎖）。以前は初回の1回しか
  // 発火せず、アプリを2日以上開きっぱなしにすると2日目以降の日付切り替えが
  // 行われない（終了イベントが残り続ける）バグがあった。
  useEffect(() => {
    let t;
    function scheduleNext() {
      const now              = Date.now();
      const jstMs            = now + 9 * 3600 * 1000;
      const todayMidnightJST = Math.floor(jstMs / 86400000) * 86400000;
      // 次の JST 深夜0時を UTC ミリ秒で計算
      const nextMidnightUTC  = todayMidnightJST + 86400000 - 9 * 3600 * 1000;
      const delay            = Math.max(nextMidnightUTC - now, 1000);

      t = setTimeout(() => {
        setJstDate(jstToday()); // フィルター日付を翌日に更新 → 当日終了イベントが消える
        fetchEvents();          // サーバーからも最新データを取得
        scheduleNext();         // 翌日の0時を再スケジュール（毎日繰り返す）
      }, delay);
    }

    scheduleNext();
    return () => clearTimeout(t);
  }, [fetchEvents]);

  // rawData × jstDate でフィルターを掛けて返す（全件の整形・除外を伴うためメモ化。
  // 以前は毎レンダーで全イベントを再正規化しており、オブジェクト識別も毎回変わっていた）
  const events = useMemo(
    () => (rawData ? filterPastEvents(rawData, jstDate) : EMPTY),
    [rawData, jstDate]
  );

  return {
    events,
    loading:   loading && !rawData,
    error,
    refresh:   fetchEvents,
    updatedAt: rawData?.updatedAt ?? null,
    checkedAt,
    isMock:    !hasData.current,
    // ── オフライン表示用 ──
    /** ブラウザが通信不能と報告している */
    offline:      !online,
    /** 表示中のデータが最新の取得結果ではない（オフライン・取得失敗・キャッシュ由来） */
    stale,
    /** 最後にデータを取得できた日時（"YYYY/MM/DD HH:mm" JST。無ければ null） */
    lastSyncedAt: fmtIso(syncedAtIso),
  };
}
