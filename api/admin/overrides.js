// /api/admin/overrides  – スクレイプ等の既存イベントを運営が上書き修正する。
//   GET                 → 上書き一覧（管理用・メタ含む）
//   POST { id, patch }  → イベントID単位で表示内容を上書き保存（編集は全担当官可）
//   DELETE { id }       → 上書きを取り消し（元の内容に戻す）
// 保存先は Redis hash `manual:overrides`（field=イベントID, value=JSON）。
// フロントは /api/manual-events が返す overrides を events.json にID一致で再適用する。
import { checkOrigin, rateLimit, requireAccount, canManagePref, redis, cleanText, resolveStaff, whoOf } from '../_security.js';

const OKEY = 'manual:overrides';
const HKEY = 'manual:history';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const weekdayOf = d => { const t = new Date(d + 'T00:00:00Z'); return Number.isNaN(t.getTime()) ? '' : WD[t.getUTCDay()]; };

// 入力から上書き用の表示フィールドを構築（公開に出るのは表示フィールドのみ）
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
  if (o.title !== undefined && !o.title) return { error: 'タイトルは必須です' };
  return { patch: o };
}

async function logHistory(who, pref, action, id, title, note) {
  try {
    await redis.lpush(HKEY, JSON.stringify({ at: new Date().toISOString(), user: who, action, id, pref: pref || '', title: title || '', note }));
    await redis.ltrim(HKEY, 0, 299);
  } catch { /* noop */ }
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret, x-admin-staff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await rateLimit(req, res, 'admin-overrides', 80, 600)) return;
  const account = requireAccount(req, res);
  if (!account) return;
  const who = whoOf(account, resolveStaff(req));

  if (req.method === 'GET') {
    try {
      const all = await redis.hgetall(OKEY);
      const overrides = all ? Object.fromEntries(Object.entries(all).map(([k, v]) => [k, typeof v === 'string' ? JSON.parse(v) : v])) : {};
      return res.status(200).json({ overrides });
    } catch (err) { console.error('[overrides] GET', err); return res.status(500).json({ error: 'failed' }); }
  }

  if (req.method === 'POST') {
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!canManagePref(account, String(req.body?.pref || ''))) return res.status(403).json({ error: '担当地本のイベントのみ修正できます' });
    const built = buildPatch(req.body?.patch);
    if (built.error) return res.status(400).json({ error: built.error });
    const record = { ...built.patch, _by: who, _at: new Date().toISOString() };
    try {
      await redis.hset(OKEY, { [id]: JSON.stringify(record) });
      await logHistory(who, req.body?.pref, 'override', id, built.patch.title || '', '一覧イベントを上書き修正');
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[overrides] POST', err); return res.status(500).json({ error: 'failed to save' }); }
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      await redis.hdel(OKEY, id);
      await logHistory(who, req.body?.pref, 'override-clear', id, '', '上書きを取り消し');
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[overrides] DELETE', err); return res.status(500).json({ error: 'failed to delete' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
