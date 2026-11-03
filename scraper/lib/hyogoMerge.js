'use strict';

/**
 * 兵庫: HTML から取ったイベントに、各イベント枠のチラシ（画像/PDF）の OCR 結果を補う。
 *
 * OCR は HTML の代替ではなく補完。同じイベントなら HTML の空欄だけを埋め、HTML に無いイベントだけ追加する。
 * 同じイベントかどうかは次のどちらかで決める:
 *   1. 名前・会場が似ている（isLikelySameEvent）
 *   2. 同じ開催日で、そのチラシがその HTML イベントの枠に貼られていた（_assetUrl）
 * 2 が無いと、OCR の読み違い（「神戸北」→「鐘戸北」）や会場の読み違い（「1階屋外E駐車場」）で
 * 同じイベントが二重に掲載される（2026-11-03 に 4 件発生）。
 *
 * @param {Array<Object>} htmlEvents  _hyogoAssets（枠内のチラシの完全な URL）付き
 * @param {Array<Object>} ocrEvents   _assetUrl（読んだチラシの URL）付き
 * @param {(a:Object, b:Object) => boolean} isLikelySameEvent
 * @returns {Array<Object>} 内部用の _hyogoAssets / _assetUrl は外した配列
 */
function mergeHyogoOcr(htmlEvents, ocrEvents, isLikelySameEvent) {
  const merged = [];
  const assetsOf = new Map();
  for (const ev of htmlEvents) {
    const { _hyogoAssets, ...clean } = ev;
    clean.source_type = clean.source_type || 'hyogo_html';
    merged.push(clean);
    assetsOf.set(clean, new Set(_hyogoAssets || []));
  }

  for (const ocrEv of ocrEvents) {
    const { _assetUrl, ...ocr } = ocrEv;
    const twin = merged.find(ev => ev.date === ocr.date && (
      isLikelySameEvent(ev, ocr) || (_assetUrl && assetsOf.get(ev)?.has(_assetUrl))
    ));
    if (twin) {
      for (const key of ['place', 'time', 'ageRequirement', 'deadline', 'notes']) {
        if (!twin[key] && ocr[key]) twin[key] = ocr[key];
      }
      continue;
    }
    merged.push(ocr);
  }
  return merged;
}

module.exports = { mergeHyogoOcr };
