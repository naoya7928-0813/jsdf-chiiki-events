const test = require('node:test');
const assert = require('node:assert');
const D = require('./eventDistance.cjs');

const ev = (id, lat, lon, accuracy = 'venue', over = {}) => ({ id, date: '2026-12-01', title: id, place: '会場',
  weatherLocation: { latitude: lat, longitude: lon, accuracy, label: '東京都' }, ...over });
const TOKYO = { lat: 35.681, lon: 139.767 };

test('近い順に並べ、位置が分からない（都道府県レベル・座標なし）ものは外して数える', () => {
  const r = D.sortByDistance([
    ev('far', 35.86, 139.97), ev('near', 35.69, 139.75), ev('pref', 35.68, 139.76, 'prefecture'), { id: 'none', date: '2026-12-01' },
  ], TOKYO);
  assert.deepStrictEqual(r.list.map(e => e.id), ['near', 'far']);
  assert.strictEqual(r.unknown, 2);
});

test('半径で絞る', () => {
  const r = D.sortByDistance([ev('far', 35.86, 139.97), ev('near', 35.69, 139.75)], TOKYO, 10);
  assert.deepStrictEqual(r.list.map(e => e.id), ['near']);
});

test('会場名に別の都道府県名がある会場名検索の座標は使わない（地本の県寄りの誤った位置）', () => {
  assert.strictEqual(D.eventCoords(ev('x', 41.77, 140.73, 'venue', { place: '青森県の航空自衛隊三沢基地' })), null);
  assert.strictEqual(D.eventCoords(ev('x', 41.77, 140.73, 'venue', { place: '県の航空自衛隊三沢基地' })), null);
  // 住所から引いた座標なら使う
  assert.ok(D.eventCoords(ev('x', 40.7, 141.37, 'address', { place: '青森県の航空自衛隊三沢基地' })));
});

test('運営が設定した入口の座標を最優先。表示は「直線」と明記、市区町村レベルはそう書く', () => {
  const c = D.eventCoords(ev('x', 35.0, 139.0, 'venue', { access: { entrance: { latitude: 35.5, longitude: 139.5 } } }));
  assert.deepStrictEqual(c, { lat: 35.5, lon: 139.5, approx: false });
  const r = D.sortByDistance([ev('m', 35.69, 139.75, 'municipality')], TOKYO);
  assert.ok(D.distanceLabel(r.list[0]).includes('直線'));
  assert.ok(D.distanceLabel(r.list[0]).includes('市区町村の中心'));
});

test('現在地が日本の範囲外・不正なら何も出さない', () => {
  assert.deepStrictEqual(D.sortByDistance([ev('a', 35.69, 139.75)], { lat: 0, lon: 0 }), { list: [], unknown: 0 });
});
