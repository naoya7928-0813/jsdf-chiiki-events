'use strict';
// shared/eventGuide.cjs のテスト（FAQ・参加準備ガイドの純粋ロジック）
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./eventGuide.cjs');

test('normalizeFaqInput: 並び順を保ち、空行は捨て、片方だけの行は拒否する', () => {
  const r = G.normalizeFaqInput([
    { q: '事前予約は必要ですか？', a: '必要です（公式案内より）' },
    { q: '', a: '' },
    { q: '一人でも参加できますか？', a: 'できます', public: false },
  ]);
  assert.deepEqual(r.faq.map(x => x.q), ['事前予約は必要ですか？', '一人でも参加できますか？']);
  assert.equal(r.faq[1].public, false);
  assert.match(r.faq[0].id, /^faq-/);
  assert.match(G.normalizeFaqInput([{ q: '質問だけ', a: '' }]).error, /両方/);
  assert.match(G.normalizeFaqInput('x').error, /形式/);
  assert.match(G.normalizeFaqInput(Array.from({ length: 21 }, (_, i) => ({ q: `q${i}`, a: 'a' }))).error, /20/);
});

test('normalizeFaqInput: HTML・制御文字・長さを無害化。既存IDは維持', () => {
  const r = G.normalizeFaqInput([{ id: 'faq-abcdef12', q: '<b>質問</b>​', a: 'あ'.repeat(1000) }]);
  assert.equal(r.faq[0].id, 'faq-abcdef12');
  assert.ok(!/[<>]/.test(r.faq[0].q));
  assert.ok(!r.faq[0].q.includes('​'));
  assert.equal(r.faq[0].a.length, G.LIMITS.answer);
});

test('normalizeGuideInput: 未知の項目・状態は捨て、確認済みは本文必須、該当なしは本文を持たない', () => {
  const r = G.normalizeGuideInput({
    fee: { state: 'confirmed', text: '無料' },
    parking: { state: 'na', text: '書いても捨てる' },
    rain: { state: 'unknown', text: '' },
    evil: { state: 'confirmed', text: 'x' },
    photo: { state: 'weird', text: '撮影可' },
  });
  assert.deepEqual(r.guide, { fee: { state: 'confirmed', text: '無料' }, parking: { state: 'na', text: '' }, photo: { state: 'unknown', text: '撮影可' } });
  assert.match(G.normalizeGuideInput({ belongings: { state: 'confirmed', text: '' } }).error, /持ち物/);
});

test('publicFaq / publicGuide: 非公開のFAQ・未確認の項目は出さない（推測で補わない）', () => {
  const faq = G.normalizeFaqInput([{ q: 'Q1', a: 'A1' }, { q: 'Q2', a: 'A2', public: false }]).faq;
  assert.deepEqual(G.publicFaq(faq).map(x => x.q), ['Q1']);
  const pg = G.publicGuide({ fee: { state: 'confirmed', text: '無料' }, parking: { state: 'na' }, rain: { state: 'unknown', text: 'メモ' } });
  assert.deepEqual(pg.map(x => [x.label, x.text]), [['参加費', '無料'], ['駐車場', '該当なし']]);
});

test('toPublicRecord: 公開分だけに置き換え、空なら項目ごと消す', () => {
  const rec = { title: 'x', faq: [{ id: 'faq-abcdef12', q: 'Q', a: 'A', public: false }], guide: { rain: { state: 'unknown', text: 'm' } }, guideUpdatedAt: 't' };
  assert.deepEqual(G.toPublicRecord(rec), { title: 'x' });
  const rec2 = { faq: [{ id: 'faq-abcdef12', q: 'Q', a: 'A', public: true }] };
  assert.deepEqual(G.toPublicRecord(rec2).faq, [{ id: 'faq-abcdef12', q: 'Q', a: 'A' }]);
});

test('sanitizePublicFaq / sanitizePublicGuide: 壊れた配信データで描画を落とさない', () => {
  assert.deepEqual(G.sanitizePublicFaq(null), []);
  assert.deepEqual(G.sanitizePublicFaq([1, { q: 'Q' }, { q: 'Q', a: 'A' }]).length, 1);
  assert.deepEqual(G.sanitizePublicGuide([{ id: 'fee', state: 'confirmed', text: '' }, { id: 'parking', state: 'na' }, { id: 'zzz', state: 'na' }]).map(x => x.id), ['parking']);
});
