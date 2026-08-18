'use strict';
/**
 * scraper/lib/ocrModel.js の自動選択ロジックのテスト。
 *
 * 入力のモデル一覧は、2026-08-18 に各プロバイダの公式ドキュメントから
 * 実際に取得したもの。ハードコードした候補が将来全部廃止されても、
 * 一覧から妥当なモデルを選び直せることを固定する。
 *   Groq   : https://console.groq.com/docs/models, /docs/vision
 *   Gemini : https://ai.google.dev/gemini-api/docs/models
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { OcrModelResolver, discoverGroqModel, discoverGeminiModel } = require('../scraper/lib/ocrModel');

const quiet = { log() {}, warn() {} };

// 2026-08-18 時点の Groq の実際の一覧
const GROQ_LIVE = [
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b',
  'whisper-large-v3', 'whisper-large-v3-turbo',
  'groq/compound', 'groq/compound-mini',
  'canopylabs/orpheus-arabic-saudi', 'canopylabs/orpheus-v1-english',
  'meta-llama/llama-prompt-guard-2-22m', 'meta-llama/llama-prompt-guard-2-86m',
  'minimaxai/minimax-m2.7', 'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3.6-27b',
];

// 2026-08-18 時点の Gemini の実際の一覧（generateContent 対応のもの）
const GEMINI_LIVE = [
  'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview',
  'gemini-omni-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-image',
  'gemini-2.5-flash-lite', 'gemini-2.5-pro',
  'gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview',
  'gemini-3.5-live-translate-preview', 'gemini-3.1-flash-live-preview',
  'gemini-robotics-er-2-preview', 'gemini-robotics-er-1.6-preview',
];

test('Groq: 実際の一覧から唯一の画像入力モデルを選ぶ', () => {
  // 公式 vision ドキュメント上、画像を渡せるのは qwen/qwen3.6-27b だけ
  assert.equal(discoverGroqModel(GROQ_LIVE), 'qwen/qwen3.6-27b');
});

test('Groq: 音声・ガードレール系を画像モデルと取り違えない', () => {
  const noVision = GROQ_LIVE.filter(id => !id.startsWith('qwen/'));
  const picked = discoverGroqModel(noVision);
  // qwen が消えたら llama-4 系の命名を探すが、この一覧には無いので null
  assert.equal(picked, null);
  for (const bad of ['whisper-large-v3', 'canopylabs/orpheus-v1-english',
    'meta-llama/llama-prompt-guard-2-22m', 'openai/gpt-oss-safeguard-20b', 'groq/compound']) {
    assert.notEqual(picked, bad);
  }
});

test('Gemini: 実際の一覧から最安の flash-lite 安定版を選ぶ', () => {
  assert.equal(discoverGeminiModel(GEMINI_LIVE), 'gemini-3.5-flash-lite');
});

test('Gemini: 画像"生成"・音声・ロボティクスを選ばない', () => {
  // flash-lite 系を一覧から除くと、次は flash 安定版に落ちる
  const noLite = GEMINI_LIVE.filter(id => !/flash-lite/.test(id));
  assert.equal(discoverGeminiModel(noLite), 'gemini-3.7-flash');

  // 使えないものしか無い場合は選ばない
  const junkOnly = [
    'gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-3-pro-image',
    'gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-live-preview',
    'gemini-robotics-er-2-preview', 'text-embedding-004', 'imagen-4.0-generate-001',
  ];
  assert.equal(discoverGeminiModel(junkOnly), null);
});

test('Gemini: 世代が上がっても flash-lite を追従して選べる', () => {
  assert.equal(discoverGeminiModel(['gemini-4.2-flash', 'gemini-4.2-flash-lite']), 'gemini-4.2-flash-lite');
  assert.equal(discoverGeminiModel(['gemini-9-flash']), 'gemini-9-flash');
});

test('候補が全滅しても discover が拾えば OCR は止まらない', async () => {
  const resolver = new OcrModelResolver({
    provider: 'gemini',
    candidates: ['gemini-2.0-flash'],       // 廃止済みのIDしか知らない状態
    listModels: async () => GEMINI_LIVE,
    discover: discoverGeminiModel,
    logger: quiet,
  });
  assert.equal(await resolver.resolve(), 'gemini-3.5-flash-lite');
});

test('discover の選択も markDead で次へ進める', async () => {
  const resolver = new OcrModelResolver({
    provider: 'gemini',
    candidates: ['gemini-2.0-flash'],
    listModels: async () => GEMINI_LIVE,
    discover: discoverGeminiModel,
    logger: quiet,
  });
  assert.equal(await resolver.resolve(), 'gemini-3.5-flash-lite');
  resolver.markDead('gemini-3.5-flash-lite');
  assert.equal(await resolver.resolve(), 'gemini-3.1-flash-lite');
});

test('失敗が続いたら maxDead で打ち止めにする（総当たりしない）', async () => {
  const resolver = new OcrModelResolver({
    provider: 'gemini',
    candidates: ['gemini-2.0-flash'],
    listModels: async () => GEMINI_LIVE,
    discover: discoverGeminiModel,
    maxDead: 3,
    logger: quiet,
  });
  const tried = [];
  for (let i = 0; i < 10; i++) {
    const id = await resolver.resolve();
    if (!id) break;
    tried.push(id);
    resolver.markDead(id);
  }
  assert.equal(tried.length, 3);
  assert.equal(await resolver.resolve(), null);
});
