'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('./session.cjs');

test('hashPassword/verifyPassword: scrypt ラウンドトリップ', () => {
  const stored = S.hashPassword('correct horse');
  assert.ok(stored.startsWith('scrypt$'));
  assert.equal(S.verifyPassword('correct horse', stored), true);
  assert.equal(S.verifyPassword('wrong', stored), false);
});
test('verifyPassword: 旧平文は allowPlaintext のときのみ許可', () => {
  assert.equal(S.verifyPassword('p', 'p', { allowPlaintext: true }), true);
  assert.equal(S.verifyPassword('p', 'p', { allowPlaintext: false }), false);
  assert.equal(S.verifyPassword('p', 'q', { allowPlaintext: true }), false);
});
test('verifyPassword: 不正な stored は false', () => {
  assert.equal(S.verifyPassword('x', ''), false);
  assert.equal(S.verifyPassword('x', 'scrypt$bad'), false);
});

test('newToken: 推測困難で十分な長さ・毎回異なる', () => {
  const a = S.newToken(), b = S.newToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40);
});

test('serializeSessionCookie: 安全属性を含む', () => {
  const c = S.serializeSessionCookie('tok', { maxAge: 100, secure: true, sameSite: 'Strict' });
  assert.match(c, /jsdf_admin_session=tok/);
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Strict/);
  assert.match(c, /Max-Age=100/);
  assert.match(c, /Path=\//);
});
test('serializeSessionCookie: secure:false で Secure を付けない（ローカル用）', () => {
  assert.doesNotMatch(S.serializeSessionCookie('t', { secure: false }), /Secure/);
});
test('clearSessionCookie: Max-Age=0', () => {
  assert.match(S.clearSessionCookie(), /Max-Age=0/);
});
test('parseCookies / getSessionToken', () => {
  const got = S.parseCookies('a=1; jsdf_admin_session=tok; b=2');
  assert.equal(got.a, '1');
  assert.equal(got.jsdf_admin_session, 'tok');
  assert.equal(S.getSessionToken({ headers: { cookie: 'jsdf_admin_session=abc' } }), 'abc');
  assert.equal(S.getSessionToken({ headers: {} }), '');
});
