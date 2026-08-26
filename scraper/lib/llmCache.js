'use strict';

/**
 * llmCache.js — LLM 呼び出し結果のキャッシュ
 *
 * スクレイプは1日3回走る。毎回すべてのイベントを LLM に投げ直すと、
 * 中身が変わっていないのにクォータだけを消費する（OCR キャッシュと同じ問題）。
 * 入力のハッシュをキーに結果を保存し、変化した分だけ呼ぶ。
 *
 * 保存先: scraper/llm-cache.json（.gitignore 対象。Actions cache で永続化する）
 * キー:   用途 + プロンプト版 + 入力 の SHA-256
 * TTL:    90日（assetCache と揃える）
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const CACHE_PATH = path.join(__dirname, '../llm-cache.json');
const TTL_DAYS   = 90;

let _cache = {};

/** 用途・プロンプト版・入力からキャッシュキーを作る */
function keyFor(task, promptVersion, input) {
  return crypto.createHash('sha256')
    .update(`${task} ${promptVersion} ${input}`)
    .digest('hex');
}

function load() {
  try {
    const raw    = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const cutoff = Date.now() - TTL_DAYS * 86400000;
    for (const [k, v] of Object.entries(raw)) {
      if (!/^[0-9a-f]{64}$/.test(k)) continue;
      if (v && v.cachedAt && new Date(v.cachedAt).getTime() < cutoff) continue;
      _cache[k] = v;
    }
    console.log(`[LLMキャッシュ] ${Object.keys(_cache).length} 件読み込み`);
  } catch {
    // ファイルなし or 破損 → 空で開始（作り直せばよい）
  }
}

function save() {
  const cutoff  = Date.now() - TTL_DAYS * 86400000;
  const cleaned = {};
  for (const [k, v] of Object.entries(_cache)) {
    if (v && v.cachedAt && new Date(v.cachedAt).getTime() < cutoff) continue;
    cleaned[k] = v;
  }
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`[LLMキャッシュ] ${Object.keys(cleaned).length} 件保存`);
  } catch (err) {
    console.warn(`[LLMキャッシュ] 保存失敗: ${err.message}`);
  }
}

/**
 * キャッシュを引く。
 * 「LLM を呼んだが抽出できなかった（null）」も記録し、同じ入力で呼び直さない。
 * @returns {{ hit: boolean, result: Object|null }}
 */
function get(key) {
  const entry = _cache[key];
  if (!entry) return { hit: false, result: null };
  return { hit: true, result: entry.result ?? null };
}

function set(key, result, meta = {}) {
  _cache[key] = {
    result: result ?? null,
    ...meta,
    cachedAt: new Date().toISOString(),
  };
}

function size() { return Object.keys(_cache).length; }

module.exports = { keyFor, load, save, get, set, size, CACHE_PATH, TTL_DAYS };
