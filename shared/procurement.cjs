'use strict';

// Official sites use several spellings for procurement directories/filenames.
const PROCUREMENT_PATH = /(?:^|\/)(?:choutatu|choutatsu|chotatu|chotatsu|nyuusatu|nyuusatsu|nyusatu|nyusatsu|keiyaku|procurement|open[-_]?counter|調達|入札|契約)(?=[/_.-]|$)/i;
const PROCUREMENT_TEXT = /オープンカウンター|入札公告|見積依頼|見積合わせ|調達品目|契約担当官|契約決定方式/;

/** Check before fetching/OCR and again before publication/carry-over. */
function isProcurementSource({ url = '', text = '' } = {}) {
  let pathname = '';
  try { pathname = new URL(url, 'https://example.invalid/').pathname; } catch { /* text still checked */ }
  try { pathname = decodeURIComponent(pathname); } catch { /* keep undecoded path */ }
  return PROCUREMENT_PATH.test(pathname) || PROCUREMENT_TEXT.test(String(text).normalize('NFKC').replace(/\s+/g, ''));
}

module.exports = { isProcurementSource };
