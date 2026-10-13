// GET /api/admin/view-stats          → 担当範囲のイベントごとの閲覧数（累計・今日・7日・30日）
// GET /api/admin/view-stats?id=…     → 1イベントの閲覧数と日別推移（30日）
// GET /api/admin/view-stats?report=1 → 出力用: 掲載中・運営登録・過去（アーカイブ）の担当範囲の全イベントと閲覧数
//                                       （運営画面が Excel・CSV・PDF に整形する。shared/reportExport.cjs）
//
// 権限: requireAuth → event:update / event:override / audit:read のいずれか → canManageScope（所属はサーバー側で解決）。
// 担当範囲外のイベントの統計は返さない（一覧から除外・個別は 403）。閲覧のみで書き込みは無いため監査ログは拒否時だけ残す。
// 統計値の書き込みは /api/view（公開の計測API）だけが行う。ここからは変更できない。
import { checkOrigin, noStore, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';
import { loadEventsMap, findEvent, MANUAL_KEY, EVENT_ID_RE } from '../_eventScope.js';
import V from '../../shared/viewStats.cjs';
import { loadArchive } from './_past-events.js';

const REPORT_MAX = 6000;

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/** ids の 30 日分＋累計を読み、期間別に集計する（日別ハッシュ 30 件＋累計 1 件の HMGET）。
 *  出力（過去分を含む数千件）でも Upstash の1リクエストの上限（約1MB）に収まるよう、ID を分けて読む */
const STATS_CHUNK = 400;
async function readStats(ids) {
  const days = V.lastNDays(30);
  if (!ids.length) return { days, dayMaps: [], stats: {} };
  // hmget は {ID: 回数} を返す（無い日は null）。分けて読んだ結果を1つにまとめる
  const totalMap = {};
  const dayMaps = days.map(() => ({}));
  for (let i = 0; i < ids.length; i += STATS_CHUNK) {
    const part = ids.slice(i, i + STATS_CHUNK);
    const [t, ...ds] = await Promise.all([
      redis.hmget(V.TOTAL_KEY, ...part),
      ...days.map(d => redis.hmget(V.dayKey(d), ...part)),
    ]);
    Object.assign(totalMap, t || {});
    ds.forEach((m, k) => Object.assign(dayMaps[k], m || {}));
  }
  return { days, dayMaps, stats: V.aggregate(ids, dayMaps, totalMap) };
}

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-view-stats', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;
  if (!['event:update', 'event:override', 'audit:read'].some(p => hasPermission(account, p))) {
    await writeAudit(account, { action: 'stats.read', result: 'denied', note: '権限不足' });
    return res.status(403).json({ error: '権限がありません' });
  }

  try {
    const id = String(req.query?.id || '').trim();
    // ── 1イベントの詳細 ──
    if (id) {
      if (!EVENT_ID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
      const found = await findEvent(req, id);
      if (!found) return res.status(404).json({ error: '対象イベントが見つかりません' });
      if (!canManageScope(account, { pref: found.pref, office: found.office })) {
        await writeAudit(account, { action: 'stats.read', result: 'denied', targetId: id, organization: found.pref, note: '担当外イベント' });
        return res.status(403).json({ error: '担当範囲のイベントのみ閲覧できます' });
      }
      const { days, dayMaps, stats } = await readStats([id]);
      return res.status(200).json({ id, ...stats[id], series: V.dailySeries(id, days, dayMaps) });
    }

    // ── 出力用（過去分を含む全件。担当範囲のみ） ──
    if (req.query?.report) {
      const byId = new Map();
      const pick = (e, kind) => ({
        id: e.id, kind, pref: e.pref || '', title: e.title || '', date: e.date || '', endDate: e.endDate || '',
        category: e.category || '', place: e.place || '', status: e.status || '', url: e.url || '',
      });
      for (const e of await loadArchive()) {
        if (e && e.id && canManageScope(account, { pref: e.pref, office: e.office })) byId.set(e.id, pick(e, 'archive'));
      }
      for (const [eid, s] of await loadEventsMap(req)) {
        if (canManageScope(account, { pref: s.pref, office: s.office })) byId.set(eid, pick({ id: eid, ...s }, 'scraped'));
      }
      for (const raw of Object.values((await redis.hgetall(MANUAL_KEY)) || {})) {
        const ev = parse(raw);
        if (ev && ev.id && canManageScope(account, { pref: ev.pref, office: ev.office })) byId.set(ev.id, pick(ev, 'manual'));
      }
      const all = [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, REPORT_MAX);
      const ids = all.map(r => r.id).filter(V.isCountableId);
      const { stats } = await readStats(ids);
      const rows = all.map(r => ({ ...r, ...(stats[r.id] || { total: 0, today: 0, d7: 0, d30: 0 }) }));
      await writeAudit(account, { action: 'stats.read', result: 'success', note: `統計の出力（${rows.length}件）` });
      return res.status(200).json({ rows, generatedAt: new Date().toISOString(), timezone: 'Asia/Tokyo', truncated: byId.size > REPORT_MAX });
    }

    // ── 一覧（担当範囲のみ） ──
    const rows = [];
    const map = await loadEventsMap(req);
    for (const [eid, s] of map) {
      if (!canManageScope(account, { pref: s.pref, office: s.office })) continue;
      rows.push({ id: eid, title: s.title || '', pref: s.pref, date: s.date || '', kind: 'scraped' });
    }
    const manual = await redis.hgetall(MANUAL_KEY);
    for (const raw of Object.values(manual || {})) {
      const ev = parse(raw);
      if (!ev || !ev.id || !canManageScope(account, { pref: ev.pref, office: ev.office })) continue;
      rows.push({ id: ev.id, title: ev.title || '', pref: ev.pref, date: ev.date || '', kind: 'manual', status: ev.status || '' });
    }
    const ids = rows.map(r => r.id).filter(V.isCountableId).slice(0, 2000);
    const { stats } = await readStats(ids);
    const out = rows.filter(r => stats[r.id]).map(r => ({ ...r, ...stats[r.id] }));
    return res.status(200).json({ rows: V.sortRows(out, 'd7'), generatedAt: new Date().toISOString(), timezone: 'Asia/Tokyo' });
  } catch (err) {
    console.error('[admin/view-stats]', err);
    return res.status(500).json({ error: 'failed' });
  }
}
