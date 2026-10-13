'use strict';
// テスト用: Upstash Redis REST API のメモリ実装（global fetch を差し替える）。
// API ハンドラ（api/**.js）を Redis なしで結合テストするために使う。
// 対応コマンドはテストで使うものだけ。未対応は null を返す（テストで気付けるよう unknown を記録）。
//
// 使い方:
//   const fake = require('./fixtures/fakeUpstash.cjs');
//   fake.install();             // global.fetch を差し替え（Upstash 以外の URL は passthrough に渡す）
//   fake.store                  // Map: key → string | Map(hash) | Set | Array(list)
//   fake.reset()

const store = new Map();
const ttl = new Map();          // key → 期限（ms）。expire/EX の確認用（自動失効はしない）
const unknown = new Set();
let passthrough = null;         // Upstash 以外の fetch を処理する関数（任意）

const b64 = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8').toString('base64') : v);

function run([cmd, key, ...args]) {
  const c = String(cmd).toLowerCase();
  const get = (want) => {
    const v = store.get(key);
    if (want === 'hash') { if (!(v instanceof Map)) store.set(key, new Map()); return store.get(key); }
    if (want === 'set') { if (!(v instanceof Set)) store.set(key, new Set()); return store.get(key); }
    if (want === 'list') { if (!Array.isArray(v)) store.set(key, []); return store.get(key); }
    return v;
  };
  switch (c) {
    case 'ping': return 'PONG';
    // ── string ──
    case 'get': { const v = store.get(key); return typeof v === 'string' ? b64(v) : null; }
    case 'set': {
      const opts = args.slice(1).map(a => String(a).toUpperCase());
      if (opts.includes('NX') && store.has(key)) return null;
      store.set(key, String(args[0]));
      const ex = opts.indexOf('EX');
      if (ex >= 0) ttl.set(key, Date.now() + Number(args[ex + 2]) * 1000);
      return 'OK';
    }
    case 'del': { let n = 0; for (const k of [key, ...args]) if (store.delete(String(k))) n++; return n; }
    case 'exists': return store.has(key) ? 1 : 0;
    case 'incr': { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return n; }
    case 'incrby': { const n = Number(store.get(key) || 0) + Number(args[0]); store.set(key, String(n)); return n; }
    case 'expire': ttl.set(key, Date.now() + Number(args[0]) * 1000); return 1;
    case 'mget': return [key, ...args].map(k => { const v = store.get(String(k)); return typeof v === 'string' ? b64(v) : null; });
    // ── hash ──
    case 'hset': { const h = get('hash'); for (let i = 0; i < args.length; i += 2) h.set(String(args[i]), String(args[i + 1])); return args.length / 2; }
    case 'hget': { const h = store.get(key); return h instanceof Map && h.has(String(args[0])) ? b64(h.get(String(args[0]))) : null; }
    case 'hmget': { const h = store.get(key); return args.map(f => (h instanceof Map && h.has(String(f)) ? b64(h.get(String(f))) : null)); }
    case 'hgetall': { const h = store.get(key); if (!(h instanceof Map) || !h.size) return []; return [...h].flat().map(b64); }
    case 'hlen': { const h = store.get(key); return h instanceof Map ? h.size : 0; }
    case 'hdel': { const h = store.get(key); let n = 0; if (h instanceof Map) for (const f of args) if (h.delete(String(f))) n++; return n; }
    case 'hincrby': { const h = get('hash'); const n = Number(h.get(String(args[0])) || 0) + Number(args[1]); h.set(String(args[0]), String(n)); return n; }
    // ── set ──
    case 'sadd': { const s = get('set'); let n = 0; for (const m of args) if (!s.has(String(m))) { s.add(String(m)); n++; } return n; }
    case 'srem': { const s = store.get(key); let n = 0; if (s instanceof Set) for (const m of args) if (s.delete(String(m))) n++; return n; }
    case 'smembers': { const s = store.get(key); return s instanceof Set ? [...s].map(b64) : []; }
    case 'scard': { const s = store.get(key); return s instanceof Set ? s.size : 0; }
    case 'sismember': { const s = store.get(key); return s instanceof Set && s.has(String(args[0])) ? 1 : 0; }
    // ── list ──
    case 'lpush': { const l = get('list'); l.unshift(...args.map(String).reverse()); return l.length; }
    case 'ltrim': { const l = get('list'); const [a, b] = args.map(Number); store.set(key, l.slice(a, b < 0 ? l.length + b + 1 : b + 1)); return 'OK'; }
    case 'lrange': { const l = get('list'); const [a, b] = args.map(Number); return l.slice(a, b < 0 ? l.length + b + 1 : b + 1).map(b64); }
    default: unknown.add(c); return null;
  }
}

function isUpstash(url) {
  const u = String(url);
  return u.startsWith(process.env.KV_REST_API_URL || 'https://example.invalid');
}

async function fakeFetch(url, init = {}) {
  if (!isUpstash(url)) {
    if (passthrough) return passthrough(url, init);
    return new Response('not found', { status: 404 });
  }
  let body = null;
  try { body = JSON.parse(init.body); } catch { /* noop */ }
  // /pipeline（自動パイプライン）はコマンド配列の配列を送り、結果も配列で受け取る
  const payload = Array.isArray(body) && Array.isArray(body[0])
    ? body.map(cmd => ({ result: run(cmd) }))
    : { result: Array.isArray(body) ? run(body) : null };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

function install({ onOtherFetch } = {}) {
  process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.invalid';
  process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';
  passthrough = onOtherFetch || null;
  globalThis.fetch = fakeFetch;
}

function reset() { store.clear(); ttl.clear(); unknown.clear(); }

/** ハンドラに渡す res の偽物 */
function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

module.exports = { install, reset, store, ttl, unknown, run, mockRes, setPassthrough: fn => { passthrough = fn; } };
