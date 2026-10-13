'use strict';
/**
 * scraper/lib/llmClient.js のキャッシュ方針のテスト
 *
 * 2026-10-13 に判明: どのプロバイダも答えなかった（429・通信障害）ときの null まで
 * 90 日キャッシュしており、その資料は以後 LLM で読み直されなかった。
 * 「答えたが取り出せなかった」ときだけキャッシュし、「答えなかった」ときはキャッシュしない。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');

process.env.GROQ_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;
const llmClient = require('../scraper/lib/llmClient');
const llmCache  = require('../scraper/lib/llmCache');

const realFetch = global.fetch;
const realWarn = console.warn, realLog = console.log;

function stubFetch(chatResponder) {
  global.fetch = async (url) => {
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }), { status: 200 });
    }
    return chatResponder();
  };
}

test.before(() => { console.warn = () => {}; console.log = () => {}; });
test.after(() => { global.fetch = realFetch; console.warn = realWarn; console.log = realLog; });

test('API が答えなかった（500）ときは null をキャッシュしない', async () => {
  stubFetch(async () => new Response('boom', { status: 500 }));
  const before = llmCache.size();
  const r = await llmClient.extractEventFromText('令和8年10月18日 自衛隊説明会 会場: 市民会館 A', { prefLabel: 't1' });
  assert.equal(r, null);
  assert.equal(llmCache.size(), before, '失敗をキャッシュしてはいけない');
  assert.ok(llmClient.getStats().unanswered >= 1);
});

test('JSON として読めない応答もキャッシュしない', async () => {
  stubFetch(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'すみません' } }] }), { status: 200 }));
  const before = llmCache.size();
  const r = await llmClient.extractEventFromText('令和8年10月18日 自衛隊説明会 会場: 市民会館 B', { prefLabel: 't2' });
  assert.equal(r, null);
  assert.equal(llmCache.size(), before);
});

test('答えた結果（取り出せなかった null を含む）はキャッシュし、2回目は API を呼ばない', async () => {
  let calls = 0;
  stubFetch(async () => {
    calls++;
    const content = JSON.stringify({ title: '自衛隊説明会', date: '2026-10-18', place: '市民会館' });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  const text = '令和8年10月18日 自衛隊説明会 会場: 市民会館 C';
  const r1 = await llmClient.extractEventFromText(text, { prefLabel: 't3' });
  assert.equal(r1.title, '自衛隊説明会');
  const n = calls;
  const r2 = await llmClient.extractEventFromText(text, { prefLabel: 't3' });
  assert.deepEqual(r2, r1);
  assert.equal(calls, n, 'キャッシュから返すので API は呼ばない');
});

test('peekImageCache: 段3の画像再抽出のキャッシュ有無を API なしで確かめられる', () => {
  assert.equal(llmClient.peekImageCache({ cacheKey: 'nohash', prefLabel: 'x' }).hit, false);
  assert.equal(llmClient.peekImageCache({}).hit, false);
});
