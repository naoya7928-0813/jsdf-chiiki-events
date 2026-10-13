// POST /api/view  { id }  – イベント詳細が開かれたことを1回数える（公開・認証不要）。
//
// 数え方・重複防止の考え方は shared/viewStats.cjs を参照。ここでは:
//   - 自サイトの画面からの送信だけを受け付ける（Origin 必須・Sec-Fetch-Site は same-origin のみ）
//   - ボットの User-Agent・存在しないイベントID・下書きは数えない
//   - 同じ通信元・同じイベントは 30 分に1回まで（IP は保存せず、ハッシュを 30 分だけ置く）
//   - 通信元ごとのレート制限（60回/10分）
// 数えなかった場合も 202 を返す（理由を返して試行錯誤させない）。統計値はここからは一切返さない。
import { createHash } from 'node:crypto';
import { checkOrigin, rateLimit, clientIp, redis } from './_security.js';
import { loadEventsMap, isManualId, MANUAL_KEY } from './_eventScope.js';
import V from '../shared/viewStats.cjs';

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/** 実在し、公開されているイベントか（任意のIDで集計キーを増やさせない） */
async function isPublicEvent(req, id) {
  if (isManualId(id)) {
    const raw = await redis.hget(MANUAL_KEY, id);
    if (!raw) return false;
    const ev = parse(raw);
    return ev && ev.status !== 'draft';
  }
  const map = await loadEventsMap(req);
  return map.has(id);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!checkOrigin(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const notCounted = () => res.status(202).json({ ok: true });
  // 自サイトの画面からの送信のみ（ページを読むだけのクローラー・他サイトからの水増しを除く）
  const site = req.headers['sec-fetch-site'];
  if (!req.headers.origin || (site && site !== 'same-origin')) return notCounted();
  if (V.isBotUserAgent(req.headers['user-agent'])) return notCounted();

  const id = String(req.body?.id || '').trim();
  if (!V.isCountableId(id)) return res.status(400).json({ error: 'invalid id' });

  if (!await rateLimit(req, res, 'view', 60, 600)) return;

  try {
    if (!await isPublicEvent(req, id)) return notCounted();

    // 同じ通信元・同じイベントの重複（再試行・別タブ・連打）を防ぐ。IP そのものは保存しない
    const fp = createHash('sha256')
      .update(`${process.env.VIEW_HASH_SALT || process.env.KV_REST_API_TOKEN || ''}|${clientIp(req)}|${req.headers['user-agent'] || ''}|${id}`)
      .digest('hex').slice(0, 32);
    const first = await redis.set(`views:seen:${fp}`, '1', { nx: true, ex: V.DEDUP_SEC });
    if (!first) return notCounted();

    const day = V.jstDay();
    await redis.hincrby(V.dayKey(day), id, 1);
    await redis.expire(V.dayKey(day), V.DAY_TTL_SEC);
    await redis.hincrby(V.TOTAL_KEY, id, 1);
    return res.status(202).json({ ok: true });
  } catch (err) {
    console.error('[view]', err && err.message);
    return notCounted();   // 計測の失敗で画面を妨げない
  }
}
