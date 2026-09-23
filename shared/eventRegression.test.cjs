'use strict';
// shared/eventRegression.cjs のテスト。
// 実データ fixture（shared/fixtures/regression-prev.json / regression-next.json）は
// 2026-09-23 の事故（f39329d → 2eff48a）の該当イベントをそのまま切り出したもの。
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./eventRegression.cjs');
const { checkRegressions, isCountableEvent } = require('./dataQuality.cjs');

const TODAY = '2026-09-23';
const prevFixture = require('./fixtures/regression-prev.json');
const nextFixture = require('./fixtures/regression-next.json');

const base = (over = {}) => ({
  id: 't-1', pref: 'tokyo', date: '2026-10-19', title: '宇都宮駐屯地見学',
  place: '宇都宮駐屯地', address: '栃木県宇都宮市', time: '10:00～15:00',
  url: 'https://www.mod.go.jp/pco/tokyo/koutou/event.html', notes: '要事前申込。定員40名', ...over,
});
const loc = { latitude: 36.55, longitude: 139.85, label: '宇都宮駐屯地', accuracy: 'venue', source: 'gsi' };

// ── 空値の定義 ─────────────────────────────────────────────
test('isBlankValue: null/undefined/空/空白/"null"/"undefined" は空、0・"0"・false は空ではない', () => {
  for (const v of [null, undefined, '', '   ', 'null', 'UNDEFINED']) assert.equal(R.isBlankValue(v), true, JSON.stringify(v));
  for (const v of [0, '0', false, '10:00']) assert.equal(R.isBlankValue(v), false, JSON.stringify(v));
});

// ── TEST 1: 同一IDの time 消失 ─────────────────────────────
test('TEST1: 同一イベントの time が空になったら前回値を維持し、記録する', () => {
  const r = R.mergeNonRegressiveEvent(base(), base({ time: '' }), { today: TODAY });
  assert.equal(r.event.time, '10:00～15:00');
  assert.deepEqual(r.carried.map(c => [c.field, c.action]), [['time', 'carried_over']]);
});

// ── TEST 2: deadline / deadlineDate の組 ────────────────────
test('TEST2: deadline と deadlineDate が消えたら両方を維持する', () => {
  const prev = base({ deadline: '10月2日（金）', deadlineDate: '2026-10-02' });
  const next = base({ deadline: null, deadlineDate: null });
  const r = R.mergeNonRegressiveEvent(prev, next, { today: TODAY });
  assert.equal(r.event.deadline, '10月2日（金）');
  assert.equal(r.event.deadlineDate, '2026-10-02');
});

test('TEST2b: 締切の書き換え（別の日付）は公式の変更として尊重する', () => {
  const prev = base({ deadline: '10月2日（金）', deadlineDate: '2026-10-02' });
  const next = base({ deadline: '10月9日（金）' });
  const r = R.mergeNonRegressiveEvent(prev, next, { today: TODAY });
  assert.equal(r.event.deadline, '10月9日（金）');
  assert.equal(r.event.deadlineDate, undefined); // status 導出で付け直させる（古い日付を戻さない）
});

// ── TEST 3: ageRequirement ─────────────────────────────────
test('TEST3: ageRequirement が null になったら維持する', () => {
  const r = R.mergeNonRegressiveEvent(base({ ageRequirement: '18～32歳以下' }), base({ ageRequirement: null }), { today: TODAY });
  assert.equal(r.event.ageRequirement, '18～32歳以下');
});

// ── TEST 4 / 5: weatherLocation ─────────────────────────────
test('TEST4: 会場が同じなら消えた座標を維持する', () => {
  const r = R.mergeNonRegressiveEvent(base({ weatherLocation: loc }), base({ weatherLocation: null }), { today: TODAY });
  assert.deepEqual(r.event.weatherLocation, loc);
  assert.notEqual(r.event.weatherLocation, loc, '前回オブジェクトを共有しない（複製する）');
});

test('TEST5: 会場が変わったら古い座標を引き継がない', () => {
  const r = R.mergeNonRegressiveEvent(base({ weatherLocation: loc }), base({ place: '朝霞駐屯地', weatherLocation: null }), { today: TODAY });
  assert.equal(r.event.weatherLocation, null);
});

// ── TEST 8: cancelled ─────────────────────────────────────
test('TEST8: 中止になったイベントには古い公開値を戻さない', () => {
  const prev = base({ ageRequirement: '18歳以上' });
  const byStatus = R.mergeNonRegressiveEvent(prev, base({ time: '', ageRequirement: null, status: 'cancelled' }), { today: TODAY });
  assert.equal(byStatus.event.time, '');
  assert.equal(byStatus.skipped, 'cancelled');
  const byText = R.mergeNonRegressiveEvent(prev, base({ time: '', title: '宇都宮駐屯地見学（開催中止）' }), { today: TODAY });
  assert.equal(byText.event.time, '');
});

// ── TEST 13 / 14: notes ───────────────────────────────────
test('TEST13: 備考が完全に消えたら同一イベント・同一ソースなら維持する', () => {
  const r = R.mergeNonRegressiveEvent(base(), base({ notes: null }), { today: TODAY });
  assert.equal(r.event.notes, '要事前申込。定員40名');
});

test('TEST14: 備考の部分更新は結合しない（重要語の消失は検出する）', () => {
  const r = R.mergeNonRegressiveEvent(base(), base({ notes: '雨天決行' }), { today: TODAY });
  assert.equal(r.event.notes, '雨天決行');
  assert.deepEqual(R.lostNotesKeywords('要事前申込。定員40名', '雨天決行'), ['要申込', '事前申込', '定員'].filter(k => '要事前申込。定員40名'.includes(k)));
  const a = R.analyzeEventRegressions({ tokyo: [base()] }, { tokyo: [base({ notes: '雨天決行' })] }, { today: TODAY });
  assert.equal(a.notes.length, 1);
  assert.equal(a.fields.length, 0, 'notes の変化はエラー対象の項目回帰に含めない');
});

// ── 同一イベントの厳格判定 ─────────────────────────────────
test('別イベント（開催日・地本が違う、ソースもタイトルも違う）へは値を継承しない', () => {
  assert.equal(R.mergeNonRegressiveEvent(base(), base({ date: '2026-10-20', time: '' }), { today: TODAY }).event.time, '');
  assert.equal(R.mergeNonRegressiveEvent(base(), base({ pref: 'saitama', time: '' }), { today: TODAY }).event.time, '');
  const other = base({ url: 'https://example.jp/other.html', title: '朝霞駐屯地見学', time: '' });
  assert.equal(R.mergeNonRegressiveEvent(base(), other, { today: TODAY }).skipped, 'identity_mismatch');
});

test('公式が明示的に消した項目（時間未定・締切なし・年齢不問）は戻さない', () => {
  assert.equal(R.mergeNonRegressiveEvent(base(), base({ time: '', notes: '開始時間未定（決まり次第掲載）' }), { today: TODAY }).event.time, '');
  const dl = R.mergeNonRegressiveEvent(base({ deadline: '10月2日' }), base({ deadline: null, notes: '申込不要・当日参加可' }), { today: TODAY });
  assert.equal(dl.event.deadline, null);
  const age = R.mergeNonRegressiveEvent(base({ ageRequirement: '18歳以上' }), base({ ageRequirement: null, notes: '年齢不問' }), { today: TODAY });
  assert.equal(age.event.ageRequirement, null);
  // __fieldState でも明示できる
  const fs = R.mergeNonRegressiveEvent(base(), base({ time: '', __fieldState: { time: 'removed' } }), { today: TODAY });
  assert.equal(fs.event.time, '');
});

test('OCR の文字落ち（横須賀基地→横賀基地）は前回値へ戻す。先頭・末尾の短縮は変更として尊重', () => {
  assert.equal(R.isDegradedVariant('横須賀基地', '横賀基地'), true);
  assert.equal(R.isDegradedVariant('横須賀基地', '横須賀'), false);
  assert.equal(R.isDegradedVariant('横須賀基地', '横須賀基地'), false);
  const r = R.mergeNonRegressiveEvent(base({ place: '横須賀基地' }), base({ place: '横賀基地' }), { today: TODAY });
  assert.equal(r.event.place, '横須賀基地');
  assert.equal(r.carried[0].action, 'restored_degraded');
});

test('終了済みイベントは保護しない', () => {
  const r = R.mergeNonRegressiveEvent(base({ date: '2026-09-01' }), base({ date: '2026-09-01', time: '' }), { today: TODAY });
  assert.equal(r.event.time, '');
});

// ── TEST 6 / 7: 地本件数 ────────────────────────────────────
const yama = (n, date = '2026-09-26') => Array.from({ length: n }, (_, i) => ({ id: `y${i}`, pref: 'yamanashi', date, title: `広報活動 イベント${i}` }));

test('TEST6: 山梨 3 → 0 件は地本回帰エラー。公開前の引き継ぎで3件残り、記録される', () => {
  const prev = { yamanashi: yama(3) }, next = { yamanashi: [] };
  const alerts = R.analyzePrefCountRegressions(prev, next, { today: TODAY });
  assert.deepEqual(alerts.map(a => [a.pref, a.level, a.rule]), [['yamanashi', 'error', 'pref_zero']]);
  const { carried, alerts: ca } = R.carryOverVanishedPrefs(prev, next, { today: TODAY });
  assert.equal(carried.yamanashi.length, 3);
  assert.equal(ca[0].action, 'carried_over');
});

test('TEST7: 前回イベントがすべて開催済みになった自然減はエラーにしない', () => {
  const prev = { yamanashi: yama(3, '2026-09-20') }, next = { yamanashi: [] };
  assert.deepEqual(R.analyzePrefCountRegressions(prev, next, { today: TODAY }), []);
  assert.deepEqual(R.carryOverVanishedPrefs(prev, next, { today: TODAY }).carried, {});
});

test('地本件数: 1件→0件は対象外、5件以上の6割超減はエラー、3件以上の3割超減は警告', () => {
  assert.deepEqual(R.analyzePrefCountRegressions({ yamanashi: yama(1) }, { yamanashi: [] }, { today: TODAY }), []);
  const sharp = R.analyzePrefCountRegressions({ yamanashi: yama(10) }, { yamanashi: yama(3) }, { today: TODAY });
  assert.equal(sharp[0].rule, 'pref_sharp_drop');
  const warn = R.analyzePrefCountRegressions({ yamanashi: yama(4) }, { yamanashi: yama(2) }, { today: TODAY });
  assert.deepEqual(warn.map(a => [a.level, a.rule]), [['warning', 'pref_drop']]);
  assert.deepEqual(R.analyzePrefCountRegressions({ yamanashi: yama(4) }, { yamanashi: yama(3) }, { today: TODAY }), []);
});

test('地本件数: 品質ルール追加で正当に除外された前回分は数えない（isCountable）', () => {
  const prev = { okayama: [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, pref: 'okayama', date: '2026-10-01', title: `募集中 【種目${i}】募集` })),
    { id: 'ok', pref: 'okayama', date: '2026-10-03', title: '高等工科学校説明会' },
  ] };
  const next = { okayama: [{ id: 'ok', pref: 'okayama', date: '2026-10-03', title: '高等工科学校説明会' }] };
  assert.equal(R.analyzePrefCountRegressions(prev, next, { today: TODAY, isCountable: isCountableEvent }).length, 0);
});

// ── 消失イベントの分類 ─────────────────────────────────────
test('消失: 検疫・統合（同日で一方のタイトルが他方を含む）・品質除外・原因不明を分類する', () => {
  const prev = { yamanashi: [
    { id: 'a', pref: 'yamanashi', date: '2026-09-26', title: '広報活動 ふじざくらFC' },
    { id: 'b', pref: 'yamanashi', date: '2026-09-26', title: '上野原防災フェスタ' },
    { id: 'c', pref: 'yamanashi', date: '2026-09-27', title: '詳しくみる' },
    { id: 'd', pref: 'yamanashi', date: '2026-09-28', title: '富士急ハイランド防災フェス' },
  ] };
  const next = { yamanashi: [{ id: 'x', pref: 'yamanashi', date: '2026-09-26', title: 'ふじざくらＦＣ' }] };
  const m = R.analyzeMissingEvents(prev, next, { today: TODAY, quarantineIds: new Set(['b']), isCountable: isCountableEvent });
  assert.deepEqual(Object.fromEntries(m.map(x => [x.id, x.reason])), { a: 'merged', b: 'quarantined', c: 'filtered', d: 'unexplained' });
});

test('消失: 同じ地本で原因不明の消失が3件以上かつ3割以上ならエラー、それ未満は警告', () => {
  const prev = { hyogo: Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, pref: 'hyogo', date: '2026-10-10', title: `説明会${i}` })) };
  const lose3 = R.analyzeMissingEvents(prev, { hyogo: prev.hyogo.slice(3) }, { today: TODAY });
  assert.equal(R.summarizeMissingByPref(lose3, prev, { today: TODAY })[0].level, 'error');
  const lose1 = R.analyzeMissingEvents(prev, { hyogo: prev.hyogo.slice(1) }, { today: TODAY });
  assert.equal(R.summarizeMissingByPref(lose1, prev, { today: TODAY })[0].level, 'warning');
});

// ── 全国総数 ───────────────────────────────────────────────
test('全国総数: 20%以上減で警告、35%以上減でエラー', () => {
  assert.equal(R.analyzeTotalDrop(100, 85), null);
  assert.equal(R.analyzeTotalDrop(100, 80).level, 'warning');
  assert.equal(R.analyzeTotalDrop(100, 65).level, 'error');
  assert.equal(R.analyzeTotalDrop(0, 10), null);
});

// ── 実データ fixture（2026-09-23 事故） ──────────────────────
test('実データ: 事故時の差分を CI が項目単位・地本単位で検出する', () => {
  const errors = [], warnings = [];
  const r = checkRegressions(prevFixture, nextFixture, { today: TODAY }, errors, warnings);
  const has = (re) => errors.some(e => re.test(e));
  assert.ok(has(/\[yamanashi\] 未終了イベントが 3 → 0（pref_zero）/));
  assert.ok(has(/\[tokyo:t-20261019-oyo8x\] time が消失: "10:00～15:00" -> ""/), '宇都宮駐屯地見学');
  assert.ok(has(/\[tokyo:t-20260929-4e639\] time が消失/), '習志野駐屯地見学');
  for (const f of ['ageRequirement', 'deadline', 'deadlineDate']) {
    assert.ok(has(new RegExp(`\\[saitama:s-20261103-ld6it\\] ${f} が消失`)), `入間航空祭 ${f}`);
    assert.ok(has(new RegExp(`\\[saitama:s-20261121-5372q\\] ${f} が消失`)), `音楽まつり ${f}`);
  }
});

test('実データ: 公開前の保護を通すと、事故の項目がすべて前回値で残る', () => {
  const next = JSON.parse(JSON.stringify(nextFixture));
  const { carried } = R.carryOverVanishedPrefs(prevFixture, next, { today: TODAY });
  for (const [pref, evs] of Object.entries(carried)) next[pref] = [...next[pref], ...evs];
  const prevIdx = R.buildEventIndex(prevFixture);
  for (const k of ['tokyo', 'saitama', 'yamanashi']) {
    next[k] = next[k].map(ev => R.mergeNonRegressiveEvent(prevIdx.get(ev.id), ev, { today: TODAY }).event);
  }
  const byId = R.buildEventIndex(next);
  assert.equal(next.yamanashi.length, 3);
  assert.equal(byId.get('t-20261019-oyo8x').time, '10:00～15:00');
  assert.equal(byId.get('t-20260929-4e639').time, '10:00～15:00');
  assert.equal(byId.get('s-20261103-ld6it').deadline, '10月2日（金）');
  assert.equal(byId.get('s-20261103-ld6it').ageRequirement, '18～32歳以下');
  assert.equal(byId.get('s-20261121-5372q').deadlineDate, '2026-10-07');
  // 改善された値（音楽まつりの「第3回公演」付き時刻）は前回値で潰さない
  assert.equal(byId.get('s-20261121-5372q').time, '09:30～11:20（第3回公演）');
  // 保護後の公開データは CI の項目回帰エラーにならない
  const errors = [];
  checkRegressions(prevFixture, next, { today: TODAY }, errors, []);
  assert.deepEqual(errors, []);
});

test('保護と CI 判定は一致する: 保護後の公開データは「保護すべき消失」を含まない（締切の文言変更は正当な変更）', () => {
  const cases = [
    [base({ deadline: '10月2日（金）', deadlineDate: '2026-10-02' }), base({ deadline: '定員になり次第締切', deadlineDate: null })],
    [base({ weatherLocation: loc }), base({ place: '朝霞駐屯地', weatherLocation: null })],
    [base({ ageRequirement: '18歳以上' }), base({ ageRequirement: null, notes: '年齢不問' })],
    [base(), base({ time: '', status: 'cancelled' })],
    [base({ time: '10:00', ageRequirement: '18歳以上', deadline: '10月2日', deadlineDate: '2026-10-02', weatherLocation: loc }),
      base({ time: '', ageRequirement: null, deadline: null, deadlineDate: null, weatherLocation: null })],
  ];
  for (const [p, n] of cases) {
    const merged = R.mergeNonRegressiveEvent(p, n, { today: TODAY }).event;
    const r = R.analyzeEventRegressions({ tokyo: [p] }, { tokyo: [merged] }, { today: TODAY });
    assert.deepEqual(r.fields.filter(x => x.protectable), [], JSON.stringify(n));
  }
});

test('内部メタデータ（__ で始まる項目）は公開データから除く', () => {
  assert.deepEqual(R.stripInternalFields({ id: 'a', __fieldState: { time: 'removed' }, __llmUnverified: 'x', title: 't' }), { id: 'a', title: 't' });
});
