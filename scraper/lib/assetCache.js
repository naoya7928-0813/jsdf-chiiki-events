'use strict';

/**
 * assetCache.js — PDF/画像アセットのOCRキャッシュ管理
 *
 * キー: content_sha256（ファイル実体のSHA-256）
 * 保存先: scraper/ocr-cache.json（.gitignore 対象、self-hosted runner上で永続）
 *
 * 既存の ocr-cache.json 形式と後方互換。
 * 新エントリには etag / last_modified / content_length 等のメタデータも保存。
 */

const fs   = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../ocr-cache.json');
const TTL_DAYS   = 90;

let _cache    = {};  // sha256 → entry
let _urlIndex = {};  // normalizedUrl → sha256

function load() {
  try {
    const raw    = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const cutoff = Date.now() - TTL_DAYS * 86_400_000;
    for (const [k, v] of Object.entries(raw)) {
      if (!/^[0-9a-f]{64}$/.test(k)) continue;
      if (v.cachedAt && new Date(v.cachedAt).getTime() < cutoff) continue;
      _cache[k] = v;
      if (v.normalized_asset_url) _urlIndex[v.normalized_asset_url] = k;
    }
    console.log(`[AssetCache] ${Object.keys(_cache).length} 件読み込み`);
  } catch {
    // ファイルなし or パース失敗 → 空で開始
  }
}

function save() {
  const cutoff  = Date.now() - TTL_DAYS * 86_400_000;
  const cleaned = {};
  for (const [k, v] of Object.entries(_cache)) {
    if (v.cachedAt && new Date(v.cachedAt).getTime() < cutoff) continue;
    cleaned[k] = v;
  }
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`[AssetCache] ${Object.keys(cleaned).length} 件保存`);
  } catch (err) {
    console.warn(`[AssetCache] 保存失敗: ${err.message}`);
  }
}

/** SHA-256ハッシュでキャッシュ検索 */
function getByHash(hash) {
  return _cache[hash] || null;
}

/** 正規化済みURLで検索（条件付きGET用のetag/last_modified取得に使用） */
function getByUrl(normalizedUrl) {
  const hash = _urlIndex[normalizedUrl];
  return hash ? _cache[hash] : null;
}

/**
 * キャッシュエントリを書き込む。
 * 既存エントリがある場合は first_seen_at / cachedAt を保持しつつマージ。
 * @param {string} hash
 * @param {Object} entry - 保存するメタデータ（result含む）
 */
function set(hash, entry) {
  const existing = _cache[hash] || {};
  const now      = new Date().toISOString();
  _cache[hash]   = {
    ...existing,
    ...entry,
    content_sha256:  hash,
    first_seen_at:   existing.first_seen_at || entry.first_seen_at || now,
    last_seen_at:    now,
    last_checked_at: now,
    cachedAt:        existing.cachedAt || now,
  };
  if (entry.normalized_asset_url) {
    _urlIndex[entry.normalized_asset_url] = hash;
  }
}

/** 中身が変わっていない場合にlast_checked_atだけ更新 */
function touch(hash) {
  if (_cache[hash]) {
    _cache[hash].last_checked_at = new Date().toISOString();
  }
}

/** 全エントリ数 */
function size() {
  return Object.keys(_cache).length;
}

module.exports = { load, save, getByHash, getByUrl, set, touch, size };
