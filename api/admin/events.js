// /api/admin/events  – 運営がイベントを登録/一覧/更新/削除する（要 認証）。
//   POST   { event }            → 追加（id 採番、既定 status='draft'）
//   GET                          → 一覧（自分の担当地本のみ。* は全件）
//   PATCH  { id, patch }         → 部分更新（status 変更=公開/下書き/締切/中止 等）
//   DELETE { id }                → 削除
// 認証は x-admin-user/x-admin-pass（または後方互換の x-admin-secret）。
// 地本スコープ: pref!=='*' のアカウントは自分の地本のみ操作可。
// 保存先は Upstash Redis hash `manual:events`（field=id, value=JSON）。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, canPublish, redis, cleanText, writeAudit } from '../_security.js';
import W from '../../shared/weather.cjs';
import { normalizeBranches } from '../../shared/branch.cjs';
import { normalizeTags } from '../../shared/tags.cjs';

const KEY = 'manual:events';
const MAX_EVENTS = 500;

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

/**
 * 手動入力の緯度経度を weatherLocation（accuracy:'manual'）に変換。
 * 数値・日本範囲チェックを通らなければ null。入力は { latitude, longitude, label? }。
 */
function parseManualCoords(obj) {
  if (!obj) return null;
  const lat = Number(obj.latitude), lon = Number(obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const b = W.JP_BOUNDS;
  if (lat < b.latMin || lat > b.latMax || lon < b.lonMin || lon > b.lonMax) return null;
  return {
    latitude: W.roundCoord3(lat), longitude: W.roundCoord3(lon),
    label: cleanText(obj.label, 40) || '手動指定',
    accuracy: 'manual', source: 'manual', geocodedAt: W.isoJst(),
  };
}

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
  const place = cleanText(e.place, 80);
  const address = cleanText(e.address, 100);
  // 天気用座標: 手動入力があれば accuracy:'manual'。無ければ未設定にして再ジオコーディング待ちにする
  // （会場/住所がある場合のみ。スクレイパー or 専用処理が weatherLocationNeedsUpdate を拾って付与）。
  const branch = normalizeBranches(e.branch);
  // 属性タグ（オンライン・家族向け・抽選 等）。公開側の絞り込みチップと同じ定義を使う。
  // 申込要否(tag)とは別物なので混ぜない（tag は「要予約/予約不要/…」の単一値）。
  const tags = normalizeTags(e.tags);
  const manualLoc = parseManualCoords(e.weatherLocation);
  const weather = manualLoc
    ? { weatherLocation: manualLoc }
    : ((place || address) ? { weatherLocation: null, weatherLocationNeedsUpdate: true } : {});
  // 既存イベントカードと同じスキーマに揃える（tag=申込要否, ageRequirement=対象/年齢, deadline=締切文字列）
  return {
    event: {
      id: `manual-${pref}-${date.replace(/-/g, '')}-${rand()}`,
      pref, date,
      ...(endDate ? { endDate, endWeekday: weekdayOf(endDate) } : {}),
      weekday: weekdayOf(date),
      title,
      place,
      address,
      time:    cleanText(e.time, 40),
      category: cleanText(e.category, 20) || '広報活動',
      tag:     cleanText(e.tag, 30),             // 申込要否（要予約/予約不要/入場無料 等）
      // 属性タグ（複数可）。未指定なら持たせず、表示側で文面から推定させる
      ...(tags.length ? { tags } : {}),
      // 自衛隊の種別（陸/海/空）。未指定なら持たせず、表示側で文面から推定させる
      ...(branch.length ? { branch } : {}),
      ageRequirement: cleanText(e.ageRequirement, 100) || null, // 対象・年齢
      deadline: cleanText(e.deadline, 40) || null,              // 締切（例: 7月20日（金））
      url,
      notes:   cleanText(e.notes, 300) || null,
      ...weather,
      status,
      source_type: 'manual',
      office: account.office || '',          // 事務所スコープ（権限判定・監査用）
      createdBy: account.displayId,          // 仮名ID（氏名は保存しない）
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret, x-admin-staff');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return; // CSRF: 状態変更は同一オリジンのみ

  if (!await rateLimit(req, res, 'admin-events', 80, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  // ── 一覧（自分の管理範囲のみ。deny-by-default） ──
  if (req.method === 'GET') {
    try {
      let events = await readAll();
      events = events.filter(e => canManageScope(account, { pref: e.pref, office: e.office }));
      events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return res.status(200).json({ events, account: { organization: account.organization, office: account.office, role: account.role, label: account.label } });
    } catch (err) { console.error('[admin/events] GET', err); return res.status(500).json({ error: 'failed to list' }); }
  }

  // ── 追加（event:create 権限が必要。公開は event:publish が必要） ──
  if (req.method === 'POST') {
    if (!hasPermission(account, 'event:create')) { await writeAudit(account, { action: 'event.create', result: 'denied', note: '権限不足' }); return res.status(403).json({ error: 'イベントを追加する権限がありません' }); }
    const built = buildEvent(req.body?.event, account);
    if (built.error) return res.status(400).json({ error: built.error });
    // 公開で登録するには公開権限が必要（office_editor は下書きのみ）
    if (built.event.status === 'published' && !canPublish(account)) {
      await writeAudit(account, { action: 'event.create', result: 'denied', note: '公開権限なし' });
      return res.status(403).json({ error: '公開する権限がありません（下書きで保存してください）' });
    }
    built.event.updatedBy = account.displayId;
    try {
      if (await redis.hlen(KEY) >= MAX_EVENTS) return res.status(409).json({ error: '登録上限に達しています' });
      await redis.hset(KEY, { [built.event.id]: JSON.stringify(built.event) });
      await writeAudit(account, { action: 'event.create', result: 'success', targetId: built.event.id, organization: built.event.pref, office: built.event.office, title: built.event.title, after: built.event, note: built.event.status === 'published' ? '公開で登録' : '下書きで登録' });
      return res.status(200).json({ ok: true, event: built.event });
    } catch (err) { console.error('[admin/events] POST', err); return res.status(500).json({ error: 'failed to save' }); }
  }

  // ── 部分更新（公開状態の切替など。event:update 権限＋スコープ必須） ──
  if (req.method === 'PATCH') {
    if (!hasPermission(account, 'event:update')) { await writeAudit(account, { action: 'event.update', result: 'denied', note: '権限不足' }); return res.status(403).json({ error: '編集する権限がありません' }); }
    const id = String(req.body?.id || '').trim();
    const patch = req.body?.patch || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const raw = await redis.hget(KEY, id);
      if (!raw) return res.status(404).json({ error: 'not found' });
      const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // 所属（pref/office）はサーバー側の保存値で判定（クライアントを信用しない）
      if (!canManageScope(account, { pref: ev.pref, office: ev.office })) {
        await writeAudit(account, { action: 'event.update', result: 'denied', targetId: id, organization: ev.pref, note: '担当外イベント' });
        return res.status(403).json({ error: '権限がありません' });
      }
      const before = JSON.parse(JSON.stringify(ev)); // 監査用に変更前を保持
      // 場所・住所の変更で既存座標が不正確になるため、変更検知用に編集前の値を控える
      const beforeLoc = { place: ev.place || '', address: ev.address || '' };
      // 許可された項目のみ更新（既存イベントの編集に対応。※手動イベントは通知対象外）
      if (patch.status !== undefined) {
        if (!STATUSES.has(patch.status)) return res.status(400).json({ error: 'status が不正です' });
        // 公開へ遷移するには公開権限が必要
        if (patch.status === 'published' && !canPublish(account)) {
          await writeAudit(account, { action: 'event.update', result: 'denied', targetId: id, organization: ev.pref, note: '公開権限なし' });
          return res.status(403).json({ error: '公開する権限がありません' });
        }
        ev.status = patch.status;
      }
      // 文字項目（cleanText + 長さ上限）
      const TXT = { title: 120, place: 80, address: 100, time: 40, category: 20, tag: 30, ageRequirement: 100, notes: 300, deadline: 40 };
      for (const f of Object.keys(TXT)) {
        if (patch[f] !== undefined) {
          const v = cleanText(patch[f], TXT[f]);
          ev[f] = v || (['notes', 'ageRequirement', 'deadline'].includes(f) ? null : '');
        }
      }
      // 種別（陸/海/空）。空配列を送ると「指定なし」に戻し、文面からの推定に任せる
      if (patch.branch !== undefined) {
        const b = normalizeBranches(patch.branch);
        if (b.length) ev.branch = b; else delete ev.branch;
      }
      if (patch.title !== undefined && !ev.title) return res.status(400).json({ error: 'タイトルは必須です' });
      if (patch.url !== undefined) {
        const u = String(patch.url || '').trim();
        if (u && !/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'URL不正' });
        ev.url = u.slice(0, 500);
      }
      // 日付（変更時は曜日も再計算）
      if (patch.date !== undefined && DATE_RE.test(patch.date)) { ev.date = patch.date; ev.weekday = weekdayOf(patch.date); }
      if (patch.endDate !== undefined) {
        const ed = String(patch.endDate || '').trim();
        if (ed && DATE_RE.test(ed) && ed >= ev.date) { ev.endDate = ed; ev.endWeekday = weekdayOf(ed); }
        else { delete ev.endDate; delete ev.endWeekday; }
      }
      // 天気用座標の更新:
      //  1) 手動座標が送られたら accuracy:'manual' で確定（再取得フラグは解除）
      //  2) 場所/住所が変わったら既存座標を無効化し、再ジオコーディング待ちにする
      const manualLoc = patch.weatherLocation !== undefined ? parseManualCoords(patch.weatherLocation) : null;
      if (manualLoc) {
        ev.weatherLocation = manualLoc;
        delete ev.weatherLocationNeedsUpdate;
      } else if (ev.place !== beforeLoc.place || ev.address !== beforeLoc.address) {
        ev.weatherLocation = null;
        ev.weatherLocationNeedsUpdate = true;
      }
      ev.updatedAt = new Date().toISOString();
      ev.updatedBy = account.displayId;  // 編集した操作者（仮名・公開には出さない）
      await redis.hset(KEY, { [id]: JSON.stringify(ev) });
      const note = patch.status !== undefined
        ? `状態→${({ draft: '下書き', published: '公開', closed: '締切', cancelled: '中止' })[ev.status] || ev.status}`
        : '内容を編集';
      await writeAudit(account, { action: 'event.update', result: 'success', targetId: id, organization: ev.pref, office: ev.office, title: ev.title, before, after: ev, note });
      return res.status(200).json({ ok: true, event: ev });
    } catch (err) { console.error('[admin/events] PATCH', err); return res.status(500).json({ error: 'failed to update' }); }
  }

  // ── 削除（event:delete 権限＋スコープ必須） ──
  if (req.method === 'DELETE') {
    if (!hasPermission(account, 'event:delete')) { await writeAudit(account, { action: 'event.delete', result: 'denied', note: '権限不足' }); return res.status(403).json({ error: 'イベントを削除する権限がありません' }); }
    const id = String(req.body?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const raw = await redis.hget(KEY, id);
      if (!raw) return res.status(404).json({ error: 'not found' });
      const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!canManageScope(account, { pref: ev.pref, office: ev.office })) {
        await writeAudit(account, { action: 'event.delete', result: 'denied', targetId: id, organization: ev.pref, note: '担当外イベント' });
        return res.status(403).json({ error: '権限がありません' });
      }
      await redis.hdel(KEY, id);
      await writeAudit(account, { action: 'event.delete', result: 'success', targetId: id, organization: ev.pref, office: ev.office, title: ev.title, before: ev, note: '削除' });
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[admin/events] DELETE', err); return res.status(500).json({ error: 'failed to delete' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
