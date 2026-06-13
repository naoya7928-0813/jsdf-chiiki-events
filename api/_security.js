// API 共通のセキュリティユーティリティ
// - オリジン検証（自サイト以外のブラウザからの書き込みを拒否）
// - プッシュ購読 endpoint の検証（正規のプッシュサービスのみ許可）
// - Upstash Redis ベースの簡易レートリミット
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

/** 自サイトとして許可するオリジン */
const ALLOWED_ORIGINS = new Set([
  'https://jsdf-chiiki-events.vercel.app',
  'http://localhost:5173',  // vite dev
  'http://localhost:4173',  // vite preview
]);

/**
 * Origin ヘッダを検証する。
 * ブラウザからのクロスサイト書き込み（CSRF的な悪用・他サイトからの購読操作）を防ぐ。
 * Origin が無いリクエスト（同一オリジンのSW等・curl）は通すが、
 * 偽オリジンを付けたブラウザ経由の攻撃を遮断できる。
 */
export function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ error: 'Forbidden origin' });
    return false;
  }
  // CORS は許可オリジンのみ返す（従来の「*」を廃止）
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  return true;
}

/** 正規の Web Push サービスの endpoint かを検証する（Redis汚染防止） */
export function isValidPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname;
  return (
    host === 'fcm.googleapis.com' ||                  // Chrome/Edge (FCM)
    host.endsWith('.push.services.mozilla.com') ||    // Firefox
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.apple.com') ||               // Safari
    host.endsWith('.notify.windows.com')              // 旧Edge/WNS
  );
}

/**
 * IPごとの簡易レートリミット。windowSec の間に limit 回まで。
 * 超過したら 429 を返して false。Redis障害時は許可（可用性優先）。
 */
export async function rateLimit(req, res, bucket, limit, windowSec) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = `rl:${bucket}:${ip}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    if (count > limit) {
      res.status(429).json({ error: 'Too many requests' });
      return false;
    }
  } catch { /* Redis障害時はブロックしない */ }
  return true;
}

// 管理操作の共有Redisクライアント（手動イベントの保存先）
export { redis };

/** タイミング攻撃に耐性のある文字列比較 */
import { timingSafeEqual } from 'node:crypto';
export function secretEquals(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 管理者シークレット（環境変数 ADMIN_SECRET）を検証する。
 * リクエストヘッダ x-admin-secret か body.secret を受け付ける。
 * 不一致なら 401 を返して false。未設定（サーバー）なら 503。
 */
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) { res.status(503).json({ error: 'admin not configured' }); return false; }
  const got = req.headers['x-admin-secret'] || req.body?.secret;
  if (!secretEquals(got, expected)) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

// ── 複数アカウント（地本ごとの権限制御） ──────────────────────────
// ADMIN_ACCOUNTS_B64: base64(JSON配列)。各要素 { user, pass, pref, label }。
//   pref '*' は全地本管理。pref 'tokyo' 等はその地本のみ。
// 後方互換: ADMIN_SECRET（パスワードのみ）は user 'admin' / pref '*' として扱う。
function loadAccounts() {
  const out = [];
  try {
    const b64 = process.env.ADMIN_ACCOUNTS_B64;
    if (b64) {
      const arr = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (Array.isArray(arr)) {
        for (const a of arr) {
          if (a && a.user && a.pass) out.push({ user: String(a.user), pass: String(a.pass), pref: String(a.pref || '*'), label: String(a.label || a.user) });
        }
      }
    }
  } catch { /* 不正なら無視 */ }
  return out;
}

/**
 * リクエストの認証情報からアカウントを解決する。
 * - ヘッダ x-admin-user / x-admin-pass（または body.user/body.pass）で照合
 * - 後方互換: x-admin-secret / body.secret が ADMIN_SECRET と一致すれば super
 * @returns {{user, pref, label}|null}  認証失敗時は null
 */
export function resolveAccount(req) {
  const user = req.headers['x-admin-user'] || req.body?.user;
  const pass = req.headers['x-admin-pass'] || req.body?.pass;
  if (user && pass) {
    for (const a of loadAccounts()) {
      if (a.user === String(user) && secretEquals(String(pass), a.pass)) {
        return { user: a.user, pref: a.pref, label: a.label };
      }
    }
  }
  // 後方互換: 単一パスワード
  const secret = req.headers['x-admin-secret'] || req.body?.secret;
  if (secret && process.env.ADMIN_SECRET && secretEquals(String(secret), process.env.ADMIN_SECRET)) {
    return { user: 'admin', pref: '*', label: '全地本管理' };
  }
  return null;
}

/** 認証必須。失敗時は 401/503 を返し null。成功時はアカウントを返す。 */
export function requireAccount(req, res) {
  if (!process.env.ADMIN_ACCOUNTS_B64 && !process.env.ADMIN_SECRET) {
    res.status(503).json({ error: 'admin not configured' });
    return null;
  }
  const acc = resolveAccount(req);
  if (!acc) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return acc;
}

/** アカウントが対象地本を操作できるか（'*' は全許可） */
export function canManagePref(account, pref) {
  return account && (account.pref === '*' || account.pref === pref);
}

// 除去対象のコードポイント判定（制御文字・双方向・ゼロ幅。タブ/改行は別途扱う）
function isRemovableCode(c) {
  if (c === 9 || c === 10) return false;
  if (c <= 31) return true;
  if (c >= 0x7f && c <= 0x9f) return true;
  if (c >= 0x200b && c <= 0x200d) return true;
  if (c >= 0x202a && c <= 0x202e) return true;
  if (c >= 0x2066 && c <= 0x2069) return true;
  if (c === 0xfeff) return true;
  return false;
}

/** テキストの安全化（制御/双方向/ゼロ幅除去、改行は1行化、長さ上限） */
export function cleanText(input, maxLen = 200) {
  let out = '';
  for (const ch of String(input ?? '')) {
    if (!isRemovableCode(ch.codePointAt(0))) out += ch;
  }
  out = out.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}
