'use strict';
/**
 * scraper/parsers/utils.js のテスト（npm test の shared/*.test.cjs glob で実行）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractLocationFromTitle } = require('../scraper/parsers/utils');

test('extractLocationFromTitle: タイトル末尾の括弧・先頭の【】から場所ヒントを抽出', () => {
  // 会場語を含む → place（秋田 iCal の実例）
  assert.deepEqual(extractLocationFromTitle('多用途支援艦すおう一般公開(秋田港)'), { place: '秋田港', address: '' });
  // 市区町村のみ → address（会場ではないため place にしない）
  assert.deepEqual(extractLocationFromTitle('3機関合同説明会(能代市)'), { place: '', address: '能代市' });
  assert.deepEqual(extractLocationFromTitle('自衛隊説明会(横手市)'), { place: '', address: '横手市' });
  // 先頭の【市町村】（長野 iCal の実例）
  assert.deepEqual(extractLocationFromTitle('【駒ケ根市】KOMA夏'), { place: '', address: '駒ケ根市' });
  assert.deepEqual(extractLocationFromTitle('【伊那市】伊那まつり'), { place: '', address: '伊那市' });
  // 場所ではない括弧は抽出しない
  assert.equal(extractLocationFromTitle('自衛隊説明会(オンライン)'), null);
  assert.equal(extractLocationFromTitle('見学会（要予約）'), null);
  assert.equal(extractLocationFromTitle('【夏休み特別企画】採用説明会'), null);
  // 括弧なし
  assert.equal(extractLocationFromTitle('公務員合同説明会'), null);
  assert.equal(extractLocationFromTitle(''), null);
});
