'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('./facilityArea.cjs');

test('比較対象は4つ（東京ドーム・ランド・シー・リゾート）で、面積は正の数', () => {
  assert.deepEqual(F.REFERENCES.map(r => r.id), ['dome', 'tdl', 'tds', 'tdr']);
  for (const r of F.REFERENCES) assert.ok(r.ha > 0 && r.note, r.label);
});

test('施設の面積データ: 名前の重複なし・面積は正・求め方が分かる', () => {
  const names = F.FACILITY_AREAS.map(f => f.name);
  assert.equal(new Set(names).size, names.length);
  for (const f of F.FACILITY_AREAS) {
    assert.ok(f.ha > 0, f.name);
    assert.ok(F.AREA_METHOD[f.src], `${f.name}: 求め方 ${f.src}`);
    if (f.src === 'pub') assert.ok(f.from, `${f.name}: 公表値は出どころを書く`);
    assert.ok(F.BRANCH_LABEL[f.branch], f.name);
  }
  // 要望のあった施設
  for (const n of ['三沢基地', '横須賀基地', '入間基地']) assert.ok(names.includes(n), n);
});

test('滑走路データ: 名前の重複なし・長さは現実的な範囲・面積データと所属が一致', () => {
  const names = F.RUNWAYS.map(r => r.name);
  assert.equal(new Set(names).size, names.length);
  for (const r of F.RUNWAYS) {
    assert.ok(r.m >= 300 && r.m <= 4000, `${r.name}: ${r.m}m`);
    const a = F.FACILITY_AREAS.find(f => f.name === r.name);
    if (a) assert.equal(`${a.pref}/${a.branch}`, `${r.pref}/${r.branch}`, r.name);
  }
  assert.deepEqual(F.LENGTH_REFERENCES.map(r => r.id), ['tower', 'skytree', 'whale', 'car', 'bus']);
});

test('滑走路の長さくらべの文言（入間基地 2,000m）', () => {
  const c = Object.fromEntries(F.compareLength(2000).map(r => [r.id, F.lengthRatioText(r.ratio, r.unit)]));
  assert.equal(c.tower, '約6本分');
  assert.equal(c.skytree, '約3.2本分');
  assert.equal(c.whale, '約80頭分');
  assert.equal(c.car, '約426台分');
  assert.equal(c.bus, '約167台分');
  assert.equal(F.mText(3353), '3,353m');
});

test('面積か滑走路のどちらかが分かれば施設を返す', () => {
  const iruma = F.findFacility({ place: '航空自衛隊入間基地' });
  assert.equal(iruma.area.ha > 0 && iruma.runway.m, 2000);
  const tokushima = F.findFacility({ place: '海上自衛隊徳島航空基地' });
  assert.equal(tokushima.area, null, '面積は地図データが一部しか無いため出さない');
  assert.equal(tokushima.runway.m, 2500);
  assert.equal(F.findFacility({ place: '朝霞駐屯地' }).runway, null);
});

test('施設名は運営画面の施設一覧（jsdfFacilities.js）と揃っている', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/data/jsdfFacilities.js'), 'utf8');
  for (const f of [...F.FACILITY_AREAS, ...F.RUNWAYS]) assert.ok(src.includes(f.name), `${f.name} が施設一覧に無い`);
});

test('会場名・タイトルから施設を見つける', () => {
  const name = (ev) => F.findFacilityArea(ev)?.name || null;
  assert.equal(name({ place: '航空自衛隊入間基地' }), '入間基地');
  assert.equal(name({ place: '陸上自衛隊 宇都宮駐屯地' }), '宇都宮駐屯地');
  assert.equal(name({ title: '入間航空祭', place: '' }), '入間基地', '航空祭の名前だけでも分かる');
  assert.equal(name({ title: '説明会 in 信太山駐屯地', place: '岸和田地域事務所' }), '信太山駐屯地', '会場が事務所ならタイトルから');
  assert.equal(name({ place: '東千歳駐屯地' }), '東千歳駐屯地');
});

test('別の施設や関係ない会場を取り違えない', () => {
  const name = (ev) => F.findFacilityArea(ev)?.name || null;
  assert.equal(name({ place: '北宇都宮駐屯地' }), '北宇都宮駐屯地', '「宇都宮駐屯地」と取り違えない');
  assert.equal(name({ place: '新千歳空港' }), null);
  assert.equal(name({ place: '春日井市民会館' }), null);
  assert.equal(name({ place: '東京ドーム' }), null);
  assert.equal(name(null), null);
});

test('倍率の文言', () => {
  const iruma = F.compareArea(300);
  assert.equal(F.ratioText(iruma.find(r => r.id === 'dome').ratio), '約64個分');
  assert.equal(F.ratioText(iruma.find(r => r.id === 'tdl').ratio), '約5.9個分');
  assert.equal(F.ratioText(0.55), '約0.6個分', '小さいときも「の」を付けず「◯個分」');
  assert.equal(F.ratioText(0.01), '約0.1個分');
  assert.equal(F.haText(300), '約300ha');
  assert.equal(F.haText(3.24), '約3.2ha');
});
