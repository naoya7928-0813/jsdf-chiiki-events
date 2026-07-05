// 過去イベント閲覧の共通ロジック（純粋・テスト可能）。
//
// 「過去イベント」の定義: effectiveDate = endDate || date が「今日(Asia/Tokyo)」より前。
//   - 監査ログ（manual:history）とは別物。
//   - 削除済みイベント（Redisから削除済）は対象外（本体が無いため表示しない）。
//   - 将来/開催中イベントは対象外。
//
// I/O（Redis/fetch）は呼び出し側（api/admin/past-events.js）が集め、ここは集約・フィルタ・
// ページングのみ行う。権限判定（canManageScope）は注入する（authz と同一の deny-by-default）。
'use strict';

const { isRealDate } = require('./weather.cjs');

const STATUSES = new Set(['published', 'draft', 'closed', 'cancelled']);

/** 終了判定に使う実効日（連日開催は終了日、無ければ開催日）。 */
function effectiveDate(ev) {
  return (ev && (ev.endDate || ev.date)) || '';
}

/** 過去イベントか（effectiveDate < today。today/日付は実在日チェック）。 */
function isPastEvent(ev, today) {
  const eff = effectiveDate(ev);
  if (!isRealDate(eff) || !isRealDate(today)) return false;
  return eff < today;
}

/**
 * クエリ検証（純粋）。不正な日付/limit/offset/status は 400。
 * @returns {{ok:true, value}} | {{ok:false, status:400, error}}
 */
function validatePastQuery(q = {}, opts = {}) {
  const maxLimit = opts.maxLimit || 100;
  const defLimit = opts.defLimit || 50;
  const out = { from: '', to: '', status: '', q: '', office: '', pref: '', limit: defLimit, offset: 0 };
  const has = (v) => v !== undefined && v !== null && v !== '';

  if (has(q.from)) { if (!isRealDate(String(q.from))) return bad('invalid from'); out.from = String(q.from); }
  if (has(q.to))   { if (!isRealDate(String(q.to)))   return bad('invalid to');   out.to = String(q.to); }
  if (out.from && out.to && out.from > out.to) return bad('from after to');
  if (has(q.status)) { if (!STATUSES.has(String(q.status))) return bad('invalid status'); out.status = String(q.status); }
  if (has(q.q))      out.q = String(q.q).slice(0, 100);
  if (has(q.office)) out.office = String(q.office).slice(0, 40);
  if (has(q.pref))   out.pref = String(q.pref).slice(0, 20);
  if (has(q.limit))  { const n = Number(q.limit);  if (!Number.isInteger(n) || n < 1 || n > maxLimit) return bad('invalid limit'); out.limit = n; }
  if (has(q.offset)) { const n = Number(q.offset); if (!Number.isInteger(n) || n < 0) return bad('invalid offset'); out.offset = n; }
  return { ok: true, value: out };

  function bad(error) { return { ok: false, status: 400, error }; }
}

/** クライアント指定フィルタ（絞り込みのみ。権限の拡大には使わない）。 */
function matchFilters(ev, f) {
  const eff = effectiveDate(ev);
  if (f.from && eff < f.from) return false;
  if (f.to && eff > f.to) return false;
  if (f.status && String(ev.status || '') !== f.status) return false;
  if (f.pref && String(ev.pref || '') !== f.pref) return false;
  if (f.office && String(ev.office || '') !== f.office) return false;
  if (f.q) {
    const hay = `${ev.title || ''} ${ev.place || ''}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

/** override レコードからメタ（_by/_at/_pref/_office）を除いた表示フィールド。 */
function overrideDisplay(o) {
  if (!o) return {};
  const { _by, _at, _pref, _office, ...rest } = o;
  return rest;
}

/** 出力フィールド（閲覧専用に必要な項目のみ）。 */
function toView(ev) {
  return {
    id: ev.id,
    title: ev.title || '',
    date: ev.date || '',
    endDate: ev.endDate || '',
    status: ev.status || '',
    pref: ev.pref || '',
    office: ev.office || '',
    place: ev.place || '',
    url: ev.url || '',
    source: ev.source_type === 'manual' ? 'manual' : 'scrape',
    updatedAt: ev.updatedAt || ev._at || '',
  };
}

/**
 * 過去イベント一覧を構築（純粋）。
 * @param {object} a
 *   manualEvents  Redis手動イベント配列（source_type:'manual' 付与）
 *   scrapeData    events.json（pref→配列, updatedAt）
 *   archiveEvents 恒久アーカイブ配列（events.json から7日超で外れた過去イベント）
 *   overrides     {id: overrideRecord}
 *   account       認証済みアカウント
 *   query         validatePastQuery の value
 *   today         JST "YYYY-MM-DD"
 *   canManageScope (account, {pref, office}) => bool（authz と同一）
 * @returns {{events, total, scopeCount, limit, offset, hasMore}}
 */
function buildPastEvents({ manualEvents = [], scrapeData = {}, archiveEvents = [], overrides = {}, account, query, today, canManageScope }) {
  const byId = new Map();

  // アーカイブ（最初に入れる。events.json/手動が同一IDなら新しい方で上書きされる）
  for (const ev of archiveEvents) {
    if (!ev || !ev.id) continue;
    const ov = overrides[ev.id];
    const merged = ov ? { ...ev, ...overrideDisplay(ov) } : ev;
    byId.set(ev.id, { ...merged, source_type: merged.source_type || 'scrape', office: merged.office || '', updatedAt: merged.updatedAt || (ov && ov._at) || '' });
  }
  // スクレイプイベント（events.json は最新なのでアーカイブより優先。override を表示に反映）
  for (const k of Object.keys(scrapeData || {})) {
    if (!Array.isArray(scrapeData[k])) continue;
    for (const ev of scrapeData[k]) {
      if (!ev || !ev.id) continue;
      const ov = overrides[ev.id];
      const merged = ov ? { ...ev, ...overrideDisplay(ov) } : ev;
      byId.set(ev.id, {
        ...merged,
        source_type: merged.source_type || 'scrape',
        office: merged.office || '',
        updatedAt: merged.updatedAt || (ov && ov._at) || scrapeData.updatedAt || '',
      });
    }
  }
  // 手動イベント（ID重複時は手動を優先）
  for (const ev of manualEvents) {
    if (ev && ev.id) byId.set(ev.id, { ...ev, source_type: 'manual' });
  }

  // 過去 → スコープ（サーバー解決）まで絞ったのが「自分の権限範囲の過去イベント」。
  // scopeCount は呼び出し元アカウント自身の範囲の件数であり、権限外情報の漏洩ではない。
  const inScope = [...byId.values()]
    .filter(ev => isPastEvent(ev, today))                                        // 過去のみ
    .filter(ev => canManageScope(account, { pref: ev.pref, office: ev.office })); // スコープ
  const scopeCount = inScope.length;

  let list = inScope.filter(ev => matchFilters(ev, query));                     // 絞り込み

  // 新しい順（effectiveDate desc、同日は updatedAt desc）
  list.sort((a, b) => {
    const ea = effectiveDate(a), eb = effectiveDate(b);
    if (ea !== eb) return ea < eb ? 1 : -1;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  const total = list.length;
  const events = list.slice(query.offset, query.offset + query.limit).map(toView);
  return { events, total, scopeCount, limit: query.limit, offset: query.offset, hasMore: query.offset + query.limit < total };
}

module.exports = { effectiveDate, isPastEvent, validatePastQuery, matchFilters, buildPastEvents, toView, STATUSES };
