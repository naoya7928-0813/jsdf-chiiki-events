'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { isProcurementSource } = require('./procurement.cjs');
const Q = require('./titleQuality.cjs');
const { isCountableEvent } = require('./dataQuality.cjs');
const { carryOverVanishedPrefs } = require('./eventRegression.cjs');

const bad = { id: 'to-off-20261006-ilul3', pref: 'tokushima', date: '2026-10-06',
  title: '1 硬質カードケースA3', place: '納期', ageRequirement: '契約決定方式',
  url: 'https://www.mod.go.jp/pco/tokushima/choutatu/choutatu_24.pdf', source_type: 'office_ocr' };

test('徳島: 品目名に調達語がなくても公開・構造化データ・アーカイブへ入れない', () => {
  assert.equal(Q.isNonEventDocument(bad), true);
  assert.equal(Q.isEligibleForStructuredEvent(bad, '2026-10-05'), false);
  assert.equal(Q.isArchivableEvent(bad), false);
  assert.equal(isCountableEvent(bad), false);
  const prior = { tokushima: [bad, { ...bad, id: 'old-procurement' }] };
  const result = carryOverVanishedPrefs(prior, { tokushima: [] }, { today: '2026-10-05', isCountable: isCountableEvent });
  assert.deepEqual(result.carried, {});
});

test('調達資料はURL表記揺れ・画像URL・明確な見積文言でも除外する', () => {
  for (const name of ['choutatu', 'choutatsu', 'chotatsu', 'nyuusatu', 'nyuusatsu', 'nyusatsu', 'keiyaku', 'open_counter']) {
    assert.equal(isProcurementSource({ url: `https://www.mod.go.jp/pco/x/${name}/20261006.pdf` }), true, name);
  }
  assert.equal(Q.isNonEventDocument({ title: '公開説明会', imageUrl: bad.url }), true);
  assert.equal(Q.isNonEventDocument({ title: 'カードケース', notes: 'オープン カウンター方式による見積依頼' }), true);
  assert.equal(isProcurementSource({ url: 'https://www.mod.go.jp/pco/x/%E8%AA%BF%E9%81%94/file.pdf' }), true);
});

test('オープンキャンパス・体験・福利厚生説明会を誤除外しない', () => {
  for (const title of ['オープンキャンパス', '硬質カードケースを作る体験イベント', '福利厚生説明会']) {
    assert.equal(Q.isNonEventDocument({ title, url: 'https://www.mod.go.jp/pco/tokushima/event/20261006.pdf?from=choutatu' }), false);
  }
});

let cheerio;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* CI installs scraper deps */ }
test('徳島: 地本・案内所の共通ナビから調達ページやPDFをOCR候補にしない', { skip: !cheerio }, () => {
  const { findEventLinks } = require('../scraper/lib/exploreLinks');
  const { extractAssets } = require('../scraper/lib/extractAssets');
  const $ = cheerio.load(`<a href="choutatu.html">調達情報</a>
    <a href="choutatu/choutatu_24.pdf">最新イベント情報</a>
    <a href="files/20261006.pdf">オープンカウンター方式の見積依頼</a>
    <img src="choutatu/20261006.jpg" alt="資料">
    <a href="event/20261010.pdf">オープンキャンパス</a>`);
  const base = 'https://www.mod.go.jp/pco/tokushima/';
  const links = findEventLinks($, base);
  assert.deepEqual(links.pages, []);
  assert.deepEqual(links.assets.map(x => x.url), [base + 'event/20261010.pdf']);
  assert.deepEqual(extractAssets($, base).map(x => x.url), [base + 'event/20261010.pdf']);
  assert.deepEqual(extractAssets($, base + 'choutatu.html'), []);
});
