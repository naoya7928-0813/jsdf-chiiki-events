'use strict';
// 横スワイプの判定（運営画面のタブ切り替え）。画面に依存しない純粋関数だけを置く。
// 縦スクロールの途中で誤って切り替わらないよう、横の移動が十分大きく、縦より明確に大きいときだけ認める。

const SWIPE_MIN_DX = 60;      // これ未満の横移動はスワイプとみなさない（px）
const SWIPE_RATIO = 1.8;      // 横の移動が縦の何倍以上なら横スワイプとみなすか
const SWIPE_MAX_MS = 800;     // ゆっくりしたドラッグ（文字選択など）は除く

/**
 * @returns {'next'|'prev'|null} 左へ払う＝次のタブ、右へ払う＝前のタブ
 */
function swipeDirection({ dx, dy, dt }) {
  if (![dx, dy, dt].every(Number.isFinite)) return null;
  if (dt > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** 現在のタブから、方向に応じた隣のタブを返す（端では動かない）。 */
function neighborTab(tabs, current, dir) {
  const i = tabs.indexOf(current);
  if (i < 0 || !dir) return null;
  const j = dir === 'next' ? i + 1 : i - 1;
  return j >= 0 && j < tabs.length ? tabs[j] : null;
}

module.exports = { swipeDirection, neighborTab, SWIPE_MIN_DX, SWIPE_RATIO, SWIPE_MAX_MS };
