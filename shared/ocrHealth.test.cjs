'use strict';
/**
 * shared/ocrHealth.cjs のテスト。OCR の止まり方を実行サマリで言葉にできるか。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { evaluateOcrHealth } = require('./ocrHealth.cjs');

const base = () => ({
  attempted: 10, cacheHits: 400, structured: 9,
  engine: { pdftext: 2, tesseract: 0, rapidocr: 5, groq: 2, ocrspace: 0, mistral: 0, gemini: 0 },
  errors: { groq: 0, ocrspace: 0, mistral: 0, gemini: 0 },
  parseFailures: { groq: 0, gemini: 0 },
  models: { groq: 'qwen/qwen3.8-27b' },
  local: { tesseract: true, rapidocr: true, rapidocrEngine: 'rapidocr(japan PP-OCRv6 small)', pdftoppm: true },
  keys: { groq: true, gemini: true, mistral: true, ocrspace: false },
  quotaExhausted: { groq: false, gemini: false, mistral: false, ocrspace: false },
});

test('evaluateOcrHealth: 全経路が動いていれば ok', () => {
  const r = evaluateOcrHealth(base());
  assert.equal(r.level, 'ok');
  assert.deepEqual(r.problems, []);
  assert.ok(r.lines.some(l => l.startsWith('OCR.space: キー未設定')));
  assert.ok(r.lines.some(l => l.includes('qwen/qwen3.8-27b')));
});

test('evaluateOcrHealth: 2026-10 に実際にあった止まり方を警告する', () => {
  // Tesseract が起動チェックで落ちる
  let s = base(); s.local.tesseract = false;
  assert.ok(evaluateOcrHealth(s).problems.some(p => p.includes('Tesseract')));
  // RapidOCR が中国語モデル
  s = base(); s.local.rapidocrEngine = 'rapidocr_onnxruntime(ch)';
  assert.ok(evaluateOcrHealth(s).problems.some(p => p.includes('中国語モデル')));
  // モデル廃止で使えるモデルが無い
  s = base(); s.models.gemini = 'none';
  assert.ok(evaluateOcrHealth(s).problems.some(p => p.includes('Gemini')));
  // 試行したのに 1 件も構造化できない
  s = base(); s.structured = 0;
  assert.equal(evaluateOcrHealth(s).level, 'warn');
});

test('evaluateOcrHealth: レート上限・JSON読取失敗は状況として出す（単独では警告にしない）', () => {
  const s = base(); s.quotaExhausted.mistral = true; s.parseFailures.groq = 2;
  const r = evaluateOcrHealth(s);
  assert.equal(r.level, 'ok');
  assert.ok(r.lines.some(l => l.startsWith('Mistral') && l.includes('上限')));
  assert.ok(r.lines.some(l => l.startsWith('Groq') && l.includes('JSON読取失敗 2')));
});

test('evaluateOcrHealth: 統計が無ければ警告', () => {
  assert.equal(evaluateOcrHealth(null).level, 'warn');
});
