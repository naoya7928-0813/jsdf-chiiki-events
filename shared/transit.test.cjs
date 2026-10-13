'use strict';
// shared/transit.cjs と /api/transit・public/data/stations.json のテスト（交通・アクセス案内）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('./transit.cjs');

const STATIONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'stations.json'), 'utf8'));

test('stations.json: 出典表示つき・全国の駅がそろっている（国土数値情報 N02）', () => {
  assert.match(STATIONS.source, /国土数値情報（鉄道データ）/);
  assert.ok(STATIONS.stations.length > 8000, `駅数 ${STATIONS.stations.length}`);
  for (const s of STATIONS.stations.slice(0, 200)) {
    assert.ok(T.inJapan(s[1], s[2]), `範囲外: ${s[0]}`);
    assert.ok(s[3].every(i => STATIONS.lines[i]), '路線の参照切れ');
  }
});

test('nearestStations: 直線距離の近い順に複数候補を返す（断定しない）', () => {
  // 宇都宮駐屯地付近
  const r = T.nearestStations(STATIONS, 36.574, 139.876, { limit: 5, maxM: 5000 });
  assert.ok(r.length >= 2, '候補が複数ある');
  for (let i = 1; i < r.length; i++) assert.ok(r[i].distanceM >= r[i - 1].distanceM);
  assert.ok(r.every(s => s.distanceM <= 5000));
  // JR新宿駅の実位置付近 → 新宿が最上位
  const s = T.nearestStations(STATIONS, 35.6896, 139.7006, { limit: 3 });
  assert.equal(s[0].name, '新宿');
  assert.ok(s[0].lines.some(l => l.line === '山手線'));
  // 範囲外・データなしは空
  assert.deepEqual(T.nearestStations(STATIONS, 10, 10), []);
  assert.deepEqual(T.nearestStations(null, 35, 139), []);
  // 海上などで近くに駅が無ければ空（利用者に他の交通手段を案内する）
  assert.deepEqual(T.nearestStations(STATIONS, 34.0, 141.0, { maxM: 3000 }), []);
});

test('distanceM / formatDistance', () => {
  assert.ok(Math.abs(T.distanceM(35.681, 139.767, 35.690, 139.700) - 6100) < 300); // 東京駅→新宿駅 約6km
  assert.equal(T.formatDistance(234), '230m');
  assert.equal(T.formatDistance(1840), '1.8km');
});

test('normalizeAccessInput: 入場口の座標は両方そろった日本の範囲のみ。URL は http(s)', () => {
  const ok = T.normalizeAccessInput({ entranceLabel: '北門', entranceLat: '36.5591', entranceLon: '139.8985', station: 'JR宇都宮駅', busStop: '駐屯地前', notes: '臨時バスあり<b>', url: 'https://www.mod.go.jp/gsdf/' });
  assert.deepEqual(ok.access.entrance, { lat: 36.5591, lon: 139.8985, label: '北門' });
  assert.ok(!/[<>]/.test(ok.access.notes));
  assert.match(T.normalizeAccessInput({ entranceLat: '36.5' }).error, /緯度・経度/);
  assert.match(T.normalizeAccessInput({ entranceLat: '0', entranceLon: '0' }).error, /日本/);
  assert.match(T.normalizeAccessInput({ url: 'javascript:alert(1)' }).error, /URL/);
  assert.deepEqual(T.normalizeAccessInput({ entranceLabel: '正門' }).access, { entranceLabel: '正門' });
  assert.deepEqual(T.normalizeAccessInput(null).access, {});
});

test('resolveDestination: 入場口 > 精度の高い会場座標 > 住所・会場名（市区町村どまりの座標は使わない）', () => {
  const base = { place: '宇都宮駐屯地', address: '栃木県宇都宮市', weatherLocation: { latitude: 36.57, longitude: 139.87, accuracy: 'venue' } };
  assert.equal(T.resolveDestination({ ...base, access: { entrance: { lat: 36.56, lon: 139.89, label: '北門' } } }).basis, 'entrance');
  assert.equal(T.resolveDestination(base).basis, 'venue');
  const muni = T.resolveDestination({ ...base, weatherLocation: { ...base.weatherLocation, accuracy: 'municipality' } });
  assert.equal(muni.basis, 'text');
  assert.equal(muni.query, '栃木県宇都宮市');
  assert.equal(T.resolveDestination({}).basis, 'none');
});

test('googleDirectionsUrl: 公式の Maps URLs 形式（api=1・travelmode）。出発地なしは端末の現在地に任せる', () => {
  const u = new URL(T.googleDirectionsUrl({ origin: { lat: 35.69, lon: 139.7 }, destination: { lat: 36.57, lon: 139.87 }, mode: 'transit' }));
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(u.searchParams.get('api'), '1');
  assert.equal(u.searchParams.get('travelmode'), 'transit');
  assert.equal(u.searchParams.get('origin'), '35.69,139.7');
  const noOrigin = new URL(T.googleDirectionsUrl({ destination: { query: '栃木県宇都宮市' }, mode: 'walking' }));
  assert.equal(noOrigin.searchParams.get('origin'), null);
  assert.equal(noOrigin.searchParams.get('destination'), '栃木県宇都宮市');
  assert.equal(T.googleDirectionsUrl({ destination: null }), '');
});

test('sanitizeRoutes: API に無い値は作らない（運賃・所要時間を推測しない）', () => {
  const r = T.sanitizeRoutes([
    { summary: { durationMin: 52, fareYen: '990', transfers: 1, departure: '9:05', arrival: 'あとで' },
      legs: [{ mode: 'walk', durationMin: 5 }, { mode: 'train', line: '東北線', from: '上野', to: '宇都宮', departure: '9:10' }, { mode: 'rocket' }] },
    { summary: {}, legs: [] },
  ]);
  assert.equal(r.length, 1, '区間の無い経路は捨てる');
  assert.deepEqual(r[0].summary, { durationMin: 52, fareYen: 990, transfers: 1, departure: '9:05' });
  assert.equal(r[0].legs[1].durationMin, undefined, '所要時間の無い区間に値を補わない');
  assert.equal(r[0].legs[2].mode, 'other');
  assert.deepEqual(T.sanitizeRoutes(null), []);
});
