'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reportExport.cjs');

const RAW = [
  { id: 'a1', kind: 'scraped', pref: 'tokyo', title: '駐屯地見学', date: '2026-10-20', category: '体験', place: '練馬', total: 12, d30: 10, d7: 3, today: 1, url: 'https://www.mod.go.jp/a' },
  { id: 'a2', kind: 'archive', pref: 'tokyo', title: '=HYPERLINK("x")', date: '2026-08-01', category: '説明会', place: '新宿', total: 5, d30: 0, d7: 0, today: 0 },
  { id: 'a3', kind: 'manual', pref: 'osaka', title: '演奏会, "特別"', date: '2026-10-25', endDate: '2026-10-26', category: '演奏会', status: 'cancelled', total: 0 },
];
const LABELS = { tokyo: '東京', osaka: '大阪' };

test('行の整形・期間の絞り込み・集計', () => {
  const rows = R.toRows(RAW, LABELS, '2026-10-13');
  assert.equal(rows[0].prefLabel, '東京');
  assert.equal(rows[1].statusLabel, '終了');
  assert.equal(rows[2].statusLabel, '中止');
  assert.equal(rows[1].kindLabel, '過去（アーカイブ）');
  assert.equal(R.filterByDate(rows, { from: '2026-10-01' }).length, 2);
  assert.equal(R.filterByDate(rows, { to: '2026-09-30' }).length, 1);
  assert.equal(R.filterByDate(rows, { from: '2026-10-26', to: '2026-10-31' }).map(r => r.id).join(), 'a3', '連日開催は終了日で含める');
  const s = R.summarize(rows);
  assert.deepEqual(s.totals, { events: 3, total: 17, d30: 10, d7: 3 });
  assert.deepEqual(s.byPref.map(g => [g.key, g.events, g.total]), [['東京', 2, 17], ['大阪', 1, 0]]);
  assert.deepEqual(s.byMonth.map(g => g.key), ['2026-08', '2026-10']);
});

test('CSV: Excel 用の BOM・引用・数式インジェクション対策', () => {
  const csv = R.toCsv(R.toRows(RAW, LABELS, '2026-10-13'));
  assert.ok(csv.startsWith('﻿開催日,'));
  assert.ok(csv.includes(`'=HYPERLINK(""x"")`), '数式として解釈される先頭文字を無害化');
  assert.ok(csv.includes('"演奏会, ""特別"""'));
});

// 無圧縮 ZIP を読む（中身の検証用）
function unzip(buf) {
  const files = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8); const crc = buf.readUInt32LE(p + 14); const size = buf.readUInt32LE(p + 18);
    const nlen = buf.readUInt16LE(p + 26); const xlen = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nlen).toString('utf8');
    const data = buf.slice(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    assert.equal(method, 0);
    assert.equal(R.crc32(data), crc, `CRC ${name}`);
    files[name] = data.toString('utf8');
    p += 30 + nlen + xlen + size;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, '中央ディレクトリの終端');
  return files;
}

test('XLSX: 正しい ZIP（CRC 一致）で、シート・数値・日本語・XML エスケープが入る', () => {
  const rows = R.toRows(RAW, LABELS, '2026-10-13');
  const sheets = R.buildSheets(rows, { generatedAt: '2026-10-13 12:00', scope: '東京' });
  const buf = Buffer.from(R.toXlsx(sheets));
  const files = unzip(buf);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[n], n);
  assert.equal(Object.keys(files).filter(n => n.startsWith('xl/worksheets/')).length, sheets.length);
  assert.match(files['xl/workbook.xml'], /name="イベント一覧"/);
  const list = files['xl/worksheets/sheet2.xml'];
  assert.match(list, /<v>12<\/v>/, '閲覧数は数値セル');
  assert.match(list, /駐屯地見学/);
  assert.match(list, /=HYPERLINK\(&quot;x&quot;\)/, 'XML エスケープ（セルは文字列なので数式にならない）');
  assert.ok(!/<f>/.test(list), '数式セルを作らない');
  assert.ok(crcSelfCheck());
});

// 既知の CRC32（"123456789" → cbf43926）
function crcSelfCheck() { return R.crc32(Buffer.from('123456789')) === 0xcbf43926; }

test('PDF（印刷用）: 表を出し、一覧は URL・ID を省く・HTML をエスケープ', () => {
  const rows = R.toRows([...RAW, { id: 'x', pref: 'tokyo', title: '<script>alert(1)</script>', date: '2026-10-30' }], LABELS, '2026-10-13');
  const html = R.toPrintHtml(R.buildSheets(rows, {}));
  assert.match(html, /<h2>イベント一覧<\/h2>/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('https://www.mod.go.jp/a'), '印刷では URL 列を省く');
});

test('PDF（印刷用）: スクリプトを含めない（CSP script-src self で動かないため）', () => {
  const html = R.toPrintHtml(R.buildSheets(R.toRows(RAW, LABELS, '2026-10-13'), {}));
  assert.ok(!/<script|onclick=|javascript:/i.test(html));
});
