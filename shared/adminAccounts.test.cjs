'use strict';
// 地本別の運営画面（/admin/<地本>）と、アカウント作成ツール（scripts/admin-accounts.mjs）の検査。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('./adminPref.cjs');
const S = require('./session.cjs');

test('地本別の運営画面: パスから地本を取り出す（未知・不正は null）', async () => {
  const { PREFECTURE_INFO } = await import('../src/data/regionMap.js');
  assert.equal(P.prefFromAdminPath('/admin/tokyo', PREFECTURE_INFO), 'tokyo');
  assert.equal(P.prefFromAdminPath('/admin/sapporo/', PREFECTURE_INFO), 'sapporo');
  assert.equal(P.prefFromAdminPath('/admin/nope', PREFECTURE_INFO), null);
  assert.equal(P.prefFromAdminPath('/admin.html', PREFECTURE_INFO), null);
  assert.equal(P.prefFromAdminPath('/admin/__proto__', PREFECTURE_INFO), null);
  assert.equal(P.prefFromAdminPath('/admin/tokyo/x', PREFECTURE_INFO), null);
  assert.equal(P.adminPathFor('tokyo'), '/admin/tokyo');
  assert.equal(P.adminPageRelation(null, 'tokyo'), 'none');
  assert.equal(P.adminPageRelation('tokyo', 'tokyo'), 'match');
  assert.equal(P.adminPageRelation('tokyo', '*'), 'national');
  assert.equal(P.adminPageRelation('tokyo', 'osaka'), 'mismatch');
});

test('vercel.json: /admin/<地本> を運営画面へ振り替える（SPA の振り替えより先）', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const i = cfg.rewrites.findIndex(r => r.source === '/admin/:pref([a-z]+)' && r.destination === '/admin.html');
  const spa = cfg.rewrites.findIndex(r => r.destination === '/index.html');
  assert.ok(i >= 0 && i < spa, '運営画面の振り替えが無い、または SPA より後ろ');
});

test('アカウント作成ツール: 地本一覧が画面と一致し、検査・パスワード生成が働く', async () => {
  const T = await import('../scripts/admin-accounts.mjs');
  const { PREFECTURE_INFO } = await import('../src/data/regionMap.js');
  assert.deepEqual(Object.keys(T.PREFS).sort(), Object.keys(PREFECTURE_INFO).sort());
  for (const [k, v] of Object.entries(T.PREFS)) assert.equal(v, PREFECTURE_INFO[k].label, k);

  const pw = T.generatePassword();
  assert.equal(pw.length, 20);
  assert.ok(!/[0O1lI]/.test(pw), '読み間違えやすい文字を使わない');
  assert.notEqual(T.generatePassword(), pw);

  const ok = [{ user: 'tokyo-admin', pass: S.hashPassword('x'.repeat(12)), organization: 'tokyo', role: 'pco_admin', displayId: 'OP-TOKYO-01', enabled: true, sessionVersion: 1 }];
  assert.deepEqual(T.checkAccounts(ok), []);
  const bad = T.checkAccounts([
    ...ok, { ...ok[0] },                                             // 重複
    { user: 'x', pass: 'plain', organization: 'nowhere', role: 'god', displayId: '' },
    { user: 'sby-editor', pass: ok[0].pass, organization: 'tokyo', role: 'office_editor', displayId: 'OP-1' }, // office 無し
  ]);
  assert.ok(bad.some(e => /重複/.test(e)));
  assert.ok(bad.some(e => /scrypt/.test(e)));
  assert.ok(bad.some(e => /organization/.test(e)));
  assert.ok(bad.some(e => /role/.test(e)));
  assert.ok(bad.some(e => /office が必須/.test(e)));
  assert.ok(JSON.parse(Buffer.from(T.toBase64(ok), 'base64').toString()).length === 1);
});

test('秘密情報のファイルはコミット対象外', () => {
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gi, /^\*\.local\.json$/m);
  assert.match(gi, /^\*\.local\.csv$/m);
});
