/**
 * IndexNow でサイトの主要URLを検索エンジン（Bing / Yandex / Naver / Seznam）へ即時通知する。
 * ※ Google は IndexNow 非対応のため、Google は sitemap.xml 経由で巡回される。
 *
 * 仕組み: public/<key>.txt にキーを置き、その所有証明として api.indexnow.org に
 * { host, key, keyLocation, urlList } を POST する。デプロイ後（キーファイルが本番に
 * 反映済み）に実行すること。失敗してもデプロイは止めない（best-effort）。
 *
 * 実行: node scripts/indexnow.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { siteUrl, siteHost } from '../shared/siteUrl.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');
// 通知先ホストは shared/siteUrl.cjs から（ドメイン移行時は SITE_URL を設定するだけ）
const ORIGIN = siteUrl(process.env);
const HOST = siteHost(process.env);

// public/ 内の <32桁hex>.txt をキーファイルとして自動検出
const keyFile = readdirSync(PUBLIC).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.log('[indexnow] キーファイル(<32hex>.txt)が見つかりません。スキップします。');
  process.exit(0);
}
const key = readFileSync(join(PUBLIC, keyFile), 'utf8').trim();
const keyLocation = `${ORIGIN}/${keyFile}`;

// sitemap.xml から URL を抽出
const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (urlList.length === 0) {
  console.log('[indexnow] sitemap に URL がありません。スキップします。');
  process.exit(0);
}

const body = { host: HOST, key, keyLocation, urlList };

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200/202 が成功。IndexNow は本文を返さないことが多い。
  console.log(`[indexnow] ${urlList.length} URL を送信 → HTTP ${res.status} ${res.statusText}`);
  if (res.status >= 400) {
    const txt = await res.text().catch(() => '');
    console.log(`[indexnow] 応答: ${txt.slice(0, 300)}`);
  }
} catch (e) {
  console.log(`[indexnow] 送信失敗（無視して継続）: ${e.message}`);
}
