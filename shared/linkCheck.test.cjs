const test = require('node:test');
const assert = require('node:assert');
const L = require('./linkCheck.cjs');

test('404/410 だけがリンク切れ。403・ボット確認・通信失敗・robots 不許可は「確認できず」', () => {
  assert.strictEqual(L.classifyLink({ status: 404 }), 'broken');
  assert.strictEqual(L.classifyLink({ status: 410 }), 'broken');
  assert.strictEqual(L.classifyLink({ status: 200 }), 'ok');
  assert.strictEqual(L.classifyLink({ status: 301 }), 'ok');
  assert.strictEqual(L.classifyLink({ status: 403 }), 'unknown');
  assert.strictEqual(L.classifyLink({ status: 403, challenge: true }), 'unknown');
  assert.strictEqual(L.classifyLink({ error: 'timeout' }), 'unknown');
  assert.strictEqual(L.classifyLink({ disallowed: true, status: 404 }), 'unknown');
  assert.strictEqual(L.classifyLink({ status: 500 }), 'unknown');
});

test('ボット確認画面の判定', () => {
  assert.ok(L.isChallengePage(403, '<title>Just a moment...</title>'));
  assert.ok(!L.isChallengePage(200, 'Just a moment'));
  assert.ok(!L.isChallengePage(403, 'Forbidden'));
});

test('robots.txt: 自分の UA のグループ優先、最長一致、Allow 優先', () => {
  const txt = 'User-agent: *\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: badbot\nDisallow: /\n';
  const ok = L.parseRobots(txt, 'jsdf-chiiki-events-linkcheck/1.0');
  assert.strictEqual(ok('/pco/tokyo/x.html'), true);
  assert.strictEqual(ok('/private/a'), false);
  assert.strictEqual(ok('/private/ok.html'), true);
  const bad = L.parseRobots(txt, 'BadBot/2');
  assert.strictEqual(bad('/anything'), false);
  assert.strictEqual(L.parseRobots('User-agent: *\nDisallow: /*.pdf$\n', 'x')('/a/b.pdf'), false);
  assert.strictEqual(L.parseRobots('', 'x')('/a'), true);
});

test('robots.txt の取得結果の扱い（RFC 9309）', () => {
  assert.strictEqual(L.robotsPolicyFromStatus(200), 'parse');
  assert.strictEqual(L.robotsPolicyFromStatus(404), 'allow_all');
  assert.strictEqual(L.robotsPolicyFromStatus(503), 'disallow_all');
});
