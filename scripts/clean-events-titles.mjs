/**
 * clean-events-titles.mjs（手動データクリーニング・一回限り）
 *
 * 既存の public/data/events.json に対して、フロント(useEvents)/スクレイパーと同じ
 * タイトル整形・非イベント除外を直接適用して上書きする。
 * 次回スクレイプを待たずに、表示・通知・events.json 本体を綺麗にするためのもの。
 *
 *   node scripts/clean-events-titles.mjs        # 適用して上書き
 *   node scripts/clean-events-titles.mjs --dry  # 集計のみ
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/events.json');
const DRY = process.argv.includes('--dry');

const isOffice = ev => typeof ev?.source_type === 'string' && ev.source_type.startsWith('office');
const OFFICE_NONEVENT_RE = /しました|されました|制度です|養成する|養成課程|修業期間|受付期間|応募資格|教育訓練|合格発表|合格者|VIEW\s*ALL|を養成|の紹介/;
const navMenuHits = s => (String(s || '').match(/イベント情報|採用試験情報|入札情報|重要なお知らせ|トピックス|お知らせ一覧|すべて/g) || []).length;

const weekdayCount = s => (String(s || '').match(/[日月火水木金土](?=[\s0-9０-９])/g) || []).length;
function officeIsJunk(title) {
  const t = String(title || '');
  if (OFFICE_NONEVENT_RE.test(t)) return true;
  if (navMenuHits(t) >= 2) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return true;
  if (/毎日実施|随時実施/.test(t)) return true;
  if (/Event\s*&\s*Seminar|各種説明会|＆各種/i.test(t)) return true;
  if (/[一-龥]{2,3}[都道府県][一-龥]{1,10}[市区郡].{0,18}(丁目|番地|ビル|庁舎|[0-9０-９]+階|第[0-9０-９]+)/.test(t)) return true;
  if (/0[0-9０-９]{1,4}[-－—][0-9０-９]{1,4}[-－—][0-9０-９]{3,4}/.test(t)) return true; // 電話番号混入
  if (weekdayCount(t) >= 4) return true;                                              // カレンダー表の塊
  if (/時期及び定員|提出書類|応募方法|別記|様式第/.test(t)) return true;              // フォーム/様式の項目
  return false;
}

function cleanOfficeTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/^(?:(?:お知らせ|重要(?:なお知らせ)?|新着|トピックス|new|NEW)\s*)+/gi, '');
  const quoted = t.match(/『([^』]{4,})』/);
  if (quoted) t = quoted[1];
  t = t.replace(/[●○]\s*【[^】]*】/g, ' ').replace(/[●○]/g, ' ');
  t = t.replace(/^(?:月日\s*[（(]?\s*曜日\s*[）)]?|イベント名|開催\s*日時?|場\s*所|時\s*間|種\s*類|区\s*分|内\s*容|[（()）\s])+/, '');
  t = t.split(/\s*(?:時間|場所|日時|開催日|受付期間|受付|開場|開演|問合せ|お問[い合]*せ|連絡先|TEL|電話)\s*[／/:：]?/)[0];
  t = t.split(/\s*開催/)[0];
  t = t.replace(/(?:令和|R|Ｒ)\s*[0-9０-９]{1,2}\s*年?\s*[0-9０-９]{1,2}\s*月\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/gi, '')
       .replace(/[0-9０-９]{4}\s*[年\/.-]\s*[0-9０-９]{1,2}\s*(?:月|[\/.-])\s*[0-9０-９]{1,2}\s*日?(?:[（(]\s*[月火水木金土日祝]\s*[）)])?/g, '')
       .replace(/[、,]?\s*[0-9０-９]{1,2}\s*[月\/.]?\s*[0-9０-９]{0,2}\s*日?\s*[（(][月火水木金土日祝][）)]/g, '')
       .replace(/[0-9０-９]{1,2}\s*[月\/.]\s*[0-9０-９]{1,2}\s*日?/g, '')
       .replace(/[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2}\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*[:：]\s*[0-9０-９]{2})?/g, '')
       .replace(/[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?\s*[~〜\-－]?\s*(?:[0-9０-９]{1,2}\s*時\s*[0-9０-９]{0,2}\s*分?)?/g, '')
       .replace(/[0-9０-９]{1,2}\s*月(?=\s|$)/g, '');
  t = t.replace(/[（(][^（()）]*(?:公式ページ|日程|ページ参照|参照|事前|まで)[^（()）]*[）)]/g, '');
  // 複数イベントが連結している場合は最初の項目だけ採用（令和○年度… が2回以上など）
  if ((t.match(/令和/g) || []).length >= 2) t = (t.split(/\s*令和[0-9０-９]/)[0] || t).trim();
  t = t.replace(/詳しくはこちら|詳しくみる|詳細はこちら|VIEW\s*ALL|お知らせ|NEWS|一覧/gi, '')
       .replace(/[｜|»>]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();
  t = t.replace(/^[\s月火水木金土日祝・,、)）]+/, '').trim();
  if ((t.match(/（/g) || []).length > (t.match(/）/g) || []).length) t = t.replace(/（[^（）]*$/, '').trim();
  if ((t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length) t = t.replace(/\([^()]*$/, '').trim();
  t = t.replace(/^[\s／/:：、,．.\-–—~〜【】\[\]<>!！#＃]+|[\s／/:：、,．.\-–—~〜【】\[\]<>、]+$/g, '').trim();
  return t; // 救済不能（空）の場合は空を返し、呼び出し側で除外する
}

function stripTrailingCta(raw) {
  if (!raw) return raw;
  const t = String(raw)
    .replace(/(?:詳細はこちら(?:から|をご覧ください)?|詳しくはこちら|詳しくみる|こちらをご覧ください|こちらから|こちら|詳細を見る)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t || raw;
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let dropped = 0, changed = 0, total = 0;
const samples = [];

for (const k of Object.keys(data)) {
  if (!Array.isArray(data[k])) continue;
  const next = [];
  for (const ev of data[k]) {
    total++;
    if (isOffice(ev) && officeIsJunk(ev.title)) { dropped++; continue; }
    const cleaned = isOffice(ev) ? stripTrailingCta(cleanOfficeTitle(ev.title)) : stripTrailingCta(ev.title);
    // 整形しても中身が残らない（救済不能）募集案内所イベントは除外
    if (isOffice(ev) && (cleaned === '募集案内所イベント' || cleaned.replace(/[\s　]/g, '').length < 4)) { dropped++; continue; }
    if (cleaned !== ev.title) {
      if (samples.length < 25) samples.push(`[${k}] ${ev.title}\n      → ${cleaned}`);
      ev.title = cleaned;
      changed++;
    }
    next.push(ev);
  }
  data[k] = next;
}

console.log(`総数:${total} 除外:${dropped} タイトル変更:${changed}`);
console.log('--- 変更サンプル ---');
samples.forEach(s => console.log('  ' + s));

if (DRY) { console.log('\n--dry のため書き込みません'); }
else {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('\npublic/data/events.json を更新しました');
}
