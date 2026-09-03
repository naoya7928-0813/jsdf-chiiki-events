#!/usr/bin/env node
/**
 * check-site-url — 公開URLの設定ズレを CI で止める
 *
 * 公開URLは `shared/siteUrl.cjs` の `DEFAULT_SITE_URL` が既定で、環境変数
 * `SITE_URL` があればそちらが勝つ。この「環境変数が勝つ」性質がドメイン移行では
 * 事故になる:
 *
 *   GitHub Secrets の SITE_URL に**旧ドメイン**が残ったままだと、
 *   コードを新ドメインへ直しても scrape.yml / deploy.yml のビルドは旧ドメインで
 *   生成される。しかも scrape.yml は生成物をコミットするため、
 *   **次のスクレイプで静的ページ・sitemap が丸ごと旧ドメインへ戻る**。
 *   ログを見ないと気づけないので、ここで止める。
 *
 * 判定:
 *   - SITE_URL 未設定           … OK（DEFAULT_SITE_URL を使う）
 *   - DEFAULT_SITE_URL と同じ   … OK
 *   - 移行元（LEGACY_ORIGINS）  … **エラー**（＝シークレットの更新漏れ）
 *   - それ以外                  … 警告のみ（検証環境など意図的な上書き）
 *
 * 切り戻しは SITE_URL を旧ドメインへ戻すのではなく、移行コミットを revert する
 * （vercel.json の CORS・index.html の canonical は静的なので環境変数では戻らない）。
 */
import { DEFAULT_SITE_URL, LEGACY_ORIGINS, normalizeOrigin } from '../shared/siteUrl.cjs';

const raw = process.env.SITE_URL;
const value = normalizeOrigin(raw);

if (raw && !value) {
  console.log(`::warning::SITE_URL の値が URL として読めません（${raw}）。既定の ${DEFAULT_SITE_URL} を使います`);
  process.exit(0);
}

if (!value) {
  console.log(`[check-site-url] SITE_URL 未設定。既定の ${DEFAULT_SITE_URL} を使います`);
  process.exit(0);
}

if (value === DEFAULT_SITE_URL) {
  console.log(`[check-site-url] 公開URL: ${value}（コードの既定と一致）`);
  process.exit(0);
}

if (LEGACY_ORIGINS.includes(value)) {
  console.log(
    `::error::SITE_URL が移行前のドメイン（${value}）のままです。`
    + `コードの公開URLは ${DEFAULT_SITE_URL} です。`
    + 'このままビルドすると canonical・OGP・sitemap・静的ページが旧ドメインで生成され、'
    + 'スクレイプの自動コミットで移行が巻き戻ります。'
    + 'GitHub Secrets と Vercel の環境変数 SITE_URL を新ドメインへ更新してください'
    + '（削除しても既定値で正しく動きます）。',
  );
  process.exit(1);
}

console.log(
  `::warning::SITE_URL（${value}）がコードの既定（${DEFAULT_SITE_URL}）と違います。`
  + '意図した上書きならこのまま進みます。',
);
