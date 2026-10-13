'use strict';
// 運営画面の会場選択（駐屯地・基地）一覧の整合性。
// 2026-10-13 に「守山駐屯地が岐阜」「築城が大分」「存在しない鳥羽航空基地」などの誤りが見つかったため、
// 地本と住所の都道府県が一致すること・重複がないことを検査する。
const { test } = require('node:test');
const assert = require('node:assert/strict');

const HOKKAIDO = new Set(['sapporo', 'asahikawa', 'obihiro', 'hakodate']);

test('駐屯地・基地の一覧: 地本と住所の都道府県が一致し、重複がない', async () => {
  const { JSDF_FACILITIES } = await import('../src/data/jsdfFacilities.js');
  const { PREFECTURE_INFO } = await import('../src/data/regionMap.js');
  const names = new Set();
  for (const f of JSDF_FACILITIES) {
    assert.ok(PREFECTURE_INFO[f.pref], `未知の地本: ${f.pref} ${f.name}`);
    const prefName = HOKKAIDO.has(f.pref) ? '北海道' : PREFECTURE_INFO[f.pref].label;
    assert.ok(f.address.startsWith(prefName), `${f.name}: 地本 ${f.pref}（${prefName}）と住所 ${f.address} が一致しない`);
    assert.ok(/^(陸上|海上|航空)自衛隊 /.test(f.name), `名称の形式: ${f.name}`);
    assert.ok(['army', 'navy', 'air'].includes(f.branch), `${f.name}: branch`);
    const kind = { army: '陸上', navy: '海上', air: '航空' }[f.branch];
    assert.ok(f.name.startsWith(kind), `${f.name}: branch ${f.branch} と名称が一致しない`);
    assert.ok(!names.has(f.name), `重複: ${f.name}`);
    names.add(f.name);
  }
});
