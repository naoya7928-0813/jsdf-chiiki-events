#!/usr/bin/env node
/**
 * check-site-url — 公開URLの設定ズレを CI で止める
 *
 * 公開URLは `shared/siteUrl.cjs` の `DEFAULT_SITE_URL` が既定で、環境変数
 * `SITE_URL` があればそちらが勝つ。ドメイン移行のあとシークレットに旧ドメインが
 * 残っていると、本来なら静的ページ・sitemap が旧ドメインで生成され、scrape.yml が
 * それをコミットして移行が巻き戻る。
 *
 * 実害のほうは `siteUrl()` 側で塞いである（移行元＝`LEGACY_ORIGINS` の値は
 * 採用せず既定へ落とす）ので、**ここは設定の直し忘れを知らせるだけ**。
 * ジョブは落とさない。落とすとスクレイプが丸ごと止まり、データが更新されなく
 * なるほうが害が大きいため（生成物は既に正しい新ドメインで出る）。
 *
 * 判定:
 *   - SITE_URL 未設定           … 何もしない（DEFAULT_SITE_URL を使う）
 *   - DEFAULT_SITE_URL と同じ   … 何もしない
 *   - 移行元（LEGACY_ORIGINS）  … 警告（＝シークレットの更新漏れ。値は無視される）
 *   - それ以外                  … 警告（検証環境など意図的な上書き）
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
    `::warning::SITE_URL が移行前のドメイン（${value}）のままです。`
    + `この値は無視して ${DEFAULT_SITE_URL} で生成するため出力は正しくなりますが、`
    + 'GitHub Secrets と Vercel の環境変数 SITE_URL を新ドメインへ更新してください'
    + '（削除しても既定値で正しく動きます）。'
    + 'scrape.yml の Web Push 送信先はこのシークレットを直接使っているため、'
    + '旧ドメインが閉じられると通知が送れなくなります。',
  );
  process.exit(0);
}

console.log(
  `::warning::SITE_URL（${value}）がコードの既定（${DEFAULT_SITE_URL}）と違います。`
  + '意図した上書きならこのまま進みます。',
);
