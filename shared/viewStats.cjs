// イベント別閲覧数 — 純粋ロジック（計測API・管理API・画面・テストで共有）。
//
// 数えるもの: イベント詳細画面が開かれた回数（閲覧回数。ユニーク利用者数ではない）。
// 日付の区切りは日本時間（JST）。
//
// 保存（Upstash Redis）:
//   views:total              hash  field=イベントID → 累計
//   views:d:<YYYY-MM-DD>     hash  field=イベントID → その日（JST）の回数。40日で失効
//   views:seen:<hash>        string 同じ通信元・同じイベントの重複計測を 30 分防ぐ印（IPは保存せずハッシュのみ）
// 1回の計測で使うコマンド: 重複判定 SET NX 1 ＋ HINCRBY 2 ＋ EXPIRE 1（＋レート制限 2）
//
// 重複して数えないために:
//   画面側 … 同じ詳細画面内の再描画・状態更新・自動更新では送らない（イベントIDが変わったときだけ）。
//            同じタブで同じイベントを 30 分以内に開き直しても送らない（再読み込みを数えない）
//   サーバー… 同じ通信元・同じイベントは 30 分に 1 回まで（再試行・別タブ・連打を数えない）
//            ボットの User-Agent、自サイト以外からの送信、存在しないイベントIDは数えない
'use strict';

const DAY_TTL_SEC = 40 * 86400;      // 日別の集計は 30 日分あれば足りる（余裕をみて 40 日）
const DEDUP_SEC = 30 * 60;           // 同じ通信元・同じイベントの再計測を防ぐ間隔
const CLIENT_DEDUP_MS = 30 * 60 * 1000;
const WINDOWS = Object.freeze({ today: 1, d7: 7, d30: 30 });

/** JST の日付 "YYYY-MM-DD"（ms は UTC エポック） */
function jstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 今日（JST）から遡って n 日分の日付（新しい順。先頭が今日） */
function lastNDays(n, ms = Date.now()) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(jstDay(ms - i * 86400000));
  return out;
}

const dayKey = (day) => `views:d:${day}`;
const TOTAL_KEY = 'views:total';

// 検索エンジン・リンクプレビュー・監視ツール・自動ブラウザ。人の閲覧ではないものは数えない
// ⚠ LINE・X 等のアプリ内ブラウザ（人が見ている）は UA に "Line/" 等を含むので、アプリ名では弾かない
const BOT_UA_RE = /(bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp\/|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|java\/|go-http|node-fetch|axios)/i;

/** 人の閲覧ではない User-Agent か（空も数えない） */
function isBotUserAgent(ua) {
  const s = String(ua || '').trim();
  if (!s) return true;
  return BOT_UA_RE.test(s);
}

/** 計測してよいイベントIDか（画面側の重複回避で付く「~2」等の接尾辞付きは対象外） */
const VIEW_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
function isCountableId(id) { return typeof id === 'string' && VIEW_ID_RE.test(id); }

/**
 * 日別ハッシュの読み出し結果から期間別の回数を作る（純粋）。
 * @param {string[]} ids
 * @param {Array<Object|null>} dayMaps  lastNDays(30) と同じ順の {id: count} 配列（無い日は null）
 * @param {Object|null} totalMap {id: count}
 * @returns {Object<string, {total:number, today:number, d7:number, d30:number}>}
 */
function aggregate(ids, dayMaps, totalMap) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const out = {};
  for (const id of ids) {
    let today = 0, d7 = 0, d30 = 0;
    dayMaps.forEach((m, i) => {
      const v = num(m && m[id]);
      if (i < WINDOWS.today) today += v;
      if (i < WINDOWS.d7) d7 += v;
      if (i < WINDOWS.d30) d30 += v;
    });
    // 累計は日別の合計を下回らない（累計キーだけ失われた場合の保険）
    out[id] = { total: Math.max(num(totalMap && totalMap[id]), d30), today, d7, d30 };
  }
  return out;
}

/** 日別の推移（古い順。画面のグラフ用） */
function dailySeries(id, days, dayMaps) {
  return days.map((day, i) => ({ day, count: Number((dayMaps[i] && dayMaps[i][id]) || 0) || 0 })).reverse();
}

const SORT_KEYS = ['total', 'today', 'd7', 'd30', 'date', 'title'];
/** 一覧の並べ替え（純粋）。数値は多い順、日付・名前は昇順。同点は開催日→ID で安定させる */
function sortRows(rows, key = 'd7', dir = 'desc') {
  const k = SORT_KEYS.includes(key) ? key : 'd7';
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c;
    if (k === 'title' || k === 'date') c = String(a[k] || '').localeCompare(String(b[k] || ''), 'ja');
    else c = (Number(a[k]) || 0) - (Number(b[k]) || 0);
    if (c !== 0) return c * sign;
    return String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id));
  });
}

/**
 * 画面側の重複判定（純粋）。同じイベントを CLIENT_DEDUP_MS 以内に送っていれば false。
 * @param {Object} seen {id: 送信時刻ms}
 */
function shouldSendView(seen, id, now = Date.now()) {
  if (!isCountableId(id)) return false;
  const t = seen && Number(seen[id]);
  return !(Number.isFinite(t) && now - t < CLIENT_DEDUP_MS);
}

/** 期限切れの記録を落とす（端末内の記録を増やし続けない） */
function pruneSeen(seen, now = Date.now()) {
  const out = {};
  for (const [k, v] of Object.entries(seen || {})) {
    const t = Number(v);
    if (Number.isFinite(t) && now - t < CLIENT_DEDUP_MS) out[k] = t;
  }
  return out;
}

module.exports = {
  DAY_TTL_SEC, DEDUP_SEC, CLIENT_DEDUP_MS, WINDOWS, TOTAL_KEY, SORT_KEYS,
  jstDay, lastNDays, dayKey, isBotUserAgent, isCountableId, aggregate, dailySeries, sortRows,
  shouldSendView, pruneSeen,
};
