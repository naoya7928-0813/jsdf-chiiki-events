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

// events.json（スクレイプイベント）の短期キャッシュ
let scrapeCache = { at: 0, data: null };
async function loadScrape(req) {
  const now = Date.now();
  if (scrapeCache.data && now - scrapeCache.at < 60000) return scrapeCache.data;
  const base = process.env.SITE_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://jsdf-chiiki-events.vercel.app');
  let data = {};
  try {
    const r = await fetch(`${base}/data/events.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) data = await r.json();
  } catch { /* 取得失敗時は手動イベントのみ */ }
  scrapeCache = { at: now, data };
  return data;
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
  const scrapeData = await loadScrape(req);

  const result = past.buildPastEvents({
    manualEvents, scrapeData, overrides,
    account, query: v.value, today, canManageScope,
  });

  return res.status(200).json({
    ...result,
    // 保存方式上の制約を明示（完全な永久アーカイブではない）
    note: '現在保存されている過去イベントを表示しています。取得元から削除され、システム内にも保存されていないイベントは表示されない場合があります。',
  });
}
