'use strict';
// 管理APIの応答に no-store 等のキャッシュ禁止ヘッダが付くことを確認する（#1）。
// ハンドラ（ESM）を動的 import し、redis に到達しない経路（OPTIONS / メソッド不一致405）で検証。
const { test } = require('node:test');
const assert = require('node:assert');

// @upstash/redis のコンストラクタ用にダミー env（実通信はしない経路のみ検証）
process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';
// 管理機能を「設定済み」にする（空アカウント配列）。CSRF通過後は資格不一致で401になる。
process.env.ADMIN_ACCOUNTS_B64 = process.env.ADMIN_ACCOUNTS_B64 || Buffer.from('[]').toString('base64');
const ALLOWED = 'https://jsdf-chiiki-events.vercel.app';
// Redis(Upstash) への実通信を避ける: fetch を即時に空結果(result:null)で返す。
// 例外を投げると Upstash がリトライ/バックオフして遅くなるため、成功応答を装って高速化する。
// （目的は認可/CSRF判定の検証。Redis値は使わない経路のみ）
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ result: null }), text: async () => '{"result":null}' });

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null, ended: false };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.getHeader = (k) => r.headers[String(k).toLowerCase()];
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}

async function call(name, method) {
  const handler = (await import('../api/admin/' + name + '.js')).default;
  const req = { method, headers: {}, query: {}, body: {} };
  const res = mockRes();
  await handler(req, res);
  return res;
}

// login/logout は POST 専用 → GET で 405（エラー応答にも付くことの確認）。
// events/history/overrides は OPTIONS で 204（redis に触れない早期 return）。
const CASES = [
  ['login', 'GET'],
  ['logout', 'GET'],
  ['events', 'OPTIONS'],
  ['history', 'OPTIONS'],
  ['overrides', 'OPTIONS'],
];

for (const [name, method] of CASES) {
  test(`no-store ヘッダ: /api/admin/${name} (${method})`, async () => {
    const res = await call(name, method);
    assert.equal(res.headers['cache-control'], 'no-store, private');
    assert.equal(res.headers['pragma'], 'no-cache');
    assert.equal(res.headers['expires'], '0');
  });
}

// ── CSRF（#4）統合: login ハンドラ経由 ──────────────────────────
async function loginWith(headers) {
  const handler = (await import('../api/admin/login.js')).default;
  const req = { method: 'POST', headers, query: {}, body: { user: 'x', pass: 'y' } };
  const res = mockRes();
  await handler(req, res);
  return res;
}

test('CSRF: 許可OriginのPOSTは403にならない（資格不一致で401）', async () => {
  const res = await loginWith({ origin: ALLOWED, 'sec-fetch-site': 'same-origin' });
  assert.notEqual(res.statusCode, 403);
  assert.equal(res.statusCode, 401);
});
test('CSRF: 外部Originは403', async () => {
  const res = await loginWith({ origin: 'https://evil.example' });
  assert.equal(res.statusCode, 403);
});
test('CSRF: Sec-Fetch-Site cross-site は403', async () => {
  const res = await loginWith({ origin: ALLOWED, 'sec-fetch-site': 'cross-site' });
  assert.equal(res.statusCode, 403);
});
test('CSRF: Origin欠落のブラウザ書込みは403', async () => {
  const res = await loginWith({});
  assert.equal(res.statusCode, 403);
});
test('CSRF: GET（状態変更でない）は403にならない（405）', async () => {
  const handler = (await import('../api/admin/login.js')).default;
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: {}, body: {} }, res);
  assert.equal(res.statusCode, 405);
});
