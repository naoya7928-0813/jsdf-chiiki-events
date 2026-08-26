// /api/admin/overrides  – スクレイプ等の既存イベントを運営が上書き修正する。
//   GET                 → 上書き一覧（自分の管理範囲のみ）
//   POST { id, patch }  → イベントID単位で表示内容を上書き保存（event:override 権限＋スコープ必須）
//   DELETE { id }       → 上書きを取り消し（event:override 権限＋スコープ必須）
// 保存先は Redis hash `manual:overrides`（field=イベントID, value=JSON）。
//
// 重要（IDOR対策）: 対象イベントの所属地本はクライアントの pref を信用せず、
// サーバー側で実データ（Redis 手動イベント / events.json）から解決して権限判定する。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, redis, cleanText, writeAudit } from '../_security.js';
import { normalizeBranches } from '../../shared/branch.cjs';

const OKEY = 'manual:overrides';
const MKEY = 'manual:events';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const weekdayOf = d => { const t = new Date(d + 'T00:00:00Z'); return Number.isNaN(t.getTime()) ? '' : WD[t.getUTCDay()]; };

// events.json の id→pref マップ（短期キャッシュ）。スクレイプイベントの所属解決用。
let eventsMap = { at: 0, map: null };
async function loadEventsMap(req) {
  const now = Date.now();
  if (eventsMap.map && now - eventsMap.at < 60000) return eventsMap.map;
  const base = process.env.SITE_URL || (req.headers.host ? `https://${req.headers.host}` : 'https://jsdf-chiiki-events.vercel.app');
  const map = new Map();
  try {
    const r = await fetch(`${base}/data/events.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      for (const k of Object.keys(data)) {
        if (!Array.isArray(data[k])) continue;
        for (const ev of data[k]) if (ev && ev.id) map.set(ev.id, { pref: ev.pref || k, office: ev.office || '' });
      }
    }
  } catch { /* 取得失敗時は空マップ（手動イベントのみ解決可） */ }
  eventsMap = { at: now, map };
  return map;
}

/**
 * 対象イベントの所属（地本・事務所）をサーバー側で解決（手動イベント→events.json の順）。
 * 未知は null。スクレイプイベントは office を持たないことが多く、その場合 office='' を返す
 * （= office ロールは canManageScope の deny-by-default で 403、pco_admin 以上のみ操作可能）。
 * @returns {{pref:string, office:string}|null}
 */
async function resolveEventScope(req, id) {
  try {
    const raw = await redis.hget(MKEY, id);
    if (raw) { const ev = typeof raw === 'string' ? JSON.parse(raw) : raw; return { pref: ev.pref || '', office: ev.office || '' }; }
  } catch { /* noop */ }
  const map = await loadEventsMap(req);
  return map.get(id) || null;
}

function buildPatch(input) {
  const e = input || {};
  const o = {};
  const TXT = { title: 120, place: 80, address: 100, time: 40, category: 20, tag: 30, ageRequirement: 100, notes: 300, deadline: 40 };
  for (const f of Object.keys(TXT)) {
    if (e[f] !== undefined) o[f] = cleanText(e[f], TXT[f]) || (['notes', 'ageRequirement', 'deadline'].includes(f) ? null : '');
  }
  if (e.url !== undefined) {
    const u = String(e.url || '').trim();
    if (u && !/^https?:\/\//i.test(u)) return { error: 'URL は http(s) で始めてください' };
    o.url = u.slice(0, 500);
  }
  if (e.date !== undefined && DATE_RE.test(e.date)) { o.date = e.date; o.weekday = weekdayOf(e.date); }
  if (e.endDate !== undefined) {
    const ed = String(e.endDate || '').trim();
    if (ed && DATE_RE.test(ed)) { o.endDate = ed; o.endWeekday = weekdayOf(ed); }
    else { o.endDate = null; o.endWeekday = null; }
  }
  // 種別（陸/海/空）。空配列を送ると「指定なし」に戻し、文面からの推定に任せる
  if (e.branch !== undefined) {
    const b = normalizeBranches(e.branch);
    o.branch = b.length ? b : null;
  }
  if (o.title !== undefined && !o.title) return { error: 'タイトルは必須です' };
  return { patch: o };
}

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return; // CSRF: 状態変更は同一オリジンのみ
  if (!await rateLimit(req, res, 'admin-overrides', 80, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  // ── 一覧（自分の管理範囲のみ。担当外データは返さない） ──
  if (req.method === 'GET') {
    if (!hasPermission(account, 'event:override')) return res.status(403).json({ error: '権限がありません' });
    try {
      const all = await redis.hgetall(OKEY);
      const overrides = {};
      if (all) {
        for (const [id, v] of Object.entries(all)) {
          const rec = typeof v === 'string' ? JSON.parse(v) : v;
          // 記録された pref/office（無い旧データはサーバー側で解決）でスコープ判定
          const scope = (rec._pref !== undefined)
            ? { pref: rec._pref, office: rec._office || '' }
            : (await resolveEventScope(req, id)) || {};
          if (canManageScope(account, { pref: scope.pref, office: scope.office })) overrides[id] = rec;
        }
      }
      return res.status(200).json({ overrides });
    } catch (err) { console.error('[overrides] GET', err); return res.status(500).json({ error: 'failed' }); }
  }

  // ── 上書き保存（IDOR対策: 所属はサーバー側で解決して権限判定） ──
  if (req.method === 'POST') {
    if (!hasPermission(account, 'event:override')) { await writeAudit(account, { action: 'override.save', result: 'denied', note: '権限不足' }); return res.status(403).json({ error: '権限がありません' }); }
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const scope = await resolveEventScope(req, id);
    if (!scope || !scope.pref) return res.status(404).json({ error: '対象イベントが見つかりません' });
    if (!canManageScope(account, { pref: scope.pref, office: scope.office })) {
      await writeAudit(account, { action: 'override.save', result: 'denied', targetId: id, organization: scope.pref, office: scope.office, note: '担当外イベント（office不一致/未割当を含む）' });
      return res.status(403).json({ error: '担当範囲のイベントのみ修正できます' });
    }
    const built = buildPatch(req.body?.patch);
    if (built.error) return res.status(400).json({ error: built.error });
    try {
      const prevRaw = await redis.hget(OKEY, id);
      const before = prevRaw ? (typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw) : null;
      const record = { ...built.patch, _pref: scope.pref, _office: scope.office, _by: account.displayId, _at: new Date().toISOString() };
      await redis.hset(OKEY, { [id]: JSON.stringify(record) });
      await writeAudit(account, { action: 'override.save', result: 'success', targetId: id, organization: scope.pref, office: scope.office, title: built.patch.title || '', before, after: record, note: '一覧イベントを上書き修正' });
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[overrides] POST', err); return res.status(500).json({ error: 'failed to save' }); }
  }

  // ── 上書き取り消し（同様に所属解決＋権限判定） ──
  if (req.method === 'DELETE') {
    if (!hasPermission(account, 'event:override')) { await writeAudit(account, { action: 'override.clear', result: 'denied', note: '権限不足' }); return res.status(403).json({ error: '権限がありません' }); }
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const prevRaw = await redis.hget(OKEY, id);
      if (!prevRaw) return res.status(404).json({ error: '対象の上書きが見つかりません' });
      const before = typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw;
      const scope = (before._pref !== undefined)
        ? { pref: before._pref, office: before._office || '' }
        : (await resolveEventScope(req, id)) || {};
      if (!canManageScope(account, { pref: scope.pref, office: scope.office })) {
        await writeAudit(account, { action: 'override.clear', result: 'denied', targetId: id, organization: scope.pref, office: scope.office, note: '担当外イベント（office不一致/未割当を含む）' });
        return res.status(403).json({ error: '担当範囲のイベントのみ操作できます' });
      }
      await redis.hdel(OKEY, id);
      await writeAudit(account, { action: 'override.clear', result: 'success', targetId: id, organization: scope.pref, office: scope.office, before, note: '上書きを取り消し' });
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[overrides] DELETE', err); return res.status(500).json({ error: 'failed to delete' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
