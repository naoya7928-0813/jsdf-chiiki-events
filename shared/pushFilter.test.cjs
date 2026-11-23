const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('./pushFilter.cjs');

const P2R = { tokyo: 'kanto', fukuoka: 'kyushu', sapporo: 'hokkaido' };
const EV = [
  { id: 'a', pref: 'tokyo', category: '説明会', title: '説明会A', date: '2026-12-01' },
  { id: 'b', pref: 'fukuoka', category: '一般公開', title: '築城の一般公開', date: '2026-12-02' },
];

test('normalizePushFilter: 既知の値だけ・空や全選択は「すべて」(null)', () => {
  assert.strictEqual(F.normalizePushFilter(null), null);
  assert.strictEqual(F.normalizePushFilter({ regions: [], categories: [] }), null);
  assert.strictEqual(F.normalizePushFilter({ regions: [...F.REGION_IDS] }), null);
  assert.deepStrictEqual(F.normalizePushFilter({ regions: ['kanto', 'kanto', 'mars'], categories: ['説明会', '<script>'] }),
    { regions: ['kanto'], categories: ['説明会'] });
});

test('buildPushPayload: 当てはまる新着だけで通知文を作り、無ければ送らない。1件なら個別ページ', () => {
  const p = F.buildPushPayload(EV, { regions: ['kyushu'], categories: [] }, P2R);
  assert.strictEqual(p.title, '自衛隊イベント情報 +1件');
  assert.strictEqual(p.url, '/event/b');
  assert.ok(p.body.includes('築城'));
  assert.strictEqual(F.buildPushPayload(EV, { regions: ['hokkaido'], categories: [] }, P2R), null);
  assert.strictEqual(F.buildPushPayload(EV, { regions: [], categories: ['演奏会'] }, P2R), null);
  assert.strictEqual(F.buildPushPayload(EV, null, P2R).url, '/list');
});

test('sanitizeNewEvents: 不正なIDを捨て、長さと件数を制限する', () => {
  const out = F.sanitizeNewEvents([{ id: '../x' }, { id: 'ok-1', title: 'x'.repeat(200) }, ...Array(60).fill({ id: 'z' })]);
  assert.strictEqual(out[0].id, 'ok-1');
  assert.strictEqual(out[0].title.length, 80);
  assert.ok(out.length <= 50);
});

test('地域IDは画面の REGIONS と一致し、種目は固定9値', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/data/regionMap.js'), 'utf8');
  const ids = [...src.slice(src.indexOf('export const REGIONS')).matchAll(/^\s{4}id: '([a-z]+)'/gm)].map(m => m[1]);
  assert.deepStrictEqual(ids, [...F.REGION_IDS]);
  assert.strictEqual(F.CATEGORIES.length, 9);
});

test('配線: 購読APIは絞り込みを保存し、通知APIは端末ごとに作り直し・同じ回を二度送らない', () => {
  const sub = fs.readFileSync(path.join(__dirname, '../api/subscribe.js'), 'utf8');
  assert.ok(sub.includes('normalizePushFilter'));
  const notify = fs.readFileSync(path.join(__dirname, '../api/notify.js'), 'utf8');
  assert.ok(notify.includes('buildPushPayload'));
  assert.ok(/push:batch:/.test(notify));
});
