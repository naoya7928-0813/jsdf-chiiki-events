const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./brandColors.cjs');

const SCHEME_COLORS = {
  'jgsdf.primary': '#3a4130', 'jmsdf.primary': '#0b2545', 'jasdf.primary': '#2a4a6b',
  'jgsdf.accent':  '#8b5a2e', 'jmsdf.accent':  '#8b2e2e', 'jasdf.accent':  '#b07a1f',
};

test('contrastRatio: 既知の値', () => {
  assert.ok(Math.abs(B.contrastRatio('#ffffff', '#000000') - 21) < 0.01);
  assert.ok(Math.abs(B.contrastRatio('#ffffff', '#ffffff') - 1) < 0.01);
});

test('元のブランド色はダーク面で読めない（この修正の前提）', () => {
  for (const hex of Object.values(SCHEME_COLORS)) {
    const worst = Math.min(...B.DARK_SURFACES.map(s => B.contrastRatio(hex, s)));
    assert.ok(worst < 4.5, `${hex} は元から十分なコントラスト(${worst.toFixed(2)})`);
  }
});

test('foregroundOnDark: 全配色がダークの全面で AA(4.5) を満たす', () => {
  for (const [name, hex] of Object.entries(SCHEME_COLORS)) {
    const fg = B.foregroundOnDark(hex);
    for (const bg of B.DARK_SURFACES) {
      const r = B.contrastRatio(fg, bg);
      assert.ok(r >= 4.5, `${name} ${hex}→${fg} が ${bg} 上で ${r.toFixed(2)}`);
    }
  }
});

test('foregroundOnDark: 色相を保つ（別の色に化けない）', () => {
  for (const hex of Object.values(SCHEME_COLORS)) {
    const [h0] = B.rgbToHsl(B.hexToRgb(hex));
    const [h1] = B.rgbToHsl(B.hexToRgb(B.foregroundOnDark(hex)));
    const diff = Math.min(Math.abs(h0 - h1), 360 - Math.abs(h0 - h1));
    assert.ok(diff <= 2, `色相がずれた ${hex}: ${h0.toFixed(1)} → ${h1.toFixed(1)}`);
  }
});

test('foregroundOnDark: 灰色に寄せない（彩度を保つ）', () => {
  for (const hex of Object.values(SCHEME_COLORS)) {
    const [, s] = B.rgbToHsl(B.hexToRgb(B.foregroundOnDark(hex)));
    assert.ok(s >= B.MIN_SATURATION - 0.01, `彩度が落ちた ${hex}: ${s.toFixed(2)}`);
  }
});

test('foregroundOnDark: 元より暗くはしない', () => {
  for (const hex of Object.values(SCHEME_COLORS)) {
    const l0 = B.relativeLuminance(B.hexToRgb(hex));
    const l1 = B.relativeLuminance(B.hexToRgb(B.foregroundOnDark(hex)));
    assert.ok(l1 > l0, `明るくなっていない ${hex}`);
  }
});

test('foregroundOnDark: 不正な入力はそのまま返す（画面を壊さない）', () => {
  for (const bad of [null, undefined, '', 'red', 'var(--x)', '#12']) {
    assert.strictEqual(B.foregroundOnDark(bad), bad);
  }
});

test('DARK_SURFACES は globalStyles のダーク値と一致している', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'globalStyles.js'), 'utf8');
  const dark = css.slice(css.indexOf('[data-theme="dark"]'));
  for (const surface of B.DARK_SURFACES) {
    assert.ok(dark.includes(surface), `globalStyles のダーク配色に ${surface} が無い（値がずれると判定が狂う）`);
  }
});

test('globalStyles の --brand-fg 既定値が既定配色（陸）の計算結果と一致する', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'globalStyles.js'), 'utf8');
  const light = css.slice(0, css.indexOf('[data-theme="dark"]'));
  assert.ok(light.includes('--brand-fg:      #3a4130'), 'ライトの既定値が配色の primary と違う');
  const expected = B.foregroundOnDark('#3a4130');
  assert.ok(css.includes(`--brand-fg:      ${expected}`), `ダークの既定値が計算結果(${expected})と違う`);
});
