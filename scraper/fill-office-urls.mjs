/**
 * fill-office-urls.mjs
 *
 * 関東7県の募集案内所・地域事務所・出張所について、地本トップで固定されていた
 * url を「各拠点の個別公式ページ」に差し替える。
 * 個別ページURLは scraper/index.js の KANTO_OFFICE_URLS と同じパターンを使用。
 * 反映前に各URLを実際にHTTP取得して 200 を確認し、200のときだけ採用する
 * （404/到達不能なら地本トップのまま据え置き）。
 *
 * 使用方法:
 *   node scraper/fill-office-urls.mjs           # 検証して offices.json を更新
 *   node scraper/fill-office-urls.mjs --dry     # 検証のみ（書き込まない）
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ROOT     = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'public/data/offices.json');
const DRY      = process.argv.includes('--dry');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 拠点名 → 個別ページのスラッグ（KANTO_OFFICE_URLS と対応）
const SLUGS = {
  ibaraki: {
    '水戸募集案内所': 'mito', '日立出張所': 'hitachi', '土浦地域事務所': 'tsuchiura',
    '龍ヶ崎地域事務所': 'ryugasaki', '筑西地域事務所': 'chikusei',
  },
  gunma: {
    '前橋地域事務所': 'maebashi', '高崎出張所': 'takasaki', '沼田地域事務所': 'numata',
    '太田出張所': 'oota', '太田地域事務所': 'oota',
  },
  tochigi: {
    '小山地域事務所': 'oyama', '真岡募集案内所': 'mohka', '足利地域事務所': 'ashikaga',
  },
  chiba: {
    '市川募集案内所': 'itikawatop', '船橋出張所': 'funabashitop', '成田地域事務所': 'narita',
    '木更津地域事務所': 'kisaradu', '茂原地域事務所': 'mobara',
  },
  saitama: {
    'さいたま地域事務所': 'saitama', '入間地域事務所': 'iruma',
    '朝霞地域事務所': 'asaka', '熊谷地域事務所': 'kumagaya',
  },
  tokyo: {
    '港出張所': 'minato', '豊島出張所': 'toshima', '大田出張所': 'oota', '江東出張所': 'koutou',
    '台東出張所': 'taitou', '立川出張所': 'tachikawa', '足立地域事務所': 'adachi',
    '西東京地域事務所': 'nishitokyo', '高円寺募集案内所': 'kouenji', '渋谷募集案内所': 'shibuya',
    '国分寺募集案内所': 'kokubunji', '町田募集案内所': 'machida',
  },
  kanagawa: {
    '横浜中央募集案内所': 'chuou', '市ヶ尾募集案内所': 'ichigao', '藤沢募集案内所': 'fujisawa',
    '厚木募集案内所': 'atugi', '横須賀地域事務所': 'yokosuka', '平塚地域事務所': 'hiratuka',
    '小田原地域事務所': 'odawara', '相模原地域事務所': 'sagami',
  },
};

// pref ごとの個別ページURLの組み立て規則
const URL_BUILDERS = {
  ibaraki:  s => `https://www.mod.go.jp/pco/ibaraki/jimusho/${s}.html`,
  gunma:    s => `https://www.mod.go.jp/pco/gunma/bosyuannai/${s}_sho/${s}.html`,
  tochigi:  s => `https://www.mod.go.jp/pco/tochigi/jimusyo_${s}.html`,
  chiba:    s => `https://www.mod.go.jp/pco/chiba/map/${s}.html`,
  saitama:  s => `https://www.mod.go.jp/pco/saitama/office/${s}-office.html`,
  tokyo:    s => `https://www.mod.go.jp/pco/tokyo/${s}/`,
  kanagawa: s => `https://www.mod.go.jp/pco/kanagawa/mado/${s}/${s}.html`,
};

// mod.go.jp は Node の fetch をbot対策で 403 にする（ブラウザ/curl の UA は許可）。
// 実ブラウザ相当の curl で到達確認する。
async function check200(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
        '-w', '%{http_code}', '-L', '--max-time', '20', '-A', UA, url,
      ], { timeout: 30000 });
      const code = parseInt(String(stdout).trim(), 10);
      if (Number.isFinite(code) && code > 0) return code;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800));
  }
  return 0;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
  let updated = 0, kept = 0, failed = 0, unmapped = 0;

  for (const o of data.offices) {
    if (o.type === 'hq') continue;
    const map = SLUGS[o.pref];
    const build = URL_BUILDERS[o.pref];
    if (!map || !build) continue;            // 関東以外は対象外
    const slug = map[o.name];
    if (!slug) { unmapped++; continue; }      // 個別ページ不明 → 地本トップのまま

    const candidate = build(slug);
    const status = await check200(candidate);
    if (status === 200) {
      o.hasOfficialPage = true;
      if (o.url !== candidate) { o.url = candidate; updated++; }
      else kept++;
      console.log(`✓ ${o.pref} ${o.name} → ${candidate}`);
    } else {
      failed++;
      console.warn(`✗ ${o.pref} ${o.name} (HTTP ${status}) → 据え置き: ${o.url}`);
    }
  }

  console.log(`\n更新:${updated} 既に一致:${kept} 検証失敗(据え置き):${failed} 個別ページ無し:${unmapped}`);

  if (DRY) { console.log('--dry のため書き込みません'); return; }
  if (updated > 0) {
    fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`offices.json を更新しました (${updated}件)`);
  } else {
    console.log('更新対象がないため書き込みませんでした');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
