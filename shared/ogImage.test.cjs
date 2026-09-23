'use strict';
// OGP 画像生成（api/og.js → @vercel/og）の回帰テスト。
// 依存更新（sharp / @vercel/og）で画像生成が壊れていないかを確かめる。
//
// api/og.js は失敗時に静的アイコンへ 302 で退避するため、「エラーにならない」だけでは不十分。
// 実際に 200 で PNG（1200×630）が返ることを確認する。
// フォントは本番では Google Fonts から取得するが、テストはネットワークに依存させないため
// fetch を差し替え、同梱の IBM Plex Mono（woff）を返す（日本語グリフの確認は手動の実レンダリングで行う）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fontPath = path.join(__dirname, '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff');
const skip = fs.existsSync(fontPath) ? false : 'フォント（@fontsource/ibm-plex-mono）未インストール';

async function renderOg(params) {
  const font = fs.readFileSync(fontPath);
  const realFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url && url.url ? url.url : url);
    // @vercel/og 自身の wasm（file://）等はそのまま読む。差し替えるのは外部（https）への取得だけ
    if (!u.startsWith('https://')) return realFetch(url, init);
    requested.push(u);
    if (u.startsWith('https://fonts.googleapis.com/css2')) {
      return new Response('@font-face { src: url(https://fonts.example.invalid/font.woff) format("woff"); }', { status: 200 });
    }
    return new Response(font, { status: 200, headers: { 'content-type': 'font/woff' } });
  };
  try {
    const { default: handler } = await import(pathToFileURL(path.join(__dirname, '../api/og.js')).href);
    const res = await handler(new Request(`https://jsdf-chiiki-events.jp/api/og?${new URLSearchParams(params)}`));
    return { res, buf: Buffer.from(await res.arrayBuffer()), requested };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('OGP画像: 200・image/png・1200×630 の PNG を生成する（302 フォールバックにならない）', { skip }, async () => {
  const { res, buf, requested } = await renderOg({ title: 'Utsunomiya Camp Tour', date: '2026-10-19', place: 'JGSDF Camp', pref: 'Tokyo', cat: 'Tour' });
  assert.equal(res.status, 200, 'フォールバック（302）になっている＝画像生成が失敗している');
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG シグネチャ');
  assert.equal(buf.readUInt32BE(16), 1200, '幅');
  assert.equal(buf.readUInt32BE(20), 630, '高さ');
  assert.ok(buf.length > 5000, `画像が小さすぎる（${buf.length} bytes）`);
  // キャッシュ指定（CDN で再利用される）
  assert.match(res.headers.get('cache-control') || '', /s-maxage=86400/);
  // 本文の文字だけのサブセットフォントを要求している（全文字フォントを取りに行かない）
  assert.ok(requested.some(u => u.includes('family=Noto+Sans+JP') && u.includes('text=')), 'サブセットフォントの要求');
});

test('OGP画像: パラメータが空でも既定タイトルで生成する', { skip }, async () => {
  const { res, buf } = await renderOg({});
  assert.equal(res.status, 200);
  assert.equal(buf.readUInt32BE(16), 1200);
});
