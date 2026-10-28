// POST /api/notify
// Body: { secret: string, title: string, body: string, url?: string }
// NOTIFY_SECRET 環境変数と一致した場合のみ全購読者にプッシュ通知を送信する
import webpush from 'web-push';
import { timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { rateLimit } from './_security.js';
import { usableSubscription, clearWatchList } from './_push.js';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const KEY   = 'push:subscriptions';

/** タイミング攻撃に耐性のあるシークレット比較 */
function secretMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 認証チェック（総当たり抑止のレートリミット付き） ──────────
  if (!await rateLimit(req, res, 'notify', 10, 600)) return; // 10回/10分/IP
  const secret = req.headers['x-notify-secret'] || req.body?.secret;
  if (!secretMatches(secret, process.env.NOTIFY_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, body, url = '/' } = req.body ?? {};
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

  // ── VAPID 設定 ────────────────────────────────────────────
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) {
    return res.status(500).json({ error: 'VAPID env vars not configured' });
  }
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // ── 全購読者取得 ──────────────────────────────────────────
  let allSubs;
  try {
    allSubs = await redis.hgetall(KEY);
  } catch (err) {
    console.error('[notify] redis error', err);
    return res.status(500).json({ error: 'Failed to retrieve subscriptions' });
  }

  if (!allSubs || Object.keys(allSubs).length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, message: 'No subscribers' });
  }

  const payload = JSON.stringify({ title, body, url, icon: '/icons/icon-192.png' });

  // ── 送信に使えない購読（不正な endpoint・鍵の欠落・壊れた JSON）は送らずに削除 ──
  // ハッシュのフィールド名（保存時の endpoint）で消す。値が壊れていても確実に消せるように
  const invalidFields = [];
  const subs = [];
  for (const [field, raw] of Object.entries(allSubs)) {
    const sub = usableSubscription(raw);
    if (sub) subs.push(sub);
    else invalidFields.push(field);
  }

  // ── 並列送信（410 Gone → 自動削除） ──────────────────────
  let sent = 0, failed = 0;
  const staleEndpoints = [];

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error('[notify] sendNotification error', err.statusCode, sub.endpoint);
        }
        failed++;
      }
    })
  );

  // 期限切れ・不正な購読を Redis から削除（お気に入りの見守り登録も外す）
  const removeList = [...staleEndpoints, ...invalidFields];
  if (removeList.length > 0) {
    await redis.hdel(KEY, ...removeList).catch(() => {});
    await Promise.allSettled(removeList.map(ep => clearWatchList(ep)));
  }
  if (invalidFields.length > 0) {
    console.warn(`[notify] 送信に使えない購読を ${invalidFields.length} 件削除しました`);
  }

  return res.status(200).json({ sent, failed, removed: staleEndpoints.length, invalid: invalidFields.length });
}
