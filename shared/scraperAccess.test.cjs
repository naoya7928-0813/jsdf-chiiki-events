'use strict';
// 公式サイトへのアクセスの決めごと（scraper/lib/accessPolicy.js）が守られているか。
// ボット検知の回避・ブラウザのふりを戻さない（2026-11-23 に廃止。相手との信頼と、突然まとめて取れなくなる危険のため）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = (f) => path.join(__dirname, '..', f);
const read = (f) => fs.readFileSync(root(f), 'utf8');

test('スクレイパーはステルス用の部品を使わず、依存にも入れない', () => {
  const pkg = JSON.parse(read('scraper/package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  assert.ok(!deps['playwright-extra'], 'playwright-extra を戻さない');
  assert.ok(!deps['puppeteer-extra-plugin-stealth'], 'puppeteer-extra-plugin-stealth を戻さない');
  for (const f of ['scraper/index.js', 'scraper/check-source-updates.js']) {
    const src = read(f);
    assert.ok(!/require\(['"](playwright-extra|puppeteer-extra[^'"]*)['"]\)/.test(src), `${f}: ステルス部品の読み込み`);
  }
});

test('ブラウザのふり・自動操作の目印を隠す設定を書かない', () => {
  const files = ['scraper/index.js', 'scraper/check-source-updates.js', 'scraper/lib/accessPolicy.js'];
  for (const f of files) {
    const code = read(f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // コメントは除く
    assert.ok(!/Chrome\/\d+\.\d|Windows NT 10\.0/.test(code), `${f}: ブラウザを装う User-Agent`);
    assert.ok(!/defineProperty\(\s*navigator/.test(code), `${f}: navigator の書き換え`);
    assert.ok(!/AutomationControlled/.test(code), `${f}: 自動操作の目印を隠す起動引数`);
    assert.ok(!/sec-ch-ua/i.test(code), `${f}: 偽の sec-ch-ua`);
  }
});

test('名乗りは当サイト名と公開URL。画像・動画・フォント・CSS は読まない', () => {
  const A = require('../scraper/lib/accessPolicy');
  assert.match(A.USER_AGENT, /jsdf-chiiki-events/);
  assert.match(A.USER_AGENT, /\+https:\/\//);
  for (const t of ['image', 'media', 'font', 'stylesheet']) assert.ok(A.BLOCKED_RESOURCE_TYPES.has(t));
  assert.ok(!A.BLOCKED_RESOURCE_TYPES.has('document'));
  assert.ok(!A.BLOCKED_RESOURCE_TYPES.has('script')); // ページの組み立てに JavaScript が要る地本がある
  assert.ok(!A.launchArgs('linux').some(a => /Automation|infobars/.test(a)));
});
