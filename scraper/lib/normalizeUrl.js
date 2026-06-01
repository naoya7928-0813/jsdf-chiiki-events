'use strict';

const STRIP_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ref','s','_ga']);

/**
 * URLを正規化する。
 * - フラグメント除去
 * - スキーム・ホストを小文字化
 * - 末尾スラッシュ統一（ルート以外は除去）
 * - 追跡パラメータ除去
 * - クエリパラメータをキー順ソート
 * @param {string} rawUrl
 * @param {string} [baseUrl] - 相対URL解決用
 * @returns {string|null}
 */
function normalizeUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  rawUrl = rawUrl.trim();
  if (rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:') || rawUrl.startsWith('tel:') || rawUrl.startsWith('data:')) return null;
  try {
    const u = new URL(rawUrl, baseUrl);
    u.hash = '';
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    for (const p of STRIP_PARAMS) u.searchParams.delete(p);
    u.searchParams.sort();
    const qs = u.searchParams.toString();
    return u.origin + u.pathname + (qs ? '?' + qs : '');
  } catch {
    return null;
  }
}

function isPdfUrl(url) {
  return typeof url === 'string' && /\.pdf(\?[^#]*)?$/i.test(url);
}

function isImageUrl(url) {
  return typeof url === 'string' && /\.(jpe?g|png|webp|gif)(\?[^#]*)?$/i.test(url);
}

function isAssetUrl(url) {
  return isPdfUrl(url) || isImageUrl(url);
}

module.exports = { normalizeUrl, isPdfUrl, isImageUrl, isAssetUrl };
