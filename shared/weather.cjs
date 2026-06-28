// 天気API・ジオコーディングの共通ロジック（スクレイパー / Vercel Function / フロント / テストで共有）
//
// ここには「副作用のない純粋関数」と、Redis/fetch を注入して使う orchestration を置く。
// I/O（実 Redis・実 fetch・fs キャッシュ）は呼び出し側（api/weather.js, scraper/lib/geocode.js）が渡す。
// これにより node --test（shared/*.test.cjs）で全ロジックを検証できる。
'use strict';

// ── 日付（Asia/Tokyo 基準） ──────────────────────────────────────
// サーバーの UTC/実行環境 TZ に依存せず、常に JST で日付境界を判定する。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** JST の今日を "YYYY-MM-DD" で返す（UTC epoch + 9h で算出。環境TZに非依存）。 */
function jstTodayStr(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 形式 + 実在日チェック（2026-02-30 のような存在しない日付を弾く）。 */
function isRealDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // UTC で構築し、各成分が一致するか（繰り上がりが起きないか）で実在を判定
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** date と today（ともに "YYYY-MM-DD"）の日数差（date - today）。日付のみで計算しTZ非依存。 */
function daysAhead(dateStr, todayStr) {
  if (!isRealDate(dateStr) || !isRealDate(todayStr)) return NaN;
  const a = Date.parse(todayStr + 'T00:00:00Z');
  const b = Date.parse(dateStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** ISO 8601（+09:00）で現在時刻を返す。 */
function isoJst(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
}

// ── 予報範囲・TTL ───────────────────────────────────────────────
// API として受け付ける上限（今日から 0〜16日）。仕様準拠。
// ※ Open-Meteo の実地平は「今日＋15日」までのため、ちょうど +16日 の日は
//    Open-Meteo 側に該当データが無く forecast_not_available になり得る（CLAUDE.md 参照）。
const FORECAST_MAX_DAYS = 16;
// 最終正常データ（stale フォールバック用）の保持期間。通常TTLより長くする。
const LAST_SUCCESS_TTL = 72 * 3600;

/** 開催までの日数に応じた通常キャッシュTTL（秒）。Redis / CDN 共通。 */
function ttlForDaysAhead(d) {
  if (d <= 2) return 3600;      // 0〜2日前: 1時間
  if (d <= 7) return 6 * 3600;  // 3〜7日前: 6時間
  return 12 * 3600;            // 8〜16日前: 12時間
}

// ── 座標の正規化・キャッシュキー ────────────────────────────────
// 緯度経度は小数3桁（約100m）に丸めて天気キャッシュキーにする。近隣会場の予報は
// ほぼ同一になるため、API負荷削減を優先して意図的に3桁で共有する（CLAUDE.md 参照）。
// より高精度が必要なら4桁へ。-0 や浮動小数点表記の揺れを避けるため共通関数で丸める。
/** 小数3桁の文字列（"-0.000" を "0.000" に正規化）。キャッシュキー用。 */
function coord3str(n) {
  let s = Number(n).toFixed(3);
  if (s === '-0.000') s = '0.000';
  return s;
}
/** 小数3桁の数値（-0 を 0 に）。保存ペイロード用。 */
function roundCoord3(n) {
  const r = Number(Number(n).toFixed(3));
  return Object.is(r, -0) ? 0 : r;
}
/** 天気キャッシュキー。 */
function weatherCacheKey(lat, lon, date) {
  return `weather:${coord3str(lat)}:${coord3str(lon)}:${date}`;
}
/** 最終正常データ（stale フォールバック）のキー。 */
function lastSuccessKey(lat, lon, date) {
  return `weather:last-success:${coord3str(lat)}:${coord3str(lon)}:${date}`;
}

// ── ジオコーディング用テキスト正規化・キャッシュキー ────────────
/** 共通テキスト正規化: Unicode NFKC・全半角空白統一・改行/連続空白圧縮・トリム。 */
function normalizeText(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFKC')
    .replace(/[　\s]+/g, ' ') // 全角空白・改行・連続空白 → 半角空白1つ
    .trim();
}
/** 住所正規化: 上記に加え「〒123-4567」等の郵便番号表記を除去。 */
function normalizeAddress(s) {
  if (s == null) return '';
  return normalizeText(
    String(s).replace(/〒?\s*\d{3}[-－―ー]?\d{4}/g, ' ')
  );
}
/**
 * ジオコーディング結果キャッシュキー。会場名だけだと同名会場・住所変更で
 * 誤座標を再利用するため、pref + 正規化住所 + 正規化会場名から生成する。
 * 住所/会場名が変われば別キーになり、古いキャッシュを使わず再取得される。
 */
function geocodeCacheKey(pref, address, venue) {
  return `${pref || ''}|${normalizeAddress(address)}|${normalizeText(venue)}`;
}

// ── Open-Meteo ─────────────────────────────────────────────────
const OPEN_METEO_DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'wind_speed_10m_max',
];
/** Open-Meteo 予報URLを組み立てる（timezone=Asia/Tokyo, 16日）。 */
function buildOpenMeteoUrl(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', coord3str(lat));
  u.searchParams.set('longitude', coord3str(lon));
  u.searchParams.set('daily', OPEN_METEO_DAILY.join(','));
  u.searchParams.set('timezone', 'Asia/Tokyo');
  u.searchParams.set('forecast_days', '16');
  return u.toString();
}

/** 数値なら数値、null/undefined は null、その他も null に正規化。 */
function numOrNull(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * Open-Meteo 応答から対象日のデータを取り出して検証する。
 * - daily.time に date が存在するか
 * - 同一インデックスの各値（数値 or 許容 null）
 * 戻り値: { ok:true, value } | { ok:false, reason:'invalid_response'|'forecast_not_available' }
 */
function extractForecast(json, date) {
  const daily = json && json.daily;
  const times = daily && Array.isArray(daily.time) ? daily.time : null;
  if (!times) return { ok: false, reason: 'invalid_response' };
  const idx = times.indexOf(date);
  if (idx < 0) return { ok: false, reason: 'forecast_not_available' };
  const at = (arr) => (Array.isArray(arr) ? numOrNull(arr[idx]) : null);
  const code = at(daily.weather_code);
  const tMax = at(daily.temperature_2m_max);
  const tMin = at(daily.temperature_2m_min);
  // 主要値（天気・気温）が全て欠落していれば実質データ無しとして扱う
  if (code === null && tMax === null && tMin === null) {
    return { ok: false, reason: 'forecast_not_available' };
  }
  const units = (json.daily_units) || {};
  return {
    ok: true,
    value: {
      weatherCode: code,
      temperatureMax: tMax,
      temperatureMin: tMin,
      precipitationProbabilityMax: at(daily.precipitation_probability_max),
      windSpeedMax: at(daily.wind_speed_10m_max),
      units: {
        temperature: units.temperature_2m_max || '°C',
        precipitationProbability: units.precipitation_probability_max || '%',
        windSpeed: units.wind_speed_10m_max || 'km/h',
      },
    },
  };
}

// ── 入力検証（API） ─────────────────────────────────────────────
// 日本のおおよその範囲（与那国〜北海道）。南鳥島等の遠隔離島は対象外。
const JP_BOUNDS = { latMin: 20, latMax: 46.5, lonMin: 122, lonMax: 154 };

/**
 * /api/weather のリクエスト検証（純粋）。
 * 戻り値: { ok:true, daysAhead } | { ok:false, status, error }
 */
function validateRequest({ latitude, longitude, date, today }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, status: 400, error: 'latitude/longitude must be numbers' };
  }
  if (
    latitude < JP_BOUNDS.latMin || latitude > JP_BOUNDS.latMax ||
    longitude < JP_BOUNDS.lonMin || longitude > JP_BOUNDS.lonMax
  ) {
    return { ok: false, status: 400, error: 'coordinates out of range' };
  }
  if (!isRealDate(date)) {
    return { ok: false, status: 400, error: 'invalid date' };
  }
  const da = daysAhead(date, today);
  if (da < 0) return { ok: false, status: 400, error: 'date is in the past' };
  if (da > FORECAST_MAX_DAYS) return { ok: false, status: 422, error: 'forecast_not_yet_available' };
  return { ok: true, daysAhead: da };
}

// ── 天気取得 orchestration（redis/fetch を注入） ────────────────
/**
 * 天気予報を取得する。検証は呼び出し側で済ませる前提（daysAhead は再計算）。
 * 1) Redis 通常キャッシュ → 2) Open-Meteo → 成功時に通常+最終正常を保存
 * 3) Open-Meteo 失敗時は最終正常データ（stale:true）→ 4) それも無ければエラー
 * @returns {Promise<{status, body, ttl?, cache}>}
 */
async function getWeather({ latitude, longitude, date, today, redis, fetchImpl, now = Date.now() }) {
  const da = daysAhead(date, today);
  const lat = roundCoord3(latitude);
  const lon = roundCoord3(longitude);
  const key = weatherCacheKey(lat, lon, date);
  const lastKey = lastSuccessKey(lat, lon, date);
  const ttl = ttlForDaysAhead(da);

  // 1) 通常キャッシュ
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit) {
        const data = typeof hit === 'string' ? JSON.parse(hit) : hit;
        return { status: 200, body: data, ttl, cache: 'redis' };
      }
    } catch { /* Redis 障害は無視して取得へ */ }
  }

  // 2) Open-Meteo
  let payload = null;
  try {
    const r = await fetchImpl(buildOpenMeteoUrl(lat, lon));
    if (!r || !r.ok) throw new Error('open-meteo http error');
    const j = await r.json();
    const ex = extractForecast(j, date);
    if (ex.ok) {
      payload = {
        latitude: lat, longitude: lon, date, daysAhead: da,
        ...ex.value,
        source: 'Open-Meteo',
        fetchedAt: isoJst(now),
        stale: false,
      };
    } else if (ex.reason === 'forecast_not_available') {
      // 200 だが対象日が応答に無い（実地平外など）。stale でも持っていないため確定エラー。
      return { status: 422, body: { error: 'forecast_not_available' }, cache: 'none' };
    } else {
      throw new Error('invalid open-meteo response'); // 不正応答 → stale フォールバックへ
    }
  } catch {
    // 3) stale フォールバック
    if (redis) {
      try {
        const last = await redis.get(lastKey);
        if (last) {
          const data = typeof last === 'string' ? JSON.parse(last) : last;
          return { status: 200, body: { ...data, stale: true }, ttl: Math.min(ttl, 3600), cache: 'stale' };
        }
      } catch { /* ignore */ }
    }
    // 4) どこにも無い
    return { status: 502, body: { error: 'forecast_unavailable' }, cache: 'none' };
  }

  // 取得成功 → 通常 + 最終正常を保存
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(payload), { ex: ttl });
      await redis.set(lastKey, JSON.stringify(payload), { ex: LAST_SUCCESS_TTL });
    } catch { /* 保存失敗でも応答は返す */ }
  }
  return { status: 200, body: payload, ttl, cache: 'miss' };
}

// ── 天気カードの表示判定（フロント・テスト共有） ────────────────
/**
 * イベントから天気カードの表示モードを決める（純粋）。
 * status:
 *   'ended'              … 終了済み（カード非表示）
 *   'no-coords'          … 座標なし
 *   'prefecture-blocked' … 都道府県代表座標のみ（既定で天気非表示）
 *   'too-far'            … 17日以上先
 *   'forecast'           … 予報取得（shouldFetch:true）
 * @param {object} event
 * @param {string} today  JST "YYYY-MM-DD"
 * @param {object} [opts] { allowPrefecture?: boolean } 将来の設定用
 */
function decideWeatherDisplay(event, today, opts = {}) {
  const loc = event && event.weatherLocation;
  const hasCoords = !!(loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number');
  const end = event && (event.endDate || event.date);
  const isEnded = !!(event && event.ended) || (end && today && end < today);
  if (isEnded) return { status: 'ended' };
  if (!hasCoords) return { status: 'no-coords' };

  const accuracy = loc.accuracy || 'unknown';
  const da = event && event.date ? daysAhead(event.date, today) : NaN;
  if (!Number.isFinite(da) || da < 0) return { status: 'ended' }; // 不正/過去はカード非表示

  if (accuracy === 'prefecture' && !opts.allowPrefecture) {
    return { status: 'prefecture-blocked', accuracy };
  }
  if (da > FORECAST_MAX_DAYS) return { status: 'too-far', accuracy, daysAhead: da };

  return {
    status: 'forecast',
    accuracy,
    daysAhead: da,
    isMunicipality: accuracy === 'municipality',
    isDistanceReference: da >= 8,
    shouldFetch: true,
  };
}

module.exports = {
  // 日付
  jstTodayStr, isRealDate, daysAhead, isoJst,
  // 範囲/TTL
  FORECAST_MAX_DAYS, LAST_SUCCESS_TTL, ttlForDaysAhead,
  // 座標/キー
  coord3str, roundCoord3, weatherCacheKey, lastSuccessKey,
  // ジオコーディング正規化
  normalizeText, normalizeAddress, geocodeCacheKey,
  // Open-Meteo
  buildOpenMeteoUrl, extractForecast, OPEN_METEO_DAILY,
  // API
  JP_BOUNDS, validateRequest, getWeather,
  // フロント
  decideWeatherDisplay,
};
