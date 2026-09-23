'use strict';
// /api/admin/system（バックアップ）と /api/admin/login の再認証（step-up）の結合テスト。
// 実際のログイン → セッション Cookie → 再認証 → バックアップ取得 → 検証 の流れを、
// メモリ上の Redis（Upstash REST の偽物）で通す。Preview 環境の書き込み停止も確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./session.cjs');
const B = require('./backupFormat.cjs');
const { assembleBackup } = require('./backupAssemble.cjs');

process.env.KV_REST_API_URL = 'https://example.invalid';
process.env.KV_REST_API_TOKEN = 'x';
process.env.SESSION_INSECURE = 'true';
const PW = 'correct horse battery';
process.env.ADMIN_ACCOUNTS_B64 = Buffer.from(JSON.stringify([
  { user: 'nat', pass: S.hashPassword(PW), pref: '*', displayId: 'OP-N' },
  { user: 'sys', pass: S.hashPassword(PW), organization: '*', role: 'system_admin', displayId: 'OP-S' },
  { user: 'mgr', pass: S.hashPassword(PW), organization: 'tokyo', office: 'shibuya', role: 'office_manager', displayId: 'OP-M' },
])).toString('base64');

// ── Upstash REST のメモリ実装 ──
const store = new Map();
const b64 = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8').toString('base64') : v);
const idx = (list, i) => (i < 0 ? list.length + i : i);
function run([cmd, key, ...args]) {
  const c = String(cmd).toLowerCase();
  const hash = () => { if (!(store.get(key) instanceof Map)) store.set(key, new Map()); return store.get(key); };
  const list = () => { if (!Array.isArray(store.get(key))) store.set(key, []); return store.get(key); };
  switch (c) {
    case 'set': store.set(key, String(args[0])); return 'OK';
    case 'get': { const v = store.get(key); return typeof v === 'string' ? b64(v) : null; }
    case 'del': return store.delete(key) ? 1 : 0;
    case 'ttl': return store.has(key) ? 300 : -2;
    case 'incr': { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return n; }
    case 'expire': return 1;
    case 'hset': { const h = hash(); for (let i = 0; i < args.length; i += 2) h.set(String(args[i]), String(args[i + 1])); return 1; }
    case 'hgetall': { const h = store.get(key); return h instanceof Map ? [...h].flat().map(b64) : []; }
    case 'hdel': { const h = store.get(key); return h instanceof Map && h.delete(String(args[0])) ? 1 : 0; }
    case 'lpush': { list().unshift(...args.map(String)); return list().length; }
    case 'ltrim': { const l = list(); store.set(key, l.slice(idx(l, Number(args[0])), idx(l, Number(args[1])) + 1)); return 'OK'; }
    case 'llen': return Array.isArray(store.get(key)) ? store.get(key).length : 0;
    case 'lrange': { const l = store.get(key) || []; return l.slice(idx(l, Number(args[0])), idx(l, Number(args[1])) + 1).map(b64); }
    default: return null;
  }
}
globalThis.fetch = async (url, init = {}) => {
  let body = null;
  try { body = JSON.parse(init.body); } catch { /* noop */ }
  const payload = Array.isArray(body) && Array.isArray(body[0])
    ? body.map(cmd => ({ result: run(cmd) }))
    : { result: Array.isArray(body) ? run(body) : null };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};

const ORIGIN = require('./siteUrl.cjs').DEFAULT_SITE_URL;
function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
async function call(file, { method = 'GET', cookie = '', body = {}, query = {} } = {}) {
  const handler = (await import(`../api/admin/${file}.js`)).default;
  const res = mockRes();
  const headers = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}) };
  await handler({ method, headers, body, query, url: `/api/admin/${file}` }, res);
  return res;
}
// ログインの IP レート制限（10回/10分）はテストでは都度リセットする（制限そのものは想定どおりの挙動）
const resetRateLimit = () => { for (const k of [...store.keys()]) if (k.startsWith('rl:')) store.delete(k); };
async function login(user) {
  resetRateLimit();
  const r = await call('login', { method: 'POST', body: { user, pass: PW } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return String(r.headers['set-cookie']).split(';')[0];
}
const auditActions = () => (store.get('manual:history') || []).map(s => JSON.parse(s)).map(e => `${e.action}:${e.result}`);

// 手動イベント・上書き・監査ログ（1200件）を用意
run(['hset', 'manual:events', 'manual-tokyo-1', JSON.stringify({ id: 'manual-tokyo-1', pref: 'tokyo', office: 'shibuya', title: '試験', status: 'draft' })]);
run(['hset', 'manual:overrides', 't-1', JSON.stringify({ time: '10:00', _pref: 'tokyo', _office: '', _by: 'OP-N', _at: 'x' })]);
for (let i = 0; i < 1200; i++) run(['lpush', 'manual:history', JSON.stringify({ at: `seed-${String(i).padStart(4, '0')}`, action: 'seed', result: 'success' })]);

test('未ログインは 401、応答は no-store', async () => {
  const r = await call('system', { query: { op: 'backup-core' } });
  assert.equal(r.statusCode, 401);
  assert.equal(r.headers['cache-control'], 'no-store, private');
});

test('権限の無いロール（office_manager）はバックアップできない（403・監査に記録）', async () => {
  const cookie = await login('mgr');
  const r = await call('system', { cookie, query: { op: 'backup-core' } });
  assert.equal(r.statusCode, 403);
  assert.ok(auditActions().includes('backup.export:denied'));
});

test('再認証（パスワード再入力）なしでは 401 step_up_required。誤ったパスワードでは再認証できない', async () => {
  const cookie = await login('nat');
  const r = await call('system', { cookie, query: { op: 'backup-core' } });
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.error, 'step_up_required');
  const bad = await call('login', { method: 'POST', cookie, body: { op: 'step-up', pass: 'wrong' } });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.body.error, 'step_up_failed');
  assert.ok(auditActions().includes('auth.stepup:failure'));
  const still = await call('system', { cookie, query: { op: 'backup-core' } });
  assert.equal(still.statusCode, 401);
});

test('再認証後: 本体＋監査ログ全ページを取得して組み立てたファイルが検証に合格する（秘密項目なし）', async () => {
  const cookie = await login('nat');
  const su = await call('login', { method: 'POST', cookie, body: { op: 'step-up', pass: PW } });
  assert.equal(su.statusCode, 200);
  const core = await call('system', { cookie, query: { op: 'backup-core' } });
  assert.equal(core.statusCode, 200, JSON.stringify(core.body));
  assert.equal(core.body.sections.manualEvents.length, 1);
  assert.equal(core.body.sections.accounts.length, 3);
  assert.doesNotMatch(JSON.stringify(core.body), /scrypt\$/);
  const pages = [];
  for (let p = 0; p < core.body.audit.pages; p++) {
    const r = await call('system', { cookie, query: { op: 'backup-audit', page: String(p) } });
    assert.equal(r.statusCode, 200);
    pages.push(r.body);
  }
  const bundle = assembleBackup(core.body, pages);
  const v = B.verifyBackup(JSON.parse(JSON.stringify(bundle)));
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.equal(bundle.sections.audit[0].at, 'seed-0000', '監査ログは古い順');
  // 取得中に「バックアップを取った」監査ログ自体が追記されるので、開始時点の件数以上になる（ファイル内の整合は上で検証済み）
  assert.ok(v.counts.audit >= core.body.audit.total);
  assert.ok(auditActions().includes('backup.export:success'));
  assert.ok(auditActions().includes('audit.export:success'));
});

test('再認証には有効期限がある（期限切れのセッションは再度 401）', async () => {
  const cookie = await login('sys');
  await call('login', { method: 'POST', cookie, body: { op: 'step-up', pass: PW } });
  const token = cookie.split('=')[1];
  const sess = JSON.parse(store.get(`admin:session:${token}`));
  sess.stepUpAt = Date.now() - 60 * 60 * 1000;
  store.set(`admin:session:${token}`, JSON.stringify(sess));
  const r = await call('system', { cookie, query: { op: 'backup-core' } });
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.reason, 'step_up_expired');
});

test('不正な op・page は 400', async () => {
  const cookie = await login('nat');
  await call('login', { method: 'POST', cookie, body: { op: 'step-up', pass: PW } });
  assert.equal((await call('system', { cookie, query: { op: 'restore' } })).statusCode, 400);
  assert.equal((await call('system', { cookie, query: { op: 'backup-audit', page: '-1' } })).statusCode, 400);
});

test('Preview 環境: 別 Redis の確認（PREVIEW_DATA_ISOLATED=true）まで書き込み（ログイン含む）を止める。本番は影響なし', async () => {
  resetRateLimit();
  process.env.VERCEL_ENV = 'preview';
  try {
    const blocked = await call('login', { method: 'POST', body: { user: 'nat', pass: PW } });
    assert.equal(blocked.statusCode, 503);
    assert.equal(blocked.body.error, 'preview_not_isolated');
    process.env.PREVIEW_DATA_ISOLATED = 'true';
    assert.equal((await call('login', { method: 'POST', body: { user: 'nat', pass: PW } })).statusCode, 200);
  } finally {
    delete process.env.VERCEL_ENV; delete process.env.PREVIEW_DATA_ISOLATED;
  }
  process.env.VERCEL_ENV = 'production';
  try {
    assert.equal((await call('login', { method: 'POST', body: { user: 'nat', pass: PW } })).statusCode, 200);
  } finally { delete process.env.VERCEL_ENV; }
});
