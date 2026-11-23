// GET /api/subscribe    – VAPID 公開鍵を返す（{ publicKey }）
// POST /api/subscribe  – { subscription: PushSubscription, filter?: {regions, categories} } → 購読登録（同じ endpoint は上書き＝絞り込みの変更にも使う）
// DELETE /api/subscribe – { endpoint: string }               → 購読解除
//
// セキュリティ:
// - オリジン検証（自サイト以外のブラウザからの操作を拒否。CORS「*」は廃止）
// - endpoint は正規のプッシュサービスURLのみ許可（Redisへの任意データ注入防止）
// - IPごとのレートリミット（購読の大量登録・総当たり解除の抑止）
import { Redis } from '@upstash/redis';
import { checkOrigin, isValidPushEndpoint, rateLimit } from './_security.js';
import { clearWatchList } from './_push.js';
import { normalizePushFilter } from '../shared/pushFilter.cjs';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const KEY = 'push:subscriptions';   // Redis Hash  field=endpoint, value=JSON

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── VAPID 公開鍵の取得（購読前にフロントが取得する。旧 /api/vapid-public-key を統合） ──
  if (req.method === 'GET') {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ publicKey: key });
  }

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
      // 数値（ミリ秒）か null だけを保存する（任意のオブジェクトを押し込ませない）
      expirationTime: typeof subscription.expirationTime === 'number' && Number.isFinite(subscription.expirationTime)
        ? subscription.expirationTime : null,
      keys: {
        p256dh: String(subscription.keys?.p256dh || '').slice(0, 256),
        auth:   String(subscription.keys?.auth   || '').slice(0, 64),
      },
    };
    // 新着通知の地域・種目の絞り込み（既知の値だけ。空＝すべて。shared/pushFilter.cjs）
    //   filter を送ってきた → その値で上書き（空なら絞り込みなし）
    //   送ってこない（Service Worker の購読更新など） → 同じ／以前の endpoint に保存済みの絞り込みを引き継ぐ
    let filter = null;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'filter')) {
      filter = normalizePushFilter(req.body.filter);
    } else {
      const oldEp = typeof req.body?.oldEndpoint === 'string' && isValidPushEndpoint(req.body.oldEndpoint) ? req.body.oldEndpoint : null;
      try {
        for (const ep of [subscription.endpoint, oldEp].filter(Boolean)) {
          const raw = await redis.hget(KEY, ep);
          const prev = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (prev && prev.filter) { filter = normalizePushFilter(prev.filter); break; }
        }
        if (oldEp && oldEp !== subscription.endpoint) await redis.hdel(KEY, oldEp);
      } catch { /* 引き継げなければ絞り込みなし（全件届く＝取りこぼさない側） */ }
    }
    if (filter) clean.filter = filter;
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
      // お気に入りの見守り（/api/watch）も一緒に外す。通知を止めた端末の情報を残さない
      await clearWatchList(endpoint).catch(() => {});
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[subscribe] DELETE error', err);
      return res.status(500).json({ error: 'Failed to remove subscription' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
