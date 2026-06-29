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

// ── CSRF判定（#4） ──────────────────────────────────────────────
const csrf = (o) => S.csrfDecision(o);
test('csrfDecision: GET/HEAD/OPTIONS は対象外', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(csrf({ method, origin: '', isAllowedOrigin: false }).ok, true);
  }
});
test('csrfDecision: 同一オリジンのPOSTは許可', () => {
  assert.deepEqual(csrf({ method: 'POST', origin: 'https://self', isAllowedOrigin: true, secFetchSite: 'same-origin' }), { ok: true });
});
test('csrfDecision: 外部OriginのPOSTは拒否', () => {
  const d = csrf({ method: 'POST', origin: 'https://evil.example', isAllowedOrigin: false });
  assert.equal(d.ok, false); assert.equal(d.reason, 'origin_not_allowed');
});
test('csrfDecision: Sec-Fetch-Site cross-site は拒否', () => {
  const d = csrf({ method: 'POST', origin: 'https://self', isAllowedOrigin: true, secFetchSite: 'cross-site' });
  assert.equal(d.ok, false); assert.match(d.reason, /sec_fetch_site_cross-site/);
});
test('csrfDecision: Origin欠落のブラウザ書込みは拒否', () => {
  const d = csrf({ method: 'POST', origin: '', isAllowedOrigin: false, internalSecretOk: false });
  assert.equal(d.ok, false); assert.equal(d.reason, 'origin_missing');
});
test('csrfDecision: Origin欠落でも内部シークレット一致なら許可（非ブラウザ正当経路）', () => {
  assert.equal(csrf({ method: 'POST', origin: '', internalSecretOk: true }).ok, true);
});
test('csrfDecision: PATCH/PUT/DELETE も対象', () => {
  for (const method of ['PATCH', 'PUT', 'DELETE']) {
    assert.equal(csrf({ method, origin: '', internalSecretOk: false }).ok, false);
  }
});
