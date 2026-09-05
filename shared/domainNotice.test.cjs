'use strict';
/**
 * domainNotice のテスト
 *
 * 「出しすぎ」と「出なさすぎ」の両方が事故になる。
 *   出しすぎ … 新規の利用者に、知らないサイトからの引っ越しを毎回知らせる
 *   出なさすぎ … お気に入りが消えた理由が分からないまま放置される
 * 境界（期限・閉じた記録・ホスト名）を機械で押さえる。
 */
const test = require('node:test');
const assert = require('node:assert');

const D = require('./domainNotice.cjs');
const { DEFAULT_SITE_URL, LEGACY_ORIGINS } = require('./siteUrl.cjs');

const NEW_HOST = new URL(DEFAULT_SITE_URL).host;
const OLD_HOST = new URL(LEGACY_ORIGINS[0]).host;
const TODAY = '2026-09-05';

const decide = (o) => D.decideDomainNotice({ today: TODAY, ...o });

test('旧ドメインでは「引っ越しました」を出す', () => {
  const r = decide({ host: OLD_HOST });
  assert.equal(r.show, true);
  assert.equal(r.mode, 'moved-away');
  assert.equal(r.newUrl, DEFAULT_SITE_URL);
});

test('新ドメインでは「アドレスが変わりました」を出す', () => {
  const r = decide({ host: NEW_HOST });
  assert.equal(r.show, true);
  assert.equal(r.mode, 'moved-here');
});

test('開発・プレビュー・www では出さない', () => {
  // ここで出しても移行の当事者ではない。www は apex へリダイレクトされる
  for (const host of [
    'localhost:5173', '127.0.0.1:4173',
    `www.${NEW_HOST}`,
    'jsdf-chiiki-events-1r6giktrk-nao3485s-projects.vercel.app',   // プレビュー
    '', null, undefined,
  ]) {
    assert.equal(decide({ host }).show, false, `host=${host}`);
  }
});

test('一度閉じたら出さない（版が一致するときだけ）', () => {
  assert.equal(decide({ host: NEW_HOST, dismissed: D.NOTICE_VERSION }).show, false);
  // 版を上げたら作り直したお知らせとしてもう一度出す
  assert.equal(decide({ host: NEW_HOST, dismissed: '2020-01-01' }).show, true);
  assert.equal(decide({ host: NEW_HOST, dismissed: '' }).show, true);
});

test('期限を過ぎたら出さない（消し忘れ防止）', () => {
  assert.equal(D.decideDomainNotice({ host: NEW_HOST, today: D.SHOW_UNTIL }).show, true);
  assert.equal(D.decideDomainNotice({ host: NEW_HOST, today: '2027-01-01' }).show, false);
  assert.equal(D.decideDomainNotice({ host: OLD_HOST, today: '2027-01-01' }).show, false);
  // today が取れない場合も出さない（判定できないなら黙る）
  assert.equal(D.decideDomainNotice({ host: NEW_HOST, today: '' }).show, false);
});

test('大文字のホスト名でも判定できる', () => {
  assert.equal(decide({ host: NEW_HOST.toUpperCase() }).mode, 'moved-here');
  assert.equal(decide({ host: OLD_HOST.toUpperCase() }).mode, 'moved-away');
});

test('ホスト一覧は shared/siteUrl.cjs から導く（二重管理しない）', () => {
  assert.equal(D.currentHost(), NEW_HOST);
  assert.deepEqual(D.legacyHosts(), LEGACY_ORIGINS.map(o => new URL(o).host));
  assert.equal(D.hostOf('not a url'), null);
});

test('プライバシーポリシーに「閉じた記録」の保存が書かれている', () => {
  // 端末内の保存項目を増やすときはポリシーに書く（書かずに増やさない）
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const privacy = readFileSync(join(__dirname, '..', 'src', 'constants', 'privacy.js'), 'utf8');
  assert.ok(
    /移行のお知らせ/.test(privacy),
    'ドメイン移行のお知らせを閉じた記録が プライバシーポリシー 2章に記載されていません',
  );
});
