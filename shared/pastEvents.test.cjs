'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('./pastEvents.cjs');
const A = require('./authz.cjs');

const TODAY = '2026-06-30';
const acc = (raw) => A.normalizeAccount(raw);
const scope = A.canManageScope;

// ── 日付判定 ────────────────────────────────────────────────────
test('isPastEvent: date 昨日は過去 / 今日・未来は過去でない', () => {
  assert.equal(P.isPastEvent({ date: '2026-06-29' }, TODAY), true);
  assert.equal(P.isPastEvent({ date: '2026-06-30' }, TODAY), false); // 今日は過去にしない
  assert.equal(P.isPastEvent({ date: '2026-07-05' }, TODAY), false);
});
test('isPastEvent: endDate 基準（昨日=過去 / 今日=過去でない）', () => {
  assert.equal(P.isPastEvent({ date: '2026-06-20', endDate: '2026-06-29' }, TODAY), true);
  assert.equal(P.isPastEvent({ date: '2026-06-20', endDate: '2026-06-30' }, TODAY), false); // 開催日過去でも終了日が今日
});
test('isPastEvent: 不正日付は安全に false', () => {
  assert.equal(P.isPastEvent({ date: '2026-13-40' }, TODAY), false);
  assert.equal(P.isPastEvent({ date: '' }, TODAY), false);
  assert.equal(P.isPastEvent({ date: '2026-06-29' }, 'bad'), false);
});

// ── クエリ検証 ─────────────────────────────────────────────────
test('validatePastQuery: 既定値', () => {
  const r = P.validatePastQuery({});
  assert.equal(r.ok, true);
  assert.deepEqual({ limit: r.value.limit, offset: r.value.offset }, { limit: 50, offset: 0 });
});
test('validatePastQuery: 不正日付/limit/offset/status は400', () => {
  assert.equal(P.validatePastQuery({ from: '2026-02-30' }).status, 400);
  assert.equal(P.validatePastQuery({ to: '2026/01/01' }).status, 400);
  assert.equal(P.validatePastQuery({ from: '2026-06-10', to: '2026-06-01' }).status, 400);
  assert.equal(P.validatePastQuery({ limit: 0 }).status, 400);
  assert.equal(P.validatePastQuery({ limit: 101 }).status, 400);
  assert.equal(P.validatePastQuery({ limit: 'x' }).status, 400);
  assert.equal(P.validatePastQuery({ offset: -1 }).status, 400);
  assert.equal(P.validatePastQuery({ status: 'foo' }).status, 400);
});
test('validatePastQuery: 上限100', () => {
  assert.equal(P.validatePastQuery({ limit: 100 }).ok, true);
});

// ── データ統合・認可・ページング ────────────────────────────────
const scrapeData = {
  tokyo: [
    { id: 's1', pref: 'tokyo', date: '2026-06-29', title: '過去スクレイプ', place: 'X' },
    { id: 's2', pref: 'tokyo', date: '2026-07-10', title: '未来スクレイプ' },
  ],
  osaka: [{ id: 's3', pref: 'osaka', date: '2026-06-25', title: '大阪過去' }],
  updatedAt: '2026/06/30 20:00',
};
const manualEvents = [
  { id: 'manual-tokyo-1', pref: 'tokyo', office: 'shibuya', date: '2026-06-28', title: '渋谷手動過去', status: 'published', source_type: 'manual', updatedAt: '2026-06-28T00:00:00Z' },
  { id: 'manual-tokyo-2', pref: 'tokyo', office: 'shinjuku', date: '2026-06-27', title: '新宿手動過去', status: 'draft', source_type: 'manual' },
];
const overrides = { s1: { title: '上書き後タイトル', _at: '2026-06-29T10:00:00Z' } };

const build = (account, q = {}) => P.buildPastEvents({
  manualEvents, scrapeData, overrides, account,
  query: P.validatePastQuery(q).value, today: TODAY, canManageScope: scope,
});

test('national_admin: 全国の過去のみ（未来s2は除外）・override反映・source種別', () => {
  const r = build(acc({ user: 'n', pass: 'p', pref: '*' }));
  const ids = r.events.map(e => e.id);
  assert.deepEqual(ids, ['s1', 'manual-tokyo-1', 'manual-tokyo-2', 's3']); // effectiveDate 降順
  assert.equal(r.total, 4);
  assert.ok(!ids.includes('s2')); // 未来は対象外
  const s1 = r.events.find(e => e.id === 's1');
  assert.equal(s1.title, '上書き後タイトル'); // override 反映
  assert.equal(s1.source, 'scrape');
  assert.equal(r.events.find(e => e.id === 'manual-tokyo-1').source, 'manual');
});
test('pco_admin(tokyo): 自地本のみ（他地本s3除外・office不明s1は閲覧可）', () => {
  const r = build(acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' }));
  const ids = r.events.map(e => e.id).sort();
  assert.deepEqual(ids, ['manual-tokyo-1', 'manual-tokyo-2', 's1']);
  assert.ok(!ids.includes('s3'));
});
test('office_manager(tokyo/shibuya): 自officeのみ（別office・office不明は非表示）', () => {
  const r = build(acc({ user: 'm', pass: 'p', pref: 'tokyo', office: 'shibuya', role: 'office_manager' }));
  assert.deepEqual(r.events.map(e => e.id), ['manual-tokyo-1']); // shibuya のみ。s1(office不明)・manual2(shinjuku) 除外
});
test('クライアントの pref/office 改変では拡大しない（pco他地本フィルタ→空）', () => {
  // pco(tokyo) が pref=osaka を要求しても、スコープ後に絞り込むため自地本外は出ない
  const r = build(acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' }), { pref: 'osaka' });
  assert.equal(r.total, 0);
});
test('status / q / 期間フィルタ', () => {
  const nat = acc({ user: 'n', pass: 'p', pref: '*' });
  assert.deepEqual(build(nat, { status: 'published' }).events.map(e => e.id), ['manual-tokyo-1']);
  assert.deepEqual(build(nat, { q: '新宿' }).events.map(e => e.id), ['manual-tokyo-2']);
  assert.deepEqual(build(nat, { from: '2026-06-28' }).events.map(e => e.id), ['s1', 'manual-tokyo-1']);
});
test('ページング（limit/offset/hasMore）', () => {
  const nat = acc({ user: 'n', pass: 'p', pref: '*' });
  const p1 = build(nat, { limit: 2, offset: 0 });
  assert.deepEqual(p1.events.map(e => e.id), ['s1', 'manual-tokyo-1']);
  assert.equal(p1.hasMore, true);
  const p2 = build(nat, { limit: 2, offset: 2 });
  assert.deepEqual(p2.events.map(e => e.id), ['manual-tokyo-2', 's3']);
  assert.equal(p2.hasMore, false);
});
test('ID保持・重複なし', () => {
  const r = build(acc({ user: 'n', pass: 'p', pref: '*' }));
  const ids = r.events.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Boolean));
});

// ── scopeCount（空一覧の理由分類の根拠。自分の範囲の件数＝漏洩ではない） ──
test('scopeCount: 自分の権限範囲の過去イベント件数（フィルタ前）', () => {
  assert.equal(build(acc({ user: 'n', pass: 'p', pref: '*' })).scopeCount, 4); // 全国
  assert.equal(build(acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' })).scopeCount, 3);
  assert.equal(build(acc({ user: 'm', pass: 'p', pref: 'tokyo', office: 'shibuya', role: 'office_manager' })).scopeCount, 1);
});
test('scopeCount>0 だが filter で total=0 → filtered_empty の根拠', () => {
  // pco(tokyo) が osaka を要求：範囲には3件あるが条件一致0 → filtered_empty
  const r = build(acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' }), { pref: 'osaka' });
  assert.equal(r.scopeCount, 3);
  assert.equal(r.total, 0);
});
test('scopeCount=0 → empty_scope の根拠（範囲に過去イベントなし）', () => {
  // office_manager(tokyo/nerima)：一致office無し → 0
  const r = build(acc({ user: 'x', pass: 'p', pref: 'tokyo', office: 'nerima', role: 'office_manager' }));
  assert.equal(r.scopeCount, 0);
  assert.equal(r.total, 0);
});

// ── アーカイブ併合（events.json から7日超で外れた過去イベント） ──
const archiveEvents = [
  // ずっと昔の過去イベント（events.json には無い＝アーカイブのみ）
  { id: 'a1', pref: 'tokyo', office: '', date: '2026-01-15', title: '昔の東京過去', place: '会館', source_type: 'scrape' },
  { id: 'a2', pref: 'osaka', date: '2026-02-20', title: '昔の大阪過去', source_type: 'scrape' },
  // events.json にも同IDが残っている（新しい方=events.json を優先すべき）
  { id: 's1', pref: 'tokyo', date: '2026-06-29', title: 'アーカイブ側の古いタイトル', source_type: 'scrape' },
];
const buildA = (account, q = {}) => P.buildPastEvents({
  manualEvents, scrapeData, archiveEvents, overrides, account,
  query: P.validatePastQuery(q).value, today: TODAY, canManageScope: scope,
});

test('archive: national はアーカイブの過去イベントも閲覧できる', () => {
  const ids = buildA(acc({ user: 'n', pass: 'p', pref: '*' })).events.map(e => e.id).sort();
  // s1,s3,manual1,manual2（既存）＋ a1,a2（アーカイブ）。未来 s2 は除外
  assert.deepEqual(ids, ['a1', 'a2', 'manual-tokyo-1', 'manual-tokyo-2', 's1', 's3']);
});

test('archive: 同ID(s1)は events.json 側（新しい方）を優先し override も反映', () => {
  const r = buildA(acc({ user: 'n', pass: 'p', pref: '*' }));
  const s1 = r.events.find(e => e.id === 's1');
  assert.equal(s1.title, '上書き後タイトル'); // アーカイブの古いタイトルではなく override 適用後
});

test('archive: pco(osaka) は自地本のアーカイブのみ（a1東京は除外）', () => {
  const ids = buildA(acc({ user: 'p', pass: 'p', pref: 'osaka', role: 'pco_admin' })).events.map(e => e.id).sort();
  assert.deepEqual(ids, ['a2', 's3']);
});

test('archive: 期間フィルタはアーカイブにも効く', () => {
  const ids = buildA(acc({ user: 'n', pass: 'p', pref: '*' }), { to: '2026-03-01' }).events.map(e => e.id).sort();
  assert.deepEqual(ids, ['a1', 'a2']); // 2026-03-01 以前のみ
});

// ── 回帰: アーカイブ×検疫の同時動作（統合PR） ─────────────────────
// 検疫（isSuspiciousTitle）で公開を止めたイベントや不正タイトルが、
// アーカイブ経由で過去ログ・運営「過去イベント」に紛れ込まないこと。
const TQ = require('./titleQuality.cjs');

test('isArchivableEvent: 正常な過去イベントは退避可・検疫/不正/スタブは退避不可', () => {
  // 正常（退避可）
  assert.equal(TQ.isArchivableEvent({ id: 'x1', date: '2026-06-20', title: '自衛隊職場体験（岩手駐屯地）' }), true);
  assert.equal(TQ.isArchivableEvent({ id: 'x2', date: '2026-06-21', title: '県民の日' }), true); // イベント語なし固有名
  // 検疫対象（疑わしい）は退避不可 … 公開を止めたものを過去ログに残さない
  assert.equal(TQ.isArchivableEvent({ id: 'q1', date: '2026-06-22', title: '乗艦受付時刻' }), false);
  assert.equal(TQ.isArchivableEvent({ id: 'q2', date: '2026-06-23', title: '宮古港上空を航過' }), false);
  // 確実な不正（junk）は退避不可
  assert.equal(TQ.isArchivableEvent({ id: 'j1', date: '2026-06-24', title: '一般曹候補生' }), false);
  // office_notice スタブは退避不可
  assert.equal(TQ.isArchivableEvent({ id: 's1', date: '2026-06-25', title: '説明会', source_type: 'office_notice' }), false);
  // id/date/title 欠落は退避不可
  assert.equal(TQ.isArchivableEvent({ id: '', date: '2026-06-25', title: 'x' }), false);
  assert.equal(TQ.isArchivableEvent({ id: 'a', date: '', title: 'x' }), false);
});

test('回帰: 検疫対象を isArchivableEvent で弾いた後のアーカイブは過去タブに正しく併合される', () => {
  // アーカイブ候補（前回events.json相当）に検疫対象が混ざっているケース
  const candidates = [
    { id: 'ok1', pref: 'tokyo', date: '2026-05-10', title: '練馬駐屯地見学', place: 'X' },
    { id: 'bad1', pref: 'tokyo', date: '2026-05-11', title: '乗艦受付時刻' },      // 検疫対象
    { id: 'bad2', pref: 'tokyo', date: '2026-05-12', title: '岩手地本公式' },      // 検疫対象
  ];
  const archived = candidates.filter(TQ.isArchivableEvent);
  assert.deepEqual(archived.map(e => e.id), ['ok1']); // 検疫対象は退避されない
  // 退避されたアーカイブが過去タブ（buildPastEvents）に出る
  const r = P.buildPastEvents({
    manualEvents: [], scrapeData: { updatedAt: 'x' }, archiveEvents: archived, overrides: {},
    account: acc({ user: 'n', pass: 'p', pref: '*' }),
    query: P.validatePastQuery({}).value, today: TODAY, canManageScope: scope,
  });
  assert.deepEqual(r.events.map(e => e.id), ['ok1']);
  assert.ok(!r.events.some(e => /受付時刻|公式$/.test(e.title))); // 検疫対象が紛れていない
});
