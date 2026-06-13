// /api/admin/events  – 運営がイベントを登録/一覧/更新/削除する（要 認証）。
//   POST   { event }            → 追加（id 採番、既定 status='draft'）
//   GET                          → 一覧（自分の担当地本のみ。* は全件）
//   PATCH  { id, patch }         → 部分更新（status 変更=公開/下書き/締切/中止 等）
//   DELETE { id }                → 削除
// 認証は x-admin-user/x-admin-pass（または後方互換の x-admin-secret）。
// 地本スコープ: pref!=='*' のアカウントは自分の地本のみ操作可。
// 保存先は Upstash Redis hash `manual:events`（field=id, value=JSON）。
import { checkOrigin, rateLimit, requireAccount, canManagePref, redis, cleanText } from '../_security.js';

const KEY = 'manual:events';
const HKEY = 'manual:history';
const MAX_EVENTS = 500;

// 変更履歴を Redis リストに追記（最新300件保持）
async function logHistory(account, action, ev, note = '') {
  try {
    const entry = { at: new Date().toISOString(), user: account.user, action, id: ev.id, pref: ev.pref, title: ev.title, note };
    await redis.lpush(HKEY, JSON.stringify(entry));
    await redis.ltrim(HKEY, 0, 299);
  } catch { /* 履歴失敗は本処理を妨げない */ }
}

const PREFS = new Set([
  'sapporo','asahikawa','obihiro','hakodate','aomori','iwate','miyagi','akita','yamagata','fukushima',
  'ibaraki','tochigi','gunma','saitama','chiba','tokyo','kanagawa','niigata','toyama','ishikawa',
  'fukui','yamanashi','nagano','gifu','shizuoka','aichi','mie','shiga','kyoto','osaka',
  'hyogo','nara','wakayama','tottori','shimane','okayama','hiroshima','yamaguchi','tokushima','kagawa',
  'ehime','kochi','fukuoka','saga','nagasaki','kumamoto','oita','miyazaki','kagoshima','okinawa',
]);
const STATUSES = new Set(['draft', 'published', 'closed', 'cancelled']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const weekdayOf = d => { const t = new Date(d + 'T00:00:00Z'); return Number.isNaN(t.getTime()) ? '' : WD[t.getUTCDay()]; };
const rand = (n = 6) => Math.random().toString(36).slice(2, 2 + n);

async function readAll() {
  const all = await redis.hgetall(KEY);
  return all ? Object.values(all).map(v => (typeof v === 'string' ? JSON.parse(v) : v)) : [];
}

/** 入力から保存用イベントを構築（account の地本スコープを強制） */
function buildEvent(input, account) {
  const e = input || {};
  let pref = String(e.pref || '').trim();
  if (account.pref !== '*') pref = account.pref;     // スコープ強制（地本は自分のものに固定）
  if (!PREFS.has(pref)) return { error: '地本（pref）が不正です' };

  const date = String(e.date || '').trim();
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date + 'T00:00:00Z').getTime())) {
    return { error: '日付の形式が不正です（YYYY-MM-DD）' };
  }
  let endDate = String(e.endDate || '').trim();
  if (endDate && (!DATE_RE.test(endDate) || endDate < date)) endDate = '';

  const title = cleanText(e.title, 120);
  if (!title) return { error: 'タイトルは必須です' };

  let url = String(e.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) return { error: 'URL は http(s) で始めてください' };
  if (url.length > 500) url = url.slice(0, 500);

  const status = STATUSES.has(e.status) ? e.status : 'draft';
  // 陸海空区分（複数可）・申込要否・締切・対象 などフェーズ1の拡張項目
  const branches = Array.isArray(e.branches)
    ? e.branches.filter(b => ['army', 'navy', 'air'].includes(b)) : [];
  const apply = cleanText(e.apply, 20);        // 申込要否（要予約/不要 等）
  let deadline = String(e.deadline || '').trim();
  if (deadline && !DATE_RE.test(deadline)) deadline = '';

  return {
    event: {
      id: `manual-${pref}-${date.replace(/-/g, '')}-${rand()}`,
      pref, date,
      ...(endDate ? { endDate, endWeekday: weekdayOf(endDate) } : {}),
      weekday: weekdayOf(date),
      title,
      place:   cleanText(e.place, 80),
      address: cleanText(e.address, 100),
      time:    cleanText(e.time, 40),
      category: cleanText(e.category, 20) || '広報活動',
      tag:     cleanText(e.tag, 20),
      branches,
      apply,
      deadline: deadline || null,
      target:  cleanText(e.target, 100),
      url,
      notes:   cleanText(e.notes, 300) || null,
      status,
      source_type: 'manual',
      createdBy: account.user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!await rateLimit(req, res, 'admin-events', 80, 600)) return;
  const account = requireAccount(req, res);
  if (!account) return;

  // ── 一覧（担当地本のみ。* は全件） ──
  if (req.method === 'GET') {
    try {
      let events = await readAll();
      if (account.pref !== '*') events = events.filter(e => e.pref === account.pref);
      events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return res.status(200).json({ events, account: { pref: account.pref, label: account.label } });
    } catch (err) { console.error('[admin/events] GET', err); return res.status(500).json({ error: 'failed to list' }); }
  }

  // ── 追加 ──
  if (req.method === 'POST') {
    const built = buildEvent(req.body?.event, account);
    if (built.error) return res.status(400).json({ error: built.error });
    try {
      if (await redis.hlen(KEY) >= MAX_EVENTS) return res.status(409).json({ error: '登録上限に達しています' });
      await redis.hset(KEY, { [built.event.id]: JSON.stringify(built.event) });
      await logHistory(account, 'add', built.event, built.event.status === 'published' ? '公開で登録' : '下書きで登録');
      return res.status(200).json({ ok: true, event: built.event });
    } catch (err) { console.error('[admin/events] POST', err); return res.status(500).json({ error: 'failed to save' }); }
  }

  // ── 部分更新（公開状態の切替など） ──
  if (req.method === 'PATCH') {
    const id = String(req.body?.id || '').trim();
    const patch = req.body?.patch || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const raw = await redis.hget(KEY, id);
      if (!raw) return res.status(404).json({ error: 'not found' });
      const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!canManagePref(account, ev.pref)) return res.status(403).json({ error: '権限がありません' });
      // 許可された項目のみ更新
      if (patch.status !== undefined) {
        if (!STATUSES.has(patch.status)) return res.status(400).json({ error: 'status が不正です' });
        ev.status = patch.status;
      }
      for (const f of ['title', 'place', 'time', 'url', 'notes', 'category']) {
        if (patch[f] !== undefined) {
          const max = f === 'notes' ? 300 : f === 'url' ? 500 : f === 'title' ? 120 : 80;
          if (f === 'url' && patch[f] && !/^https?:\/\//i.test(patch[f])) return res.status(400).json({ error: 'URL不正' });
          ev[f] = f === 'url' ? String(patch[f]).slice(0, 500) : (cleanText(patch[f], max) || (f === 'notes' ? null : ''));
        }
      }
      ev.updatedAt = new Date().toISOString();
      await redis.hset(KEY, { [id]: JSON.stringify(ev) });
      const note = patch.status !== undefined
        ? `状態→${({ draft: '下書き', published: '公開', closed: '締切', cancelled: '中止' })[ev.status] || ev.status}`
        : '内容を編集';
      await logHistory(account, patch.status !== undefined ? 'status' : 'update', ev, note);
      return res.status(200).json({ ok: true, event: ev });
    } catch (err) { console.error('[admin/events] PATCH', err); return res.status(500).json({ error: 'failed to update' }); }
  }

  // ── 削除 ──
  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const raw = await redis.hget(KEY, id);
      let deleted = { id, pref: '', title: '' };
      if (raw) {
        const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!canManagePref(account, ev.pref)) return res.status(403).json({ error: '権限がありません' });
        deleted = ev;
      }
      await redis.hdel(KEY, id);
      await logHistory(account, 'delete', deleted, '削除');
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[admin/events] DELETE', err); return res.status(500).json({ error: 'failed to delete' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
