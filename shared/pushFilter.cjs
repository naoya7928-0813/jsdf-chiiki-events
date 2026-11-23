'use strict';
/**
 * 新着通知の「地域・種目」の絞り込み（2026-11-23 導入）。
 *
 * 利用者が設定画面で選んだ地域（8地域）・種目（固定9値）を購読情報と一緒に保存し、
 * /api/notify が新着イベントのうち当てはまるものだけをその端末へ送る。
 *   - 何も選んでいない（空）＝すべて（従来どおり）
 *   - 当てはまる新着が無い端末には送らない
 * 判定はここに集約（api/subscribe・api/notify・テストで共有）。
 */

const { CATEGORIES } = require('./llmExtract.cjs');

/** 地域 ID（src/data/regionMap.js の REGIONS と同じ。テストで一致を検査） */
const REGION_IDS = Object.freeze(['hokkaido', 'tohoku', 'kanto', 'chubu', 'kinki', 'chugoku', 'shikoku', 'kyushu']);

/** 保存してよい形に正規化（既知の値だけ・重複なし）。どちらも空なら null（＝絞り込みなし） */
function normalizePushFilter(input) {
  if (!input || typeof input !== 'object') return null;
  const pick = (arr, allowed) => [...new Set((Array.isArray(arr) ? arr : []).filter(v => allowed.includes(v)))];
  const regions = pick(input.regions, REGION_IDS);
  const categories = pick(input.categories, CATEGORIES);
  // 全部選んだのは「すべて」と同じ
  const r = regions.length === REGION_IDS.length ? [] : regions;
  const c = categories.length === CATEGORIES.length ? [] : categories;
  return (r.length || c.length) ? { regions: r, categories: c } : null;
}

/** 新着イベントがこの端末の絞り込みに当てはまるか */
function matchesPushFilter(filter, ev, prefToRegion) {
  if (!filter) return true;
  if (filter.regions && filter.regions.length) {
    const region = prefToRegion && prefToRegion[ev && ev.pref];
    if (!region || !filter.regions.includes(region)) return false;
  }
  if (filter.categories && filter.categories.length) {
    if (!filter.categories.includes(ev && ev.category)) return false;
  }
  return true;
}

/**
 * 1回の通知で扱う新着の上限。これを超えた分は絞り込みに使えないため、
 * 当てはまる新着が見つからない端末にも「新着あり」の概要を送る（取りこぼさない側に倒す）。
 * 以前は 50 件で切っており、51件目以降だけが当てはまる端末に通知が届かなかった（2026-11-23 指摘）。
 */
const MAX_NEW_EVENTS = 500;

/** 通知に載せる新着イベント（スクレイパーが送る）を安全な形に。最大 MAX_NEW_EVENTS 件 */
function sanitizeNewEvents(list) {
  if (!Array.isArray(list)) return [];
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  return list.slice(0, MAX_NEW_EVENTS)
    .filter(e => e && typeof e === 'object' && /^[A-Za-z0-9_-]{1,80}$/.test(String(e.id || '')))
    .map(e => ({ id: String(e.id), pref: s(e.pref, 20), category: s(e.category, 20), title: s(e.title, 80), date: s(e.date, 10) }));
}

/**
 * 1端末に送る通知の中身。当てはまる新着が無ければ null。
 * totalCount（新着の実数）が events の件数より多い＝上限で切った回は、当てはまるものが無くても
 * 切った分に当てはまるかもしれないので、概要の通知を送る。
 */
function buildPushPayload(events, filter, prefToRegion, totalCount = events.length) {
  const hit = events.filter(e => matchesPushFilter(filter, e, prefToRegion));
  if (!hit.length) {
    if (totalCount > events.length) {
      return { title: '自衛隊イベント情報 新着あり', body: `新着イベントが ${totalCount} 件あります。アプリで確認してください。`, url: '/list' };
    }
    return null;
  }
  const sample = hit.slice(0, 3);
  return {
    title: `自衛隊イベント情報 +${hit.length}件`,
    body: sample.map(e => `・${e.title} (${e.date})`).join('\n') + (hit.length > 3 ? `\n他 ${hit.length - 3} 件…` : ''),
    url: hit.length === 1 ? `/event/${encodeURIComponent(hit[0].id)}` : '/list',
  };
}

module.exports = { MAX_NEW_EVENTS, REGION_IDS, CATEGORIES, normalizePushFilter, matchesPushFilter, sanitizeNewEvents, buildPushPayload };
