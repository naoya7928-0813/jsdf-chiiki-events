'use strict';
// shared/eventChanges.cjs のテスト（変更・中止のお知らせの純粋ロジック）
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./eventChanges.cjs');

const NOW = '2026-10-13T10:00:00.000Z';

test('buildChangeEntry: 中止・延期は理由が必須。日時/会場変更は変更後の内容が必須', () => {
  assert.match(C.buildChangeEntry({ type: 'cancelled' }).error, /理由/);
  assert.match(C.buildChangeEntry({ type: 'postponed', reason: '' }).error, /理由/);
  assert.match(C.buildChangeEntry({ type: 'datetime', reason: '都合' }).error, /変更後/);
  assert.match(C.buildChangeEntry({ type: 'venue' }).error, /変更後/);
  assert.match(C.buildChangeEntry({ type: 'nope' }).error, /種別/);
  const ok = C.buildChangeEntry({ type: 'cancelled', reason: '台風接近のため', public: true }, { by: 'OP-1', now: NOW });
  assert.equal(ok.entry.type, 'cancelled');
  assert.equal(ok.entry.public, true);
  assert.equal(ok.entry.by, 'OP-1');
  assert.match(ok.entry.id, /^chg-[a-z0-9]{6,20}$/);
});

test('buildChangeEntry: 通知は「公開」「通知対象の種別」「確認済みの根拠」がそろったときだけ', () => {
  const base = { type: 'cancelled', reason: '台風', notify: true };
  assert.match(C.buildChangeEntry({ ...base, public: false }).error, /公開/);
  assert.match(C.buildChangeEntry({ ...base, public: true }).error, /根拠/);
  assert.match(C.buildChangeEntry({ ...base, public: true, evidence: 'https://example.jp' }).error, /根拠/); // 確認チェックなし
  assert.match(C.buildChangeEntry({ ...base, public: true, confirmed: true }).error, /根拠/);             // 根拠なし
  assert.match(C.buildChangeEntry({ type: 'content', after: '内容', public: true, notify: true, evidence: 'x', confirmed: true }).error, /通知の対象外/);
  const ok = C.buildChangeEntry({ ...base, public: true, evidence: 'https://www.mod.go.jp/pco/x', confirmed: true });
  assert.equal(ok.entry.notify, true);
});

test('buildChangeEntry: HTML・制御文字・長すぎる入力を無害化する', () => {
  const r = C.buildChangeEntry({ type: 'notice', after: '<script>alert(1)</script>​重要' + 'あ'.repeat(500), public: true });
  assert.ok(!/[<>]/.test(r.entry.after));
  assert.ok(!r.entry.after.includes('​'));
  assert.ok(r.entry.after.length <= C.LIMITS.after);
});

test('normalizeApply: 日時変更の反映値を検証する', () => {
  assert.deepEqual(C.normalizeApply('datetime', { date: '2026-10-26', time: '10:00～15:00' }).apply, { date: '2026-10-26', time: '10:00～15:00' });
  assert.match(C.normalizeApply('datetime', { date: '2026-02-30' }).error, /開催日/);
  assert.match(C.normalizeApply('datetime', { date: '2026-10-26', endDate: '2026-10-25' }).error, /終了日/);
  assert.match(C.normalizeApply('datetime', { time: '朝から' }).error, /時間/);
  // 会場変更では日時は受け付けない（種別外の項目は無視）
  assert.deepEqual(C.normalizeApply('venue', { place: '新会場', date: '2026-10-26' }).apply, { place: '新会場' });
  assert.match(C.normalizeApply('venue', { place: '' }).error, /会場/);
});

test('applyChange: 種別に連動して開催状況が変わり、日時変更では状態を変えない', () => {
  const ev = { id: 'x', status: 'published', date: '2026-10-19' };
  const c1 = C.buildChangeEntry({ type: 'cancelled', reason: '台風', public: true }, { now: NOW }).entry;
  assert.equal(C.applyChange(ev, c1).status, 'cancelled');
  const c2 = C.buildChangeEntry({ type: 'datetime', after: '10/26', public: true }, { now: NOW }).entry;
  const next = C.applyChange(ev, c2, { date: '2026-10-26' });
  assert.equal(next.status, 'published');
  assert.equal(next.date, '2026-10-26');
  assert.equal(next.changes.length, 1);
  const c3 = C.buildChangeEntry({ type: 'resumed', reason: '誤り訂正', public: false }, { now: NOW }).entry;
  assert.equal(C.applyChange({ ...ev, status: 'cancelled' }, c3).status, 'published');
});

test('publicChanges: 非公開・根拠・操作者は出さない（新しい順）', () => {
  const a = C.buildChangeEntry({ type: 'datetime', after: 'A', public: true, evidence: '電話で確認', confirmed: true }, { by: 'OP', now: '2026-10-01T00:00:00Z' }).entry;
  const b = C.buildChangeEntry({ type: 'venue', after: 'B', public: false }, { now: '2026-10-02T00:00:00Z' }).entry;
  const c = C.buildChangeEntry({ type: 'notice', after: 'C', public: true }, { now: '2026-10-03T00:00:00Z' }).entry;
  const pub = C.publicChanges([a, b, c]);
  assert.deepEqual(pub.map(x => x.after), ['C', 'A']);
  for (const x of pub) {
    assert.equal(x.evidence, undefined);
    assert.equal(x.by, undefined);
    assert.equal(x.public, undefined);
  }
});

test('setChangeVisibility / removeChange', () => {
  const e = C.buildChangeEntry({ type: 'notice', after: 'お知らせ', public: true }, { now: NOW }).entry;
  const t = { status: 'published', changes: [e] };
  assert.equal(C.setChangeVisibility(t, e.id, false).changes[0].public, false);
  assert.equal(C.setChangeVisibility(t, 'chg-nothere00', false), null);
  const r = C.removeChange({ status: 'cancelled', changes: [e] }, e.id);
  assert.equal(r.next.changes.length, 0);
  assert.equal(r.next.status, 'cancelled', '取り消しでは開催状況を戻さない');
});

test('changeFlags / publicChangeFlags: 一覧カードの印', () => {
  const dt = C.buildChangeEntry({ type: 'datetime', after: 'x', public: true }, { now: NOW }).entry;
  const vHidden = C.buildChangeEntry({ type: 'venue', after: 'y', public: false }, { now: NOW }).entry;
  const f = C.changeFlags({ status: 'postponed', changes: [dt, vHidden] });
  assert.deepEqual(f, { cancelled: false, postponed: true, datetime: true, venue: false, notice: false });
  // 公開APIの形（public フラグなし）からも同じ判定ができる
  const pf = C.publicChangeFlags({ status: 'cancelled', changes: C.publicChanges([dt]) });
  assert.equal(pf.cancelled, true);
  assert.equal(pf.datetime, true);
});

test('sanitizePublicChanges: 壊れたデータで描画を落とさない', () => {
  assert.deepEqual(C.sanitizePublicChanges(null), []);
  assert.deepEqual(C.sanitizePublicChanges([null, 1, { type: 'evil' }, { type: 'notice', after: 123 }]).map(x => x.type), ['notice']);
});

test('buildChangeNotification: タイトルに種別、URLは自サイトのイベント詳細', () => {
  const e = C.buildChangeEntry({ type: 'cancelled', reason: '台風接近のため', public: true }, { now: NOW }).entry;
  const n = C.buildChangeNotification({ id: 'tk-1', title: '宇都宮駐屯地見学' }, e);
  assert.equal(n.title, '【開催中止】宇都宮駐屯地見学');
  assert.equal(n.body, '台風接近のため');
  assert.equal(n.url, '/event/tk-1');
  assert.equal(n.tag, `change-${e.id}`);
});

test('describeBefore: 管理画面の「変更前」の初期値', () => {
  const ev = { date: '2026-10-19', endDate: '2026-10-20', time: '10:00～15:00', place: '宇都宮駐屯地', address: '栃木県' };
  assert.equal(C.describeBefore('datetime', ev), '2026-10-19〜2026-10-20 10:00～15:00');
  assert.equal(C.describeBefore('venue', ev), '宇都宮駐屯地 / 栃木県');
  assert.equal(C.describeBefore('notice', ev), '');
});
