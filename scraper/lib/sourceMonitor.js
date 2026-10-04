'use strict';

const crypto = require('crypto');

/**
 * HTML差分監視用の正規化。
 * 見た目や意味に影響しないコメント・nonce・空白差分を除き、
 * 実コンテンツやリンク/画像/PDF参照の変更は残す。
 */
function canonicalizeHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\snonce=(["'])[^"']*\1/gi, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashHtml(html) {
  return crypto.createHash('sha256').update(canonicalizeHtml(html)).digest('hex');
}

/**
 * 初回は基準値作成のみ。2回目以降、HTMLハッシュが変わった場合だけ changed。
 */
function classifyChange(previous, current) {
  if (!previous || !previous.hash) return 'baseline';
  return previous.hash === current.hash ? 'unchanged' : 'changed';
}

module.exports = {
  canonicalizeHtml,
  hashHtml,
  classifyChange,
};
