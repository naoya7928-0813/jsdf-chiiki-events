'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('地本連絡先: イベント詳細と近隣窓口の50地本の電話を一致させる', () => {
  const offices = JSON.parse(read('public/data/offices.json')).offices;
  const hq = offices.filter(o => o.type === 'hq');
  assert.equal(hq.length, 50);
  assert.equal(new Set(hq.map(o => o.pref)).size, 50);
  const config = read('src/config.js').split('export const REGION_HQ = {')[1].split('};')[0];
  for (const o of hq) {
    const match = config.match(new RegExp(`${o.pref}:\\s*\\{ name: '[^']+',\\s*tel: '([^']+)'`));
    assert.ok(match, o.pref);
    assert.equal(match[1], o.tel, o.pref);
    assert.match(o.tel, /^0[0-9-]+$/);
  }
});

test('徳島: 各窓口の連絡先に共通ヘッダーの本部連絡先を取り込まない', () => {
  const offices = JSON.parse(read('public/data/offices.json')).offices.filter(o => o.pref === 'tokushima');
  const hq = offices.find(o => o.type === 'hq');
  const counters = offices.filter(o => o.type === 'recruitment');
  assert.equal(counters.length, 5);
  assert.deepEqual(counters.map(o => o.name).sort(), ['三好出張所','吉野川地域事務所','鳴門地域事務所','阿南地域事務所','徳島募集案内所'].sort());
  assert.equal(new Set(counters.map(o => o.tel)).size, 5);
  for (const o of counters) {
    assert.ok(o.area && o.address && o.tel);
    assert.notEqual(o.tel, hq.tel);
    assert.notEqual(o.address, hq.address);
    assert.ok(o.url.endsWith('.html'));
    assert.ok(Number.isFinite(o.lat) && Number.isFinite(o.lng));
  }
});
