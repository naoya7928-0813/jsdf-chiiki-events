'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const B = require('./branch.cjs');

// ── 明示語（strong）からの判定 ────────────────────────────────────
test('strong: 明示的な種別名・施設名で判定できる', () => {
  const cases = [
    [{ title: '陸上自衛隊朝霞駐屯地見学会' }, 'ground'],
    [{ title: '高等工科学校説明会' },          'ground'],
    [{ title: '潜水艦艦内見学' },              'maritime'],
    [{ title: '護衛艦あきづき艦艇広報' },      'maritime'],
    [{ title: '航空自衛隊入間基地見学' },      'air'],
    [{ title: '千歳のまちの航空祭' },          'air'],
  ];
  for (const [ev, want] of cases) {
    assert.deepEqual(B.branchesOf(ev), [want], ev.title);
  }
});

test('place / notes / category も判定に使う', () => {
  assert.deepEqual(
    B.branchesOf({ title: '2026秋季インターンシップ', place: '自衛隊 市ヶ谷駐屯地' }),
    ['ground']
  );
  assert.deepEqual(
    B.branchesOf({ title: '伊勢町祇園祭', notes: 'オートバイ（偵察用）を展示予定です' }),
    ['ground']
  );
});

// ── weak は「どの種別の明示語も無い」ときだけ効く ──────────────────
test('weak: 明示語が無いときだけ施設・装備の語で補う', () => {
  // 岸壁だけ → 海上
  assert.deepEqual(B.branchesOf({ title: 'イベント', place: '門司港西海岸1号岸壁' }), ['maritime']);
  // 明示語（駐屯地）があるので、岸壁があっても海上にはしない
  assert.deepEqual(
    B.branchesOf({ title: 'イベント', place: '朝霞駐屯地', notes: '岸壁' }),
    ['ground']
  );
});

test('判定材料が無ければ種別なし（推測しない）', () => {
  assert.deepEqual(B.branchesOf({ title: '公安職合同説明会' }), []);
  assert.deepEqual(B.branchesOf({ title: '' }), []);
  assert.deepEqual(B.branchesOf({}), []);
});

// ── 手動入力（運営）の branch を優先する ─────────────────────────
test('ev.branch があれば推定で上書きしない', () => {
  const ev = { title: '陸上自衛隊駐屯地見学', branch: ['air'] };
  assert.deepEqual(B.branchesOf(ev), ['air']);
  assert.equal(B.matchesBranch(ev, 'air'), true);
  assert.equal(B.matchesBranch(ev, 'ground'), false);
});

test('normalizeBranches: 未知の値と重複を落とす', () => {
  assert.deepEqual(B.normalizeBranches(['air', 'bogus', 'air', 'ground']), ['air', 'ground']);
  assert.deepEqual(B.normalizeBranches(['  maritime  ']), ['maritime']);
  assert.deepEqual(B.normalizeBranches([]), []);
  assert.deepEqual(B.normalizeBranches(null), []);
  assert.deepEqual(B.normalizeBranches('air'), []);
  assert.deepEqual(B.normalizeBranches([1, {}, null]), []);
});

test("matchesBranch: 'all' と未指定は常に true", () => {
  assert.equal(B.matchesBranch({ title: '説明会' }, 'all'), true);
  assert.equal(B.matchesBranch({ title: '説明会' }, ''), true);
  assert.equal(B.matchesBranch({ title: '説明会' }, 'bogus'), false);
});

// ── 実データでの誤判定チェック（日本語の一般語を拾わないこと） ──────
test('一般的なイベント名を誤って種別に振り分けない', () => {
  for (const t of [
    '自衛官募集説明会', '公務員合同説明会', '就職セミナー',
    '看護学生説明会', 'ガールズトーク', '個別相談会',
  ]) {
    assert.deepEqual(B.branchesOf({ title: t }), [], t);
  }
});

test('BRANCH_DEFS と BRANCH_VALUES / BRANCH_OPTIONS が一致する', () => {
  assert.deepEqual(B.BRANCH_DEFS.map(d => d.id), B.BRANCH_VALUES);
  assert.deepEqual(B.BRANCH_OPTIONS.map(o => o.id), B.BRANCH_VALUES);
  for (const o of B.BRANCH_OPTIONS) assert.ok(o.label, o.id);
});
