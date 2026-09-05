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

test('開発中・www では出さない', () => {
  // ここで出しても移行の当事者ではない。www は apex へリダイレクトされる
  for (const host of ['localhost:5173', '127.0.0.1:4173', `www.${NEW_HOST}`, '', null, undefined]) {
    assert.equal(decide({ host }).show, false, `host=${host}`);
  }
});

test('vercel.app のURLはサブドメインを問わず旧ドメイン扱いにする', () => {
  // Vercel は1プロジェクトに複数の *.vercel.app を割り当てる。完全一致だけで見ると
  // 利用者のブックマークがそちらだったときに判定が外れ、移行の案内が出ないうえ
  // 誤って「オフラインです」が出る（2026-09-05 に実際に発生した）。
  for (const host of [
    OLD_HOST,
    'jsdf-chiiki-events-nao3485s-projects.vercel.app',
    'jsdf-chiiki-events-1r6giktrk-nao3485s-projects.vercel.app',
    'JSDF-CHIIKI-EVENTS.VERCEL.APP',
  ]) {
    assert.equal(D.isLegacyHost(host), true, `host=${host}`);
    assert.equal(decide({ host }).mode, 'moved-away', `host=${host}`);
  }
  // 紛らわしい別ドメインは旧扱いにしない
  for (const host of ['vercel.app.example.com', 'notvercel.app.jp', NEW_HOST]) {
    assert.equal(D.isLegacyHost(host), false, `host=${host}`);
  }
});

test('許可オリジン（書き込みAPI）は緩めない', () => {
  // 判定を広げたのは案内の表示だけ。allowedOrigins まで広げると
  // 第三者の *.vercel.app からの書き込みが通ってしまう。
  const { allowedOrigins } = require('./siteUrl.cjs');
  const list = allowedOrigins({}, false);
  // 案内では旧扱いにするホストでも、書き込みは許可しない
  assert.ok(D.isLegacyHost('jsdf-chiiki-events-nao3485s-projects.vercel.app'));
  assert.ok(
    !list.includes('https://jsdf-chiiki-events-nao3485s-projects.vercel.app'),
    '許可オリジンまで広がっています（第三者の *.vercel.app から書き込めてしまう）',
  );
  assert.ok(list.includes(LEGACY_ORIGINS[0]), '移行元の正規オリジンは許可したまま');
  assert.deepEqual(list, [DEFAULT_SITE_URL, ...LEGACY_ORIGINS], '許可オリジンは完全一致のみ');
});

test('新ドメインは一度閉じたら出さない（版が一致するときだけ）', () => {
  assert.equal(decide({ host: NEW_HOST, dismissed: D.NOTICE_VERSION }).show, false);
  // 版を上げたら作り直したお知らせとしてもう一度出す
  assert.equal(decide({ host: NEW_HOST, dismissed: '2020-01-01' }).show, true);
  assert.equal(decide({ host: NEW_HOST, dismissed: '' }).show, true);
});

test('旧ドメインは閉じても毎回出す', () => {
  // 移行後の旧ドメインは最新データを取得できず、アプリが「オフラインです」と
  // 表示してしまう。原因は通信ではなく引っ越したこと。一度閉じたら黙る作りだと
  // 間違った説明だけが残るため、正しい案内を出し続ける。
  assert.equal(decide({ host: OLD_HOST, dismissed: D.NOTICE_VERSION }).show, true);
  assert.equal(decide({ host: OLD_HOST, dismissed: D.NOTICE_VERSION }).mode, 'moved-away');
});

test('isLegacyHost: 旧ドメインだけを真とする', () => {
  assert.equal(D.isLegacyHost(OLD_HOST), true);
  assert.equal(D.isLegacyHost(OLD_HOST.toUpperCase()), true);
  assert.equal(D.isLegacyHost(NEW_HOST), false);
  assert.equal(D.isLegacyHost('localhost:5173'), false);
  assert.equal(D.isLegacyHost(''), false);
  assert.equal(D.isLegacyHost(undefined), false);
});

test('App.jsx は旧ドメインでオフラインのお知らせを出さない', () => {
  // 旧ドメインで「オフラインです」を出すと、引っ越しの案内が埋もれるうえ
  // 原因の説明としても誤り。判定を消していないか実ファイルで確認する。
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const app = readFileSync(join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
  assert.ok(
    /isLegacyHost\(window\.location\.host\)/.test(app),
    'App.jsx が旧ドメインの判定をしていません（オフラインのお知らせが誤表示されます）',
  );
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
