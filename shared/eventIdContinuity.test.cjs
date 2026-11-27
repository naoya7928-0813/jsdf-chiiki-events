const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { carryOverEventIds, isSameEventForId } = require('./eventIdContinuity.cjs');

const ev = (o) => ({ pref: 'tochigi', date: '2026-11-29', title: 'HondaFes 26', place: '', notes: '', ...o });

test('ID 引き継ぎ: 取得経路だけ違う同じイベント（-off- ⇔ -office-）は前回の ID を使い続ける（2026-11 栃木 HondaFes 26 の実例）', () => {
  const prev = { tochigi: [ev({ id: 'to-off-20261129-4zdvw' })] };
  const data = { tochigi: [ev({ id: 'to-office-20261129-yyt3m', notes: '掲載元: 宇都宮募集案内所', place: '宇都宮募集案内所' })] };
  const ch = carryOverEventIds(prev, data);
  assert.strictEqual(data.tochigi[0].id, 'to-off-20261129-4zdvw');
  assert.deepStrictEqual(ch.map(c => [c.from, c.to]), [['to-office-20261129-yyt3m', 'to-off-20261129-4zdvw']]);
});

test('ID 引き継ぎ: 表記ゆれ（括弧・軍種名・空白）でも同じイベントなら引き継ぐ', () => {
  const prev = { tokyo: [ev({ pref: 'tokyo', id: 'to-a', title: '体験型説明会in信太山駐屯地', date: '2026-12-01' })] };
  const data = { tokyo: [ev({ pref: 'tokyo', id: 'to-b', title: '陸上自衛隊 体験型説明会in陸上自衛隊信太山駐屯地（要予約）', date: '2026-12-01' })] };
  carryOverEventIds(prev, data);
  assert.strictEqual(data.tokyo[0].id, 'to-a');
});

test('ID 引き継ぎ: 開催日・タイトル・会場が違うものは別イベントとして新しい ID のまま', () => {
  const prev = { tochigi: [ev({ id: 'old', place: '宇都宮市文化会館' })] };
  for (const cur of [
    ev({ id: 'new', date: '2026-11-30' }),                              // 開催日が違う
    ev({ id: 'new', title: '防衛大学校学生等との懇談会' }),               // タイトルが違う
    ev({ id: 'new', place: '栃木県総合運動公園' }),                       // 会場が両方あり別物
  ]) {
    const data = { tochigi: [cur] };
    assert.deepStrictEqual(carryOverEventIds(prev, data), []);
    assert.strictEqual(data.tochigi[0].id, 'new');
  }
  // 短い部分一致（8文字未満）では同一視しない
  assert.strictEqual(isSameEventForId(ev({ title: '説明会' }), ev({ title: '入隊説明会' })), false);
});

test('ID 引き継ぎ: 地本が違えば引き継がない', () => {
  const prev = { gunma: [ev({ pref: 'gunma', id: 'gu-old' })] };
  const data = { tochigi: [ev({ id: 'to-new' })] };
  assert.deepStrictEqual(carryOverEventIds(prev, data), []);
  assert.strictEqual(data.tochigi[0].id, 'to-new');
});

test('ID 引き継ぎ: 候補が1対1でなければ引き継がない（同じ日の同名・別会場イベント）', () => {
  // 前回1件 → 今回、会場の空いた同名2件（どちらが前回のものか決められない）
  const prev = { tochigi: [ev({ id: 'old' })] };
  const data = { tochigi: [ev({ id: 'n1', place: 'A会館' }), ev({ id: 'n2', place: 'B会館' })] };
  assert.deepStrictEqual(carryOverEventIds(prev, data), []);
  assert.deepStrictEqual(data.tochigi.map(e => e.id), ['n1', 'n2']);
  // 前回2件 → 今回1件（会場不明）も決められない
  const prev2 = { tochigi: [ev({ id: 'o1', place: 'A会館' }), ev({ id: 'o2', place: 'B会館' })] };
  const data2 = { tochigi: [ev({ id: 'n' })] };
  assert.deepStrictEqual(carryOverEventIds(prev2, data2), []);
});

test('ID 引き継ぎ: 前回の ID が今回も残っている・手動イベント・前回から続く ID には手を付けない', () => {
  // 前回の ID が今回も使われている（＝消えていない）
  const prev = { tochigi: [ev({ id: 'keep' })] };
  const data = { tochigi: [ev({ id: 'keep' }), ev({ id: 'new', place: '別会場' })] };
  assert.deepStrictEqual(carryOverEventIds(prev, data), []);
  // 手動イベント（manual-*）は Redis 側の ID なので対象外
  const prevM = { tochigi: [ev({ id: 'manual-1' })] };
  const dataM = { tochigi: [ev({ id: 'to-new' })] };
  assert.deepStrictEqual(carryOverEventIds(prevM, dataM), []);
  assert.strictEqual(dataM.tochigi[0].id, 'to-new');
});

test('ID 引き継ぎ: 前回データが無い・壊れていても落ちない', () => {
  const data = { tochigi: [ev({ id: 'x' })], updatedAt: '2026/11/27' };
  assert.deepStrictEqual(carryOverEventIds({}, data), []);
  assert.deepStrictEqual(carryOverEventIds(null, data), []);
  assert.deepStrictEqual(carryOverEventIds({ tochigi: 'broken', updatedAt: 'x' }, data), []);
  assert.strictEqual(data.tochigi[0].id, 'x');
});

test('ID 引き継ぎ: 引き継いだ結果 ID が重複しない', () => {
  const prev = { tochigi: [ev({ id: 'old' })] };
  const data = { tochigi: [ev({ id: 'new' })], gunma: [ev({ pref: 'gunma', id: 'gu-1', title: '別のイベント' })] };
  carryOverEventIds(prev, data);
  const ids = Object.values(data).flat().map(e => e.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('scraper: 取得経路の判定に ID の接頭辞を使わない（引き継いだ ID でも前回データ維持が正しく動く）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scraper', 'index.js'), 'utf8');
  assert.match(src, /carryOverEventIds\(prevData, data\)/, 'writeOutput が ID の引き継ぎを呼ぶこと');
  assert.match(src, /source_path:\s*'hq_flyer'/, 'HQ探索のチラシに経路の印を付けること');
  assert.match(src, /source_path:\s*'office'/, '募集案内所巡回のイベントに経路の印を付けること');
  assert.match(src, /e\.source_path \? e\.source_path === 'hq_flyer'/, '前回データ維持は経路の印で判定すること');
  // ID の引き継ぎは前回値の保護（ID で前回を引く）より前
  assert.ok(src.indexOf('carryOverEventIds(prevData, data)') < src.indexOf('eventRegression.buildEventIndex(prevData)'));
});
