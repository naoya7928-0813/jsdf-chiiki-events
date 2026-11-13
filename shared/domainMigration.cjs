'use strict';
/**
 * domainMigration — 旧ドメイン（*.vercel.app）から .jp への自動移動と、端末内の設定の引き継ぎ
 *
 * ■ なぜ 308 転送だけでは足りないか（2026-11-13 調査）
 *   middleware.js は 2026-10-02 から旧ドメインへのリクエストを 308 で .jp へ送っている。
 *   新しく開いた人はそれで移れるが、**以前に旧ドメインを開いた端末は移れなかった**:
 *     1. 旧ドメインの Service Worker（SW）が画面を手元のキャッシュから出すため、サーバーに届かない
 *     2. SW の更新ファイル（/sw.js）も 308 で返していた。ブラウザは SW の更新を
 *        「リダイレクト禁止」で取りにいく（Service Worker 仕様の Update）ため、更新は毎回失敗し、
 *        古い SW と古い画面が残り続ける（手動の「新しいサイトへ移動」ボタンが出るだけ）
 *   さらに 308 で移すと、お気に入り・配色などの端末内の保存（localStorage）は
 *   ドメインごとに別物なので、すべて消えたように見える。
 *
 * ■ 仕組み
 *   旧ドメインでは middleware.js が次を返す（それ以外は従来どおり 308）:
 *     /sw.js         … 片付け用の SW（legacyServiceWorkerSource）。古い SW と入れ替わり、
 *                      キャッシュを消して自分を登録解除し、開いている画面を読み直させる
 *     画面の読み込み  … 引っ越し用の小さなページ（legacyMigratePageHtml）。
 *                      ブラウザの画面遷移（Sec-Fetch-Dest: document）のときだけ。検索エンジン等は 308
 *     /__migrate.js  … そのページのスクリプト（legacyMigrateScriptSource）。CSP が script-src 'self'
 *                      のため外部ファイルにしている。localStorage を読み、URL の # 以降に載せて .jp へ移る
 *   .jp では src/utils/domainMigrationImport.js が # 以降を読み取り、
 *   planImport の結果だけを localStorage に書いてから # を消す。
 *
 * ■ 安全のための決めごと
 *   - 引き継ぐのは CARRY_KEYS に挙げた項目だけ。値は種類ごとに形を検査する（validValue）
 *   - URL の # 以降はサーバーに送られない（アクセスログにも残らない）。読み取り後すぐ消す。
 *     アクセス解析（main.jsx の injectAnalytics）より前に消すこと
 *   - 誰でも .jp/#jsdf-migrate=… のリンクを作れるため、**既にある値は上書きしない**。
 *     お気に入り・申請済み（ID の集合）だけは和集合にする（今ある登録は消えない）
 *   - 規約への同意（jsdf-legal-accepted）は引き継がない。リンクで同意を飛ばせないようにする
 *     （移った人は一度だけ同意画面を見る）
 *   - 通知の登録（Web Push）はドメイン単位で引き継げない。関連の設定も運ばない
 *   - 新しい保存項目は作らない（「引き継いだ」ことはその読み込みの間だけ覚える）。
 *     運ぶのはプライバシーポリシーに記載済みの項目だけで、端末の外（サーバー）へは送らない
 */

/** 現行の公開URL（shared/siteUrl.cjs と同じ値。middleware.js から読むためここでも持つ） */
const { DEFAULT_SITE_URL } = require('./siteUrl.cjs');

/** URL の # 以降に載せるときの名前 */
const HASH_PARAM = 'jsdf-migrate';
/** 引っ越し用スクリプトの置き場所（旧ドメインだけで配信する） */
const MIGRATE_SCRIPT_PATH = '/__migrate.js';
/** 旧ドメインで片付け用に差し替える SW のパス（vite-plugin-pwa の filename と同じ） */
const SW_PATH = '/sw.js';
/** 載せる量の上限（# 以降の文字数）。超えたら優先度の低い項目から落とす */
const MAX_PAYLOAD_CHARS = 48000;

/**
 * 引き継ぐ項目。並びは優先度順（上限を超えたら下から落とす）。
 *   kind 'ids'  … ID 文字列の配列（JSON）。既存と和集合にする
 *   kind 'list' … 配列（JSON）。既にあれば上書きしない
 *   kind 'flag' … 短い文字列（英数字・記号のみ）。既にあれば上書きしない
 */
const CARRY_KEYS = [
  { key: 'jsdf-favorites',          kind: 'ids'  },
  { key: 'jsdf-applied',            kind: 'ids'  },
  { key: 'jsdf-scheme',             kind: 'flag' },
  { key: 'jsdf-dark',               kind: 'flag' },
  { key: 'jsdf-region',             kind: 'flag' },
  { key: 'jsdf-last-region',        kind: 'flag' },
  { key: 'jsdf-last-pref',          kind: 'flag' },
  { key: 'jsdf-auto-mode',          kind: 'flag' },
  { key: 'jsdf-layout-mode',        kind: 'flag' },
  { key: 'jsdf-wm-layout',          kind: 'flag' },
  { key: 'jsdf-view-mode',          kind: 'flag' },
  { key: 'jsdf-radar-orientation',  kind: 'flag' },
  { key: 'jsdf-notif-region',       kind: 'flag' },
  { key: 'jsdf-notice-read',        kind: 'flag' },
  { key: 'jsdf-filter-open',        kind: 'flag' },
  { key: 'jsdf-auto-apply',         kind: 'flag' },
  { key: 'jsdf-nearby-intro-seen',  kind: 'flag' },
  { key: 'jsdf-known-ids',          kind: 'ids'  },
  { key: 'jsdf-notif-history',      kind: 'list' },
];
const KIND_OF = Object.fromEntries(CARRY_KEYS.map((c) => [c.key, c.kind]));

const MAX_IDS = 2000;
const MAX_ID_LEN = 200;
const MAX_LIST_ITEMS = 200;
const MAX_FLAG_LEN = 64;

function parseJson(v) { try { return JSON.parse(v); } catch { return undefined; } }

/** 値の形を検査する。通らない値は引き継がない */
function validValue(kind, value) {
  if (typeof value !== 'string') return false;
  if (kind === 'flag') return value.length <= MAX_FLAG_LEN && /^[\w.:-]*$/.test(value);
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return false;
  if (kind === 'ids') {
    return parsed.length <= MAX_IDS
      && parsed.every((x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID_LEN);
  }
  if (kind === 'list') {
    return parsed.length <= MAX_LIST_ITEMS
      && parsed.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
  }
  return false;
}

// ── # 以降の符号化（UTF-8 JSON → base64url）。旧ドメインのスクリプトも同じ方式 ──
function toBase64Url(text) {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(b64) {
  const s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(s + '='.repeat((4 - (s.length % 4)) % 4))));
}

/** 引き継ぐ値（{key: value}）を # 以降の文字列にする。上限を超えたら優先度の低い項目から落とす */
function encodePayload(items) {
  const picked = {};
  for (const { key, kind } of CARRY_KEYS) {
    if (items && Object.prototype.hasOwnProperty.call(items, key) && validValue(kind, items[key])) picked[key] = items[key];
  }
  const keys = Object.keys(picked);
  while (keys.length) {
    const body = {};
    for (const k of keys) body[k] = picked[k];
    const encoded = toBase64Url(JSON.stringify({ v: 1, items: body }));
    if (encoded.length <= MAX_PAYLOAD_CHARS) return encoded;
    keys.pop();
  }
  return '';
}

/** # 以降の文字列を読む。形が違う・未知の項目・検査に通らない値は捨てる。読めなければ null */
function decodePayload(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > MAX_PAYLOAD_CHARS) return null;
  let data;
  try { data = JSON.parse(fromBase64Url(encoded)); } catch { return null; }
  if (!data || data.v !== 1 || !data.items || typeof data.items !== 'object' || Array.isArray(data.items)) return null;
  const items = {};
  for (const [key, value] of Object.entries(data.items)) {
    const kind = KIND_OF[key];
    if (kind && validValue(kind, value)) items[key] = value;
  }
  return { items };
}

/** location.hash から引き継ぎの値を取り出す（無ければ null） */
function payloadFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const raw = params.get(HASH_PARAM);
  return raw ? decodePayload(raw) : null;
}

/** 引き継ぎを取り除いたあとの hash（他の値があれば残す） */
function hashWithoutPayload(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!h) return '';
  const params = new URLSearchParams(h);
  params.delete(HASH_PARAM);
  const rest = params.toString();
  return rest ? `#${rest}` : '';
}

/**
 * 実際に書き込む値を決める。
 * @param {{items: object}} payload decodePayload の結果
 * @param {(key: string) => (string|null)} getExisting いまの端末の値
 * @returns {Array<[string, string]>} 書き込む [key, value]
 */
function planImport(payload, getExisting) {
  if (!payload || !payload.items) return [];
  const out = [];
  for (const { key, kind } of CARRY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload.items, key)) continue;
    const incoming = payload.items[key];
    let existing = null;
    try { existing = getExisting(key); } catch { existing = null; }
    if (existing == null || existing === '') { out.push([key, incoming]); continue; }
    if (kind !== 'ids') continue; // 既にあるものは上書きしない
    const cur = parseJson(existing);
    if (!Array.isArray(cur)) continue; // 今の値が壊れていても勝手に直さない
    const merged = [...new Set([...cur.filter((x) => typeof x === 'string'), ...JSON.parse(incoming)])].slice(0, MAX_IDS);
    if (merged.length !== cur.length) out.push([key, JSON.stringify(merged)]);
  }
  return out;
}

/** 移動先の URL を決める（パスは同じものを使う。外部へは飛ばさない） */
function migrateTargetUrl(pathAndSearch, origin = DEFAULT_SITE_URL) {
  try {
    const p = String(pathAndSearch || '/');
    const target = new URL(p.startsWith('/') && !p.startsWith('//') ? p : '/', origin);
    if (target.origin !== new URL(origin).origin) return new URL('/', origin).href;
    return target.href;
  } catch {
    return `${origin}/`;
  }
}

// ── 旧ドメインで配信するスクリプト ─────────────────────────────
// 文字列のまま配信する（関数の toString は本番の圧縮で書き換わる恐れがあるため使わない）。
// テスト（shared/domainMigration.test.cjs）が仮の localStorage で実行し、decodePayload で読めることを確かめる。

const LEGACY_MIGRATE_BODY = `
var items = {};
try {
  for (var i = 0; i < cfg.keys.length; i++) {
    var v = window.localStorage.getItem(cfg.keys[i]);
    if (v !== null && v !== '') items[cfg.keys[i]] = v;
  }
} catch (e) { /* 読めなければ設定なしで移る */ }

var path = window.location.pathname + window.location.search;
var target;
try {
  target = new URL(path.charAt(0) === '/' && path.charAt(1) !== '/' ? path : '/', cfg.origin);
  if (target.origin !== cfg.origin) target = new URL('/', cfg.origin);
} catch (e) { target = new URL('/', cfg.origin); }

var hash = '';
var names = Object.keys(items);
while (names.length) {
  var body = {};
  for (var j = 0; j < names.length; j++) body[names[j]] = items[names[j]];
  var enc = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, items: body }))))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  if (enc.length <= cfg.max) { hash = '#' + cfg.param + '=' + enc; break; }
  names.pop();
}
window.location.replace(target.href + hash);
`;

const LEGACY_SW_SOURCE = `// 旧ドメインの片付け用 Service Worker（shared/domainMigration.cjs）
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try { await self.clients.claim(); } catch (e) { /* noop */ }
    var wins = [];
    try { wins = await self.clients.matchAll({ type: 'window' }); } catch (e) { /* noop */ }
    try {
      var names = await caches.keys();
      await Promise.all(names.map(function (n) { return caches.delete(n); }));
    } catch (e) { /* noop */ }
    try { await self.registration.unregister(); } catch (e) { /* noop */ }
    // 読み直すとサーバーに届き、引っ越し用ページ→ .jp へ進む。
    // navigate が使えない環境でも SW は外れたので、次に開いたときに同じ経路になる
    await Promise.all(wins.map(function (c) {
      try { return c.navigate(c.url).catch(function () {}); } catch (e) { return null; }
    }));
  })());
});
`;

function legacyMigrateScriptSource(origin = DEFAULT_SITE_URL) {
  const cfg = { origin: new URL(origin).origin, keys: CARRY_KEYS.map((c) => c.key), param: HASH_PARAM, max: MAX_PAYLOAD_CHARS };
  return `(function (cfg) {${LEGACY_MIGRATE_BODY}})(${JSON.stringify(cfg)});\n`;
}

function legacyServiceWorkerSource() {
  return LEGACY_SW_SOURCE;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 引っ越し用ページ（旧ドメインの画面遷移にだけ返す）。スクリプトが動かない環境向けにリンクも置く */
function legacyMigratePageHtml(pathAndSearch, origin = DEFAULT_SITE_URL) {
  const target = escapeHtml(migrateTargetUrl(pathAndSearch, origin));
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${target}">
<title>新しいアドレスへ移動しています</title>
<script src="${MIGRATE_SCRIPT_PATH}"></script>
</head>
<body style="font-family:sans-serif;background:#0b2545;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center;line-height:1.8">
<div>
<p style="margin:0 0 12px;font-weight:700">新しいアドレスへ移動しています…</p>
<p style="margin:0;font-size:14px">自動で移動しない場合は <a href="${target}" style="color:#9fd3ff">こちら</a> を開いてください。</p>
</div>
</body>
</html>
`;
}

/**
 * 旧ドメインへのリクエストへの返し方を決める（middleware.js から使う。純粋関数）。
 * @returns {'sw'|'script'|'page'|'redirect'}
 */
function legacyResponseKind({ pathname, secFetchDest, secFetchMode, method }) {
  if (method && method !== 'GET' && method !== 'HEAD') return 'redirect';
  if (pathname === SW_PATH) return 'sw';
  if (pathname === MIGRATE_SCRIPT_PATH) return 'script';
  // 画面の読み込み（ブラウザの遷移）だけ。検索エンジン等はこのヘッダーを送らないので 308 のまま
  if (secFetchDest === 'document' && secFetchMode === 'navigate') return 'page';
  return 'redirect';
}

module.exports = {
  HASH_PARAM, MIGRATE_SCRIPT_PATH, SW_PATH, MAX_PAYLOAD_CHARS, CARRY_KEYS,
  validValue, encodePayload, decodePayload, payloadFromHash, hashWithoutPayload, planImport,
  migrateTargetUrl, legacyMigrateScriptSource, legacyServiceWorkerSource, legacyMigratePageHtml,
  legacyResponseKind,
};
