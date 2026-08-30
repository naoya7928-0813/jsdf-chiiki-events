const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TAG_DEFS, TAG_VALUES, guessTags, guessTag, matchesTag } = require('./tags.cjs');

test('guessTags: 複数該当をすべて返す', () => {
  assert.deepStrictEqual(
    guessTags('入場無料の個別相談会（要予約・高校生歓迎）'),
    ['入場無料', '要予約', '学生向け', '個別']
  );
});

test('guessTags: 該当なしは空配列 / 不正入力でも落ちない', () => {
  assert.deepStrictEqual(guessTags('艦艇公開'), []);
  for (const bad of [null, undefined, 0, {}]) assert.deepStrictEqual(guessTags(bad), []);
});

test('guessTag: 先頭のタグだけ返す（既存パーサーの後方互換）', () => {
  assert.strictEqual(guessTag('無料・要予約'), '入場無料');
  assert.strictEqual(guessTag('該当語なし'), '');
});

test('matchesTag: title / notes / tag を横断して判定する', () => {
  assert.ok(matchesTag({ title: '個別相談会' }, '個別'));
  assert.ok(matchesTag({ title: 'X', notes: '事前登録が必要です' }, '要予約'));
  assert.ok(matchesTag({ title: 'X', tag: '抽選' }, '抽選'));
  assert.ok(!matchesTag({ title: '一般公開' }, 'オンライン'));
});

test('matchesTag: 未知のタグIDは ev.tag の一致で判定（申請済み等の特別IDを壊さない）', () => {
  assert.ok(matchesTag({ tag: '未知タグ' }, '未知タグ'));
  assert.ok(!matchesTag({ tag: 'X' }, '未知タグ'));
  assert.ok(!matchesTag({}, '未知タグ'));
});

test('スクレイパーが付けうるタグは、すべて絞り込みチップを持つ', () => {
  // guessTags が返しうる値 = TAG_DEFS の id。フロントはこの配列からチップを作るため、
  // ここが一致していれば「付いているのに絞り込めないタグ」は生まれない。
  assert.deepStrictEqual(TAG_VALUES, TAG_DEFS.map(d => d.id));
});

test('タグ判定のパターンを他所へ再実装していない', () => {
  // 以前は scraper/parsers/utils.js と src/components/FilterBar.jsx が
  // 同じ正規表現を別々に持っており、「個別」がフロントに無いズレが起きていた。
  const utils = fs.readFileSync(path.join(__dirname, '..', 'scraper', 'parsers', 'utils.js'), 'utf8');
  const filterBar = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'FilterBar.jsx'), 'utf8');
  for (const [name, src] of [['scraper/parsers/utils.js', utils], ['src/components/FilterBar.jsx', filterBar]]) {
    assert.ok(!/元自衛官/.test(src), `${name} にタグ判定のパターンが再実装されている`);
  }
});
