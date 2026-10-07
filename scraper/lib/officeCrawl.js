'use strict';
const { normalizeUrl } = require('./normalizeUrl');
const { isProcurementSource } = require('../../shared/procurement.cjs');

function isOfficialHtml(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.mod.go.jp' && u.pathname.startsWith('/pco/')
      && !/\.(?:pdf|jpe?g|png|gif|webp|zip|pptx?|xlsx?|docx?)$/i.test(u.pathname) && !isProcurementSource({ url });
  } catch { return false; }
}

// Explicit event pages remain crawlable even when a contact page is shared or the
// directory addition has not yet been published. Each URL is requested only once.
function buildOfficePages(offices, configured = [], excludedPrefs = new Set(), legacyPages = {}) {
  const pages = new Map();
  const add = (office, source, explicit = false) => {
    const url = typeof source === 'string' ? source : source.url;
    if (!isOfficialHtml(url)) return;
    const normalized = normalizeUrl(url); const key = `${office.pref}|${normalized}`;
    if (!pages.has(key)) pages.set(key, { pref: office.pref, url, normalized, officeNames: [], officeIds: [], explicit, scope: source.scope || 'office' });
    const p = pages.get(key);
    p.explicit ||= explicit;
    if (source.scope === 'shared') p.scope = 'shared';
    if (office.name && !p.officeNames.includes(office.name)) p.officeNames.push(office.name);
    if (office.id && !p.officeIds.includes(office.id)) p.officeIds.push(office.id);
  };
  const configuredIds = new Set(configured.map(o => o.id));
  const headquarters = new Set((offices || []).filter(o => o.type === 'hq').map(o => normalizeUrl(o.url)));
  for (const o of offices || []) {
    if (o.type !== 'recruitment' || excludedPrefs.has(o.pref) || configuredIds.has(o.id)) continue;
    add(o, { url: o.url, scope: headquarters.has(normalizeUrl(o.url)) ? 'shared' : 'office' });
  }
  for (const [pref, urls] of Object.entries(legacyPages)) {
    for (const url of urls) {
      const matches = (offices || []).filter(o => o.pref === pref && o.type === 'recruitment' && normalizeUrl(o.url) === normalizeUrl(url));
      for (const o of matches.length ? matches : [{ pref }]) add(o, { url });
    }
  }
  for (const o of configured) for (const source of o.pages || []) add(o, source, true);
  for (const p of pages.values()) if (p.officeNames.length > 1) p.scope = 'shared';
  return [...pages.values()].sort((a, b) => `${a.pref}|${a.normalized}`.localeCompare(`${b.pref}|${b.normalized}`));
}

function orderOfficePages(pages, offset = 0) {
  // Confirmed event sources before broad fallback pages; both groups rotate so
  // later prefectures are not permanently starved when a run hits its deadline.
  const rotate = group => {
    if (!group.length) return group;
    const n = ((offset % group.length) + group.length) % group.length;
    return [...group.slice(n), ...group.slice(0, n)];
  };
  return [...rotate(pages.filter(p => p.explicit)), ...rotate(pages.filter(p => !p.explicit))];
}

async function crawlOfficePages({ pages, fetchPage, extractHtml, collectAssets, findSubPages, processAssets,
  ocrReady, cutoffReached = () => false, sleep = async () => {}, delayMs = 1800,
  maxSubPages = 2, maxAssets = 2, skipReason = () => '', markRevisited = () => {}, log = () => {}, onRows = () => {} }) {
  const events = []; const rows = []; const seen = new Map(); const documents = new Map();
  const scheduled = new Set(pages.map(p => `${p.pref}|${p.normalized}`));
  let requests = 0;
  const visit = async (meta, parentUrl = null) => {
    const key = `${meta.pref}|${meta.normalized}`;
    if (seen.has(key)) return seen.get(key);
    const row = { pref: meta.pref, url: meta.url, officeIds: meta.officeIds || [], officeNames: meta.officeNames || [],
      scope: meta.scope, parentUrl, remappedFrom: meta.remappedFrom || null, status: 'not_visited', reason: '', htmlEvents: 0,
      ocr: { status: 'not_attempted', candidates: 0, results: [] } };
    rows.push(row); seen.set(key, row); onRows(rows);
    if (cutoffReached()) { row.reason = 'cutoff'; return row; }
    const reason = skipReason(meta);
    if (reason) { row.reason = reason; return row; }
    if (requests++) await sleep(meta.pref === 'hyogo' ? Math.max(3000, delayMs) : delayMs);
    if (cutoffReached()) { row.reason = 'cutoff'; return row; }
    log(`[OfficeOCR] HTML ${meta.pref} ${meta.officeNames.join('・')}: ${meta.url}`);
    let result;
    try { result = await fetchPage(meta); }
    catch (error) { result = { error: error.message }; }
    row.httpStatus = result?.status || null;
    row.finalUrl = result?.finalUrl || meta.url;
    if (!result?.document) { row.status = 'fetch_failed'; row.reason = result?.error || 'empty_response'; return row; }
    row.status = 'fetched'; documents.set(key, result.document); markRevisited(meta.url);
    // A prefecture-wide listing must not invent all its offices as the venue.
    const sourceUrl = isOfficialHtml(row.finalUrl) ? row.finalUrl : meta.url;
    const eventMeta = meta.scope === 'shared' ? { ...meta, officeNames: [] } : meta;
    const extracted = extractHtml(result.document, sourceUrl, eventMeta);
    row.htmlEvents = extracted.length; events.push(...extracted);
    if (meta.pref === 'hyogo') { row.ocr.status = 'not_attempted'; row.ocr.reason = 'document_only'; return row; }
    const assets = collectAssets(result.document, sourceUrl);
    row.ocr.candidates = assets.length;
    if (!ocrReady) row.ocr.status = 'engine_unavailable';
    else if (!assets.length) row.ocr.status = 'no_candidates';
    else if (cutoffReached()) { row.ocr.status = 'not_attempted'; row.ocr.reason = 'cutoff'; }
    else {
      row.ocr.status = 'processed';
      const output = await processAssets(assets, eventMeta, maxAssets, cutoffReached);
      row.ocr.results = output.results; row.ocr.deferred = output.deferred || 0; row.ocr.ignored = output.ignored || 0;
      if (!output.results.length) row.ocr.status = output.ignored === assets.length ? 'no_candidates' : 'not_attempted';
      events.push(...output.events);
    }
    return row;
  };
  for (const meta of pages) {
    const row = await visit(meta);
    if (row.status !== 'fetched' || meta.pref === 'hyogo' || cutoffReached()) continue;
    const subs = findSubPages(documents.get(`${meta.pref}|${meta.normalized}`), isOfficialHtml(row.finalUrl) ? row.finalUrl : meta.url);
    let n = 0;
    for (const sub of subs) {
      if (!isOfficialHtml(sub.url)) continue;
      const normalized = normalizeUrl(sub.url); const key = `${meta.pref}|${normalized}`;
      if (seen.has(key) || scheduled.has(key)) continue;
      if (n++ >= maxSubPages) break;
      await visit({ ...meta, url: sub.url, normalized, scope: sub.scope || meta.scope,
        remappedFrom: sub.remappedFrom || null }, meta.url);
    }
  }
  return { events, pages: rows };
}
module.exports = { isOfficialHtml, buildOfficePages, orderOfficePages, crawlOfficePages };
