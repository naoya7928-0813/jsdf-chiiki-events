// GET /api/admin/past-events  – 運営者が「過去イベント」を権限範囲内で閲覧する（閲覧専用）。
//
// 過去イベント = effectiveDate(endDate||date) < 今日(Asia/Tokyo)。
//   - 監査ログ（/api/admin/history）とは別。削除済みイベントは含めない（本体が無いため）。
//   - 現在システムに保存されているデータのみ（events.json は終了後約7日で削除されるため、
//     それ以前のスクレイプ過去イベントは残らない場合がある）。
//
// 認可: requireAuth ＋ canManageScope（deny-by-default）。クライアントの pref/office/role では
//   閲覧範囲を拡大できない（サーバーの認証済みアカウントと実データの pref/office で判定）。
// GET の閲覧のため状態変更用 CSRF は適用しない（no-store は付与）。
import { checkOrigin, noStore, rateLimit, requireAuth, canManageScope, redis } from '../_security.js';
import W from '../../shared/weather.cjs';
import past from '../../shared/pastEvents.cjs';

const MKEY = 'manual:events';
const OKEY = 'manual:overrides';

// events.json（スクレイプイベント）の短期キャッシュ。
// 取得成否(ok)も返し、「取得失敗（データ不明）」と「取得成功だが空」を区別する。
let scrapeCache = { at: 0, data: null, ok: false };
async function loadScrape(req) {
  const now = Date.now();
  if (scrapeCache.data && now - scrapeCache.at < 60000) return { data: scrapeCache.data, ok: scrapeCache.ok };
  const base = process.env.SITE_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://jsdf-chiiki-events.vercel.app');
  let data = {};
  let ok = false;
  try {
    const r = await fetch(`${base}/data/events.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { data = await r.json(); ok = true; }
    else console.error(`[past-events] events.json 取得が非200: ${r.status} ${base}/data/events.json`);
  } catch (e) {
    // 取得失敗は握りつぶさずサーバーログに残す（原因識別のため）。認証情報は出さない。
    console.error(`[past-events] events.json 取得失敗: ${e && e.name === 'TimeoutError' ? 'timeout(5s)' : (e && e.message) || 'error'}`);
  }
  scrapeCache = { at: now, data, ok };
  return { data, ok };
}

// 過去イベントの恒久アーカイブ（events.json から7日で外れた後もここで閲覧できる）。
// public/data/events-archive.json をフェッチ（events.json と同経路・短期キャッシュ）。
let archiveCache = { at: 0, events: null };
async function loadArchive(req) {
  const now = Date.now();
  if (archiveCache.events && now - archiveCache.at < 60000) return archiveCache.events;
  const base = process.env.SITE_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://jsdf-chiiki-events.vercel.app');
  let events = [];
  try {
    const r = await fetch(`${base}/data/events-archive.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j?.events)) events = j.events; }
    else if (r.status !== 404) console.error(`[past-events] archive 取得が非200: ${r.status}`);
  } catch (e) {
    console.error(`[past-events] archive 取得失敗: ${e && e.name === 'TimeoutError' ? 'timeout(5s)' : (e && e.message) || 'error'}`);
  }
  archiveCache = { at: now, events };
  return events;
}

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-past-events', 120, 600)) return;

  const account = await requireAuth(req, res);
  if (!account) return;

  // クエリ検証（不正な日付/limit/offset/status は 400）
  const v = past.validatePastQuery(req.query || {}, { maxLimit: 100, defLimit: 50 });
  if (!v.ok) return res.status(v.status).json({ error: v.error });

  const today = W.jstTodayStr();

  // 手動イベント（Redis）・オーバーライド（Redis）・スクレイプ（events.json）を収集
  let manualEvents = [];
  let overrides = {};
  try {
    const all = await redis.hgetall(MKEY);
    manualEvents = all ? Object.values(all).map(x => (typeof x === 'string' ? JSON.parse(x) : x)) : [];
  } catch { /* Redis障害時は空 */ }
  try {
    const o = await redis.hgetall(OKEY);
    if (o) for (const [id, val] of Object.entries(o)) overrides[id] = typeof val === 'string' ? JSON.parse(val) : val;
  } catch { /* ignore */ }
  const { data: scrapeData, ok: scrapeOk } = await loadScrape(req);
  const archiveEvents = await loadArchive(req); // 恒久アーカイブ（7日超の過去イベント）

  const result = past.buildPastEvents({
    manualEvents, scrapeData, archiveEvents, overrides,
    account, query: v.value, today, canManageScope,
  });

  // 空一覧の理由を分類する（権限外の件数・名称は一切返さない）。
  // - data_unavailable: スクレイプ取得失敗かつ手動イベントも無い＝データ不明（黙って空にしない）
  // - filtered_empty  : 自分の範囲に過去イベントはあるが、検索条件に一致しない
  // - empty_scope     : 自分の権限範囲（事務所/地本）に過去イベントが無い
  // - ok              : 表示対象あり
  const officeScoped = account.role === 'office_editor' || account.role === 'office_manager';
  let reason = 'ok';
  if (result.total === 0) {
    if (!scrapeOk && manualEvents.length === 0) reason = 'data_unavailable';
    else if (result.scopeCount > 0) reason = 'filtered_empty';
    else reason = 'empty_scope';
  }

  return res.status(200).json({
    events: result.events,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
    reason,
    scope: officeScoped ? 'office' : (past_isNational(account) ? 'national' : 'pref'),
    // 保存方式の説明（アーカイブ導入後）
    note: '終了したイベントはアーカイブに保存され、後からも確認できます（この機能の運用開始より前に終了・削除されたイベントは含まれない場合があります）。',
  });
}

// national 判定（表示メッセージ分岐用。権限判定は canManageScope が本体）。
function past_isNational(account) {
  return account && (account.role === 'national_admin' || (account.organization ?? account.pref) === '*');
}
