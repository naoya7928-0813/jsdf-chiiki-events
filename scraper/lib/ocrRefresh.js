'use strict';

/**
 * ocrRefresh.js — 旧ローカルOCR（中国語モデル）の誤読をキャッシュから読み直す判定
 *
 * 背景（2026-10-13）:
 *   RapidOCR が既定の中国語モデルで動いており、かなを落として簡体字に化けていた
 *   （「駐屯地」→「鞋屯地」「驻車場」、「保健センター」→「保健七久一」）。
 *   OCR 結果は assetCache に 90 日残るため、モデルを直してもその間は誤読が公開され続ける。
 *
 * 方針:
 *   - 読み直すのは「旧パイプラインの結果」かつ「誤読の痕跡があるもの」だけ。
 *     痕跡＝タイトル・会場に簡体字が混じる／タイトルが不正・疑わしいと判定される。
 *     痕跡の無い結果まで読み直すと LLM 整形の呼び出しが一斉に増えるため対象にしない
 *   - 読み直しは**ローカルOCRだけ**で行う（CLAUDE.md: 取得済みアセットを API で再OCRしない）
 *   - 1アセット1回まで（refreshed_for を記録し、結果が改善しなくても繰り返さない）
 */

const { toJapaneseKanji, hasForeignChinese, cleanEventTitle, isJunkOrStubTitle, isSuspiciousTitle }
  = require('../../shared/titleQuality.cjs');

// ローカルOCRを日本語モデル（rapidocr PP-OCRv6 / japan）へ切り替えた版。
// 以後に保存した OCR 結果にはこの値を付ける。
const OCR_PIPELINE_VERSION = '2026-10-13-ja';

/** 中国語モデルの誤読の痕跡（日本語で使わない簡体字）があるか */
// 中国語モデルが日本語の字を別の（日本語にもある）字へ読み違えた典型（2026-10-14 の照合で確認した実例）。
// 簡体字ではないので toJapaneseKanji では見つからない。誤爆しないよう語の組で持つ
const MISREAD_RE = /自衛隧|自行隧|陵上自衛|陵海空|合和\s*[0-9０-９]|予偏自衛|搭秉/;

function hasChineseTrace(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return toJapaneseKanji(text) !== text || hasForeignChinese(text) || MISREAD_RE.test(text);
}

/** OCR 結果1件が誤読の疑いを持つか（タイトル欠落は対象外＝読み直しても直る見込みが薄い） */
function looksMisread(result) {
  if (!result || typeof result !== 'object') return false;
  const title = typeof result.title === 'string' ? result.title.trim() : '';
  if (hasChineseTrace(title) || hasChineseTrace(result.place)) return true;
  if (!title) return false;
  const cleaned = cleanEventTitle(title);
  return !cleaned || isJunkOrStubTitle(cleaned) || isSuspiciousTitle(cleaned);
}

/**
 * キャッシュ済みエントリをローカルOCRで読み直すべきか。
 * @param {Object|null} entry assetCache のエントリ
 * @param {string} [version]
 */
function needsLocalReocr(entry, version = OCR_PIPELINE_VERSION) {
  if (!entry || !entry.result) return false;
  // 複数イベント（配列）の結果は単発のローカルOCRで置き換えると件数が減るため対象外
  if (Array.isArray(entry.result)) return false;
  if (entry.ocr_pipeline === version) return false;   // 新パイプラインの結果
  if (entry.refreshed_for === version) return false;  // すでに1回読み直した
  return looksMisread(entry.result);
}

module.exports = { OCR_PIPELINE_VERSION, hasChineseTrace, looksMisread, needsLocalReocr };
