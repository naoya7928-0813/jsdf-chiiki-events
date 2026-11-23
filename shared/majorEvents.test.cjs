const test = require('node:test');
const assert = require('node:assert');
const M = require('./majorEvents.cjs');

const data = (titles) => ({ updatedAt: 'x', fukuoka: titles.map((t, i) => ({ id: `f${i}`, date: '2026-11-29', title: t })) });
const r = (res, id) => res.find(x => x.id === id);

test('本体が掲載されていれば listed、ツアー等だけなら related_only、無ければ missing', () => {
  const res = M.checkMajorEvents({ ...data(['築城基地航空祭2026']), tokyo: [{ id: 't1', date: '2026-12-06', title: '百里基地航空祭バスツアー' }] }, '2026-11-23');
  assert.strictEqual(r(res, 'tsuiki').status, 'listed');
  assert.strictEqual(r(res, 'hyakuri').status, 'related_only');
  assert.strictEqual(r(res, 'nyutabaru').status, 'missing');
});

test('例年の時期で本体が無いものだけを要確認にする。今年アーカイブ済みなら開催済み', () => {
  const archive = [{ id: 'g', pref: 'gifu', date: '2026-11-22', title: '岐阜基地航空祭2026' },
    { id: 'old', pref: 'fukuoka', date: '2025-11-30', title: '築城基地航空祭2025' }];
  const res = M.checkMajorEvents(data([]), '2026-11-23', { archive });
  assert.strictEqual(r(res, 'gifu').status, 'held');
  assert.strictEqual(r(res, 'tsuiki').status, 'missing'); // 前年分は開催済みに数えない
  const miss = M.missingInSeason(res).map(x => x.id);
  assert.ok(miss.includes('tsuiki'));
  assert.ok(!miss.includes('gifu'));
  assert.ok(!miss.includes('chitose')); // 時期でない
});

test('似た名前を取り違えない（方面隊の音楽まつり ≠ 自衛隊音楽まつり、千歳の文字だけ ≠ 航空祭）', () => {
  const res = M.checkMajorEvents(data(['陸上自衛隊北部方面隊音楽まつり', '千歳市の自衛隊説明会']), '2026-11-23');
  assert.strictEqual(r(res, 'ongaku').status, 'missing');
  assert.strictEqual(r(res, 'chitose').status, 'missing');
});

test('監視リストは日付・会場を持たない（公開データへ推測の情報を出さないため）', () => {
  for (const m of M.MAJOR_EVENTS) {
    assert.strictEqual(m.date, undefined);
    assert.strictEqual(m.place, undefined);
    assert.ok(m.months.every(x => x >= 1 && x <= 12));
  }
});
