'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('./eventStatus.cjs');

// ── 中止(cancelled)判定 ────────────────────────────────────────────
test('cancelled: 確定中止の文言', () => {
  for (const t of [
    '本イベントは中止となりました',
    '開催中止のお知らせ',
    '7月10日の開催を中止します',
    '中止のお知らせ',
    '本行事は中止いたします',
  ]) {
    assert.equal(S.detectCancelled(t).cancelled, true, t);
  }
});

test('cancelled: 条件付き注意書きは中止にしない（誤判定防止）', () => {
  for (const t of [
    '天候等により中止の場合があります',
    '中止または変更となる場合があります',
    '状況により中止する可能性があります',
    '荒天時中止',
    '中止の場合あり',
    '雨天中止',
    '荒天の場合は中止となる場合があります',
  ]) {
    const r = S.detectCancelled(t);
    assert.equal(r.cancelled, false, `should NOT cancel: ${t}`);
    assert.equal(r.conditionalOnly, true, `should be conditional: ${t}`);
  }
});

test('cancelled: 条件付き＋確定が混在なら確定を優先', () => {
  assert.equal(S.detectCancelled('荒天時中止。なお本イベントは中止となりました').cancelled, true);
});

// ── 受付終了/募集終了(closed)判定 ─────────────────────────────────
test('closed: 確定受付終了の文言', () => {
  for (const t of [
    '7月10日をもって受付を終了しました',
    '定員に達したため受付終了',
    '募集を終了しました',
    '申込みを締め切りました',
    '応募を締め切りました',
  ]) {
    assert.equal(S.detectClosedText(t).closed, true, t);
  }
});

test('closed: 当日の受付デスク終了「時刻」は closed にしない（実データ回帰）', () => {
  // 「時間：11:00〜16:00 (15:40受付終了)」= 当日受付時刻であって申込締切ではない
  assert.equal(S.detectClosedText('時間：11:00～16:00 (15:40受付終了) 内容：説明').closed, false);
  assert.equal(S.detectClosedText('受付終了 16:00').closed, false);
});

test('closed: 「受付終了の可能性有」等の条件付きは closed にしない（実データ回帰）', () => {
  assert.equal(S.detectClosedText('無料・予約優先（定員に達した場合、受付終了の可能性有）').closed, false);
  assert.equal(S.detectClosedText('混雑時は受付を終了する場合があります').closed, false);
});

test('closed: 受付継続中の文言は closed にしない（誤判定防止）', () => {
  for (const t of [
    '定員に達し次第締切',
    '締切予定',
    '応募締切を延長しました',
    '受付期間を延長します',
    '応募締切を7月10日から7月20日に延長しました',
  ]) {
    assert.equal(S.detectClosedText(t).closed, false, `should NOT close: ${t}`);
  }
});

// ── 締切日解決 ────────────────────────────────────────────────────
test('deadline: 明示年（令和/西暦）はその年を採用', () => {
  assert.equal(S.resolveDeadlineDate('令和8年7月2日(木)まで', '2026-07-10').date, '2026-07-02');
  assert.equal(S.resolveDeadlineDate('2026年7月10日', '2026-07-20').date, '2026-07-10');
});

test('deadline: 年なしは開催日から年を解決', () => {
  // 2026-07-20 開催、締切「7月10日」→ 2026-07-10
  assert.equal(S.resolveDeadlineDate('7月10日', '2026-07-20').date, '2026-07-10');
});

test('deadline: 年跨ぎ（12月締切→翌1月開催）', () => {
  // 2026-01-10 開催、締切「12月20日」→ 前年 2025-12-20
  assert.equal(S.resolveDeadlineDate('12月20日', '2026-01-10').date, '2025-12-20');
});

test('deadline: 曜日不整合は reliable=false', () => {
  // 2026-07-10 は金曜。「7月10日（月）」は不整合。
  const r = S.resolveDeadlineDate('7月10日（月）', '2026-07-20');
  assert.equal(r.date, '2026-07-10');
  assert.equal(r.reliable, false);
});

test('deadline: 曜日整合は reliable=true', () => {
  const r = S.resolveDeadlineDate('7月10日（金）', '2026-07-20'); // 2026-07-10 は金
  assert.equal(r.reliable, true);
});

test('deadline: なし/null/空 は date=null', () => {
  assert.equal(S.resolveDeadlineDate('なし', '2026-07-20').date, null);
  assert.equal(S.resolveDeadlineDate('null', '2026-07-20').date, null);
  assert.equal(S.resolveDeadlineDate('', '2026-07-20').date, null);
});

test('deadline: 年なしで開催日も無ければ現在年を機械付与しない', () => {
  assert.equal(S.resolveDeadlineDate('7月10日', '').date, null);
});

test('deadline: OCR由来の空白・改行・全角数字を許容', () => {
  assert.equal(S.resolveDeadlineDate('  ７月\n１０日（金）', '2026-07-20').date, '2026-07-10');
});

test('deadline: 存在しない日付は null', () => {
  assert.equal(S.resolveDeadlineDate('2月30日', '2026-03-01').date, null);
});

// ── deriveStatus 統合 ─────────────────────────────────────────────
const TODAY = '2026-07-15';

test('deriveStatus: 中止確定 → cancelled', () => {
  const r = S.deriveStatus({ text: '本イベントは中止となりました', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.confidence, 'high');
});

test('deriveStatus: 条件付き中止のみ → published', () => {
  const r = S.deriveStatus({ text: '荒天時中止', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'published');
});

test('deriveStatus: 受付終了告知 → closed', () => {
  const r = S.deriveStatus({ text: '定員に達したため受付終了', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'closed');
});

test('deriveStatus: 締切日経過（信頼できる）→ closed', () => {
  // 締切 7月10日（金・整合）、today 7月15日 → 経過 → closed
  const r = S.deriveStatus({ text: '', deadline: '7月10日（金）', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'closed');
  assert.equal(r.statusReason, '締切日経過');
  assert.equal(r.deadlineDate, '2026-07-10');
});

test('deriveStatus: 締切前 → published', () => {
  const r = S.deriveStatus({ text: '', deadline: '7月20日（月）', eventDate: '2026-07-25', today: TODAY });
  assert.equal(r.status, 'published');
});

test('deriveStatus: 締切日の曜日不整合は自動closedにしない', () => {
  // 「7月10日（月）」は不整合 → reliable=false → 自動closedしない
  const r = S.deriveStatus({ text: '', deadline: '7月10日（月）', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'published');
});

test('deriveStatus: 定員に達し次第締切 は closed にしない', () => {
  const r = S.deriveStatus({ text: '定員に達し次第締切', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'published');
});

test('deriveStatus: 締切日が開催日より1年以上前（誤読/古い年）は自動closedしない', () => {
  // 令和6年(2024)締切だが開催2026 → 不自然 → published のまま
  const r = S.deriveStatus({ text: '', deadline: '令和6年7月15日（水）', eventDate: '2026-07-20', today: TODAY });
  assert.equal(r.status, 'published');
});

// ── mergeStatus（状態の粘着性） ───────────────────────────────────
test('mergeStatus: cancelled は published へ戻さない', () => {
  const r = S.mergeStatus('cancelled', { status: 'published', statusReason: '' });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.sticky, true);
});

test('mergeStatus: closed → published は closed 維持、closed → cancelled は cancelled', () => {
  assert.equal(S.mergeStatus('closed', { status: 'published', statusReason: '' }).status, 'closed');
  assert.equal(S.mergeStatus('closed', { status: 'cancelled', statusReason: '中止告知' }).status, 'cancelled');
});

test('mergeStatus: published → closed は素直に反映', () => {
  assert.equal(S.mergeStatus('published', { status: 'closed', statusReason: '受付終了告知' }).status, 'closed');
});

test('STATUS_VALUES は published/closed/cancelled/draft のみ', () => {
  assert.deepEqual([...S.STATUS_VALUES].sort(), ['cancelled', 'closed', 'draft', 'published']);
});
