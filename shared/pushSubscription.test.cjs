'use strict';
// 送信に使える購読かの判定（api/_push.js の usableSubscription）。
// 購読先の検査を入れる前に保存された不正な値（endpoint が "test"）が残り、通知のたびに失敗し続けていた（2026-06〜10）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// @upstash/redis のコンストラクタ用ダミー（本テストでは redis を使わない）
process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';

const push = () => import('../api/_push.js');
const VALID = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
};

test('正規の購読は JSON 文字列でもオブジェクトでも通す', async () => {
  const { usableSubscription } = await push();
  assert.deepStrictEqual(usableSubscription(JSON.stringify(VALID)), VALID);
  assert.deepStrictEqual(usableSubscription(VALID), VALID);
  for (const ep of ['https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://db5.notify.windows.com/x']) {
    assert.ok(usableSubscription({ ...VALID, endpoint: ep }), ep);
  }
});

test('本番に残っていた endpoint "test" は使えない', async () => {
  const { usableSubscription } = await push();
  assert.strictEqual(usableSubscription(JSON.stringify({ ...VALID, endpoint: 'test' })), null);
});

test('正規のプッシュサービス以外・http・鍵の欠落・壊れた JSON は使えない', async () => {
  const { usableSubscription } = await push();
  const bad = [
    { ...VALID, endpoint: 'https://evil.example.com/push' },
    { ...VALID, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' },
    { ...VALID, endpoint: undefined },
    { ...VALID, keys: { p256dh: VALID.keys.p256dh } },
    { ...VALID, keys: { auth: VALID.keys.auth } },
    { ...VALID, keys: { p256dh: '', auth: '' } },
    { ...VALID, keys: undefined },
  ];
  for (const b of bad) assert.strictEqual(usableSubscription(b), null, JSON.stringify(b));
  for (const raw of ['{broken', '', null, undefined, 42, '"str"', '[]']) {
    assert.strictEqual(usableSubscription(raw), null, String(raw));
  }
});

test('通知API・見守り通知は送信前に usableSubscription を通している', () => {
  const notify = fs.readFileSync(path.join(__dirname, '..', 'api', 'notify.js'), 'utf8');
  const pushSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_push.js'), 'utf8');
  assert.ok(/usableSubscription\(raw\)/.test(notify), 'notify.js が判定を通していない');
  assert.ok(!/JSON\.parse\(raw\)/.test(notify), 'notify.js が判定を通さずに購読を読んでいる');
  assert.ok(/usableSubscription\(raw\)/.test(pushSrc), 'sendToWatchers が判定を通していない');
});
