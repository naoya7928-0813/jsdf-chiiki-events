// POST   /api/watch  { endpoint, eventIds: string[] } → お気に入りイベントの見守り一覧を差し替える
// DELETE /api/watch  { endpoint }                     → 見守りをすべて外す
//
// 「お気に入りの変更・中止を通知」を利用者がオンにしたときだけ呼ばれる（既定はオフ）。
// 保存するのは push の宛先とイベントIDだけ（氏名・位置・閲覧履歴は保存しない）。詳細は api/_push.js。
//
// セキュリティ:
// - オリジン検証・IPレートリミット（/api/subscribe と同じ方針）
// - endpoint は正規のプッシュサービスURLのみ、かつ購読登録済みのものだけ受け付ける
//   （任意の文字列を宛先として溜め込ませない）
// - eventIds は形式検証し、最大 100 件
import { checkOrigin, isValidPushEndpoint, rateLimit, redis } from './_security.js';
import { SUBS_KEY, MAX_WATCH_IDS, replaceWatchList, clearWatchList } from './_push.js';
import { EVENT_ID_RE } from './_eventScope.js';

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'watch', 30, 600)) return; // 30回/10分/IP

  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint || !isValidPushEndpoint(endpoint)) return res.status(400).json({ error: 'invalid push endpoint' });

  try {
    if (req.method === 'DELETE') {
      const n = await clearWatchList(endpoint);
      return res.status(200).json({ ok: true, removed: n });
    }

    const raw = req.body?.eventIds;
    if (!Array.isArray(raw)) return res.status(400).json({ error: 'eventIds must be an array' });
    if (raw.length > MAX_WATCH_IDS) return res.status(400).json({ error: `eventIds は ${MAX_WATCH_IDS} 件までです` });
    const ids = [...new Set(raw.map(v => String(v || '').trim()))].filter(Boolean);
    if (ids.some(id => !EVENT_ID_RE.test(id))) return res.status(400).json({ error: 'invalid event id' });

    // 購読登録済みの宛先だけ（通知を受け取れない宛先の見守りは意味がない）
    const sub = await redis.hget(SUBS_KEY, endpoint);
    if (!sub) return res.status(404).json({ error: '通知が登録されていません' });

    const r = await replaceWatchList(endpoint, ids);
    return res.status(200).json({ ok: true, ...r });
  } catch (err) {
    console.error('[watch] error', err);
    return res.status(500).json({ error: 'failed' });
  }
}
