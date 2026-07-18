'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('./authz.cjs');

const acc = (raw) => A.normalizeAccount(raw);

test('normalizeAccount: role 未指定は pref から導出', () => {
  assert.equal(acc({ user: 'a', pass: 'p', pref: '*' }).role, 'national_admin');
  assert.equal(acc({ user: 'b', pass: 'p', pref: 'tokyo' }).role, 'pco_admin');
});
test('normalizeAccount: 既定値（enabled/displayId/organization）', () => {
  const a = acc({ user: 'u', pass: 'p', pref: 'tokyo' });
  assert.equal(a.enabled, true);
  assert.equal(a.displayId, 'u');
  assert.equal(a.organization, 'tokyo');
  assert.equal(a.pref, 'tokyo'); // 後方互換
});
test('normalizeAccount: user/pass 欠落は null', () => {
  assert.equal(acc({ user: 'u' }), null);
  assert.equal(acc(null), null);
});
test('normalizeAccount: sessionVersion は既定1・指定値を採用', () => {
  assert.equal(acc({ user: 'u', pass: 'p', pref: 'tokyo' }).sessionVersion, 1);
  assert.equal(acc({ user: 'u', pass: 'p', pref: 'tokyo', sessionVersion: 5 }).sessionVersion, 5);
});

test('hasPermission: ロール別の権限', () => {
  const editor = acc({ user: 'e', pass: 'p', pref: 'tokyo', role: 'office_editor' });
  const manager = acc({ user: 'm', pass: 'p', pref: 'tokyo', role: 'office_manager' });
  const auditor = acc({ user: 'a', pass: 'p', pref: 'tokyo', role: 'auditor' });
  assert.equal(A.hasPermission(editor, 'event:create'), true);
  assert.equal(A.hasPermission(editor, 'event:update'), true);
  assert.equal(A.hasPermission(editor, 'event:delete'), false);  // editor は削除不可
  assert.equal(A.hasPermission(editor, 'event:publish'), false); // editor は公開不可
  assert.equal(A.hasPermission(manager, 'event:delete'), true);
  assert.equal(A.hasPermission(manager, 'event:publish'), true);
  assert.equal(A.hasPermission(auditor, 'audit:read'), true);
  assert.equal(A.hasPermission(auditor, 'event:create'), false);
});
test('hasPermission: report:read は所長・全国管理・システム管理のみ', () => {
  const pco = acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' });
  const national = acc({ user: 'n', pass: 'p', pref: '*', role: 'national_admin' });
  const sys = acc({ user: 's', pass: 'p', pref: 'tokyo', role: 'system_admin' });
  const editor = acc({ user: 'e', pass: 'p', pref: 'tokyo', role: 'office_editor' });
  const auditor = acc({ user: 'a', pass: 'p', pref: 'tokyo', role: 'auditor' });
  assert.equal(A.hasPermission(pco, 'report:read'), true);
  assert.equal(A.hasPermission(national, 'report:read'), true);
  assert.equal(A.hasPermission(sys, 'report:read'), true);
  assert.equal(A.hasPermission(editor, 'report:read'), false);   // 広報官は不可
  assert.equal(A.hasPermission(auditor, 'report:read'), false);  // 監査のみは不可
});
test('hasPermission: 無効アカウントは常に false', () => {
  const d = acc({ user: 'x', pass: 'p', pref: 'tokyo', role: 'office_manager', enabled: false });
  assert.equal(A.hasPermission(d, 'event:create'), false);
});
test('hasPermission: 明示 permissions はロールを上書き', () => {
  const a = acc({ user: 'a', pass: 'p', pref: 'tokyo', role: 'auditor', permissions: ['event:create'] });
  assert.equal(A.hasPermission(a, 'event:create'), true);
  assert.equal(A.hasPermission(a, 'audit:read'), false); // 明示指定に含まれない
});

test('canManageScope: 全国は何でも可', () => {
  const nat = acc({ user: 'n', pass: 'p', pref: '*' });
  assert.equal(A.canManageScope(nat, { pref: 'osaka' }), true);
});
test('canManageScope: 地本は自地本のみ（deny-by-default）', () => {
  const pco = acc({ user: 'p', pass: 'p', pref: 'tokyo' });
  assert.equal(A.canManageScope(pco, { pref: 'tokyo' }), true);
  assert.equal(A.canManageScope(pco, { pref: 'osaka' }), false);
  assert.equal(A.canManageScope(pco, {}), false);        // pref 不明は拒否
  assert.equal(A.canManageScope(pco, null), false);
});
test('canManageScope: 事務所ロールは deny-by-default（双方officeが一致時のみ）', () => {
  const mgr = acc({ user: 'm', pass: 'p', pref: 'tokyo', office: 'shibuya', role: 'office_manager' });
  const ed  = acc({ user: 'e', pass: 'p', pref: 'tokyo', office: 'shibuya', role: 'office_editor' });
  assert.equal(A.canManageScope(mgr, { pref: 'tokyo', office: 'shibuya' }), true);  // 自office一致
  assert.equal(A.canManageScope(ed,  { pref: 'tokyo', office: 'shibuya' }), true);
  assert.equal(A.canManageScope(mgr, { pref: 'tokyo', office: 'shinjuku' }), false); // 別office拒否
  assert.equal(A.canManageScope(mgr, { pref: 'tokyo' }), false);                     // target.office欠落→拒否
  assert.equal(A.canManageScope(mgr, { pref: 'tokyo', office: '' }), false);         // 空office→拒否
  // account.office 欠落の office ロールは何も操作できない
  const noOff = acc({ user: 'm2', pass: 'p', pref: 'tokyo', role: 'office_manager' });
  assert.equal(A.canManageScope(noOff, { pref: 'tokyo', office: 'shibuya' }), false);
});
test('canManageScope: pco_admin は同一pref全体（office不問・他prefは拒否）', () => {
  const pco = acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' });
  assert.equal(A.canManageScope(pco, { pref: 'tokyo' }), true);                  // office不明でも可
  assert.equal(A.canManageScope(pco, { pref: 'tokyo', office: 'shibuya' }), true);
  assert.equal(A.canManageScope(pco, { pref: 'osaka', office: 'x' }), false);    // 他pref拒否
});
test('canManageScope: national_admin は office不明でも可', () => {
  const nat = acc({ user: 'n', pass: 'p', pref: '*' });
  assert.equal(A.canManageScope(nat, { pref: 'tokyo' }), true);
  assert.equal(A.canManageScope(nat, { pref: 'osaka', office: 'y' }), true);
});
test('canManageScope: 対象に role を混ぜても権限昇格しない', () => {
  const pco = acc({ user: 'p', pass: 'p', pref: 'tokyo' });
  // クライアントが target に role:'national_admin' を入れても pref 判定のみ
  assert.equal(A.canManageScope(pco, { pref: 'osaka', role: 'national_admin' }), false);
  assert.equal(A.canManageScope(pco, { pref: 'tokyo', role: 'national_admin' }), true);
});

test('canPublish: editor 不可 / manager・pco・national 可', () => {
  assert.equal(A.canPublish(acc({ user: 'e', pass: 'p', pref: 'tokyo', role: 'office_editor' })), false);
  assert.equal(A.canPublish(acc({ user: 'm', pass: 'p', pref: 'tokyo', role: 'office_manager' })), true);
  assert.equal(A.canPublish(acc({ user: 'p', pass: 'p', pref: 'tokyo', role: 'pco_admin' })), true);
  assert.equal(A.canPublish(acc({ user: 'n', pass: 'p', pref: '*' })), true);
});
