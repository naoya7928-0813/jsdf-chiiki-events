const test = require('node:test');
const assert = require('node:assert');
const V = require('./verifiedEvents.cjs');
const { PREF_LABELS } = require('./eventPage.cjs');
const Q = require('./titleQuality.cjs');
const KEYS = Object.keys(PREF_LABELS);

const ok = {
  id: 'verified-test-2026', pref: 'ibaraki', date: '2026-12-06', title: '百里基地航空祭', place: '航空自衛隊百里基地',
  url: 'https://www.mod.go.jp/x.html',
  evidence: { url: 'https://www.mod.go.jp/x.pdf', quote: '令和８年１２月６日（日）', checkedAt: '2026-11-23' },
};

test('出典（URL・引用・確認日）が無いものは入れない', () => {
  assert.ok(V.normalizeVerifiedEvent(ok, KEYS).event);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, evidence: undefined }, KEYS).error);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, evidence: { ...ok.evidence, quote: '' } }, KEYS).error);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, url: '' }, KEYS).error);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, pref: 'mars' }, KEYS).error);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, id: 'x' }, KEYS).error);
  assert.ok(V.normalizeVerifiedEvent({ ...ok, date: '2026-02-30x' }, KEYS).error);
});

test('出典の引用は公開データに出さない。既に同じ ID があれば上書きしない', () => {
  const out = { ibaraki: [] };
  V.mergeVerifiedEvents(out, [ok], KEYS);
  assert.strictEqual(out.ibaraki.length, 1);
  assert.strictEqual(out.ibaraki[0].evidence, undefined);
  assert.strictEqual(out.ibaraki[0].source_type, 'verified_source');
  const r = V.mergeVerifiedEvents(out, [ok], KEYS);
  assert.deepStrictEqual(r.added, []);
  assert.strictEqual(out.ibaraki.length, 1);
});

test('data/verified-events.json の全件が規則を満たし、公開の品質判定も通る', () => {
  const list = require('../data/verified-events.json').events;
  for (const raw of list) {
    const r = V.normalizeVerifiedEvent(raw, KEYS);
    assert.ok(r.event, r.error);
    assert.ok(!Q.isJunkOrStubTitle(r.event.title));
    assert.ok(!Q.isNonEventDocument(r.event), `${r.event.id} が非イベント扱いになる`);
  }
});
