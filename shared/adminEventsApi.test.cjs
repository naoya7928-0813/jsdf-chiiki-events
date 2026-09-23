'use strict';
// /api/admin/events と /api/manual-events の統合確認（Redis はメモリ上の偽物で代用）。
// - PATCH で属性タグ(tags)が保存される（以前は黙って捨てられていた）
// - 開始日だけ後ろへずらして「終了日 < 開始日」になる PATCH は 400
// - office ロールで office 未設定のアカウントは POST できない（作っても自分で扱えないため）
// - 公開 API（/api/manual-events）は office や上書きの管理用メタ（_pref/_office/_by/_at）を返さない
// - 公開 API は status を返す（中止/受付終了のバッジ表示に必要）。公開可能な状態のみ許可リストで通す
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('./session.cjs');

process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';
// 認証は簡便なヘッダ経路を使う（既定では無効なので明示的に有効化）。
process.env.LEGACY_HEADER_AUTH = 'true';
const PW = S.hashPassword('pw');
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'nat', pass: PW, pref: '*', displayId: 'OP-N' },
  { user: 'ed-nooffice', pass: PW, organization: 'tokyo', role: 'office_editor', displayId: 'OP-E0' },
  { user: 'mgr', pass: PW, organization: 'tokyo', office: 'shibuya', role: 'office_manager', displayId: 'OP-M' },
])).toString('base64');

// ── Upstash REST のメモリ実装（このテストで使うコマンドのみ） ──
const store = new Map(); // key → string | Map(hash) | Array(list)
const b64 = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8').toString('base64') : v);
function run([cmd, key, ...args]) {
  const c = String(cmd).toLowerCase();
  const hash = () => { if (!(store.get(key) instanceof Map)) store.set(key, new Map()); return store.get(key); };
  const list = () => { if (!Array.isArray(store.get(key))) store.set(key, []); return store.get(key); };
  switch (c) {
    case 'hset': { const h = hash(); for (let i = 0; i < args.length; i += 2) h.set(String(args[i]), String(args[i + 1])); return args.length / 2; }
    case 'hget': { const h = store.get(key); return h instanceof Map && h.has(String(args[0])) ? b64(h.get(String(args[0]))) : null; }
    case 'hgetall': { const h = store.get(key); if (!(h instanceof Map) || !h.size) return []; return [...h].flat().map(b64); }
    case 'hlen': { const h = store.get(key); return h instanceof Map ? h.size : 0; }
    case 'hdel': { const h = store.get(key); return h instanceof Map && h.delete(String(args[0])) ? 1 : 0; }
    case 'lpush': { list().unshift(...args.map(String)); return list().length; }
    case 'ltrim': return 'OK';
    case 'incr': { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return n; }
    case 'expire': return 1;
    default: return null;
  }
}
globalThis.fetch = async (url, init = {}) => {
  let body = null;
  try { body = JSON.parse(init.body); } catch { /* noop */ }
  // /pipeline（自動パイプライン）はコマンド配列の配列を送り、結果も配列で受け取る
  const payload = Array.isArray(body) && Array.isArray(body[0])
    ? body.map(cmd => ({ result: run(cmd) }))
    : { result: Array.isArray(body) ? run(body) : null };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
const as = (user) => ({ 'x-admin-user': user, 'x-admin-pass': 'pw', origin: ORIGIN, 'sec-fetch-site': 'same-origin' });
async function admin(method, user, body) {
  const handler = (await import('../api/admin/events.js')).default;
  const res = mockRes();
  await handler({ method, headers: as(user), query: {}, body }, res);
  return res;
}
async function publicList() {
  const handler = (await import('../api/manual-events.js')).default;
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: {} }, res);
  return res;
}
const base = { pref: 'tokyo', date: '2099-05-01', title: '試験イベント', place: '会場' };

test('PATCH: 属性タグ(tags)が保存される／空配列で解除される', async () => {
  const c = await admin('POST', 'nat', { event: { ...base, status: 'published' } });
  assert.equal(c.statusCode, 200);
  const id = c.body.event.id;
  const p = await admin('PATCH', 'nat', { id, patch: { tags: ['オンライン', '家族向け', '不正な値'] } });
  assert.equal(p.statusCode, 200);
  assert.ok(Array.isArray(p.body.event.tags) && p.body.event.tags.length > 0, 'tags が保存されていない');
  assert.ok(!p.body.event.tags.includes('不正な値'), '未定義タグは正規化で除外される');
  const clear = await admin('PATCH', 'nat', { id, patch: { tags: [] } });
  assert.equal(clear.statusCode, 200);
  assert.equal(clear.body.event.tags, undefined);
});

test('PATCH: 開始日だけ後ろへずらして終了日より後になる場合は 400', async () => {
  const c = await admin('POST', 'nat', { event: { ...base, endDate: '2099-05-02' } });
  assert.equal(c.statusCode, 200);
  const bad = await admin('PATCH', 'nat', { id: c.body.event.id, patch: { date: '2099-05-10' } });
  assert.equal(bad.statusCode, 400);
  const ok = await admin('PATCH', 'nat', { id: c.body.event.id, patch: { date: '2099-05-02' } });
  assert.equal(ok.statusCode, 200);
});

test('POST: office 未設定の office ロールは拒否（403）、office 設定済みは可', async () => {
  const denied = await admin('POST', 'ed-nooffice', { event: base });
  assert.equal(denied.statusCode, 403);
  const ok = await admin('POST', 'mgr', { event: base });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.event.office, 'shibuya');
});

test('公開 API: office と上書きの管理用メタを返さない', async () => {
  const c = await admin('POST', 'mgr', { event: { ...base, status: 'published' } });
  assert.equal(c.statusCode, 200);
  run(['hset', 'manual:overrides', 'scrape-1', JSON.stringify({ title: '修正後', _pref: 'tokyo', _office: 'shibuya', _by: 'OP-M', _at: 'x' })]);
  const res = await publicList();
  assert.equal(res.statusCode, 200);
  const ev = res.body.events.find(e => e.id === c.body.event.id);
  assert.ok(ev, '公開イベントが返っていない');
  for (const k of ['office', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt']) assert.ok(!(k in ev), `${k} が公開されている`);
  assert.equal(ev.status, 'published');
  assert.deepEqual(res.body.overrides['scrape-1'], { title: '修正後' });
});

test('公開 API: 中止・受付終了は status 付きで公開、下書き・未知の状態は非公開', async () => {
  const mk = async (status) => (await admin('POST', 'nat', { event: { ...base, title: `状態${status}`, status: 'published' } })).body.event.id;
  const cancelled = await mk('cancelled');
  assert.equal((await admin('PATCH', 'nat', { id: cancelled, patch: { status: 'cancelled' } })).statusCode, 200);
  const draft = await mk('draft');
  assert.equal((await admin('PATCH', 'nat', { id: draft, patch: { status: 'draft' } })).statusCode, 200);
  // 将来追加される状態（例: 承認待ち）は、許可リストに足さない限り公開されないこと
  const unknown = 'manual-tokyo-unknown';
  run(['hset', 'manual:events', unknown, JSON.stringify({ ...base, id: unknown, status: 'pending_review' })]);
  const res = await publicList();
  const byId = Object.fromEntries(res.body.events.map(e => [e.id, e]));
  assert.equal(byId[cancelled]?.status, 'cancelled', '中止バッジ用の status が公開されていない');
  assert.ok(!byId[draft], '下書きが公開されている');
  assert.ok(!byId[unknown], '未知の状態が公開されている');
});
