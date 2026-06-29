// 認証セッション・パスワードの純粋ユーティリティ（I/O無し）。
// セッション本体（Redis 保存/失効）は api/_security.js が担当し、ここは
// パスワードのハッシュ化/検証・Cookie の組立/解析・トークン生成のみを提供する。
'use strict';

const crypto = require('node:crypto');

// ── パスワード（scrypt。Node 標準。ネイティブビルド不要） ────────
// 保存形式: "scrypt$<N>$<saltHex>$<hashHex>"。旧データ（平文）は移行期間のみ許可。
const SCRYPT_N = 16384, SCRYPT_KEYLEN = 32;

/** 平文パスワードを scrypt でハッシュ化（移行・新規アカウント生成用）。 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** タイミングセーフ比較（長さ不一致は false）。 */
function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * パスワード検証。stored が "scrypt$..." なら scrypt 検証。
 * それ以外は平文比較（移行期間のみ。allowPlaintext=false で拒否可能）。
 */
function verifyPassword(plain, stored, { allowPlaintext = true } = {}) {
  if (typeof stored !== 'string' || !stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, nStr, saltHex, hashHex] = stored.split('$');
    const N = Number(nStr);
    if (!N || !saltHex || !hashHex) return false;
    let derived;
    try { derived = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), hashHex.length / 2, { N }); }
    catch { return false; }
    return timingSafeEqualStr(derived.toString('hex'), hashHex);
  }
  // 旧方式（平文）
  if (!allowPlaintext) return false;
  return timingSafeEqualStr(plain, stored);
}

/** 推測困難なセッショントークン（URL安全）。 */
function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** リクエスト相関用 ID（監査ログの requestId）。 */
function newRequestId() {
  return crypto.randomUUID();
}

// ── Cookie ──────────────────────────────────────────────────────
const COOKIE_NAME = 'jsdf_admin_session';

/**
 * Set-Cookie 値を組み立てる（HttpOnly/Secure/SameSite/Max-Age/Path）。
 * @param {string} value セッショントークン（空文字＝失効用）
 * @param {object} opts { maxAge(秒), secure, sameSite }
 */
function serializeSessionCookie(value, opts = {}) {
  const { maxAge = 60 * 60 * 8, secure = true, sameSite = 'Strict' } = opts;
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'HttpOnly',
    'Path=/',
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** 失効用 Cookie（Max-Age=0）。 */
function clearSessionCookie(opts = {}) {
  return serializeSessionCookie('', { ...opts, maxAge: 0 });
}

/** Cookie ヘッダ文字列をパースして { name: value } を返す。 */
function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** リクエストからセッショントークンを取り出す。 */
function getSessionToken(req) {
  const cookies = parseCookies(req && req.headers && req.headers.cookie);
  return cookies[COOKIE_NAME] || '';
}

// ── CSRF（同一オリジン）判定（純粋・テスト可能） ────────────────
// 状態変更メソッドのみ対象。GET/HEAD/OPTIONS は対象外（プリフライトを壊さない）。
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF判定（純粋）。I/O や許可リストは呼び出し側が解決して渡す。
 * @param {object} a
 *   method            HTTPメソッド
 *   origin            Origin ヘッダ（無ければ falsy）
 *   secFetchSite      Sec-Fetch-Site ヘッダ（無ければ falsy）
 *   isAllowedOrigin   origin が自サイト許可originと完全一致なら true
 *   internalSecretOk  Origin欠落を許す正当な非ブラウザ経路（専用シークレット一致）なら true
 * @returns {{ok:true} | {ok:false, reason:string}}
 */
function csrfDecision({ method, origin, secFetchSite, isAllowedOrigin, internalSecretOk }) {
  const m = String(method || 'GET').toUpperCase();
  if (!STATE_CHANGING.has(m)) return { ok: true };
  if (origin) {
    if (!isAllowedOrigin) return { ok: false, reason: 'origin_not_allowed' };
  } else if (!internalSecretOk) {
    // ブラウザ由来の状態変更で Origin 欠落は原則拒否
    return { ok: false, reason: 'origin_missing' };
  }
  // Sec-Fetch-Site があるなら same-origin 必須（cross-site/same-site は拒否）
  if (secFetchSite && String(secFetchSite).toLowerCase() !== 'same-origin') {
    return { ok: false, reason: 'sec_fetch_site_' + String(secFetchSite).toLowerCase() };
  }
  return { ok: true };
}

module.exports = {
  hashPassword, verifyPassword, timingSafeEqualStr, newToken, newRequestId,
  COOKIE_NAME, serializeSessionCookie, clearSessionCookie, parseCookies, getSessionToken,
  STATE_CHANGING, csrfDecision,
};
