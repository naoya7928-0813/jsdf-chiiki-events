'use strict';
// 東京（calendar.js ＋ 事務所ページ）の時刻取得のテスト。
// 2026-09-23 事故: calendar.js は開催日しか持たず、時刻はチラシ OCR でだけ埋まっていた。
// OCR が時間切れで見送られた回に「宇都宮駐屯地見学」「習志野駐屯地見学」の time が空で公開された。
// 事務所ページ（koutou/index.html）の表には「令和８年１０月１９日（月）10:00～15:00」と書かれている。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseTokyoCalendar, extractTime, extractOfficePageDetails } = require('../scraper/parsers/tokyoCalendar');

let cheerio = null;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* 未インストール */ }
const skip = cheerio ? false : 'cheerio 未インストール（scraper の依存が必要）';

test('extractTime: 日付の後ろの時刻だけを取り出す（全角・全角コロンも可）', () => {
  assert.equal(extractTime('令和８年１０月１９日（月）10:00～15:00'), '10:00～15:00');
  assert.equal(extractTime('2026年10月3日（土）12：00'), '12:00');
  assert.equal(extractTime('2026年10月19日（月）'), '');
  assert.equal(extractTime('2026年10月19日（月）9:30〜11:20'), '09:30～11:20');
  assert.equal(extractTime(''), '');
});

test('parseTokyoCalendar: period に時刻があれば time に入れる（無ければ空のまま・推測しない）', () => {
  const js = `const EVENTS = {
    '2026-10': {
      3:  [ { cat: '陸見学', office: '渋谷募集案内所', title: '富士駐屯地記念行事予行研修', period: '2026年10月3日（土）12：00', link: '../shibuya/index.html#1003' } ],
      19: [ { cat: '陸見学', office: '江東出張所', title: '宇都宮駐屯地見学', period: '2026年10月19日（月）', link: '../koutou/index.html#1019' } ],
    },
  };`;
  const evs = parseTokyoCalendar(js);
  const by = Object.fromEntries(evs.map(e => [e.title, e]));
  assert.equal(by['富士駐屯地記念行事予行研修'].time, '12:00');
  assert.equal(by['宇都宮駐屯地見学'].time, '');
  assert.equal(by['宇都宮駐屯地見学'].url, 'https://www.mod.go.jp/pco/tokyo/koutou/index.html#1019');
});

// 実ページ（koutou/event.html, 2026-09-23 取得）のイベント表の構造
const OFFICE_HTML = `<table><tbody><tr>
  <td class="section_title">習志野駐屯地見学</td>
  <td><p>令和８年９月２９日（火）10:00～15:00<br>締切 ８月３１日（月）まで</p></td>
</tr></tbody></table>
<table><tbody><tr>
  <td class="section_title">宇都宮駐屯地見学</td>
  <td><p>令和８年１０月１９日（月）10:00～15:00<br>締切 １０月１２日（月）まで<br>無料マイクロバスで送迎（０８００頃出発予定）<br>体験喫食代　無料</p></td>
</tr></tbody></table>`;

test('extractOfficePageDetails: 事務所ページの表からタイトル・開催日一致の行の時刻を取る', { skip }, () => {
  const $ = cheerio.load(OFFICE_HTML);
  assert.deepEqual(extractOfficePageDetails($, { title: '宇都宮駐屯地見学', date: '2026-10-19' }), { time: '10:00～15:00' });
  assert.deepEqual(extractOfficePageDetails($, { title: '習志野駐屯地見学', date: '2026-09-29' }), { time: '10:00～15:00' });
  // 「送迎（０８００頃出発予定）」の数字を時刻と誤認しない／開催日が違えば取らない
  assert.equal(extractOfficePageDetails($, { title: '宇都宮駐屯地見学', date: '2026-10-20' }), null);
  assert.equal(extractOfficePageDetails($, { title: '朝霞駐屯地見学', date: '2026-10-19' }), null);
});
