'use strict';

const crypto = require('crypto');

/**
 * HTML差分監視用の正規化。
 *
 * 比べるのは「利用者に見える文章」と「リンク・画像・PDF 等の参照先」だけにする（2026-11-23 改定・版 2）。
 * 以前は HTML 全体（コメント・nonce・空白だけ除く）を比べていたため、ページに毎回変わる埋め込み
 * （スクリプト内のトークン・ランダム値・解析タグ等）があると内容が同じでも毎回「更新あり」になり、
 * 2026-11-23 の週次監視では 322 URL 中 320 URL が更新扱い → 毎週フルスクレイプを余計に起動していた。
 *   - 除く: <script>・<style>・<noscript>・<template>・コメント・<head> 内の <link>/<meta>・属性値のトークン
 *   - 残す: 本文の文字・<a href>・<img src>・<iframe src>・<embed src>・<object data>・<source src>
 *   - 参照先の /cdn-cgi/ や __cf_ のような配信基盤のURLは除く
 *   - 例外: パーサーがスクリプト内のデータからイベントを読む地本は、そのデータだけ残す（EVENT_SCRIPT_PATTERNS）。
 *     広島（hiroshima.js）は `var calendarEvents = [...]` からイベントを読むため、ここを除くとカレンダーだけの
 *     更新を見落とす（監視は JavaScript を動かさずに HTML を取るので本文に出てこない）。2026-11-23 指摘
 * イベントの追加・日付の変更・チラシ（PDF/画像）の差し替えは、文章か参照先のどちらかが変わるので検知できる。
 */
const HASH_VERSION = 2;

/** スクリプト内にあるイベントのデータ（パーサーが読むもの）。scraper/parsers/ と揃える */
const EVENT_SCRIPT_PATTERNS = [
  /var\s+calendarEvents\s*=\s*(\[[\s\S]*?\]);/, // hiroshima.js
];

const REF_RE = /<(a|img|iframe|embed|source|object)\b[^>]*?\s(href|src|data)\s*=\s*(["'])(.*?)\3/gi;

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function canonicalizeHtml(html) {
  const raw = String(html || '');
  const scriptData = [];
  raw.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, body) => {
    for (const re of EVENT_SCRIPT_PATTERNS) {
      const m = body.match(re);
      if (m) scriptData.push(m[1].replace(/\s+/g, ' ').trim());
    }
    return '';
  });

  let s = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head\s*>/i, (head) => {
      // <head> は <title> だけ残す（link/meta はキャッシュ用の版番号やトークンで変わる）
      const t = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
      return t ? `<title>${t[1]}</title>` : '';
    });

  const refs = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(s)) !== null) {
    const v = decodeEntities(m[4]).trim();
    if (!v || /\/cdn-cgi\/|__cf_|^javascript:|^data:/i.test(v)) continue;
    refs.push(v);
  }

  const text = decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  return `${text}\n${refs.join('\n')}${scriptData.length ? `\n${scriptData.join('\n')}` : ''}`;
}

function hashHtml(html) {
  return crypto.createHash('sha256').update(canonicalizeHtml(html)).digest('hex');
}

/**
 * 初回は基準値作成のみ。2回目以降、HTMLハッシュが変わった場合だけ changed。
 * 比べ方の版（hashVersion）が前回と違うときも基準値の作り直し（baseline）にする
 * （版を上げた直後に全ページが「更新あり」になってフルスクレイプが起動するのを防ぐ）。
 */
function classifyChange(previous, current) {
  if (!previous || !previous.hash) return 'baseline';
  const pv = previous.hashVersion || 1;
  const cv = current.hashVersion || HASH_VERSION;
  if (pv !== cv) return 'baseline';
  return previous.hash === current.hash ? 'unchanged' : 'changed';
}

module.exports = {
  HASH_VERSION,
  EVENT_SCRIPT_PATTERNS,
  canonicalizeHtml,
  hashHtml,
  classifyChange,
};
