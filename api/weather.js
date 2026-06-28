// GET /api/weather?latitude=..&longitude=..&date=YYYY-MM-DD
// イベント詳細画面から遅延取得する天気予報。Open-Meteo を使用。
//
// 設計方針:
// - 検証: 緯度経度が数値・日本国内のおおよその範囲・date が YYYY-MM-DD・今日(JST)から0〜16日以内。
// - キャッシュ二段:
//   1) Upstash Redis  weather:{lat3}:{lon3}:{date}（開催までの日数で TTL を変える）
//   2) Vercel CDN     Cache-Control s-maxage（同上の秒数）
//   → 同一地点・同一日付の API 呼び出しを大幅に削減する。
// - APIキー等の秘密情報は使わない（Open-Meteo はキー不要）。
import { redis } from './_security.js';

// 日本のおおよその範囲（与那国〜北海道、南鳥島は除外）
const JP_BOUNDS = { latMin: 20, latMax: 46.5, lonMin: 122, lonMax: 154 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** JST 今日 "YYYY-MM-DD" */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 2つの "YYYY-MM-DD" の日数差（b - a）。UTC 基準で計算。 */
function daysBetween(a, b) {
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
}

/** 開催までの日数に応じた TTL 秒（Redis / CDN 共通） */
function ttlForDaysAhead(d) {
  if (d <= 2) return 3600;        // 0〜2日前: 1時間
  if (d <= 7) return 6 * 3600;    // 3〜7日前: 6時間
  return 12 * 3600;              // 8〜16日前: 12時間
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const date = String(req.query.date || '');

  // ── 入力検証 ───────────────────────────────────────────────
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'latitude/longitude must be numbers' });
  }
  if (
    latitude < JP_BOUNDS.latMin || latitude > JP_BOUNDS.latMax ||
    longitude < JP_BOUNDS.lonMin || longitude > JP_BOUNDS.lonMax
  ) {
    return res.status(400).json({ error: 'coordinates out of range' });
  }
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const today = jstToday();
  const daysAhead = daysBetween(today, date);
  if (daysAhead < 0) {
    return res.status(400).json({ error: 'date is in the past' });
  }
  if (daysAhead > 16) {
    // 17日以上先は予報を取得しない（フロントでも事前に弾くが二重防御）
    return res.status(422).json({ error: 'forecast not yet available', daysAhead });
  }

  const lat3 = latitude.toFixed(3);
  const lon3 = longitude.toFixed(3);
  const cacheKey = `weather:${lat3}:${lon3}:${date}`;
  const ttl = ttlForDaysAhead(daysAhead);

  // ── Redis キャッシュ ───────────────────────────────────────
  try {
    const hit = await redis.get(cacheKey);
    if (hit) {
      const data = typeof hit === 'string' ? JSON.parse(hit) : hit;
      res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=86400`);
      res.setHeader('X-Cache', 'redis');
      return res.status(200).json(data);
    }
  } catch { /* Redis 障害時は無視して Open-Meteo へ */ }

  // ── Open-Meteo から取得 ────────────────────────────────────
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat3);
    url.searchParams.set('longitude', lon3);
    url.searchParams.set('daily', [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'wind_speed_10m_max',
    ].join(','));
    url.searchParams.set('timezone', 'Asia/Tokyo');
    url.searchParams.set('forecast_days', '16');

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`);
    const j = await r.json();
    const daily = j && j.daily;
    const times = daily && Array.isArray(daily.time) ? daily.time : [];
    const idx = times.indexOf(date);
    if (idx < 0) {
      return res.status(422).json({ error: 'forecast not available for date' });
    }

    const num = (arr) => (Array.isArray(arr) && typeof arr[idx] === 'number' ? arr[idx] : null);
    const payload = {
      latitude: Number(lat3),
      longitude: Number(lon3),
      date,
      daysAhead,
      weatherCode: num(daily.weather_code),
      temperatureMax: num(daily.temperature_2m_max),
      temperatureMin: num(daily.temperature_2m_min),
      precipitationProbabilityMax: num(daily.precipitation_probability_max),
      windSpeedMax: num(daily.wind_speed_10m_max),
      units: {
        temperature: (j.daily_units && j.daily_units.temperature_2m_max) || '°C',
        precipitationProbability: (j.daily_units && j.daily_units.precipitation_probability_max) || '%',
        windSpeed: (j.daily_units && j.daily_units.wind_speed_10m_max) || 'km/h',
      },
      source: 'Open-Meteo',
      fetchedAt: new Date().toISOString(),
    };

    // Redis に保存（TTL 付き）。失敗しても応答は返す。
    try { await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl }); } catch { /* ignore */ }

    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=86400`);
    res.setHeader('X-Cache', 'miss');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[weather] fetch error', err);
    return res.status(502).json({ error: 'failed to fetch weather' });
  }
}
