'use strict';
/**
 * scraper/lib/ocrModel.js のテスト（npm test の shared/*.test.cjs glob で実行）
 *
 * ここが壊れると OCR 層が丸ごと無言で死ぬ（2026-07-17 Groq / 2026-08-11 Gemini の
 * モデル廃止で実際に起きた）。分岐を全て固定しておく。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { OcrModelResolver, isModelGoneError } = require('../scraper/lib/ocrModel');

/** ログを飲み込むダミー */
const quiet = { log() {}, warn() {} };

const make = (candidates, available, opts = {}) => {
  let calls = 0;
  const resolver = new OcrModelResolver({
    provider: 'test',
    candidates,
    listModels: async () => { calls++; return typeof available === 'function' ? available() : available; },
    logger: opts.logger || quiet,
  });
  return { resolver, calls: () => calls };
};

test('実在する候補のうち先頭のものを選ぶ', async () => {
  const { resolver } = make(['a', 'b', 'c'], ['x', 'b', 'c']);
  assert.equal(await resolver.resolve(), 'b');
});

test('env 由来の先頭候補が最優先される', async () => {
  const { resolver } = make(['env-model', 'default-model'], ['default-model', 'env-model']);
  assert.equal(await resolver.resolve(), 'env-model');
});

test('falsy な候補（env 未設定）は無視される', async () => {
  const { resolver } = make([undefined, '', 'real'], ['real']);
  assert.equal(await resolver.resolve(), 'real');
});

test('解決結果はキャッシュされ models API は1回しか呼ばれない', async () => {
  const { resolver, calls } = make(['a'], ['a']);
  await resolver.resolve();
  await resolver.resolve();
  await resolver.resolve();
  assert.equal(calls(), 1);
});

test('models API が引けないときは先頭候補で試す（従来挙動に劣化）', async () => {
  const { resolver } = make(['a', 'b'], null);
  assert.equal(await resolver.resolve(), 'a');
});

test('models API は引けたが候補が全滅なら null（404を量産しない）', async () => {
  const { resolver } = make(['old-1', 'old-2'], ['new-1', 'new-2']);
  assert.equal(await resolver.resolve(), null);
});

test('markDead で次の候補へ切り替わる', async () => {
  const { resolver } = make(['a', 'b'], ['a', 'b']);
  assert.equal(await resolver.resolve(), 'a');
  resolver.markDead('a');
  assert.equal(await resolver.resolve(), 'b');
});

test('候補を全て markDead したら null を返して打ち止めになる', async () => {
  const { resolver, calls } = make(['a', 'b'], ['a', 'b']);
  assert.equal(await resolver.resolve(), 'a');
  resolver.markDead('a');
  assert.equal(await resolver.resolve(), 'b');
  resolver.markDead('b');
  assert.equal(await resolver.resolve(), null);
  // 候補が尽きたら models API を叩き直さない（無駄打ちしない）
  const before = calls();
  assert.equal(await resolver.resolve(), null);
  assert.equal(calls(), before);
});

test('markDead(null) は何もしない', async () => {
  const { resolver } = make(['a'], ['a']);
  assert.equal(await resolver.resolve(), 'a');
  resolver.markDead(null);
  assert.equal(await resolver.resolve(), 'a');
});

test('候補が空なら models API を呼ばずに null', async () => {
  const { resolver, calls } = make([], ['a']);
  assert.equal(await resolver.resolve(), null);
  assert.equal(calls(), 0);
});

test('空配列の一覧は「引けなかった」扱いにして先頭候補で試す', async () => {
  const { resolver } = make(['a'], []);
  assert.equal(await resolver.resolve(), 'a');
});

test('候補全滅時は利用可能な一覧を警告に出す（原因が追えるように）', async () => {
  const warns = [];
  const { resolver } = make(['old'], ['new-a', 'new-b'], {
    logger: { log() {}, warn: (m) => warns.push(m) },
  });
  await resolver.resolve();
  assert.equal(warns.length, 1);
  assert.match(warns[0], /new-a/);
  assert.match(warns[0], /old/);
});

test('isModelGoneError: 実際に観測したエラー本文を廃止と判定する', () => {
  // 2026-07-17 Groq
  assert.equal(isModelGoneError(404,
    '{"error":{"message":"The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist"}}'), true);
  // 2026-08-11 Gemini
  assert.equal(isModelGoneError(404,
    '{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available"}}'), true);
  // 本文だけで判定できるケース（ステータスが 400 でも拾う）
  assert.equal(isModelGoneError(400, 'model_not_found'), true);
  assert.equal(isModelGoneError(400, 'has been decommissioned'), true);
});

test('isModelGoneError: 一時的な障害はモデル廃止と誤判定しない', () => {
  assert.equal(isModelGoneError(429, 'rate limit exceeded'), false);
  assert.equal(isModelGoneError(500, 'internal server error'), false);
  assert.equal(isModelGoneError(401, 'invalid api key'), false);
  assert.equal(isModelGoneError(400, 'image too large'), false);
});
