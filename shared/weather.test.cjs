'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const W = require('./weather.cjs');
const geocode = require('../scraper/lib/geocode');

const TODAY = '2026-06-28';
// TODAY からの相対日付文字列
const plus = n => new Date(Date.parse(TODAY + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ── 日付（Asia/Tokyo 基準・実在日チェック） ──────────────────────
test('isRealDate: 形式と実在日を検証する', () => {
  assert.equal(W.isRealDate('2026-07-01'), true);
  assert.equal(W.isRealDate('2026-02-30'), false); // 存在しない日付
  assert.equal(W.isRealDate('2026-13-01'), false);
  assert.equal(W.isRealDate('2026/07/01'), false); // 形式不正
  assert.equal(W.isRealDate('2026-7-1'), false);
  assert.equal(W.isRealDate(''), false);
});

test('daysAhead: 日付差を返す（TZ非依存）', () => {
  assert.equal(W.daysAhead(TODAY, TODAY), 0);
  assert.equal(W.daysAhead(plus(16), TODAY), 16);
  assert.equal(W.daysAhead(plus(-1), TODAY), -1);
});

// ── validateRequest（API入力検証） ──────────────────────────────
const baseReq = { latitude: 35.681, longitude: 139.767, today: TODAY };
test('validateRequest: 正常な緯度経度と日付', () => {
  assert.deepEqual(W.validateRequest({ ...baseReq, date: plus(3) }), { ok: true, daysAhead: 3 });
});
test('validateRequest: 今日 / 16日後は取得可能', () => {
  assert.equal(W.validateRequest({ ...baseReq, date: plus(0) }).ok, true);
  assert.equal(W.validateRequest({ ...baseReq, date: plus(16) }).ok, true);
});
test('validateRequest: 17日後は予報期間外(422)', () => {
  const r = W.validateRequest({ ...baseReq, date: plus(17) });
  assert.equal(r.ok, false); assert.equal(r.status, 422);
});
test('validateRequest: 過去日は拒否(400)', () => {
  const r = W.validateRequest({ ...baseReq, date: plus(-1) });
  assert.equal(r.ok, false); assert.equal(r.status, 400);
});
test('validateRequest: 緯度範囲外', () => {
  assert.equal(W.validateRequest({ latitude: 10, longitude: 139.7, today: TODAY, date: plus(1) }).status, 400);
});
test('validateRequest: 経度範囲外', () => {
  assert.equal(W.validateRequest({ latitude: 35.6, longitude: 100, today: TODAY, date: plus(1) }).status, 400);
});
test('validateRequest: 数値でない緯度経度', () => {
  assert.equal(W.validateRequest({ latitude: NaN, longitude: 139.7, today: TODAY, date: plus(1) }).status, 400);
});
test('validateRequest: 不正形式・存在しない日付', () => {
  assert.equal(W.validateRequest({ ...baseReq, date: '2026/07/01' }).status, 400);
  assert.equal(W.validateRequest({ ...baseReq, date: '2026-02-30' }).status, 400);
});

// ── extractForecast（Open-Meteo応答検証） ───────────────────────
function omJson(date, v = {}) {
  const pick = (k, dflt) => (k in v ? v[k] : dflt); // 明示的な null を尊重する
  return {
    daily: {
      time: [date],
      weather_code: [pick('code', 3)],
      temperature_2m_max: [pick('tmax', 28)],
      temperature_2m_min: [pick('tmin', 21)],
      precipitation_probability_max: [pick('pop', 40)],
      wind_speed_10m_max: [pick('wind', 12)],
    },
    daily_units: { temperature_2m_max: '°C', precipitation_probability_max: '%', wind_speed_10m_max: 'km/h' },
  };
}
test('extractForecast: 正常応答から対象日を取り出す', () => {
  const ex = W.extractForecast(omJson(plus(3)), plus(3));
  assert.equal(ex.ok, true);
  assert.equal(ex.value.weatherCode, 3);
  assert.equal(ex.value.temperatureMax, 28);
});
test('extractForecast: 対象日が存在しない', () => {
  const ex = W.extractForecast(omJson(plus(2)), plus(3));
  assert.deepEqual(ex, { ok: false, reason: 'forecast_not_available' });
});
test('extractForecast: 不正応答', () => {
  assert.equal(W.extractForecast({}, plus(3)).reason, 'invalid_response');
});
test('extractForecast: 降水確率nullは許容、主要値全nullは不可', () => {
  const ok = W.extractForecast(omJson(plus(1), { pop: null }), plus(1));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.precipitationProbabilityMax, null);
  const bad = W.extractForecast(omJson(plus(1), { code: null, tmax: null, tmin: null }), plus(1));
  assert.equal(bad.ok, false);
});

// ── getWeather（orchestration: redis/fetch注入） ────────────────
function fakeRedis(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async set(k, v) { m.set(k, v); } };
}
const okFetch = (date, v) => async () => ({ ok: true, async json() { return omJson(date, v); } });

test('getWeather: 取得成功で通常+最終正常を保存し stale:false', async () => {
  const redis = fakeRedis();
  const r = await W.getWeather({ latitude: 35.681, longitude: 139.767, date: plus(3), today: TODAY, redis, fetchImpl: okFetch(plus(3)) });
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'miss');
  assert.equal(r.body.stale, false);
  assert.equal(r.body.weatherCode, 3);
  // 通常キャッシュと最終正常データの両方が保存される
  assert.ok(redis.m.has(W.weatherCacheKey(35.681, 139.767, plus(3))));
  assert.ok(redis.m.has(W.lastSuccessKey(35.681, 139.767, plus(3))));
});

test('getWeather: Redisヒットを返す', async () => {
  const date = plus(2);
  const key = W.weatherCacheKey(35.681, 139.767, date);
  const cached = { date, weatherCode: 1, stale: false };
  const redis = fakeRedis({ [key]: JSON.stringify(cached) });
  const r = await W.getWeather({ latitude: 35.681, longitude: 139.767, date, today: TODAY, redis, fetchImpl: () => { throw new Error('should not fetch'); } });
  assert.equal(r.cache, 'redis');
  assert.equal(r.body.weatherCode, 1);
});

test('getWeather: 対象日が応答に無ければ 422 forecast_not_available', async () => {
  const redis = fakeRedis();
  const r = await W.getWeather({ latitude: 35.681, longitude: 139.767, date: plus(5), today: TODAY, redis, fetchImpl: okFetch(plus(4)) });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'forecast_not_available');
});

test('getWeather: Open-Meteo障害時に最終正常データを stale:true で返す', async () => {
  const date = plus(3);
  const lastKey = W.lastSuccessKey(35.681, 139.767, date);
  const last = { date, weatherCode: 2, temperatureMax: 25, fetchedAt: '2026-06-27T09:00:00+09:00', stale: false };
  const redis = fakeRedis({ [lastKey]: JSON.stringify(last) });
  const r = await W.getWeather({ latitude: 35.681, longitude: 139.767, date, today: TODAY, redis, fetchImpl: async () => ({ ok: false }) });
  assert.equal(r.status, 200);
  assert.equal(r.cache, 'stale');
  assert.equal(r.body.stale, true);
  assert.equal(r.body.weatherCode, 2);
});

test('getWeather: 障害時に最終正常データも無ければ 502', async () => {
  const redis = fakeRedis();
  const r = await W.getWeather({ latitude: 35.681, longitude: 139.767, date: plus(3), today: TODAY, redis, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'forecast_unavailable');
});

// ── decideWeatherDisplay（WeatherCard表示判定） ─────────────────
const evWith = (accuracy, extra = {}) => ({ date: plus(3), weatherLocation: { latitude: 35.6, longitude: 139.7, accuracy }, ...extra });

test('decideWeatherDisplay: address/venue/manual は通常予報(fetch)', () => {
  for (const a of ['address', 'venue', 'manual']) {
    const d = W.decideWeatherDisplay(evWith(a), TODAY);
    assert.equal(d.status, 'forecast');
    assert.equal(d.shouldFetch, true);
    assert.equal(d.isMunicipality, false);
  }
});
test('decideWeatherDisplay: municipality は参考予報フラグ付きで取得', () => {
  const d = W.decideWeatherDisplay(evWith('municipality'), TODAY);
  assert.equal(d.status, 'forecast');
  assert.equal(d.isMunicipality, true);
});
test('decideWeatherDisplay: prefecture はブロック（API呼ばない）', () => {
  assert.equal(W.decideWeatherDisplay(evWith('prefecture'), TODAY).status, 'prefecture-blocked');
});
test('decideWeatherDisplay: prefecture も allowPrefecture で取得可', () => {
  assert.equal(W.decideWeatherDisplay(evWith('prefecture'), TODAY, { allowPrefecture: true }).status, 'forecast');
});
test('decideWeatherDisplay: 座標なし', () => {
  assert.equal(W.decideWeatherDisplay({ date: plus(3) }, TODAY).status, 'no-coords');
});
test('decideWeatherDisplay: 17日以上先', () => {
  assert.equal(W.decideWeatherDisplay(evWith('address', { date: plus(17) }), TODAY).status, 'too-far');
});
test('decideWeatherDisplay: 終了済み', () => {
  assert.equal(W.decideWeatherDisplay(evWith('address', { date: plus(-2), ended: true }), TODAY).status, 'ended');
  assert.equal(W.decideWeatherDisplay(evWith('address', { date: plus(-2) }), TODAY).status, 'ended');
});
test('decideWeatherDisplay: 8〜16日は参考予報、0〜7日は通常', () => {
  assert.equal(W.decideWeatherDisplay(evWith('address', { date: plus(10) }), TODAY).isDistanceReference, true);
  assert.equal(W.decideWeatherDisplay(evWith('address', { date: plus(5) }), TODAY).isDistanceReference, false);
});

// ── 座標キー正規化（衝突対策） ──────────────────────────────────
test('weatherCacheKey: 小数3桁・-0正規化で安定', () => {
  assert.equal(W.weatherCacheKey(35.6812, 139.7671, '2026-07-01'), 'weather:35.681:139.767:2026-07-01');
  assert.equal(W.coord3str(-0.0001), '0.000'); // -0.000 を 0.000 に
});

// ── ジオコーディング: キャッシュキー・正規化・accuracy・フォールバック ──
test('geocodeCacheKey: 同じ住所/会場は同一キー、変更で別キー', () => {
  const k1 = W.geocodeCacheKey('tokyo', '東京都千代田区1-1', '会館A');
  const k2 = W.geocodeCacheKey('tokyo', '東京都千代田区1-1', '会館A');
  assert.equal(k1, k2); // 再利用される
  assert.notEqual(k1, W.geocodeCacheKey('tokyo', '東京都千代田区1-1', '会館B')); // 会場変更
  assert.notEqual(k1, W.geocodeCacheKey('tokyo', '東京都千代田区2-2', '会館A')); // 住所変更
  assert.notEqual(k1, W.geocodeCacheKey('osaka', '東京都千代田区1-1', '会館A')); // 地本変更
});
test('geocodeCacheKey: Unicode・空白・郵便番号を正規化', () => {
  const a = W.geocodeCacheKey('tokyo', '〒100-0001  東京都千代田区', 'Ｈall　Ａ');
  const b = W.geocodeCacheKey('tokyo', '東京都千代田区', 'Hall A');
  assert.equal(a, b);
});

test('resolveLocation: accuracy を address>venue>municipality>prefecture で判定', async () => {
  const now = Date.parse('2026-06-28T03:00:00Z');
  // 住所がヒット → address
  const addr = await geocode.resolveLocation({ pref: 'tokyo', address: '東京都千代田区1-1', place: '会館' }, async () => ({ lat: 35.68, lon: 139.76, title: '東京都千代田区' }), now);
  assert.equal(addr.accuracy, 'address');
  assert.equal(addr.source, 'gsi');
  assert.ok(addr.geocodedAt.endsWith('+09:00'));
  // 住所なし・会場ヒット → venue
  const venue = await geocode.resolveLocation({ pref: 'tokyo', place: '日本武道館' }, async () => ({ lat: 35.69, lon: 139.74, title: '東京都千代田区日本武道館' }), now);
  assert.equal(venue.accuracy, 'venue');
});
test('resolveLocation: 個別がダメでも都道府県でフォールバック', async () => {
  // address/venue/municipality は null、prefecture(都道府県名) だけ返す lookup
  const lookup = async (q) => (q === '東京都' ? { lat: 35.7, lon: 139.7, title: '東京都' } : null);
  const loc = await geocode.resolveLocation({ pref: 'tokyo', place: '謎の会場' }, lookup);
  assert.equal(loc.accuracy, 'prefecture');
});
test('resolveLocation: 全て失敗なら null（missing）', async () => {
  const loc = await geocode.resolveLocation({ pref: 'tokyo', place: 'x' }, async () => null);
  assert.equal(loc, null);
});
