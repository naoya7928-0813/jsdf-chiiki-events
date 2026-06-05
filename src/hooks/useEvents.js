import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, REFRESH_INTERVAL_MS } from '../config';

const EMPTY = { updatedAt: null };

// ── 募集案内所イベントの表記ゆれ・ノイズ対策 ──────────────────
const isOfficeEvent = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');
// 過去の実施報告・採用制度の説明文・お知らせ/合格発表など「イベントではない」もの
const OFFICE_NONEVENT_RE = /しました|されました|制度です|養成する|養成課程|修業期間|受付期間|応募資格|教育訓練|合格発表|合格者|VIEW\s*ALL|を養成|の紹介/;
// ナビメニュー/カテゴリ一覧の塊（見出し語が複数回出る）は実イベントではない
const navMenuHits = s => (String(s || '').match(/イベント情報|採用試験情報|入札情報|重要なお知らせ|トピックス|お知らせ一覧|すべて/g) || []).length;

const weekdayCount = s => (String(s || '').match(/[日月火水木金土](?=[\s0-9０-９])/g) || []).length;
/** 募集案内所イベントとして表示すべきでない（整形しても綺麗にならない）塊か判定 */
function officeIsJunk(title) {
  const t = String(title || '');
  if (OFFICE_NONEVENT_RE.test(t)) return true;
  if (navMenuHits(t) >= 2) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return true;     // メールアドレス混入
  if (/毎日実施|随時実施/.test(t)) return true;                                  // 常時開催の案内
  if (/Event\s*&\s*Seminar|各種説明会|＆各種/i.test(t)) return true;             // 複数イベントの見出し塊
  if (/[一-龥]{2,3}[都道府県][一-龥]{1,10}[市区郡].{0,18}(丁目|番地|ビル|庁舎|[0-9０-９]+階|第[0-9０-９]+)/.test(t)) return true; // 住所塊
  if (/0[0-9０-９]{1,4}[-－—][0-9０-９]{1,4}[-－—][0-9０-９]{3,4}/.test(t)) return true; // 電話番号混入
  if (weekdayCount(t) >= 4) return true;                                          // カレンダー表の塊
  if (/時期及び定員|提出書類|応募方法|別記|様式第/.test(t)) return true;          // フォーム/様式の項目
  if (/[队乐贝实团济纪记书译录习场]|�/.test(t)) return true;                  // OCR文字化け（簡体字・置換文字の混入）
  return false;
}

/** 募集案内所イベントのタイトルから表ヘッダー・時間/場所・注記などの余計な文章を除去 */
function cleanOfficeTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  // 先頭のラベル（お知らせ/new/重要 等。連続も除去）
  t = t.replace(/^(?:(?:お知らせ|重要(?:なお知らせ)?|新着|トピックス|new|NEW)\s*)+/gi, '');
  // 『…』で囲まれた正式名称があればそれを優先
  const quoted = t.match(/『([^』]{4,})』/);
  if (quoted) t = quoted[1];
  // 箇条書き・セッションマーカー（●【…】 ● ○）を除去
  t = t.replace(/[●○]\s*【[^】]*】/g, ' ').replace(/[●○]/g, ' ');
  // 先頭に並ぶ表ヘッダー語（月日（曜日） イベント名 場 所 …）を除去
  t = t.replace(/^(?:月日\s*[（(]?\s*曜日\s*[）)]?|イベント名|開催\s*日時?|場\s*所|時\s*間|種\s*類|区\s*分|内\s*容|[（()）\s])+/, '');
  // 「時間／…」「場所／…」「開催…」以降は本文ではないので切り落とす
  t = t.split(/\s*(?:時間|場所|日時|開催日|受付期間|受付|開場|開演|問合せ|お問[い合]*せ|連絡先|TEL|電話)\s*[／/:：]?/)[0];
  t = t.split(/\s*開催/)[0];
  // 区切りの全角スラッシュ以降（時間／場所／… の語が先に除去された残骸）を切り落とす
  t = t.split(/\s*／/)[0];
  // 日付・時刻・曜日断片を除去（半角・全角数字の両対応）
  t = t.replace(/(?:令和|R|Ｒ)\s*[0-9０-９]{1,2}\s*年?\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/gi, '')
       .replace(/[0-9０-９]{4}\s*[年\/.-]\s*[0-9０-９]{1,2}\s*(?:月|[\/.-])\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/g, '')
       .replace(/[、,]?\s*[0-9０-９]{1,2}\s*[月\/.]?\s*[0-9０-９]{0,2}\s*日?\s*[（(][月火水木金土日祝][）)]/g, '')
       .replace(/[0-9０-９]{1,2}\s*[月\/.]\s*[0-9０-９]{1,2}\s*日?/g, '')
       .replace(/[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2}\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2})?/g, '')
       .replace(/[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?)?/g, '')
       .replace(/[0-9０-９]{1,2}\s*月(?=\s|$)/g, '');
  // 注記（公式ページ参照／事前→…まで 等）
  t = t.replace(/[（(][^（()）]*(?:公式ページ|日程|ページ参照|参照|事前|まで)[^（()）]*[）)]/g, '');
  // 複数イベントが連結している場合は最初の項目だけ採用
  if ((t.match(/令和/g) || []).length >= 2) t = (t.split(/\s*令和[0-9０-９]/)[0] || t).trim();
  // 案内系の語
  t = t.replace(/詳しくはこちら|詳しくみる|詳細はこちら|VIEW\s*ALL|お知らせ|NEWS|一覧/gi, '')
       .replace(/[｜|»>]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
  // 先頭の曜日・記号の断片を除去
  t = t.replace(/^[\s月火水木金土日祝・,、)）]+/, '').trim();
  // 未閉じ括弧の整理（開きが多い場合は最後の開き以降を削る）
  if ((t.match(/（/g) || []).length > (t.match(/）/g) || []).length) t = t.replace(/（[^（）]*$/, '').trim();
  if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) t = t.replace(/\([^()]*$/, '').trim();
  // 先頭・末尾の記号類を除去（括弧 （）() は正規の閉じを壊さないため対象外）
  t = t.replace(/^[\s／/:：、,．.\-–—~〜＝=【】\[\]<>!！#＃]+|[\s／/:：、,．.\-–—~〜＝=【】\[\]<>、]+$/g, '').trim();
  return t; // 救済不能（空）の場合は空を返す（呼び出し側で除外）
}

/** 全イベント共通: 末尾の誘導文言（詳細はこちら 等）を除去 */
function stripTrailingCta(raw) {
  if (!raw) return raw;
  const t = String(raw)
    .replace(/(?:詳細はこちら(?:から|をご覧ください)?|詳しくはこちら|詳しくみる|こちらをご覧ください|こちらから|こちら|詳細を見る)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
        // タイトルの余計な文章を除去（全イベント: 末尾誘導文言／募集案内所: さらに表ヘッダー等）
        const cleaned = isOfficeEvent(ev)
          ? stripTrailingCta(cleanOfficeTitle(ev.title))
          : stripTrailingCta(ev.title);
        let e = cleaned !== ev.title ? { ...ev, title: cleaned } : ev;
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
