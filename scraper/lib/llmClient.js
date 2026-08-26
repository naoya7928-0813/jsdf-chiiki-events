'use strict';

/**
 * llmClient.js — スクレイピング/OCR の途中に挟む LLM 呼び出し
 *
 * 役割は2つだけ。どちらも「資料に書かれていることだけを、決まった JSON で返す」。
 *   extractEventFromText(text)         … 段1: ローカルOCRの生テキスト・ページ本文から構造化
 *   extractEventFromImage(base64,mime) … 段3: 一次ソース（チラシ画像/PDF）を直接見て再抽出
 *
 * 方針:
 *   - 出力は JSON に固定し（Groq: json_object / Gemini: application/json）、
 *     受け取った側で shared/llmExtract.cjs の normalizeLlmEvent が規定外の値を捨てる。
 *     「モデルが規定を守る」ことに依存せず、コード側で必ず絞る。
 *   - 資料に無い情報は null。プロンプトで繰り返し指示し、正規化でも空文字等を null に潰す。
 *   - Groq 優先 → Gemini フォールバック（無料枠の大きい方を先に使う）。
 *   - モデル廃止（404）には OcrModelResolver が候補の切り替えで追従する。
 *   - 429（クォータ枯渇）を受けたプロバイダはその実行中スキップする。
 *   - LLM が全滅しても null を返すだけ。呼び出し側は従来の正規表現経路で動き続ける。
 */

const { OcrModelResolver, isModelGoneError, pickByPattern, discoverGeminiModel } = require('./ocrModel');
const llmCache = require('./llmCache');
const {
  EVENT_JSON_SCHEMA,
  normalizeLlmEvent,
  buildTextExtractPrompt,
  buildRecheckPrompt,
} = require('../../shared/llmExtract.cjs');

// プロンプトを変えたら上げる。キャッシュキーに含めるので、古い結果を引きずらない。
const PROMPT_VERSION = 'v1';

const TIMEOUT_MS      = 45000;
const MAX_TEXT_CHARS  = 6000;   // OCR 生テキストが長すぎるときの上限（先頭を優先）

let groqExhausted   = false;
let geminiExhausted = false;

const stats = {
  textCalls:   0,
  visionCalls: 0,
  cacheHits:   0,
  structured:  0,
  provider:    { groq: 0, gemini: 0 },
  errors:      { groq: 0, gemini: 0 },
};

function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── モデル解決 ─────────────────────────────────────────────────
// テキスト用と画像用でモデルが違う（画像入力に対応したモデルは限られる）。

async function listGroqModels() {
  try {
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    }, 15000);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data || []).filter(m => m.active !== false).map(m => m.id);
  } catch { return null; }
}

async function listGeminiModels() {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      {}, 15000
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''));
  } catch { return null; }
}

// Groq のテキストモデル（画像は不要なので候補が広い）
const GROQ_TEXT_DENY = /(whisper|tts|orpheus|guard|safeguard|embedding|moderation)/i;
const GROQ_TEXT_PREFER = [/llama-?3\.[3-9]/, /llama-?[4-9]/, /qwen/, /gemma/, /^llama/];

const groqTextResolver = new OcrModelResolver({
  provider:   'groq(text)',
  candidates: [process.env.GROQ_LLM_MODEL, 'llama-3.3-70b-versatile'],
  listModels: listGroqModels,
  discover:   available => pickByPattern(available, { deny: GROQ_TEXT_DENY, prefer: GROQ_TEXT_PREFER }),
});

// Groq の画像入力モデル（既存 OCR と同じ考え方）
const GROQ_VISION_DENY = /(whisper|tts|orpheus|guard|safeguard|embedding|compound|moderation)/i;
const GROQ_VISION_PREFER = [/qwen.*\d/, /(vision|-vl-|vl$)/, /(scout|maverick)/, /llama-?[4-9]/];

const groqVisionResolver = new OcrModelResolver({
  provider:   'groq(vision)',
  candidates: [process.env.GROQ_OCR_MODEL, 'qwen/qwen3.6-27b'],
  listModels: listGroqModels,
  discover:   available => pickByPattern(available, { deny: GROQ_VISION_DENY, prefer: GROQ_VISION_PREFER }),
});

// Gemini はテキストも画像も同じモデルで扱える
const geminiResolver = new OcrModelResolver({
  provider:   'gemini(llm)',
  candidates: [
    process.env.GEMINI_LLM_MODEL,
    process.env.GEMINI_OCR_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash',
  ],
  listModels: listGeminiModels,
  discover:   discoverGeminiModel,
});

/** 使える LLM プロバイダがあるか（キー未設定なら段1〜3はまるごとスキップ） */
function hasLlm() {
  return Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
}

// ── 応答からの JSON 取り出し ───────────────────────────────────
function parseJsonLoose(text) {
  if (!text) return null;
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// スキーマをプロンプトに埋め込んで、返す形をモデル側にも明示する
const SCHEMA_BLOCK = [
  '次の JSON オブジェクトだけを返してください（前置き・説明・コードブロック不要）。',
  'すべてのキーを必ず含め、該当する情報が資料に無いキーの値は null にしてください。',
  JSON.stringify(
    Object.fromEntries(Object.keys(EVENT_JSON_SCHEMA.properties).map(k => [k, null])),
    null, 2
  ),
].join('\n');

// ── Groq ───────────────────────────────────────────────────────
async function callGroq({ model, messages, label }) {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:      800,
      temperature:     0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  const json = await res.json();
  return { ok: true, text: json.choices?.[0]?.message?.content ?? '' };
}

async function groqStructured({ resolver, messages, label }) {
  if (!process.env.GROQ_API_KEY || groqExhausted) return null;
  let model = await resolver.resolve();
  if (!model) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await callGroq({ model, messages, label });
    } catch (err) {
      stats.errors.groq++;
      console.warn(`[${label}] Groq 通信エラー: ${err.message}`);
      return null;
    }
    if (out.ok) {
      const parsed = parseJsonLoose(out.text);
      if (parsed) stats.provider.groq++;
      return parsed;
    }
    if (out.status === 429) {
      // 1回だけ待って再試行し、それでも駄目ならこの実行では Groq を使わない
      if (attempt === 0) { console.warn(`[${label}] Groq 429 → 20秒待機`); await sleep(20000); continue; }
      console.warn(`[${label}] Groq 429 継続 → この実行では Groq をスキップ`);
      groqExhausted = true;
      return null;
    }
    stats.errors.groq++;
    console.warn(`[${label}] Groq エラー (${out.status}): ${String(out.body).slice(0, 120)}`);
    if (isModelGoneError(out.status, out.body)) {
      resolver.markDead(model);
      const next = await resolver.resolve();
      if (next && next !== model) { model = next; continue; }
    }
    return null;
  }
  return null;
}

// ── Gemini ─────────────────────────────────────────────────────
async function geminiStructured({ parts, label }) {
  if (!process.env.GEMINI_API_KEY || geminiExhausted) return null;
  let model = await geminiResolver.resolve();
  if (!model) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              maxOutputTokens:  800,
              temperature:      0,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
    } catch (err) {
      stats.errors.gemini++;
      console.warn(`[${label}] Gemini 通信エラー: ${err.message}`);
      return null;
    }
    if (res.ok) {
      const json   = await res.json();
      const text   = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = parseJsonLoose(text);
      if (parsed) stats.provider.gemini++;
      return parsed;
    }
    if (res.status === 429) {
      if (attempt === 0) { console.warn(`[${label}] Gemini 429 → 30秒待機`); await sleep(30000); continue; }
      console.warn(`[${label}] Gemini 429 継続 → この実行では Gemini をスキップ`);
      geminiExhausted = true;
      return null;
    }
    const body = await res.text();
    stats.errors.gemini++;
    console.warn(`[${label}] Gemini エラー (${res.status}): ${body.slice(0, 120)}`);
    if (isModelGoneError(res.status, body)) {
      geminiResolver.markDead(model);
      const next = await geminiResolver.resolve();
      if (next && next !== model) { model = next; continue; }
    }
    return null;
  }
  return null;
}

// ── 段1: テキストから構造化 ────────────────────────────────────
/**
 * OCR の生テキストやページ本文から、規定スキーマのイベント情報を取り出す。
 * @param {string} text
 * @param {{prefLabel?:string, today?:string, label?:string}} [opts]
 * @returns {Promise<Object|null>} normalizeLlmEvent 済み。抽出できなければ null
 */
async function extractEventFromText(text, opts = {}) {
  const { prefLabel = '', today = '', label = 'LLM整形' } = opts;
  const src = String(text || '').trim();
  if (!src || !hasLlm()) return null;

  const body = src.length > MAX_TEXT_CHARS ? src.slice(0, MAX_TEXT_CHARS) : src;
  const key  = llmCache.keyFor('text', `${PROMPT_VERSION}|${prefLabel}`, body);
  const hit  = llmCache.get(key);
  if (hit.hit) { stats.cacheHits++; return hit.result; }

  const prompt = [
    buildTextExtractPrompt({ prefLabel, today }),
    '',
    SCHEMA_BLOCK,
    '',
    '--- 資料ここから ---',
    body,
    '--- 資料ここまで ---',
  ].join('\n');

  stats.textCalls++;
  let raw = await groqStructured({
    resolver: groqTextResolver,
    messages: [{ role: 'user', content: prompt }],
    label,
  });
  if (!raw) raw = await geminiStructured({ parts: [{ text: prompt }], label });

  const result = raw ? normalizeLlmEvent(raw) : null;
  if (result) stats.structured++;
  llmCache.set(key, result, { task: 'text', pref: prefLabel });
  return result;
}

// ── 段3: 一次ソース（画像/PDF）から再抽出 ──────────────────────
/**
 * チラシ画像・PDF を直接見て、規定スキーマのイベント情報を取り出す。
 * 既存データは渡さない（提示された値に引きずられた「確認」ではなく、独立した読み取りにする）。
 *
 * @param {string} base64   画像/PDF の base64
 * @param {string} mimeType
 * @param {{cacheKey?:string, prefLabel?:string, today?:string, label?:string}} [opts]
 *        cacheKey にはアセットの SHA-256 を渡す（base64 をキーにすると巨大になる）
 * @returns {Promise<Object|null>} normalizeLlmEvent 済み。抽出できなければ null
 */
async function extractEventFromImage(base64, mimeType, opts = {}) {
  const { cacheKey = '', prefLabel = '', today = '', label = 'LLM再検査' } = opts;
  if (!hasLlm()) return null;

  // キャッシュ判定を先に行う。条件付きGETで 304（中身が変わっていない）だった
  // アセットは本体をダウンロードしないため base64 が無い。その場合でも
  // ハッシュ（cacheKey）だけで前回の結果を返せるようにしておく。
  const keySrc = cacheKey || (base64 ? base64.slice(0, 4096) : '');
  if (!keySrc) return null;
  const key = llmCache.keyFor('vision', `${PROMPT_VERSION}|${prefLabel}`, keySrc);
  const hit = llmCache.get(key);
  if (hit.hit) { stats.cacheHits++; return hit.result; }
  if (!base64) return null;   // キャッシュに無く、実体も無い → 判断材料が無い

  const prompt = [buildRecheckPrompt({ prefLabel, today }), '', SCHEMA_BLOCK].join('\n');

  stats.visionCalls++;
  let raw = await groqStructured({
    resolver: groqVisionResolver,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: 'text',      text: prompt },
      ],
    }],
    label,
  });
  if (!raw) {
    raw = await geminiStructured({
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ],
      label,
    });
  }

  const result = raw ? normalizeLlmEvent(raw) : null;
  if (result) stats.structured++;
  llmCache.set(key, result, { task: 'vision', pref: prefLabel });
  return result;
}

function getStats() { return { ...stats, cacheSize: llmCache.size() }; }

function logStats() {
  console.log('[LLM統計]'
    + ` テキスト ${stats.textCalls} 件 / 画像 ${stats.visionCalls} 件`
    + ` / キャッシュ再利用 ${stats.cacheHits} 件 / 構造化成功 ${stats.structured} 件`);
  console.log(`  プロバイダ別: ${Object.entries(stats.provider).map(([k, v]) => `${k}=${v}`).join(' ')}`
    + ` / エラー: ${Object.entries(stats.errors).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

module.exports = {
  hasLlm,
  extractEventFromText,
  extractEventFromImage,
  getStats,
  logStats,
  PROMPT_VERSION,
};
