'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let cheerio = null;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* scraper deps required */ }
const skip = cheerio ? false : 'cheerio 未インストール（scraper の依存が必要）';

function withNow(iso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
  try {
    delete require.cache[require.resolve('../scraper/parsers/sapporo')];
    delete require.cache[require.resolve('../scraper/parsers/utils')];
    return fn(require('../scraper/parsers/sapporo'));
  } finally {
    global.Date = RealDate;
  }
}

test('札幌: 令和8年10月24日の北部方面隊音楽まつりを静的HTML表から取得', { skip }, () => {
  const html = `
    <table>
      <thead><tr><th>期日</th><th>行事名</th><th>場所</th><th>連絡先</th></tr></thead>
      <tbody>
        <tr>
          <td>令和８年１０月２４日（土）</td>
          <td><a href="concert.html">陸上自衛隊北部方面隊音楽まつり</a></td>
          <td>札幌コンサートホールKitaura</td>
          <td>北部方面総監部広報室</td>
        </tr>
      </tbody>
    </table>`;

  withNow('2026-10-04T20:00:00+09:00', ({ parseSapporoPage }) => {
    const evs = parseSapporoPage(
      cheerio.load(html, { decodeEntities: false }),
      '演奏会',
      'co',
      { counter: 0 },
      'https://www.mod.go.jp/pco/sapporo/event_concert.html',
    );
    assert.equal(evs.length, 1);
    assert.equal(evs[0].date, '2026-10-24');
    assert.equal(evs[0].weekday, '土');
    assert.equal(evs[0].title, '陸上自衛隊北部方面隊音楽まつり');
    assert.equal(evs[0].place, '札幌コンサートホールKitaura');
    assert.equal(evs[0].category, '演奏会');
  });
});

test('兵庫: 募集案内所イベント名の先頭誘導矢印を除去', () => {
  const { cleanOfficeTitle } = require('./officeTitle.cjs');
  assert.equal(cleanOfficeTitle('☛「自衛隊職業説明会」ハローワーク西宮'), '「自衛隊職業説明会」ハローワーク西宮');
  assert.equal(cleanOfficeTitle('☞～「自衛隊個別説明会」川西地域事務所'), '「自衛隊個別説明会」川西地域事務所');
});
