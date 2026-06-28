// GET /api/weather?latitude=..&longitude=..&date=YYYY-MM-DD
// イベント詳細画面から遅延取得する天気予報。Open-Meteo を使用。
//
// ロジックの本体は shared/weather.cjs に集約（純粋関数＋redis/fetch注入のorchestration）。
// このハンドラは I/O 配線（リクエスト解釈・redis/fetch 注入・レスポンスヘッダ）だけを行う。
//
// キャッシュ二段（+stale フォールバック）:
//   weather:{lat3}:{lon3}:{date}              … 通常キャッシュ（開催日数でTTL: 1h/6h/12h）
//   weather:last-success:{lat3}:{lon3}:{date} … 最終正常データ（72h）。Open-Meteo障害時に stale:true で返す
//   + CDN: Cache-Control s-maxage。日付境界は Asia/Tokyo 基準（shared/weather.cjs）。
import { redis } from './_security.js';
import W from '../shared/weather.cjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const date = String(req.query.date || '');
  const today = W.jstTodayStr();

  // 入力検証（数値・日本範囲・実在日付・0〜16日）
  const v = W.validateRequest({ latitude, longitude, date, today });
  if (!v.ok) return res.status(v.status).json({ error: v.error });

  const result = await W.getWeather({ latitude, longitude, date, today, redis, fetchImpl: fetch });

  // CDN キャッシュ: 正常/redis ヒットは通常TTL、stale は短め、エラーはキャッシュしない
  if (result.status === 200 && result.ttl) {
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${result.ttl}, stale-while-revalidate=86400`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.setHeader('X-Cache', result.cache);
  return res.status(result.status).json(result.body);
}
