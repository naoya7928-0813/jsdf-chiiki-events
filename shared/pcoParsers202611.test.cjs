'use strict';
// 茨城・宮城・兵庫(イベント) パーサーの回帰テスト（実ページ fixture。2026-10/11 に取得）。
// 3地本とも公式ページの作りが変わり、パーサーが 0 件を返して前回データのまま止まっていた:
//   茨城: h3 + h4「4月26日 日曜日」→ h3 + <dl><dt>日程</dt><dd>11月3日(火・祝)</dd>…
//   宮城: 新着イベントの日付「NEWS 2026.4.25」→「2026.10.31」（同じ枠の「お知らせ」と同じ形）
//   兵庫: イベント名にイベント語が無い（「自衛隊サテライトブース」「防災フェスin神戸北」）
//
// cheerio はスクレイパー側（scraper/node_modules）にだけ入っているため、未インストールの環境ではスキップする。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let cheerio = null;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* 未インストール */ }
const skip = cheerio ? false : 'cheerio 未インストール（scraper の依存が必要）';

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

// isPast・年の判定は実時刻を見るため、fixture 取得時点に固定する
function parseAt(isoNow, mod, fn, html) {
  const RealDate = Date;
  const fixed = new RealDate(isoNow).getTime();
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
  try {
    delete require.cache[require.resolve(`../scraper/parsers/${mod}`)];
    delete require.cache[require.resolve('../scraper/parsers/utils')];
    return require(`../scraper/parsers/${mod}`)[fn](cheerio.load(html, { decodeEntities: false }));
  } finally { global.Date = RealDate; }
}

const weekdayOf = date => '日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()];

test('茨城: dl 形式（日程・時間・場所・詳細）から全件取得する', { skip }, () => {
  const evs = parseAt('2026-11-03T09:00:00+09:00', 'ibaraki', 'parseIbaraki', fixture('ibaraki-event-2026-11.html'));
  assert.equal(evs.length, 18);
  const by = Object.fromEntries(evs.map(e => [`${e.date} ${e.title}`, e]));
  const kawachi = by['2026-11-03 かわちドリームフェスタ'];
  assert.equal(kawachi.place, 'かわち水と緑のふれあい公園');
  assert.equal(kawachi.time, '10:30～15:00');
  assert.equal(kawachi.url, 'https://www.town.ibaraki-kawachi.lg.jp/page/page003312.html');
  assert.equal(by['2026-11-08 土浦駐屯地記念行事'].place, '土浦駐屯地');
  assert.match(by['2026-11-03 第49回みほ産業文化フェスティバル'].notes, /制服試着/);
  // 日付の無い見出し（クイズ企画）は拾わない
  assert.ok(!evs.some(e => /にゃっとら/.test(e.title)));
  for (const e of evs) {
    assert.equal(e.pref, 'ibaraki');
    assert.match(e.id, /^ib-\d{8}-/);
    assert.equal(e.weekday, weekdayOf(e.date));
  }
});

test('茨城: 飛び飛びの複数日は日ごとに1件。ページの曜日の書き間違いでも日付を捨てない', { skip }, () => {
  const evs = parseAt('2026-11-03T09:00:00+09:00', 'ibaraki', 'parseIbaraki', fixture('ibaraki-event-2026-11.html'));
  // ページは「11月11日(火)、12日(水)、17日(火)、18日(水)、19日(木)」（11日・12日の曜日が実際と1日ずれている）
  const dates = evs.filter(e => /ヒタチエ/.test(e.title)).map(e => e.date);
  assert.deepEqual(dates, ['2026-11-11', '2026-11-12', '2026-11-17', '2026-11-18', '2026-11-19']);
});

test('茨城: 年末は翌年1月の予定を翌年として読む・連日開催は endDate', { skip }, () => {
  const html = `<div class="post">
    <h3>新春イベント</h3><dl><dt>日程</dt><dd>1月10日(日)</dd><dt>場所</dt><dd>水戸駅</dd></dl>
    <h3>連日フェア</h3><dl><dt>日程</dt><dd>12月19日(土)～20日(日)</dd></dl>
  </div>`;
  const evs = parseAt('2026-12-01T09:00:00+09:00', 'ibaraki', 'parseIbaraki', html);
  const by = Object.fromEntries(evs.map(e => [e.title, e]));
  assert.equal(by['新春イベント'].date, '2027-01-10');
  assert.equal(by['連日フェア'].date, '2026-12-19');
  assert.equal(by['連日フェア'].endDate, '2026-12-20');
});

test('茨城: 旧形式（h3 + h4「日時」）も引き続き読める', { skip }, () => {
  const html = `<div class="post">
    <h3>土浦駐屯地 見学会</h3><h4>日時：4月26日　日曜日　午前10時から午後3時</h4><p>場所：土浦駐屯地にて</p>
  </div>`;
  const evs = parseAt('2026-04-01T09:00:00+09:00', 'ibaraki', 'parseIbaraki', html);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].date, '2026-04-26');
  assert.equal(evs[0].place, '土浦駐屯地');
});

test('宮城: 「新着イベント」の枠だけを読み、「お知らせ」の更新履歴を拾わない', { skip }, () => {
  const evs = parseAt('2026-10-30T12:00:00+09:00', 'miyagi', 'parseMiyagi', fixture('miyagi-top-2026-10.html'));
  assert.deepEqual(evs.map(e => `${e.date} ${e.title}`), [
    '2026-10-31 くりはら市民まつり',
    '2026-10-31 あすとつながるぐりりパーク',
    '2026-11-01 たじり文化祭・JA祭IN田尻',
  ]);
  assert.equal(evs[0].place, 'イオンスーパーセンター栗原志波姫店');
  assert.match(evs[0].notes, /96式装輪装甲車/);
  assert.ok(!evs.some(e => /掲載|更新|新コンテンツ/.test(e.title)));
});

test('宮城: 旧形式「NEWS 2026.4.25-26」も読め、期間は endDate', { skip }, () => {
  const html = `<div id="toppage-news"><h3>新着イベント EVENT</h3>
    <dl><dt>NEWS 2026.4.25-26</dt><dd><a href="https://example.jp/ev">春まつり</a></dd></dl></div>`;
  const evs = parseAt('2026-04-01T09:00:00+09:00', 'miyagi', 'parseMiyagi', html);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].date, '2026-04-25');
  assert.equal(evs[0].endDate, '2026-04-26');
  assert.equal(evs[0].url, 'https://example.jp/ev');
});

test('兵庫(イベント): イベント語の無い見出しも「日時」が続けば取る。会場に「内容」を混ぜない', { skip }, () => {
  const evs = parseAt('2026-11-03T09:00:00+09:00', 'hyogo', 'parseHyogoEvents', fixture('hyogo-event-2026-11.html'));
  assert.deepEqual(evs.map(e => `${e.date} ${e.title}`), [
    '2026-10-31 自衛隊サテライトブース',
    '2026-11-03 自衛隊サテライトブース2026',
    '2026-11-07 防災フェスin神戸北',
    '2026-12-04 自衛隊が姫路駅にやってくる',
    '2026-12-05 自衛隊が姫路駅にやってくる',
    '2026-12-06 自衛隊が姫路駅にやってくる',
    '2026-12-07 自衛隊が姫路駅にやってくる',
  ]);
  const by = Object.fromEntries(evs.map(e => [`${e.date} ${e.title}`, e]));
  // 期間開催は初日が過ぎていても最終日まで残す
  assert.equal(by['2026-10-31 自衛隊サテライトブース'].endDate, '2026-11-03');
  assert.equal(by['2026-10-31 自衛隊サテライトブース'].place, '阪急西宮北口駅構内(カリヨン広場)');
  assert.equal(by['2026-11-07 防災フェスin神戸北'].place, 'イオンモール神戸北');
  assert.equal(by['2026-11-07 防災フェスin神戸北'].time, '10:00～13:00');
  for (const e of evs) assert.ok(!/内\s*容/.test(e.place), e.place);
  // 事務所名だけの見出し（「神　戸」等）はイベントにしない
  assert.ok(!evs.some(e => /^[西神姫]\s*[宮戸路]$/.test(e.title.replace(/\s/g, ''))));
});

test('兵庫: 日付の読み取り（月を省いた続き・改行で区切りなし・期間・「2日間」を拾わない）', { skip }, () => {
  const { parseDates } = (() => {
    delete require.cache[require.resolve('../scraper/parsers/hyogo')];
    return require('../scraper/parsers/hyogo');
  })();
  const at = (iso, fn) => {
    const RealDate = Date; const fixed = new RealDate(iso).getTime();
    global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
    try { return fn(); } finally { global.Date = RealDate; }
  };
  at('2026-11-03T09:00:00+09:00', () => {
    assert.deepEqual(parseDates('11月7日(土)、8日(日)、14日(土)21日(土)、22日(日)').map(d => d.date),
      ['2026-11-07', '2026-11-08', '2026-11-14', '2026-11-21', '2026-11-22']);
    assert.deepEqual(parseDates('11月3日(火) 2日間開催').map(d => d.date), ['2026-11-03']);
    assert.deepEqual(parseDates('10月31日(土)～11月3日(火・祝) 10:00-20:00'),
      [{ date: '2026-10-31', weekday: '土', endDate: '2026-11-03' }]);
    assert.deepEqual(parseDates('10月25日(日)～11月1日(日)'), []); // 期間ごと終了済み
  });
});
