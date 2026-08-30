/**
 * brandColors — ブランド配色（陸・海・空）を「暗い面に置く文字色」へ変換する
 *
 * COLOR_SCHEMES の primary / accent は **白地に置く前提の濃い色**（例 陸 #3a4130）。
 * 見出しやヘッダーの背景としては正しいが、そのままダークモードの面
 * （--bg #0d1117 / --card #161b22 / --tag-bg #21262d）に文字・アイコンとして
 * 置くとコントラスト比が 1.1〜1.9 しかなく、実質読めない（WCAG AA は 4.5 必要）。
 *
 * ここでは **色相と彩度を保ったまま明度だけ上げ**、必要な比を満たす最初の色を返す。
 * 白と混ぜて明るくすると灰色に寄ってブランド色に見えなくなるため、HSL で持ち上げる。
 *
 * 使い方: App が `--brand-fg` / `--accent-fg` に流し込み、各コンポーネントは
 * 「文字・アイコンとしての配色」にこの変数を使う（背景としての濃い色は据え置き）。
 */

/** ダークモードでブランド色の文字が載りうる面（globalStyles の値と一致させること） */
const DARK_SURFACES = ['#0d1117', '#161b22', '#21262d'];

/** WCAG 2.1 AA の本文コントラスト比 */
const MIN_CONTRAST = 4.5;

/** 明度を上げても彩度が低いと灰色に見えるため、最低限の彩度を確保する */
const MIN_SATURATION = 0.35;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const to = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 相対輝度（WCAG 2.1） */
function relativeLuminance([r, g, b]) {
  const f = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** コントラスト比（1〜21）。引数は #rrggbb または [r,g,b] */
function contrastRatio(a, b) {
  const ca = Array.isArray(a) ? a : hexToRgb(a);
  const cb = Array.isArray(b) ? b : hexToRgb(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca), lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R)      h = ((G - B) / d) + (G < B ? 6 : 0);
  else if (max === G) h = ((B - R) / d) + 2;
  else                h = ((R - G) / d) + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hk = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = t => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(hk + 1 / 3), ch(hk), ch(hk - 1 / 3)].map(v => v * 255);
}

/**
 * 暗い面の上で読めるブランド色を返す。
 * 変換できない値（不正な色）はそのまま返す＝呼び出し側を壊さない。
 *
 * @param {string} hex     元のブランド色（#rrggbb）
 * @param {object} [opts]  surfaces: 対象の背景色配列 / minContrast: 必要な比
 * @returns {string} #rrggbb
 */
function foregroundOnDark(hex, opts = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const surfaces    = opts.surfaces    || DARK_SURFACES;
  const minContrast = opts.minContrast || MIN_CONTRAST;

  const [h, s0, l0] = rgbToHsl(rgb);
  const s = Math.max(s0, MIN_SATURATION);
  const worst = c => Math.min(...surfaces.map(bg => contrastRatio(c, bg)));

  // 明度を 0.5% 刻みで上げ、必要な比を満たした時点で採用する
  for (let l = l0; l <= 0.95; l += 0.005) {
    const c = hslToRgb([h, s, l]);
    if (worst(c) >= minContrast) return rgbToHex(c);
  }
  // ここまで来ることはまずないが、届かない色は最も明るい候補を返す
  return rgbToHex(hslToRgb([h, s, 0.95]));
}

module.exports = {
  DARK_SURFACES, MIN_CONTRAST, MIN_SATURATION,
  hexToRgb, rgbToHex, relativeLuminance, contrastRatio, rgbToHsl, hslToRgb,
  foregroundOnDark,
};
