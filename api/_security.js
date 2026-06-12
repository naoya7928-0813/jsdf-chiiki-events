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
