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

test('内部ネットワークの URL には接続しない（IP直書き・localhost・内部向けドメイン・特殊ポート・認証情報付き）', () => {
  assert.ok(L.isPublicHttpUrl('https://www.mod.go.jp/pco/tokyo/x.html'));
  assert.ok(L.isPublicHttpUrl('http://example.jp:80/a'));
  for (const bad of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/', 'http://[::1]/', 'http://localhost/',
    'http://printer.local/', 'http://db.internal/', 'https://example.jp:8443/', 'ftp://example.jp/', 'javascript:alert(1)',
    'https://user:pass@example.jp/', 'http://10.0.0.1/', 'not a url']) {
    assert.strictEqual(L.isPublicHttpUrl(bad), false, bad);
  }
});

test('接続先の IP アドレスが内部向けか（IPv4・IPv6・IPv4 埋め込み）', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', 'garbage', '']) {
    assert.strictEqual(L.isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '203.0.113.5', '13.107.42.14', '2001:4860:4860::8888', '::ffff:808:808']) {
    assert.strictEqual(L.isPrivateAddress(ip), false, ip);
  }
});

test('名前解決の結果に内部アドレスが1つでもあれば接続しない（普通のドメイン名でも）', async () => {
  const fake = (answers) => (host, opts, cb) => cb(null, answers);
  const run = (fn, opts = {}) => new Promise(r => fn('example.jp', opts, (err, a, f) => r({ err, a, f })));
  // 公開アドレスだけ → そのアドレスで接続
  let r = await run(L.makeSafeLookup(fake([{ address: '203.0.113.5', family: 4 }])));
  assert.strictEqual(r.err, null);
  assert.strictEqual(r.a, '203.0.113.5');
  // 内部アドレスに名前解決される → 失敗
  r = await run(L.makeSafeLookup(fake([{ address: '127.0.0.1', family: 4 }])));
  assert.strictEqual(r.err.code, 'EBLOCKED');
  // 公開と内部が混ざる（切り替えを狙う応答）→ 失敗
  r = await run(L.makeSafeLookup(fake([{ address: '203.0.113.5', family: 4 }, { address: '10.0.0.1', family: 4 }])));
  assert.strictEqual(r.err.code, 'EBLOCKED');
  // all:true で呼ばれたときは一覧で返す
  r = await run(L.makeSafeLookup(fake([{ address: '203.0.113.5', family: 4 }])), { all: true });
  assert.deepStrictEqual(r.a, [{ address: '203.0.113.5', family: 4 }]);
});

test('配線: リンク検査は robots.txt もイベントURLも、同じ検査つきの取得（1段ずつのリダイレクト）を通る', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../scripts/check-links.mjs'), 'utf8');
  assert.ok(src.includes('makeSafeLookup(dns.lookup'));
  assert.ok(/lookup:\s*safeLookup/.test(src));
  assert.ok(/getFollow\(`\$\{u\.origin\}\/robots\.txt`/.test(src));
  assert.ok(!/\bfetch\(/.test(src), 'fetch は名前解決を差し替えられないので使わない');
});
