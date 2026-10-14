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

test('施設の面積データ: 名前の重複なし・面積は正・出典の種類は wiki/osm', () => {
  const names = F.FACILITY_AREAS.map(f => f.name);
  assert.equal(new Set(names).size, names.length);
  for (const f of F.FACILITY_AREAS) {
    assert.ok(f.ha > 0, f.name);
    assert.ok(['wiki', 'osm'].includes(f.src), f.name);
    assert.ok(F.BRANCH_LABEL[f.branch], f.name);
  }
});

test('施設名は運営画面の施設一覧（jsdfFacilities.js）と揃っている', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/data/jsdfFacilities.js'), 'utf8');
  for (const f of F.FACILITY_AREAS) assert.ok(src.includes(f.name), `${f.name} が施設一覧に無い`);
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
  assert.equal(name({ place: '北宇都宮駐屯地' }), null, '「宇都宮駐屯地」と取り違えない（北宇都宮は面積データなし）');
  assert.equal(name({ place: '新千歳空港' }), null);
  assert.equal(name({ place: '春日井市民会館' }), null);
  assert.equal(name({ place: '東京ドーム' }), null);
  assert.equal(name(null), null);
});

test('倍率の文言', () => {
  const iruma = F.compareArea(300);
  assert.equal(F.ratioText(iruma.find(r => r.id === 'dome').ratio), '約64個分');
  assert.equal(F.ratioText(iruma.find(r => r.id === 'tdl').ratio), '約5.9個分');
  assert.equal(F.ratioText(0.55), '約0.6倍');
  assert.equal(F.ratioText(0.01), '約0.1倍');
  assert.equal(F.haText(300), '約300ha');
  assert.equal(F.haText(3.24), '約3.2ha');
});
