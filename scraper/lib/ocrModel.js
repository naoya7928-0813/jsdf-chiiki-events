'use strict';

/**
 * ocrModel.js — OCR に使うモデルIDを実行時に解決する
 *
 * 背景:
 *   モデルIDを1つ固定で持つ設計は、プロバイダが廃止した瞬間に 404 を吐き続けて
 *   OCR 段が丸ごと死ぬ。実際に 2 度起きた。
 *     - 2026-07-17 Groq   meta-llama/llama-4-scout-17b-16e-instruct 廃止
 *     - 2026-08-11 Gemini gemini-2.0-flash 廃止
 *   どちらも「総イベント数」には現れず（キャッシュが穴を埋める）1か月以上
 *   気付けなかった。
 *
 * 方針:
 *   候補リストを持ち、プロバイダの models API に実在するものを選ぶ。
 *     - 候補が実在 → それを使う
 *     - models API が引けない → 先頭候補で試す（従来どおりの挙動に劣化）
 *     - API は引けたが候補がどれも無い → discover() で一覧から自力で選ぶ
 *     - discover() でも決まらない → この段は諦める（404 を量産しない）
 *   実行中に 404 を受けたら markDead() で候補から外し、次の候補へ切り替える。
 *
 *   discover() を置いているのは、候補リストの正しさに依存させないため。
 *   ハードコードした候補が全部廃止された時点で OCR が死ぬなら、モデルIDを
 *   1つ固定していた元の設計と本質的に変わらない。
 */

class OcrModelResolver {
  /**
   * @param {Object} opts
   * @param {string} opts.provider            ログ用の名前（'groq' / 'gemini'）
   * @param {Array<string|undefined>} opts.candidates  優先順の候補ID（falsy は無視）
   * @param {() => Promise<string[]|null>} opts.listModels  実在モデルID一覧。失敗時 null
   * @param {(available: string[]) => string|null} [opts.discover]
   *        候補が全滅したときに一覧から選び直す関数（省略時は諦める）
   * @param {number} [opts.maxDead] 見切りをつけるまでに許す失敗モデル数（暴走防止）
   * @param {Console} [opts.logger]
   */
  constructor({ provider, candidates, listModels, discover = null, maxDead = 4, logger = console }) {
    this.provider   = provider;
    this.candidates = (candidates || []).filter(Boolean);
    this.listModels = listModels;
    this.discover   = discover;
    this.maxDead    = maxDead;
    this.logger     = logger;
    this.dead       = new Set();
    this.chosen     = null;
    this.resolved   = false;
    this.available  = null;   // 直近に取得したモデル一覧
  }

  /** @returns {Promise<string|null>} 使用するモデルID。使えるものが無ければ null */
  async resolve() {
    if (this.resolved && this.chosen && !this.dead.has(this.chosen)) return this.chosen;

    // 失敗が続くようなら、モデル名を総当たりせずに見切る
    if (this.dead.size >= this.maxDead) {
      this.resolved = true;
      this.chosen   = null;
      this.logger.warn(`[OCRモデル] ${this.provider}: ${this.dead.size} 個のモデルが続けて失敗 → この段を停止します`);
      return null;
    }

    const alive = this.candidates.filter(id => !this.dead.has(id));
    const available = (alive.length > 0 || this.discover) ? await this.listModels() : null;
    this.available = available;

    if (available && available.length > 0) {
      const hit = alive.find(id => available.includes(id));
      if (hit) {
        this.chosen = hit;
      } else if (this.discover) {
        // 候補が全滅（＝候補リストが古い）。一覧から自力で選ぶ。
        // ここが無いと「候補リストの寿命 = OCR の寿命」になってしまう。
        const found = this.discover(available.filter(id => !this.dead.has(id)));
        if (!found) {
          this.resolved = true;
          this.chosen   = null;
          this.logger.warn(`[OCRモデル] ${this.provider}: 候補 ${alive.join(', ') || '(なし)'} が実在せず、`
            + `一覧からも選べませんでした（利用可能: ${available.slice(0, 10).join(', ')}）。この段をスキップします`);
          return null;
        }
        this.chosen = found;
        this.logger.warn(`[OCRモデル] ${this.provider}: 候補が全滅したため一覧から ${found} を自動選択しました。`
          + '候補リストの更新を検討してください');
      } else {
        // 実在しないと分かっているIDを投げるのは 404 を量産するだけ。
        this.resolved = true;
        this.chosen   = null;
        this.logger.warn(`[OCRモデル] ${this.provider}: 候補 ${alive.join(', ')} がいずれも実在しません`
          + `（利用可能: ${available.slice(0, 10).join(', ')}）。この段をスキップします`);
        return null;
      }
    } else if (alive.length > 0) {
      // models API を引けなかった → 従来どおり先頭候補で試す
      this.chosen = alive[0];
    } else {
      this.resolved = true;
      this.chosen   = null;
      return null;
    }

    this.resolved = true;
    this.logger.log(`[OCRモデル] ${this.provider} = ${this.chosen}`);
    return this.chosen;
  }

  /** 404（モデル廃止）を受けたIDを候補から外し、次回の resolve() で選び直させる */
  markDead(modelId) {
    if (!modelId) return;
    this.dead.add(modelId);
    this.resolved = false;
    this.chosen   = null;
    this.logger.warn(`[OCRモデル] ${this.provider}: ${modelId} は利用不可 → 次の候補へ切り替えます`);
  }
}

/** レスポンス本文からモデル廃止（＝別モデルへ切り替えるべき）と判断できるか */
function isModelGoneError(status, bodyText = '') {
  if (status === 404) return true;
  return /no longer available|does not exist|decommissioned|is not supported|model_not_found/i.test(bodyText);
}

/**
 * 一覧から最初に prefer にマッチしたものを返す（deny に当たるものは除外）。
 * @param {string[]} available
 * @param {{deny: RegExp, prefer: RegExp[]}} rules
 */
function pickByPattern(available, { deny, prefer }) {
  const usable = available.filter(id => !deny.test(id));
  for (const re of prefer) {
    const hit = usable.find(id => re.test(id));
    if (hit) return hit;
  }
  return null;
}

// ── Gemini: generateContent 対応かつ画像/PDF入力できるモデルを選ぶ ──────
// 除外するもの（2026-08 時点の一覧で実在を確認済み）:
//   *-image        … 画像"生成"モデル（gemini-3.1-flash-image など）
//   *-tts / *-live / *-audio … 音声系
//   *-robotics / embedding   … 用途違い
const GEMINI_DENY = /(-image$|-image-|tts|live|audio|robotics|embedding|aqa|imagen|veo)/i;
const GEMINI_PREFER = [
  /^gemini-\d+(\.\d+)?-flash-lite$/,   // 最安・最速の安定版
  /^gemini-\d+(\.\d+)?-flash$/,        // 標準 flash 安定版
  /flash-lite/,
  /flash/,
  /^gemini-/,
];

/** Gemini のモデル一覧から OCR に使えそうなものを選ぶ */
function discoverGeminiModel(available) {
  return pickByPattern(available, { deny: GEMINI_DENY, prefer: GEMINI_PREFER });
}

// ── Groq: 画像入力できるモデルを選ぶ ──────────────────────────────
// Groq の models API はモダリティを返さないため名前で推測するしかない。
// 外れても markDead で次へ進み、maxDead で打ち止めになる。
// 除外は「画像を入れられないと分かっているもの」だけに絞る。
const GROQ_DENY = /(whisper|tts|orpheus|guard|safeguard|embedding|compound|moderation)/i;
const GROQ_PREFER = [
  /qwen.*\d/,           // 2026-08 時点の Groq 唯一の画像入力モデルは qwen 系
  /(vision|-vl-|vl$)/,
  /(scout|maverick)/,   // Llama-4 系のマルチモーダル命名
  /llama-?[4-9]/,
];

/** Groq のモデル一覧から画像入力できそうなものを選ぶ */
function discoverGroqModel(available) {
  return pickByPattern(available, { deny: GROQ_DENY, prefer: GROQ_PREFER });
}

module.exports = {
  OcrModelResolver,
  isModelGoneError,
  pickByPattern,
  discoverGeminiModel,
  discoverGroqModel,
};
