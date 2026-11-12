'use strict';
/**
 * ワークフローの「準備」段階が外部障害で落ちないことの検査
 *
 * 2026-11-11 23:38 JST の定期スクレイプは、Ubuntu のパッケージミラーの名前解決が
 * 一時的にできず、`sudo apt-get install tesseract-ocr …` で11分待った末に exit 100 で落ち、
 * スクレイプ本体に一度も入らなかった（stage=unknown で通知）。
 * apt は共通アクション（.github/actions/install-ocr-packages / install-playwright-chromium）
 * だけが呼ぶようにし、裸の apt-get や `--with-deps` に戻っていないかをここで見る。
 */
const test = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ name: f, text: read(`.github/workflows/${f}`) }));

test('ワークフローで OCR 用パッケージを裸の apt-get で入れていない', () => {
  for (const { name, text } of workflows) {
    assert.ok(
      !/apt-get\s+install[^\n]*(tesseract|poppler)/.test(text),
      `${name}: OCR 用パッケージは ./.github/actions/install-ocr-packages で入れること`,
    );
  }
});

test('ワークフローで playwright の --with-deps を使っていない（毎回 apt を呼ぶため）', () => {
  for (const { name, text } of workflows) {
    assert.ok(
      !/playwright\s+install[^\n]*--with-deps/.test(text),
      `${name}: Chromium は ./.github/actions/install-playwright-chromium で入れること`,
    );
  }
});

test('scrape.yml: OCR 用パッケージの導入失敗でジョブを止めない・時間の上限がある', () => {
  const yml = read('.github/workflows/scrape.yml');
  const step = yml.match(/- name: Tesseract OCR[^\n]*\n((?:\s{8}[^\n]*\n)+)/);
  assert.ok(step, 'Tesseract の導入ステップが見つからない');
  assert.match(step[1], /uses: \.\/\.github\/actions\/install-ocr-packages/);
  assert.match(step[1], /continue-on-error: true/);
  assert.match(step[1], /timeout-minutes: \d+/);
});

test('scrape.yml: 準備段階で落ちても「不明な段階」にならない', () => {
  const yml = read('.github/workflows/scrape.yml');
  const setupAt = yml.indexOf('STAGE=setup');
  assert.ok(setupAt > 0, 'STAGE=setup が無い');
  assert.ok(setupAt < yml.indexOf('install-ocr-packages'), 'STAGE=setup は apt の導入より前に置くこと');
  assert.match(yml, /setup\)\s+LABEL=/, '失敗通知の case に setup の表示名が無い');
});

test('OCR 用パッケージのスクリプトは導入できなくても成功で終わる（警告のみ）', () => {
  const sh = read('.github/actions/install-ocr-packages/install.sh');
  assert.match(sh, /--no-download/, 'キャッシュ済み .deb から入れる経路が無い');
  assert.match(sh, /::warning::/);
  assert.match(sh, /\nexit 0\s*$/, '最後は exit 0 で終えること');
  // timeout 0 は「上限なし」になる
  assert.match(sh, /\[ "\$r" -lt 1 \] && r=1/);
});
