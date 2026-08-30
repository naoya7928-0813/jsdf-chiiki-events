const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TAG_DEFS, TAG_VALUES, guessTags, guessTag, matchesTag, normalizeTags, eventTags } = require('./tags.cjs');

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

// ── 運営が明示的に付けるタグ（管理画面の複数選択） ──────────────

test('normalizeTags: 既知のIDだけを、定義順・重複なしで返す', () => {
  assert.deepStrictEqual(normalizeTags(['個別', '抽選', '個別', '存在しない']), ['抽選', '個別']);
  assert.deepStrictEqual(normalizeTags('オンライン, 学生向け'), ['オンライン', '学生向け']);
  assert.deepStrictEqual(normalizeTags('入場無料 要予約'), ['入場無料', '要予約']);
});

test('normalizeTags: 不正な入力は空配列（画面・APIを壊さない）', () => {
  for (const bad of [null, undefined, '', [], {}, 0, ['   ']]) {
    assert.deepStrictEqual(normalizeTags(bad), []);
  }
});

test('eventTags: tags と、属性タグと同じ値の tag（申込要否）を合わせて返す', () => {
  assert.deepStrictEqual(eventTags({ tags: ['抽選'], tag: '入場無料' }), ['入場無料', '抽選']);
  // 申込要否だけの値（予約不要など）は属性タグではないので含めない
  assert.deepStrictEqual(eventTags({ tag: '予約不要' }), []);
  assert.deepStrictEqual(eventTags({}), []);
});

test('matchesTag: 運営が明示的に付けたタグは文面に語が無くても一致する', () => {
  const ev = { title: '説明会', notes: '', tags: ['オンライン', '抽選'] };
  assert.ok(matchesTag(ev, 'オンライン'));
  assert.ok(matchesTag(ev, '抽選'));
  assert.ok(!matchesTag(ev, '家族向け'));
});

test('matchesTag: 明示タグを足しても従来の文面判定は残る（スクレイプ品の後方互換）', () => {
  assert.ok(matchesTag({ title: 'オンライン説明会' }, 'オンライン'));
  assert.ok(matchesTag({ title: 'X', notes: '事前登録が必要です' }, '要予約'));
});

test('管理画面が選べるタグと絞り込みチップの項目が一致している', () => {
  // 管理画面は shared/tags.cjs の TAG_DEFS からチップを生成するため、定義が唯一の出どころ。
  // ここがずれると「付けられるのに絞り込めない／絞り込めるのに付けられない」が再発する。
  const fs = require('node:fs');
  const path = require('node:path');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'AdminScreen.jsx'), 'utf8');
  assert.ok(/TAG_DEFS\.map\(/.test(admin), '管理画面が TAG_DEFS からタグ選択肢を作っていない');
  assert.ok(!/const\s+TAG_/.test(admin), '管理画面にタグ定義が再実装されている');
  assert.deepStrictEqual(TAG_VALUES, TAG_DEFS.map(d => d.id));
});
