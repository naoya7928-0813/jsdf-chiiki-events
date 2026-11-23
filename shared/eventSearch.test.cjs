const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./eventSearch.cjs');

const ev = { title: '百里基地航空祭', place: '航空自衛隊百里基地', category: '一般公開', notes: 'ブルーインパルス飛行予定', date: '2026-12-06', pref: 'ibaraki' };
const hit = (q, e = ev, label = '茨城') => S.matchesSearch(e, S.parseQuery(q), label);

test('全角/半角・大文字/小文字・ひらがな/カタカナを区別しない', () => {
  assert.ok(hit('ﾌﾞﾙｰｲﾝﾊﾟﾙｽ'));
  assert.ok(hit('ぶるーいんぱるす'));
  assert.ok(S.matchesSearch({ title: 'ふじざくらＦＣ' }, S.parseQuery('fc')));
});

test('空白区切りはすべて含むもの（AND）。地本名・開催日でも探せる', () => {
  assert.ok(hit('航空祭 12月'));
  assert.ok(hit('茨城 航空祭'));
  assert.ok(hit('茨城地本'));
  assert.ok(hit('12月6日'));
  assert.ok(!hit('航空祭 11月'));
  assert.ok(!hit('宮崎'));
});

test('記号は文字として扱い、長すぎる入力は先頭だけ使う（正規表現にしない）', () => {
  assert.doesNotThrow(() => hit('(.*+?[\\'));
  assert.ok(!hit('(.*+?['));
  assert.ok(S.parseQuery('あ'.repeat(500)).join('').length <= S.MAX_QUERY_LENGTH);
  assert.deepStrictEqual(S.parseQuery('   '), []);
  assert.ok(hit('')); // 検索語なし＝すべて
});

test('配線: 一覧は共通の検索を使い、0件のときに「全国で探す」「絞り込みを解除」を出す', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/components/ListScreen.jsx'), 'utf8');
  assert.ok(src.includes('matchesSearch('));
  assert.ok(src.includes('全国で探す'));
  assert.ok(src.includes('絞り込みを解除'));
  assert.ok(src.includes('条件に合うイベントはありません'));
});
