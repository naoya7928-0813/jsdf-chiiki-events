const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./myPref.cjs');

const SUP = new Set(['tokyo', 'sapporo']);

test('保存値は対応している地本キーだけ（不正・空は未設定）', () => {
  assert.strictEqual(M.normalizeMyPref('tokyo', SUP), 'tokyo');
  assert.strictEqual(M.normalizeMyPref(' tokyo ', SUP), 'tokyo');
  assert.strictEqual(M.normalizeMyPref('mars', SUP), '');
  assert.strictEqual(M.normalizeMyPref(null, SUP), '');
  assert.strictEqual(M.normalizeMyPref('<script>', SUP), '');
});

test('トップ（/）から開いたときだけ自分の都道府県の一覧から始める。共有リンク・未設定・運営画面は従来どおり', () => {
  assert.strictEqual(M.startScreenFor({ myPref: 'tokyo', pathname: '/' }), 'list');
  assert.strictEqual(M.startScreenFor({ myPref: 'tokyo', pathname: '/event/t-1' }), 'home'); // 以後 URL から詳細を解決
  assert.strictEqual(M.startScreenFor({ myPref: 'tokyo', pathname: '/favorites' }), 'home');
  assert.strictEqual(M.startScreenFor({ myPref: '', pathname: '/' }), 'home');
  assert.strictEqual(M.startScreenFor({ myPref: 'tokyo', pathname: '/', operator: true }), 'home');
});

test('一覧の最初の絞り込みは自分の都道府県（未設定なら全国）', () => {
  assert.strictEqual(M.defaultListRegion('tokyo'), 'tokyo');
  assert.strictEqual(M.defaultListRegion(''), 'all');
});

test('配線: App は起動画面・一覧の既定・設定画面に使い、設定は端末内だけに保存する', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');
  assert.ok(app.includes('startScreenFor('));
  assert.ok(!app.includes("handleRegionChange('all')"), '一覧を開く処理が全国固定のまま残っている');
  assert.ok(app.includes('localStorage.setItem(MY_PREF_KEY'));
  const privacy = fs.readFileSync(path.join(__dirname, '../src/constants/privacy.js'), 'utf8');
  assert.ok(privacy.includes('自分の都道府県'), 'プライバシーポリシーの端末内保存の一覧に記載が無い');
});
