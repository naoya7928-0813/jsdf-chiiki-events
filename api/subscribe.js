// POST /api/subscribe  – { subscription: PushSubscription }  → 購読登録
// DELETE /api/subscribe – { endpoint: string }               → 購読解除
//
// セキュリティ:
// - オリジン検証（自サイト以外のブラウザからの操作を拒否。CORS「*」は廃止）
// - endpoint は正規のプッシュサービスURLのみ許可（Redisへの任意データ注入防止）
// - IPごとのレートリミット（購読の大量登録・総当たり解除の抑止）
import { Redis } from '@upstash/redis';
import { checkOrigin, isValidPushEndpoint, rateLimit } from './_security.js';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const KEY = 'push:subscriptions';   // Redis Hash  field=endpoint, value=JSON

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!await rateLimit(req, res, 'subscribe', 20, 600)) return; // 20回/10分/IP

  // ── 購読登録 ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { subscription } = req.body ?? {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'subscription.endpoint is required' });
    }
    if (!isValidPushEndpoint(subscription.endpoint)) {
      return res.status(400).json({ error: 'invalid push endpoint' });
    }
    // 保存対象は必要フィールドのみ・サイズ上限あり（任意データの持ち込み防止）
    const clean = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: String(subscription.keys?.p256dh || '').slice(0, 256),
        auth:   String(subscription.keys?.auth   || '').slice(0, 64),
      },
    };
    if (!clean.keys.p256dh || !clean.keys.auth) {
      return res.status(400).json({ error: 'subscription.keys is required' });
    }
    try {
      await redis.hset(KEY, { [clean.endpoint]: JSON.stringify(clean) });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[subscribe] POST error', err);
      return res.status(500).json({ error: 'Failed to save subscription' });
    }
  }

  // ── 購読解除 ─────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    if (!isValidPushEndpoint(endpoint)) {
      return res.status(400).json({ error: 'invalid push endpoint' });
    }
    try {
      await redis.hdel(KEY, endpoint);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[subscribe] DELETE error', err);
      return res.status(500).json({ error: 'Failed to remove subscription' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
