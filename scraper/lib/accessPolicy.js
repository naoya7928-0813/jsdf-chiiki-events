'use strict';
/**
 * 公式サイトへのアクセスの決めごと（2026-11-23 導入）。スクレイパーの取得はすべてここを通す。
 *
 * - 名乗る: User-Agent は当サイト名と連絡先（公開URL）。ブラウザのふりはしない
 * - 回避しない: ボット検知を隠す設定（navigator.webdriver の書き換え・偽のプラグイン・偽の sec-ch-ua 等）や
 *   ステルス用プラグインは使わない。ボット確認画面が出たら取得失敗として扱い、前回データを引き継ぐ
 *   （scraper/index.js の keysNeedingCarryOver）。運営はその地本を手動登録で補う
 * - 軽くする: ページ表示に要らない画像・動画・フォント・CSS は読み込まない（相手サーバーの負荷と取得時間を減らす）。
 *   チラシの画像・PDF は別途 downloadFile()（キャッシュ・条件付きGET）で取得するので影響しない
 *
 * 経緯: 2026-11-23 まで puppeteer-extra-plugin-stealth と手書きの偽装で取得していた。週1回の HP 更新監視
 * （check-source-updates.js）は同じ GitHub Actions から名乗り付きの普通のブラウザで 322 ページを取得して失敗0件だったため、
 * 偽装をやめても取得できると判断した。偽装は相手（防衛省）との信頼を損ね、検知されると突然まとめて取れなくなる危険もあった。
 */

const { siteUrl } = require('../../shared/siteUrl.cjs');

/** 当サイトを名乗る User-Agent（全取得共通） */
const USER_AGENT = `Mozilla/5.0 (compatible; jsdf-chiiki-events/1.0; +${siteUrl(process.env)}/)`;

/** ページ表示で読み込まないリソースの種類 */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

/** ブラウザの起動引数（自動操作であることを隠す引数は付けない） */
function launchArgs(platform = process.platform) {
  return [
    ...(platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : []),
    '--lang=ja-JP',
  ];
}

/**
 * 取得用のブラウザコンテキストを作る（地本ごとに新しく作り、Cookie 等を持ち越さない）。
 * @param {import('playwright').Browser} browser
 */
async function createScraperContext(browser) {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': 'ja,en;q=0.8' },
  });
  await context.route('**/*', (route) => {
    if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) return route.abort();
    return route.continue();
  });
  return context;
}

module.exports = { USER_AGENT, BLOCKED_RESOURCE_TYPES, launchArgs, createScraperContext };
