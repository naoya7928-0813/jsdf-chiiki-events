/**
 * siteUrl — 公開サイトの URL / オリジンの唯一の出どころ
 *
 * ドメインを移行するとき（2026-09-03 に vercel.app → .jp を実施）に
 * コードを書き換えて回らずに済むよう、参照を1か所へ集約している。
 * 切り替えは環境変数 `SITE_URL` を設定するだけでよい。
 *
 * 使う側:
 *   - scripts/generate-events-html.mjs … canonical / sitemap / JSON-LD の URL
 *   - scripts/indexnow.mjs             … 通知するホスト
 *   - api/og.js                        … OGP 画像に描くサイト名と絶対URL
 *   - api/_security.js                 … 書き込みAPIの許可オリジン
 *   - api/admin/*.js                   … 公開データを取りにいく際のベースURL
 *   - vite.config.js                   … index.html の canonical / og:url / og:image
 *
 * ⚠ vercel.json の Access-Control-Allow-Origin は静的JSONのため、ここからは
 *   差し込めない。ズレを防ぐため shared/siteUrl.test.cjs が実ファイルを読んで検証する。
 */
'use strict';

/**
 * 既定（現行の公開URL）。SITE_URL 未設定時はこれを使う。
 * 2026-09-03 に vercel.app から独自ドメイン（.jp）へ移行した。
 */
const DEFAULT_SITE_URL = 'https://jsdf-chiiki-events.jp';

/**
 * 移行後も書き込みAPIで許可し続けるオリジン。
 * 旧ドメインを開いたままの利用者・リダイレクト前のブックマークからの操作を
 * 失敗させないため。移行が落ち着いたら空にしてよい。
 */
const LEGACY_ORIGINS = ['https://jsdf-chiiki-events.vercel.app'];

/** 開発時のオリジン（ローカル確認用） */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

/**
 * オリジン文字列を正規化する。
 * http(s) 以外・不正なURLは null（呼び出し側で無視する＝設定ミスで全許可にしない）。
 */
function normalizeOrigin(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return u.origin;   // 末尾スラッシュ・パス・クエリを落とす
}

/**
 * 公開サイトの URL（末尾スラッシュなし）。env.SITE_URL があればそれを使う。
 *
 * ⚠ ただし **`LEGACY_ORIGINS`（＝移行元として捨てたドメイン）は採用しない**。
 *   `SITE_URL` はコードの既定より優先されるため、移行後にシークレットの更新を
 *   忘れると静的ページ・sitemap が旧ドメインで生成され、scrape.yml が
 *   それをコミットして**移行が丸ごと巻き戻る**（1日3回走るので必ず起きる）。
 *   「捨てたドメインを公開URLとして指定する」は設定として成立しないので、
 *   ここで既定へ落とす。設定の直し忘れは scripts/check-site-url.mjs が警告する。
 *   旧ドメインへ戻したいときは移行コミットを revert する（vercel.json の CORS や
 *   index.html の canonical は静的で、環境変数では戻らないため）。
 */
function siteUrl(env = process.env) {
  const value = normalizeOrigin(env && env.SITE_URL);
  if (!value || LEGACY_ORIGINS.includes(value)) return DEFAULT_SITE_URL;
  return value;
}

/** 公開サイトのホスト名（例 example.jp）。IndexNow 等ホストだけ要る用途向け */
function siteHost(env = process.env) {
  return new URL(siteUrl(env)).host;
}

/**
 * 書き込みAPIが受け付けるオリジン一覧。
 *   現行サイト + SITE_ORIGINS（カンマ区切り・移行期の併用や独自ドメイン用）
 *   + 旧ドメイン + （開発時のみ）localhost
 * @param {object} env
 * @param {boolean} includeDev 開発オリジンを含めるか（既定: NODE_ENV !== 'production'）
 */
function allowedOrigins(env = process.env, includeDev = (env || {}).NODE_ENV !== 'production') {
  const extra = String((env && env.SITE_ORIGINS) || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const list = [siteUrl(env), ...extra, ...LEGACY_ORIGINS, ...(includeDev ? DEV_ORIGINS : [])];
  return [...new Set(list)];
}

module.exports = {
  DEFAULT_SITE_URL, LEGACY_ORIGINS, DEV_ORIGINS,
  normalizeOrigin, siteUrl, siteHost, allowedOrigins,
};
