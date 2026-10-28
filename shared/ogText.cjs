'use strict';
// OGP画像（/api/og）に描く文字列の無害化（2026-10-28 導入）。
//
// /api/og は URL のクエリ（title/date/place/pref/cat）をそのまま描画するため、誰でも任意の文字列を渡せる。
// 描画に使う satori（@vercel/og 0.11.1 に同梱の 0.25.0）には、文字列を SVG に書き出すときの
// エスケープ漏れがある（GHSA-wx4j-mvgx-mqwp / CVE-2026-94545。修正は satori 0.33.5＝@vercel/og 1.0.3）。
// 1.0.3 は Edge 用ビルドが同梱されていない hb.wasm を読みに行き描画できない（2026-10-28 に検証）ため、
// 当面は「攻撃者が決められる文字列を satori に渡さない」という公式の回避策をここで行う。
//
// SVG の構造を壊せる記号（< > & " '）を同じ見た目の全角記号に置き換える。日本語の表示は変わらない。
// 制御文字・双方向制御・ゼロ幅文字も取り除く（見た目の偽装を防ぐ）。
// ⚠️ @vercel/og を satori 0.33.5 以上の版へ上げたあとも、この無害化は残してよい（害は無い）。

const REPLACE = { '<': '＜', '>': '＞', '&': '＆', '"': '＂', "'": '＇' };

function isRemovable(c) {
  if (c <= 0x1f) return true;                     // 制御文字（改行・タブ含む。画像では1行で描く）
  if (c >= 0x7f && c <= 0x9f) return true;
  if (c >= 0x200b && c <= 0x200f) return true;    // ゼロ幅・LRM/RLM
  if (c >= 0x202a && c <= 0x202e) return true;    // 双方向の埋め込み・上書き
  if (c >= 0x2066 && c <= 0x2069) return true;    // 双方向の分離
  if (c === 0xfeff) return true;
  return false;
}

/**
 * OGP画像に描く文字列を無害化し、maxLen 文字（コードポイント単位）で切る。
 * @param {unknown} input クエリの値（null/undefined は空文字）
 * @param {number} maxLen 最大文字数
 */
function ogSafeText(input, maxLen) {
  const out = [];
  for (const ch of String(input ?? '')) {
    if (out.length >= maxLen) break;
    if (isRemovable(ch.codePointAt(0))) continue;
    out.push(REPLACE[ch] || ch);
  }
  return out.join('').trim();
}

module.exports = { ogSafeText };
