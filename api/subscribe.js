// POST /api/subscribe  – { subscription: PushSubscription }  → 購読登録
// DELETE /api/subscribe – { endpoint: string }               → 購読解除
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const KEY   = 'push:subscriptions';   // Redis Hash  field=endpoint, value=JSON

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── 購読登録 ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { subscription } = req.body ?? {};
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'subscription.endpoint is required' });
    }
    try {
      await redis.hset(KEY, { [subscription.endpoint]: JSON.stringify(subscription) });
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
