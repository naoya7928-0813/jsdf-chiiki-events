// POST /api/transit { from: {lat,lon}|{query}, to: {lat,lon}|{query}, date?, time? }
//   → { available: true, routes: [...] } | { available: false, reason }
//
// 公共交通の経路APIを接続するための差し替え口（調査結果: docs/TRANSIT_API_2026-10.md）。
// 国内の鉄道・バス経路APIは有料のため、運営の承認が出るまで接続しない（既定は not_configured）。
// 接続するときは PROVIDERS にアダプタを足し、環境変数 TRANSIT_PROVIDER とキーを Vercel に設定する。
//   - キーはサーバー側だけで使い、応答に含めない
//   - 応答は shared/transit.cjs の sanitizeRoutes で正規化し、API に無い値（運賃・所要時間）は作らない
//   - 月間上限 TRANSIT_MONTHLY_LIMIT（既定 0 = 呼ばない）・タイムアウト 8 秒・IPごとのレート制限
// 利用者の位置は経路の検索にだけ使い、保存しない（ログにも出さない）。
import { checkOrigin, rateLimit, redis } from './_security.js';
import T from '../shared/transit.cjs';

const TIMEOUT_MS = 8000;

// 経路APIのアダプタ: async ({from, to, date, time, signal}) => 生の応答を sanitizeRoutes が読める形に変換して返す
// 承認・契約後に追加する（例: ekispert / navitime）。未定義のプロバイダ名は not_configured として扱う。
const PROVIDERS = {};

function parsePoint(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat), lon = Number(p.lon);
  if (p.lat !== undefined || p.lon !== undefined) return T.inJapan(lat, lon) ? { lat, lon } : null;
  const q = String(p.query || '').trim().slice(0, 80);
  return q ? { query: q } : null;
}

function monthKey() {
  return `transit:calls:${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!checkOrigin(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const from = parsePoint(req.body?.from);
  const to = parsePoint(req.body?.to);
  if (!from || !to) return res.status(400).json({ error: '出発地と目的地を指定してください' });

  const name = String(process.env.TRANSIT_PROVIDER || '').trim();
  const provider = PROVIDERS[name];
  if (!provider) return res.status(200).json({ available: false, reason: 'not_configured' });

  if (!await rateLimit(req, res, 'transit', 20, 600)) return;

  // 月間上限（有料APIの使いすぎ防止）。上限に達したら呼ばずに代替案内へ
  const limit = Number.parseInt(process.env.TRANSIT_MONTHLY_LIMIT || '0', 10);
  if (!Number.isFinite(limit) || limit <= 0) return res.status(200).json({ available: false, reason: 'not_configured' });
  try {
    const used = await redis.incr(monthKey());
    if (used === 1) await redis.expire(monthKey(), 40 * 86400);
    if (used > limit) return res.status(200).json({ available: false, reason: 'quota' });
  } catch {
    // 上限を数えられないときは呼ばない（課金の暴走を防ぐ方を優先）
    return res.status(200).json({ available: false, reason: 'unavailable' });
  }

  try {
    const raw = await provider({
      from, to,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || '')) ? req.body.date : undefined,
      time: /^\d{1,2}:\d{2}$/.test(String(req.body?.time || '')) ? req.body.time : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const routes = T.sanitizeRoutes(raw);
    if (!routes.length) return res.status(200).json({ available: false, reason: 'no_route' });
    return res.status(200).json({ available: true, provider: name, routes });
  } catch (err) {
    const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('[transit]', name, timeout ? 'timeout' : (err && err.message));
    return res.status(200).json({ available: false, reason: timeout ? 'timeout' : 'unavailable' });
  }
}

// テスト用: アダプタを差し込む
export function __setProviderForTest(name, fn) { if (fn) PROVIDERS[name] = fn; else delete PROVIDERS[name]; }
