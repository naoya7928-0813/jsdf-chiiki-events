'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EVENT_IMAGES_ENABLED, decideImageDisplay, normalizeImages, safeImageUrl, MAX_IMAGES } = require('./eventImages.cjs');

const OK_IMG = { url: 'https://www.mod.go.jp/pco/tokyo/img/a.jpg', alt: '会場の様子', credit: '自衛隊東京地方協力本部ホームページ（https://www.mod.go.jp/pco/tokyo/）', rightsConfirmed: true, public: true };

test('現在は全体スイッチが off で、どのイベントも「（現在準備中）」', () => {
  assert.equal(EVENT_IMAGES_ENABLED, false);
  assert.deepEqual(decideImageDisplay({ images: [OK_IMG] }), { state: 'preparing' });
  assert.deepEqual(decideImageDisplay({}), { state: 'preparing' });
  assert.deepEqual(decideImageDisplay(null), { state: 'preparing' });
});

test('スイッチ on: 権利確認済み・公開許可・出典ありの画像だけを出す', () => {
  const d = decideImageDisplay({ images: [OK_IMG] }, { enabled: true });
  assert.equal(d.state, 'show');
  assert.equal(d.images.length, 1);
  assert.equal(d.images[0].credit, OK_IMG.credit);
  for (const bad of [
    { ...OK_IMG, rightsConfirmed: false },
    { ...OK_IMG, public: false },
    { ...OK_IMG, rightsConfirmed: 'true' },
    { ...OK_IMG, credit: '' },
    { ...OK_IMG, url: 'http://www.mod.go.jp/a.jpg' },
    { ...OK_IMG, url: 'https://evil.example.com/a.jpg' },
    { ...OK_IMG, url: 'javascript:alert(1)' },
  ]) {
    assert.deepEqual(decideImageDisplay({ images: [bad] }, { enabled: true }), { state: 'hidden' }, JSON.stringify(bad));
  }
});

test('スイッチ on: 個別に隠す・画像なしは枠ごと出さない', () => {
  assert.deepEqual(decideImageDisplay({ images: [OK_IMG], imagesHidden: true }, { enabled: true }), { state: 'hidden' });
  assert.deepEqual(decideImageDisplay({}, { enabled: true }), { state: 'hidden' });
});

test('スクレイパーの imageUrl（権利未確認のチラシ実物）は使わない', () => {
  assert.deepEqual(decideImageDisplay({ imageUrl: 'https://www.mod.go.jp/pco/tokyo/a.jpg' }, { enabled: true }), { state: 'hidden' });
});

test('形の正規化（件数上限・文字数・許可ホスト）', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ ...OK_IMG, url: `https://www.mod.go.jp/a${i}.jpg` }));
  assert.equal(normalizeImages(many).length, MAX_IMAGES);
  assert.equal(normalizeImages([{ ...OK_IMG, alt: 'あ'.repeat(500) }])[0].alt.length, 120);
  assert.equal(normalizeImages('x').length, 0);
  assert.ok(safeImageUrl('https://jsdf-chiiki-events.jp/img/a.png'));
  assert.equal(safeImageUrl('https://mod.go.jp.evil.com/a.png'), null);
});

test('詳細画面に画像枠が組み込まれている', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'DetailScreen.jsx'), 'utf8');
  assert.match(src, /<EventImages ev=\{ev\} \/>/);
});
