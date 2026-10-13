'use strict';
// イベント詳細の画像（チラシ・会場写真など）の表示判定と、運営画面での登録データの検証。
// 2026-10-13: 公開画面は当面すべて「（現在準備中）」のみ（運営の決定）。運営画面では画像を登録・管理できる。
//
// 背景（地本サイトの利用条件の確認結果）:
//   地本サイトの掲載物は政府標準利用規約2.0／公共データ利用規約1.0（出典を書けば転載・加工可）だが、
//   「シンボルマーク・ロゴ・キャラクター」は対象外で、写真の人物（肖像権）・タレント等の第三者の権利は
//   利用者が許諾を取る必要がある。チラシにはこれらがほぼ必ず入るため、自動で収集した画像は出さない。
//   → 表示するのは「運営が権利を確認し、公開を許可した画像」だけ。出典（＋加工したなら加工の旨）を必ず添える。
//
// 拡張の手順（画像を出すとき）:
//   1. EVENT_IMAGES_ENABLED を true にする（全体の表示スイッチ。false の間は枠に「（現在準備中）」だけを出す）
//   2. 公開用の画像配信API（/api/image?id=…）を追加する（現在は運営用の /api/admin/images のみ。関数数の上限に注意）
//      イベントの images は運営画面（/api/admin/images）で登録済み。形式は normalizeImages を参照
//   3. 個別に隠したいときはイベントの imagesHidden を true にする（枠ごと出さない）
// ⚠️ スクレイパーが集める imageUrl（チラシ実物）はここでは使わない（権利確認がされていないため）。

const EVENT_IMAGES_ENABLED = false;
const MAX_IMAGES = 6;
const LIMITS = { alt: 120, credit: 200 };
const MAX_IMAGE_BYTES = 600 * 1024;          // 1枚あたり（運営画面で縮小・再圧縮してから送る）
const IMAGE_ID_RE = /^img-[a-z0-9]{12}$/;
const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** 登録済み画像の配信パス（公開APIを足すときにこの形で配信する） */
const imagePath = (id) => `/api/image?id=${encodeURIComponent(id)}`;

const { DEFAULT_SITE_URL } = require('./siteUrl.cjs');

// 画像を置いてよい場所（https のみ）。公開を許可した画像は自サイトか防衛省サイトに置く想定
const SITE_HOST = new URL(DEFAULT_SITE_URL).hostname;
const isAllowedHost = (h) => h === SITE_HOST || h === 'www.mod.go.jp' || h.endsWith('.mod.go.jp');

function safeImageUrl(u) {
  // 自サイトの画像配信パス（登録済み画像）
  if (typeof u === 'string' && /^\/api\/image\?id=img-[a-z0-9]{12}$/.test(u)) return u;
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
    const url = safeImageUrl(im.id && IMAGE_ID_RE.test(im.id) ? imagePath(im.id) : im.url);
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
 *   preparing … 枠に「（現在準備中）」だけを出す
 *   hidden    … 枠ごと出さない（個別に隠した／表示できる画像が無い）
 *   show      … 画像を出す（各画像に出典を添える）
 */
function decideImageDisplay(ev, { enabled = EVENT_IMAGES_ENABLED } = {}) {
  if (!enabled) return { state: 'preparing' };
  if (!ev || ev.imagesHidden === true) return { state: 'hidden' };
  const images = normalizeImages(ev.images);
  return images.length ? { state: 'show', images } : { state: 'hidden' };
}

// ── 運営画面からの登録（/api/admin/images） ──────────────────────────────

/**
 * data URL（data:image/jpeg;base64,…）を検証してバイト列にする。
 * 形式（JPEG/PNG/WebP）は申告の MIME ではなくファイル先頭のバイトで確かめる。
 * @returns {{mime:string, buf:Buffer} | {error:string}}
 */
function parseImageDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: '画像の形式が不正です（JPEG・PNG・WebP のみ）' };
  if (m[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) return { error: `画像が大きすぎます（${Math.round(MAX_IMAGE_BYTES / 1024)}KB まで）` };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return { error: `画像が大きすぎます（${Math.round(MAX_IMAGE_BYTES / 1024)}KB まで）` };
  const sniff = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'image/jpeg'
    : buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
    : buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : '';
  if (!sniff || sniff !== m[1]) return { error: '画像の中身が JPEG・PNG・WebP ではありません' };
  return { mime: sniff, buf };
}

/** 画像の説明・出典・確認状態（運営の入力）を規定の形にそろえる。 */
function normalizeImageMeta(input = {}) {
  return {
    alt: clip(input.alt, LIMITS.alt),
    credit: clip(input.credit, LIMITS.credit),
    edited: input.edited === true,
    rightsConfirmed: input.rightsConfirmed === true,
    public: input.public === true,
  };
}

/** 保存済みの images 配列（運営向け）を検証済みの形にそろえる（不正な要素は捨てる）。 */
function sanitizeStoredImages(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(im => im && IMAGE_ID_RE.test(im.id)).slice(0, MAX_IMAGES).map(im => ({
    id: im.id, ...normalizeImageMeta(im),
    mime: MIME[im.mime] ? im.mime : 'image/jpeg',
    width: Number.isFinite(im.width) ? im.width : null, height: Number.isFinite(im.height) ? im.height : null,
    size: Number.isFinite(im.size) ? im.size : null, by: String(im.by || '').slice(0, 40), at: String(im.at || '').slice(0, 40),
  }));
}

module.exports = {
  EVENT_IMAGES_ENABLED, MAX_IMAGES, LIMITS, MAX_IMAGE_BYTES, IMAGE_ID_RE, imagePath,
  safeImageUrl, normalizeImages, decideImageDisplay, parseImageDataUrl, normalizeImageMeta, sanitizeStoredImages,
};
