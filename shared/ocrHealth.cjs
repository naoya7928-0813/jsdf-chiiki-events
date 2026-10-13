'use strict';

/**
 * ocrHealth.cjs — OCR 層の稼働状況（scraper/ocr-stats.json）を判定する
 *
 * OCR の不調は「総イベント数」に現れない（キャッシュが穴を埋める）。実際に
 *   - Tesseract が起動チェックの不具合で一度も動いていなかった（2026-10 判明）
 *   - RapidOCR が中国語モデルで動き、かなを落としていた（同上）
 *   - Groq / Gemini のモデル廃止に1か月以上気付けなかった（2026-07・08）
 * という止まり方をしている。ここで「止まっている経路」を言葉にして実行サマリへ出す。
 *
 * 判定は警告どまり（ジョブは落とさない）。OCR はフォールバックが多段で、1経路の停止で
 * スクレイプ全体を止めるとデータが更新されない方が害が大きいため。
 */

const API_LABEL = { groq: 'Groq', gemini: 'Gemini', mistral: 'Mistral', ocrspace: 'OCR.space' };

/**
 * @param {Object|null} stats ocr-stats.json の中身
 * @returns {{ level: 'ok'|'warn', problems: string[], lines: string[] }}
 *   problems … 警告にすべき事柄（::warning:: と管理者向けサマリに出す）
 *   lines    … 実行サマリに載せる状況の一覧（経路ごと）
 */
function evaluateOcrHealth(stats) {
  const problems = [];
  const lines = [];
  if (!stats || typeof stats !== 'object') {
    return { level: 'warn', problems: ['OCR統計が出力されていません（スクレイパーが途中で止まった可能性）'], lines };
  }

  const local = stats.local || {};
  const keys = stats.keys || {};
  const engine = stats.engine || {};
  const errors = stats.errors || {};
  const parse = stats.parseFailures || {};
  const exhausted = stats.quotaExhausted || {};
  const models = stats.models || {};

  // ── ローカル（無料） ──
  if (local.rapidocr === false) problems.push('RapidOCR が使えません（python / rapidocr 未導入、またはモデル取得失敗）');
  else if (local.rapidocr && /\(ch\)/.test(String(local.rapidocrEngine || ''))) {
    problems.push('RapidOCR が中国語モデルで動いています（かなが落ち簡体字に化けます。requirements-ocr.txt の rapidocr を導入してください）');
  }
  if (local.tesseract === false) problems.push('Tesseract が使えません（tesseract-ocr / tesseract-ocr-jpn 未導入）');
  if (local.pdftoppm === false) problems.push('pdftoppm が使えません（PDF を画像にできず、PDF のローカルOCR・Groq が全滅します）');
  lines.push(`RapidOCR: ${fmtLocal(local.rapidocr)}${local.rapidocrEngine ? `（${local.rapidocrEngine}）` : ''} / 成功 ${engine.rapidocr || 0} 件`);
  lines.push(`Tesseract: ${fmtLocal(local.tesseract)} / 成功 ${engine.tesseract || 0} 件`);
  lines.push(`PDFテキスト抽出: 成功 ${engine.pdftext || 0} 件`);

  // ── API ──
  for (const k of ['groq', 'ocrspace', 'mistral', 'gemini']) {
    const name = API_LABEL[k];
    if (!keys[k]) { lines.push(`${name}: キー未設定（この段はスキップ）`); continue; }
    const parts = [`成功 ${engine[k] || 0} 件`];
    if (errors[k]) parts.push(`失敗 ${errors[k]} 件`);
    if (parse[k]) parts.push(`JSON読取失敗 ${parse[k]} 件`);
    if (exhausted[k]) parts.push('レート/クォータ上限で途中停止');
    if (models[k]) parts.push(`モデル ${models[k]}`);
    lines.push(`${name}: ${parts.join(' / ')}`);
    if (models[k] === 'none') problems.push(`${name}: 使えるモデルが見つかりません（モデル廃止の可能性）`);
  }

  // ── 全体 ──
  if ((stats.attempted || 0) > 0 && (stats.structured || 0) === 0) {
    problems.push(`OCR を ${stats.attempted} 件試行して構造化成功が 0 件です（OCR 層が機能していません）`);
  }
  const parseTotal = Object.values(parse).reduce((a, b) => a + (b || 0), 0);
  if (parseTotal > 0 && (stats.structured || 0) === 0) {
    problems.push(`API の応答を JSON として読めない失敗が ${parseTotal} 件あります`);
  }
  lines.unshift(`試行 ${stats.attempted || 0} 件 / キャッシュ再利用 ${stats.cacheHits || 0} 件`
    + ` / 構造化成功 ${stats.structured || 0} 件 / 旧OCR読み直し ${stats.refreshed || 0} 件`);

  return { level: problems.length ? 'warn' : 'ok', problems, lines };
}

function fmtLocal(v) {
  if (v === true) return '利用可';
  if (v === false) return '利用不可';
  return '未確認';
}

module.exports = { evaluateOcrHealth };
