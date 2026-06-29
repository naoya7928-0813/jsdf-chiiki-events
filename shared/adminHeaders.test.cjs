'use strict';
// 管理APIの応答に no-store 等のキャッシュ禁止ヘッダが付くことを確認する（#1）。
// ハンドラ（ESM）を動的 import し、redis に到達しない経路（OPTIONS / メソッド不一致405）で検証。
const { test } = require('node:test');
const assert = require('node:assert');

// @upstash/redis のコンストラクタ用にダミー env（実通信はしない経路のみ検証）
process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';

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
