'use strict';
// ADMIN_SECRET の安全な無効化（#2）と平文/scrypt/無効アカウントの検証。
// verifyCredentials は redis に触れない（loadAccounts + scrypt のみ）。env は呼び出し時評価。
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('./session.cjs');

// @upstash/redis のコンストラクタ用ダミー（本テストでは redis を使わない）
process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';

const sec = () => import('../api/_security.js');
const setAccounts = (arr) => { process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify(arr)).toString('base64'); };
function resetFlags() {
  delete process.env.LEGACY_ADMIN_SECRET;
  delete process.env.LEGACY_PLAINTEXT_PASSWORDS;
}

test('ADMIN_SECRET: 既定では拒否（任意ユーザー名＋共通PWでnational_adminになれない）', async () => {
  resetFlags();
  process.env.ADMIN_SECRET = 'topsecret';
  setAccounts([]);
  const { verifyCredentials } = await sec();
  assert.equal(verifyCredentials('anyone', 'topsecret'), null);
  assert.equal(verifyCredentials('admin', 'topsecret'), null);
});

test('ADMIN_SECRET: LEGACY_ADMIN_SECRET=true のときだけ移行経路が動く', async () => {
  resetFlags();
  process.env.ADMIN_SECRET = 'topsecret';
  process.env.LEGACY_ADMIN_SECRET = 'true';
  setAccounts([]);
  const { verifyCredentials } = await sec();
  const acc = verifyCredentials('anyone', 'topsecret');
  assert.ok(acc);
  assert.equal(acc.role, 'national_admin');
  resetFlags();
});

test('平文アカウント: LEGACY_PLAINTEXT_PASSWORDS=false で拒否', async () => {
  resetFlags();
  process.env.LEGACY_PLAINTEXT_PASSWORDS = 'false';
  setAccounts([{ user: 'p', pass: 'plain', pref: 'tokyo' }]);
  const { verifyCredentials } = await sec();
  assert.equal(verifyCredentials('p', 'plain'), null);
  resetFlags();
});

test('scryptアカウント: 成功（平文不許可でも）', async () => {
  resetFlags();
  process.env.LEGACY_PLAINTEXT_PASSWORDS = 'false';
  setAccounts([{ user: 's', pass: S.hashPassword('pw'), pref: 'tokyo', role: 'pco_admin' }]);
  const { verifyCredentials } = await sec();
  const acc = verifyCredentials('s', 'pw');
  assert.ok(acc);
  assert.equal(acc.user, 's');
  assert.equal(verifyCredentials('s', 'wrong'), null);
  resetFlags();
});

test('無効アカウント(enabled:false)は拒否', async () => {
  resetFlags();
  setAccounts([{ user: 'd', pass: S.hashPassword('pw'), pref: 'tokyo', enabled: false }]);
  const { verifyCredentials } = await sec();
  assert.equal(verifyCredentials('d', 'pw'), null);
  resetFlags();
});


// ── ヘッダ認証（移行用の旧経路）は既定で無効 ─────────────────────
// 既定で許すと、ログイン画面のロック（回数制限・指数バックオフ）を通らずに
// 任意の管理APIへ資格情報を投げ続けられ、総当りが実質無制限になる。
test('ヘッダ認証: 既定では拒否される（総当り迂回路を塞ぐ）', async () => {
  resetFlags();
  delete process.env.LEGACY_HEADER_AUTH;
  delete process.env.ADMIN_SECRET;
  setAccounts([{ user: 'op', pass: S.hashPassword('pw'), pref: 'tokyo', displayId: 'OP-1' }]);
  const { authenticate } = await sec();
  const r = await authenticate({ headers: { 'x-admin-user': 'op', 'x-admin-pass': 'pw' } });
  assert.equal(r, null, '既定でヘッダ認証を通してしまっている');
});

test('ヘッダ認証: LEGACY_HEADER_AUTH=true のときだけ通る', async () => {
  resetFlags();
  delete process.env.ADMIN_SECRET;
  process.env.LEGACY_HEADER_AUTH = 'true';
  setAccounts([{ user: 'op', pass: S.hashPassword('pw'), pref: 'tokyo', displayId: 'OP-1' }]);
  const { authenticate } = await sec();
  const r = await authenticate({ headers: { 'x-admin-user': 'op', 'x-admin-pass': 'pw' } });
  assert.ok(r && r.account, '移行フラグを立てても通らない');
  assert.equal(r.via, 'header');
  delete process.env.LEGACY_HEADER_AUTH;
});
