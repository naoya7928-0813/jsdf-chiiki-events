'use strict';
// Vercel の関数数の上限（Hobby プラン: 1デプロイ12個まで）を超えないことを確かめる。
// 2026-10-13 に運営APIを6個足して18個になり、本番デプロイが
// 「No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan」で失敗した。
// 運営API（api/admin/）は api/admin/[action].js にまとめ、各処理は先頭 "_" のファイルに置く。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAX_FUNCTIONS = 12;

// Vercel が関数にする api/ 配下のファイル（先頭 "_" のファイル・フォルダは関数にならない）
function functionFiles(dir = path.join(ROOT, 'api'), rel = 'api') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
    if (ent.isDirectory()) out.push(...functionFiles(path.join(dir, ent.name), `${rel}/${ent.name}`));
    else if (/\.(js|mjs|cjs|ts)$/.test(ent.name)) out.push(`${rel}/${ent.name}`);
  }
  return out;
}
// Edge 実行の関数はこの上限に数えない
const isEdge = (f) => /runtime:\s*['"]edge['"]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test(`サーバー関数は ${MAX_FUNCTIONS} 個以内（Hobby プランの上限）`, () => {
  const fns = functionFiles().filter(f => !isEdge(f));
  assert.ok(fns.length <= MAX_FUNCTIONS,
    `関数が ${fns.length} 個ある（上限 ${MAX_FUNCTIONS}）: ${fns.join(', ')}\n` +
    '運営APIは api/admin/[action].js の HANDLERS に足し、ファイル名を "_" で始めること');
});

test('api/admin/ には振り分け用の [action].js 以外の関数を置かない', () => {
  const fns = functionFiles(path.join(ROOT, 'api', 'admin'), 'api/admin');
  assert.deepEqual(fns, ['api/admin/[action].js']);
});

test('api/admin/_*.js の処理はすべて振り分け表に載っている（載せ忘れると 404 になる）', async () => {
  const { HANDLERS } = await import('../api/admin/[action].js');
  const files = fs.readdirSync(path.join(ROOT, 'api', 'admin'))
    .filter(n => /^_[a-z-]+\.js$/.test(n)).map(n => n.slice(1, -3)).sort();
  assert.deepEqual(Object.keys(HANDLERS).sort(), files);
  for (const k of files) assert.equal(typeof HANDLERS[k], 'function', k);
});

test('振り分け: 既知の action は処理に渡し、action をクエリから外す／未知は 404', async () => {
  const { default: handler, HANDLERS } = await import('../api/admin/[action].js');
  const mkRes = () => { const r = { statusCode: 200, headers: {} }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
  const orig = HANDLERS.history;
  let seen = null;
  HANDLERS.history = async (req, res) => { seen = req.query; return res.status(200).json({ ok: true }); };
  try {
    const res = mkRes();
    await handler({ method: 'GET', headers: {}, query: { action: 'history', limit: '5' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(seen, { limit: '5' });
  } finally { HANDLERS.history = orig; }
  for (const bad of ['nope', '__proto__', 'constructor', undefined]) {
    const res = mkRes();
    await handler({ method: 'GET', headers: {}, query: { action: bad } }, res);
    assert.equal(res.statusCode, 404, String(bad));
    assert.match(res.headers['cache-control'], /no-store/);
  }
});

test('vercel.json の functions 設定は実在する関数を指している', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  for (const k of Object.keys(cfg.functions || {})) {
    assert.ok(fs.existsSync(path.join(ROOT, k)), `vercel.json の functions に存在しない ${k} がある`);
  }
});
