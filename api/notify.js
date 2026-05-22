// POST /api/notify
// Body: { secret: string, title: string, body: string, url?: string }
// NOTIFY_SECRET 環境変数と一致した場合のみ全購読者にプッシュ通知を送信する
import webpush from 'web-push';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const KEY   = 'push:subscriptions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 認証チェック ──────────────────────────────────────────
  const secret = req.headers['x-notify-secret'] || req.body?.secret;
  if (!secret || secret !== process.env.NOTIFY_SECRET) {
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
  const entries = Object.values(allSubs);

  // ── 並列送信（410 Gone → 自動削除） ──────────────────────
  let sent = 0, failed = 0;
  const staleEndpoints = [];

  await Promise.allSettled(
    entries.map(async raw => {
      const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;
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

  // 期限切れ購読者を Redis から削除
  if (staleEndpoints.length > 0) {
    await redis.hdel(KEY, ...staleEndpoints).catch(() => {});
  }

  return res.status(200).json({ sent, failed, removed: staleEndpoints.length });
}
