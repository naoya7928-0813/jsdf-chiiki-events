// API 共通のセキュリティユーティリティ
// - オリジン検証（自サイト以外のブラウザからの書き込みを拒否）
// - プッシュ購読 endpoint の検証（正規のプッシュサービスのみ許可）
// - Upstash Redis ベースの簡易レートリミット
import { Redis } from '@upstash/redis';
import authz from '../shared/authz.cjs';
import sessionUtil from '../shared/session.cjs';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

/** 自サイトとして許可するオリジン。
 *  独自ドメイン等へ移行する際は、コードを変えずに環境変数 SITE_ORIGINS（カンマ区切りの
 *  完全なオリジン。例: "https://jsdf-events.jp,https://www.jsdf-events.jp"）で追加できる。
 *  移行期は旧 vercel.app オリジンも残しておくと切替中の書き込みが 403 にならない。 */
// localhost は開発時だけ許可する。本番で許可し続けると、利用者の端末で動く
// ローカルのページを起点にした書き込みが Origin 検証を素通りしてしまう
// （SameSite=Strict Cookie と Sec-Fetch-Site でも止まるが、层を減らさない）。
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';
const DEV_ORIGINS = IS_PRODUCTION ? [] : [
  'http://localhost:5173',  // vite dev
  'http://localhost:4173',  // vite preview
];
const ALLOWED_ORIGINS = new Set([
  'https://jsdf-chiiki-events.vercel.app',
  ...DEV_ORIGINS,
  ...String(process.env.SITE_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(s => /^https?:\/\//.test(s)),
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

/**
 * 管理APIの応答をキャッシュさせない（ブラウザ・CDN・中継）。
 * 成功/エラー（401/403/405/500等）問わず付与するため、各管理ハンドラの先頭で呼ぶ。
 * 別アカウントへ前の管理データが表示される事故やオフライン残存を防ぐ。
 */
export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * CSRF多層防御: 状態変更（POST/PUT/PATCH/DELETE）は同一オリジン由来のみ許可する。
 * - Origin が許可originと完全一致を要求
 * - Sec-Fetch-Site があれば same-origin を要求（cross-site等は拒否）
 * - Origin 欠落は原則拒否。正当な非ブラウザ経路は INTERNAL_API_SECRET（x-internal-secret）で明示分離
 * - GET/HEAD/OPTIONS は対象外（CORSプリフライトを壊さない）。SameSite=Strict Cookie と併用。
 * 失敗時は 403（内部情報を含めない）＋ 監査ログ（denied）を記録して false。
 */
export async function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  const sec = req.headers['x-internal-secret'];
  const internalSecretOk = !!(process.env.INTERNAL_API_SECRET && sec &&
    secretEquals(String(sec), process.env.INTERNAL_API_SECRET));
  const decision = sessionUtil.csrfDecision({
    method: req.method,
    origin,
    secFetchSite: req.headers['sec-fetch-site'],
    isAllowedOrigin: !!(origin && ALLOWED_ORIGINS.has(origin)),
    internalSecretOk,
  });
  if (decision.ok) return true;

  const requestId = sessionUtil.newRequestId();
  let actor = null;
  try { const r = await authenticate(req); actor = r && r.account; } catch { /* ベストエフォート */ }
  await writeAudit(actor, {
    requestId,
    action: 'csrf.denied',
    result: 'denied',
    note: `${(req.method || '').toUpperCase()} ${req.url || ''} reason=${decision.reason}`,
  });
  res.status(403).json({ error: 'Forbidden' });
  return false;
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
 * レート制限に使う「信用できる」クライアントIPを取り出す。
 *
 * x-forwarded-for の *先頭* を使ってはいけない。プロキシは受け取ったアドレスを
 * 末尾に足していくため、先頭は利用者が自由に詐称できる値になる。
 * 先頭を使うと、このヘッダーを毎回変えるだけでレート制限を素通りできてしまう。
 *
 * 優先順:
 *   1. x-real-ip            … Vercel が付与（利用者は上書きできない）
 *   2. x-vercel-forwarded-for の末尾
 *   3. x-forwarded-for の末尾  … 最後に足されたもの＝プラットフォームに最も近い
 * キーが無制限に伸びないよう長さも制限する。
 */
export function clientIp(req) {
  const h = req.headers || {};
  const last = (v) => {
    const parts = String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  };
  const ip = String(h['x-real-ip'] || '').trim()
    || last(h['x-vercel-forwarded-for'])
    || last(h['x-forwarded-for'])
    || 'unknown';
  return ip.slice(0, 45); // IPv6 の最大長
}

/**
 * IPごとの簡易レートリミット。windowSec の間に limit 回まで。
 * 超過したら 429 を返して false。Redis障害時は許可（可用性優先）。
 */
export async function rateLimit(req, res, bucket, limit, windowSec) {
  const ip = clientIp(req);
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

// ── アカウント解決（RBAC: 権限判定は shared/authz.cjs に集約） ──────
// ADMIN_ACCOUNTS_B64: base64(JSON配列)。各要素は authz.normalizeAccount のスキーマ
//   { user, pass, organization|pref, office, role, displayId, permissions, enabled, label }。
//   後方互換: role 未指定は pref から導出（'*'→national_admin、他→pco_admin）。pass は
//   平文 or "scrypt$..." ハッシュ（session.cjs で検証）。
// 後方互換: ADMIN_SECRET（パスワードのみ）は **LEGACY_ADMIN_SECRET=true の時のみ**
//   user 'admin' / national_admin として受理（既定は無効）。正式運用では ADMIN_SECRET を削除する。
export function loadAccounts() {
  const out = [];
  try {
    const b64 = process.env.ADMIN_ACCOUNTS_B64;
    if (b64) {
      const arr = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (Array.isArray(arr)) for (const a of arr) { const n = authz.normalizeAccount(a); if (n) out.push(n); }
    }
  } catch { /* 不正なら無視 */ }
  return out;
}

// 移行フラグは呼び出し時に評価する（運用での切替・テストを容易にするため）。
const allowPlaintext   = () => process.env.LEGACY_PLAINTEXT_PASSWORDS !== 'false'; // 既定: 許可（移行期）
// ヘッダ認証（x-admin-user/x-admin-pass を毎リクエストに付ける旧方式）は **既定で無効**。
// これを既定で許すと、ログイン画面のロック（回数制限・指数バックオフ）を通らずに
// 任意の管理APIへ資格情報を投げ続けられ、総当りが実質無制限になる。
// 管理画面はセッション Cookie のみを使うため、通常運用でこの経路は不要。
const allowHeaderAuth  = () => process.env.LEGACY_HEADER_AUTH === 'true';          // 既定: 拒否
// ADMIN_SECRET（任意ユーザー名＋共通PWで national_admin になる旧経路）は既定で無効。
// 移行時に LEGACY_ADMIN_SECRET=true を明示した場合のみ許可する。正式運用では ADMIN_SECRET 自体を削除する。
const allowAdminSecret = () => process.env.LEGACY_ADMIN_SECRET === 'true';

let plaintextWarned = false;

/** user/pass を検証してアカウントを返す（平文/scrypt両対応・無効アカウントは拒否）。 */
export function verifyCredentials(user, pass) {
  if (!user || !pass) return null;
  for (const a of loadAccounts()) {
    if (a.user === String(user) && a.enabled !== false &&
        sessionUtil.verifyPassword(String(pass), a.pass, { allowPlaintext: allowPlaintext() })) {
      // 平文のまま保存されたパスワードで認証が通った場合は警告する。
      // 設定を読める人（デプロイ設定の閲覧者・漏洩時）にパスワードそのものが渡るため、
      // scrypt ハッシュへ移行して LEGACY_PLAINTEXT_PASSWORDS=false にすべき状態。
      if (!plaintextWarned && typeof a.pass === 'string' && !a.pass.startsWith('scrypt$')) {
        plaintextWarned = true;
        console.warn('[security] 平文パスワードのアカウントで認証されました。'
          + ' scrypt ハッシュへ移行し LEGACY_PLAINTEXT_PASSWORDS=false を設定してください。');
      }
      return a;
    }
  }
  // 旧共通管理者（ADMIN_SECRET）は LEGACY_ADMIN_SECRET=true の時のみ
  if (allowAdminSecret() && process.env.ADMIN_SECRET && secretEquals(String(pass), process.env.ADMIN_SECRET)) {
    return authz.normalizeAccount({ user: 'admin', pass: process.env.ADMIN_SECRET, pref: '*', label: '全国管理（移行用）' });
  }
  return null;
}

/** ヘッダ（x-admin-user/pass か x-admin-secret）からアカウント解決（移行期の後方互換）。 */
export function resolveAccount(req) {
  const user = req.headers['x-admin-user'] || req.body?.user;
  const pass = req.headers['x-admin-pass'] || req.body?.pass;
  if (user && pass) { const a = verifyCredentials(user, pass); if (a) return a; }
  const secret = req.headers['x-admin-secret'] || req.body?.secret;
  if (allowAdminSecret() && secret && process.env.ADMIN_SECRET && secretEquals(String(secret), process.env.ADMIN_SECRET)) {
    return authz.normalizeAccount({ user: 'admin', pass: process.env.ADMIN_SECRET, pref: '*', label: '全国管理（移行用）' });
  }
  return null;
}

// ── サーバー側セッション（Redis + HttpOnly Cookie） ──────────────
const SESSION_PREFIX  = 'admin:session:';
const SESSION_ABS_TTL = Number(process.env.ADMIN_SESSION_TTL || 8 * 3600); // 最大有効期間(秒)
const SESSION_IDLE    = Number(process.env.ADMIN_SESSION_IDLE || 60 * 60); // 無操作失効(秒)
const SESSION_SECURE  = process.env.SESSION_INSECURE !== 'true';           // ローカルHTTP検証用に解除可

// 在席状況（プレゼンス）用の最終アクティビティ時刻。userId → 最終アクセス(ms) のハッシュ。
// ログイン時・認証付きリクエストのたびに更新し、ログアウトで消す（在席状況APIが参照）。
const LASTSEEN_KEY = 'admin:lastseen';
export const SESSION_IDLE_SEC = SESSION_IDLE;
/** 在席用の最終アクティビティを記録（ベストエフォート）。 */
async function touchLastSeen(userId, nowMs) {
  if (!userId) return;
  try { await redis.hset(LASTSEEN_KEY, { [userId]: nowMs }); } catch { /* noop */ }
}
/** userId → 最終アクティビティ(ms) のマップを取得。 */
export async function readLastSeenMap() {
  try {
    const h = await redis.hgetall(LASTSEEN_KEY);
    const out = {};
    for (const [k, v] of Object.entries(h || {})) { const n = Number(v); if (Number.isFinite(n)) out[k] = n; }
    return out;
  } catch { return {}; }
}

/** ログイン成功時にセッションを発行し Set-Cookie を付与。失敗時 false。 */
export async function startSession(res, account) {
  const token = sessionUtil.newToken();
  const now = Date.now();
  // sv にログイン時点の sessionVersion を刻む。アカウント側で値が変われば既存セッションは失効する。
  const data = { userId: account.userId, user: account.user, createdAt: now, lastSeen: now, sv: account.sessionVersion };
  try { await redis.set(SESSION_PREFIX + token, JSON.stringify(data), { ex: SESSION_ABS_TTL }); }
  catch { return false; }
  await touchLastSeen(account.userId, now);   // 在席状況に反映
  res.setHeader('Set-Cookie', sessionUtil.serializeSessionCookie(token, { maxAge: SESSION_ABS_TTL, secure: SESSION_SECURE }));
  return true;
}

/** ログアウト: セッション失効 + Cookie 削除。在席状況も即オフラインにする。 */
export async function endSession(req, res) {
  const token = sessionUtil.getSessionToken(req);
  if (token) {
    try {
      const raw = await redis.get(SESSION_PREFIX + token);
      const data = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
      if (data && data.userId) { try { await redis.hdel(LASTSEEN_KEY, data.userId); } catch { /* noop */ } }
      await redis.del(SESSION_PREFIX + token);
    } catch { /* noop */ }
  }
  res.setHeader('Set-Cookie', sessionUtil.clearSessionCookie({ secure: SESSION_SECURE }));
}

/** Cookie セッションを検証してアカウントを返す（絶対期限・無操作失効・無効化を反映）。 */
async function resolveSession(req) {
  const token = sessionUtil.getSessionToken(req);
  if (!token) return null;
  let data;
  try { const raw = await redis.get(SESSION_PREFIX + token); if (!raw) return null; data = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return null; }
  const now = Date.now();
  // アカウントを設定から再解決し、無効化・絶対期限・無操作失効・sessionVersion不一致を判定
  const acc = loadAccounts().find(a => a.userId === data.userId);
  if (!acc || !sessionUtil.sessionStillValid(data, acc, now, { absTtl: SESSION_ABS_TTL, idleTtl: SESSION_IDLE })) {
    try { await redis.del(SESSION_PREFIX + token); } catch { /* noop */ }
    return null;
  }
  data.lastSeen = now;
  try { await redis.set(SESSION_PREFIX + token, JSON.stringify(data), { ex: SESSION_ABS_TTL }); } catch { /* noop */ }
  await touchLastSeen(acc.userId, now);   // 在席状況に反映（操作のたびに緑を維持）
  return acc;
}

/** セッション(優先)→後方互換ヘッダ の順で認証。{account, via} か null。 */
export async function authenticate(req) {
  const acc = await resolveSession(req);
  if (acc) return { account: acc, via: 'session' };
  if (allowHeaderAuth()) { const a = resolveAccount(req); if (a) return { account: a, via: 'header' }; }
  return null;
}

/** 認証必須（非同期）。失敗時 401/503 を返し null。新規コードはこちらを使う。 */
export async function requireAuth(req, res) {
  if (!process.env.ADMIN_ACCOUNTS_B64 && !process.env.ADMIN_SECRET) { res.status(503).json({ error: 'admin not configured' }); return null; }
  const r = await authenticate(req);
  if (!r) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return r.account;
}

/** 後方互換: 同期のアカウント解決（ヘッダのみ）。 */
export function requireAccount(req, res) {
  if (!process.env.ADMIN_ACCOUNTS_B64 && !process.env.ADMIN_SECRET) { res.status(503).json({ error: 'admin not configured' }); return null; }
  const acc = resolveAccount(req);
  if (!acc) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  return acc;
}

// 権限・スコープ判定（deny-by-default）は authz に集約
export const hasPermission = authz.hasPermission;
export const canManageScope = authz.canManageScope;
export const canPublish = authz.canPublish;
/** 後方互換: 地本スコープ判定（authz.canManageScope へ委譲）。 */
export function canManagePref(account, pref) { return authz.canManageScope(account, { pref }); }

// ── 監査ログ（追記専用・enriched。削除APIは廃止） ──────────────
const AUDIT_KEY = 'manual:history';
const AUDIT_MAX = Number(process.env.AUDIT_MAX || 5000);
/** 監査エントリを1件追記する（ベストエフォート。本処理は妨げない）。 */
export async function writeAudit(account, e = {}) {
  const actorId = (account && account.displayId) || e.actorId || '';
  const org = (account && account.organization) || e.organization || '';
  const entry = {
    at: new Date().toISOString(),
    requestId: e.requestId || sessionUtil.newRequestId(),
    actorId,
    accountId: (account && account.userId) || e.accountId || '',
    organization: org,
    office: (account && account.office) || e.office || '',
    action: e.action || '',
    targetId: e.targetId || '',
    result: e.result || 'success',
    note: e.note || '',
    ...(e.before !== undefined ? { before: e.before } : {}),
    ...(e.after !== undefined ? { after: e.after } : {}),
    // 後方互換（既存履歴GET/UIが参照するフィールド）
    user: actorId, pref: org, title: e.title || '', id: e.targetId || '',
  };
  try { await redis.lpush(AUDIT_KEY, JSON.stringify(entry)); await redis.ltrim(AUDIT_KEY, 0, AUDIT_MAX - 1); }
  catch { /* 監査失敗は本処理を妨げない */ }
}

// ── 開発/移行用の個人番号（既定で無効。authorization には一切使わない） ──
const ENABLE_DEV_STAFF = process.env.ENABLE_DEV_STAFF === 'true';
export const STAFF = ENABLE_DEV_STAFF ? {
  '001': { name: '東京 募集案内所 所長（仮）', addDelete: true },
  '002': { name: '東京 担当官A（仮）',        addDelete: false },
  '003': { name: '東京 担当官B（仮）',        addDelete: false },
} : {};
export function resolveStaff(req) {
  const no = String(req.headers['x-admin-staff'] || req.body?.staff || '').trim();
  return STAFF[no] ? { no, ...STAFF[no] } : null;
}
/** 表示用の操作者ID（displayId 優先。氏名は通常画面に出さない）。 */
export function whoOf(account) {
  return (account && account.displayId) || '';
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
