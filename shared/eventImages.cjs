'use strict';
// イベント詳細の画像（チラシ・会場写真など）の表示判定。2026-10-13 に枠だけ用意（現在は「（現在用意中）」を表示）。
//
// 背景（地本サイトの利用条件の確認結果）:
//   地本サイトの掲載物は政府標準利用規約2.0／公共データ利用規約1.0（出典を書けば転載・加工可）だが、
//   「シンボルマーク・ロゴ・キャラクター」は対象外で、写真の人物（肖像権）・タレント等の第三者の権利は
//   利用者が許諾を取る必要がある。チラシにはこれらがほぼ必ず入るため、自動で収集した画像は出さない。
//   → 表示するのは「運営が権利を確認し、公開を許可した画像」だけ。出典（＋加工したなら加工の旨）を必ず添える。
//
// 拡張の手順（画像を出すとき）:
//   1. EVENT_IMAGES_ENABLED を true にする（全体の表示スイッチ。false の間は枠に「（現在用意中）」だけを出す）
//   2. イベントに images を持たせる（運営画面・API は未実装。形式は normalizeImages を参照）
//   3. 個別に隠したいときはイベントの imagesHidden を true にする（枠ごと出さない）
// ⚠️ スクレイパーが集める imageUrl（チラシ実物）はここでは使わない（権利確認がされていないため）。

const EVENT_IMAGES_ENABLED = false;
const MAX_IMAGES = 6;
const LIMITS = { alt: 120, credit: 200 };

const { DEFAULT_SITE_URL } = require('./siteUrl.cjs');

// 画像を置いてよい場所（https のみ）。公開を許可した画像は自サイトか防衛省サイトに置く想定
const SITE_HOST = new URL(DEFAULT_SITE_URL).hostname;
const isAllowedHost = (h) => h === SITE_HOST || h === 'www.mod.go.jp' || h.endsWith('.mod.go.jp');

function safeImageUrl(u) {
  try {
    const url = new URL(String(u || ''));
    if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 画像の配列を規定の形にそろえる。権利確認（rightsConfirmed）と公開許可（public）の両方が true のものだけ残す。
 * @returns {{url:string, alt:string, credit:string, edited:boolean}[]}
 */
function normalizeImages(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const im of list) {
    if (!im || typeof im !== 'object') continue;
    if (im.rightsConfirmed !== true || im.public !== true) continue;
    const url = safeImageUrl(im.url);
    const credit = clip(im.credit, LIMITS.credit);
    if (!url || !credit) continue; // 出典の無い画像は出さない
    out.push({ url, alt: clip(im.alt, LIMITS.alt), credit, edited: im.edited === true });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/**
 * 詳細画面の画像枠をどう出すか。
 * @param {object} ev イベント
 * @param {{enabled?: boolean}} [opt] 全体スイッチ（既定は EVENT_IMAGES_ENABLED）
 * @returns {{state:'preparing'} | {state:'hidden'} | {state:'show', images: ReturnType<typeof normalizeImages>}}
 *   preparing … 枠に「（現在用意中）」だけを出す
 *   hidden    … 枠ごと出さない（個別に隠した／表示できる画像が無い）
 *   show      … 画像を出す（各画像に出典を添える）
 */
function decideImageDisplay(ev, { enabled = EVENT_IMAGES_ENABLED } = {}) {
  if (!enabled) return { state: 'preparing' };
  if (!ev || ev.imagesHidden === true) return { state: 'hidden' };
  const images = normalizeImages(ev.images);
  return images.length ? { state: 'show', images } : { state: 'hidden' };
}

module.exports = { EVENT_IMAGES_ENABLED, MAX_IMAGES, LIMITS, safeImageUrl, normalizeImages, decideImageDisplay };
