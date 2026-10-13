'use strict';
// 掲載イベントの統計・閲覧数の出力（運営画面の「出力」）。2026-10-13 導入。
//   - 集計（地本別・月別・種別）… summarize
//   - CSV（Excel で開ける UTF-8 BOM 付き）… toCsv
//   - Excel（.xlsx）… toXlsx（依存ライブラリなし。無圧縮 ZIP＋最小限の SpreadsheetML）
// PDF は運営画面が印刷用ページを開き、ブラウザの「PDF に保存」で出力する（日本語フォントを同梱しないため）。
// 印刷用ページにはスクリプトを書かない（CSP が script-src 'self' のため。印刷は開いた側から呼ぶ）。
// ブラウザ・Node の両方で動く（Uint8Array / TextEncoder のみ使用）。

const COLUMNS = [
  ['date', '開催日'], ['endDate', '終了日'], ['prefLabel', '地本'], ['title', 'イベント名'], ['category', '種別'],
  ['place', '会場'], ['statusLabel', '状態'], ['kindLabel', '区分'], ['total', '閲覧数（累計）'], ['d30', '閲覧数（30日）'],
  ['d7', '閲覧数（7日）'], ['today', '閲覧数（今日）'], ['url', '掲載元URL'], ['id', 'イベントID'],
];
const NUM_COLS = new Set(['total', 'd30', 'd7', 'today']);
const STATUS_LABEL = { published: '開催予定', closed: '受付終了', cancelled: '中止', postponed: '延期', draft: '下書き', ended: '終了' };
const KIND_LABEL = { scraped: '自動収集（掲載中）', manual: '運営登録', archive: '過去（アーカイブ）' };

/** 行を出力用の形にそろえる（地本名・状態名など）。 */
function toRows(rows, prefLabels = {}, today = '') {
  return (rows || []).map(r => {
    const end = r.endDate || r.date || '';
    const status = r.status || (today && end && end < today ? 'ended' : 'published');
    return {
      ...r,
      prefLabel: prefLabels[r.pref] || r.pref || '',
      statusLabel: STATUS_LABEL[status] || status,
      kindLabel: KIND_LABEL[r.kind] || r.kind || '',
      total: r.total | 0, d30: r.d30 | 0, d7: r.d7 | 0, today: r.today | 0,
    };
  });
}

/** 期間（開催日）で絞り込む。from/to は YYYY-MM-DD（空なら制限なし）。 */
function filterByDate(rows, { from = '', to = '' } = {}) {
  return rows.filter(r => (!from || (r.endDate || r.date || '') >= from) && (!to || (r.date || '') <= to));
}

function groupCount(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || '（不明）';
    const g = m.get(k) || { key: k, events: 0, total: 0, d30: 0, d7: 0 };
    g.events++; g.total += r.total | 0; g.d30 += r.d30 | 0; g.d7 += r.d7 | 0;
    m.set(k, g);
  }
  return [...m.values()];
}

/** 集計: 全体・地本別・月別・種別。 */
function summarize(rows) {
  return {
    totals: { events: rows.length, total: rows.reduce((a, r) => a + (r.total | 0), 0), d30: rows.reduce((a, r) => a + (r.d30 | 0), 0), d7: rows.reduce((a, r) => a + (r.d7 | 0), 0) },
    byPref: groupCount(rows, r => r.prefLabel).sort((a, b) => b.events - a.events || a.key.localeCompare(b.key, 'ja')),
    byMonth: groupCount(rows, r => (r.date || '').slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: groupCount(rows, r => r.category).sort((a, b) => b.events - a.events),
    byStatus: groupCount(rows, r => r.statusLabel).sort((a, b) => b.events - a.events),
  };
}

const SUMMARY_HEAD = ['項目', 'イベント数', '閲覧数（累計）', '閲覧数（30日）', '閲覧数（7日）'];
const summaryTable = (groups) => groups.map(g => [g.key, g.events, g.total, g.d30, g.d7]);

/** 出力するシート（表）の一覧: [{ name, head, rows }] */
function buildSheets(rows, meta = {}) {
  const s = summarize(rows);
  const info = [
    ['出力日時', meta.generatedAt || ''], ['担当範囲', meta.scope || ''], ['対象期間（開催日）', `${meta.from || '指定なし'} ～ ${meta.to || '指定なし'}`],
    ['イベント数', s.totals.events], ['閲覧数（累計）', s.totals.total], ['閲覧数（30日）', s.totals.d30], ['閲覧数（7日）', s.totals.d7],
    ['注記', '閲覧数はイベント詳細が開かれた回数（人数ではありません）。日付は日本時間。'],
  ];
  return [
    { name: '概要', head: ['項目', '値'], rows: info },
    { name: 'イベント一覧', head: COLUMNS.map(c => c[1]), rows: rows.map(r => COLUMNS.map(([k]) => r[k] ?? '')) },
    { name: '地本別', head: SUMMARY_HEAD, rows: summaryTable(s.byPref) },
    { name: '月別', head: SUMMARY_HEAD, rows: summaryTable(s.byMonth) },
    { name: '種別', head: SUMMARY_HEAD, rows: summaryTable(s.byCategory) },
    { name: '状態別', head: SUMMARY_HEAD, rows: summaryTable(s.byStatus) },
  ];
}

// ── CSV ─────────────────────────────────────────────────────────
// 表計算ソフトで数式として解釈される先頭文字は無害化する（CSV インジェクション対策）
const safeCell = (v) => {
  if (typeof v === 'number') return String(v);
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
const csvCell = (v) => { const s = safeCell(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function toCsv(rows) {
  const lines = [COLUMNS.map(c => c[1]), ...rows.map(r => COLUMNS.map(([k]) => (NUM_COLS.has(k) ? (r[k] | 0) : r[k] ?? '')))];
  return '﻿' + lines.map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ── XLSX（無圧縮 ZIP） ────────────────────────────────────────────
const enc = (s) => new TextEncoder().encode(s);
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // XML 1.0 で使えない制御文字は除く
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const parts = []; const central = []; let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc(f.name); const data = f.data; const crc = crc32(data);
    const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function sheetXml(head, rows) {
  const cell = (v, r, c, style) => {
    const ref = `${colName(c)}${r}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlEsc(v ?? '')}</t></is></c>`;
  };
  const lines = [`<row r="1">${head.map((h, c) => cell(h, 1, c, 1)).join('')}</row>`,
    ...rows.map((row, i) => `<row r="${i + 2}">${row.map((v, c) => cell(v, i + 2, c, 0)).join('')}</row>`)];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<sheetData>${lines.join('')}</sheetData></worksheet>`;
}

/** シート一覧から .xlsx のバイト列を作る。 */
function toXlsx(sheets) {
  const safeName = (n, i) => (String(n).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || `Sheet${i + 1}`);
  const files = [
    { name: '[Content_Types].xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { name: '_rels/.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECEF"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(s.head, s.rows)) })),
  ];
  return zipStore(files);
}

// ── PDF（印刷用 HTML） ─────────────────────────────────────────────
function toPrintHtml(sheets, { title = '掲載イベントの統計' } = {}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const table = (s) => `<h2>${esc(s.name)}</h2><table><thead><tr>${s.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    s.rows.map(r => `<tr>${r.map(v => `<td${typeof v === 'number' ? ' class="n"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  // 一覧は URL・ID を除いて印刷する（紙面の幅に収めるため）
  const printable = sheets.map(s => (s.name === 'イベント一覧'
    ? { ...s, head: s.head.slice(0, -2), rows: s.rows.map(r => r.slice(0, -2)) } : s));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;font-size:10px;color:#111;margin:16px}
    h1{font-size:16px;margin:0 0 8px}h2{font-size:12.5px;margin:16px 0 6px;break-after:avoid}
    table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}
    th{background:#e8ecef}td.n{text-align:right;font-variant-numeric:tabular-nums}tr{break-inside:avoid}
    .note{color:#555;margin:4px 0 10px}@page{size:A4 landscape;margin:12mm}
    @media screen{.bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:8px}}
    @media print{.bar{display:none}}
  </style></head><body><div class="bar">印刷画面で「PDFに保存」を選んでください（印刷画面が開かない場合は Ctrl+P／⌘+P、スマホは共有メニューの「プリント」）。</div>
  <h1>${esc(title)}</h1><div class="note">閲覧数はイベント詳細が開かれた回数です（人数ではありません）。</div>${printable.map(table).join('')}</body></html>`;
}

module.exports = { COLUMNS, STATUS_LABEL, KIND_LABEL, toRows, filterByDate, summarize, buildSheets, toCsv, toXlsx, toPrintHtml, crc32 };
