/**
 * デプロイ後、公開サイトの /data/events.json が今回のデータに切り替わるまで待つ。
 * 実行: SITE_URL=https://… node scripts/wait-for-live-data.mjs
 *
 * 以前は「CDN 伝播待機」として一律 60 秒待つだけで、実際に新しいデータが配信されているかは
 * 確かめていなかった（Issue #16: 通知をタップした時点で新着が見えないことがある）。
 * 利用者と同じ URL（クエリなし）を読み、updatedAt が手元の events.json と一致したら終わる。
 *
 * ジョブは落とさない（通知が遅れるより、送られない方が困る）。時間切れは警告を出し、
 * GITHUB_ENV に LIVE_DATA=timeout を書く。
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { siteUrl } from '../shared/siteUrl.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(__dirname, '../public/data/events.json'), 'utf8')).updatedAt;
const url = `${siteUrl(process.env)}/data/events.json`;
const TIMEOUT_MS = Number(process.env.LIVE_WAIT_TIMEOUT_MS || 300000); // 既定5分
const INTERVAL_MS = 15000;

const setEnv = (v) => { if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `LIVE_DATA=${v}\n`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const started = Date.now();
let last = '';
for (;;) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'jsdf-events-deploy-check' } });
    if (res.ok) {
      last = (await res.json())?.updatedAt ?? '';
      if (last === expected) {
        console.log(`[公開確認] 新しいデータの配信を確認しました（updatedAt=${expected}・${Math.round((Date.now() - started) / 1000)}秒）`);
        setEnv('ok');
        process.exit(0);
      }
    } else {
      last = `HTTP ${res.status}`;
    }
  } catch (err) {
    last = `取得失敗: ${err.message}`;
  }
  if (Date.now() - started > TIMEOUT_MS) break;
  await sleep(INTERVAL_MS);
}
console.log(`::warning::公開サイトのデータが ${Math.round(TIMEOUT_MS / 1000)} 秒以内に切り替わりませんでした（期待 ${expected} / 現在 ${last}）。通知は送りますが、開いた直後は古い情報が見える可能性があります`);
setEnv('timeout');
process.exit(0);
