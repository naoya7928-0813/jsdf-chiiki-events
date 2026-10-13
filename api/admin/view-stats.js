// GET /api/admin/view-stats          → 担当範囲のイベントごとの閲覧数（累計・今日・7日・30日）
// GET /api/admin/view-stats?id=…     → 1イベントの閲覧数と日別推移（30日）
//
// 権限: requireAuth → event:update / event:override / audit:read のいずれか → canManageScope（所属はサーバー側で解決）。
// 担当範囲外のイベントの統計は返さない（一覧から除外・個別は 403）。閲覧のみで書き込みは無いため監査ログは拒否時だけ残す。
// 統計値の書き込みは /api/view（公開の計測API）だけが行う。ここからは変更できない。
import { checkOrigin, noStore, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';
import { loadEventsMap, findEvent, MANUAL_KEY, EVENT_ID_RE } from '../_eventScope.js';
import V from '../../shared/viewStats.cjs';

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/** ids の 30 日分＋累計を読み、期間別に集計する（日別ハッシュ 30 件＋累計 1 件の HMGET） */
async function readStats(ids) {
  const days = V.lastNDays(30);
  if (!ids.length) return { days, dayMaps: [], stats: {} };
  const [totalMap, ...dayMaps] = await Promise.all([
    redis.hmget(V.TOTAL_KEY, ...ids),
    ...days.map(d => redis.hmget(V.dayKey(d), ...ids)),
  ]);
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
