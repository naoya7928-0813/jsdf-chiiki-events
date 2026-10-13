'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { swipeDirection, neighborTab } = require('./swipe.cjs');

test('横に大きく払ったときだけスワイプと判定する', () => {
  assert.equal(swipeDirection({ dx: -120, dy: 10, dt: 200 }), 'next');
  assert.equal(swipeDirection({ dx: 120, dy: -10, dt: 200 }), 'prev');
  assert.equal(swipeDirection({ dx: -40, dy: 0, dt: 100 }), null, '移動が小さい');
  assert.equal(swipeDirection({ dx: -100, dy: 80, dt: 200 }), null, '斜め（縦スクロールの途中）');
  assert.equal(swipeDirection({ dx: -200, dy: 0, dt: 1500 }), null, 'ゆっくりしたドラッグ');
  assert.equal(swipeDirection({ dx: NaN, dy: 0, dt: 100 }), null);
});

test('隣のタブ（端では動かない）', () => {
  const tabs = ['all', 'draft', 'past', 'views'];
  assert.equal(neighborTab(tabs, 'all', 'next'), 'draft');
  assert.equal(neighborTab(tabs, 'draft', 'prev'), 'all');
  assert.equal(neighborTab(tabs, 'all', 'prev'), null);
  assert.equal(neighborTab(tabs, 'views', 'next'), null);
  assert.equal(neighborTab(tabs, 'nope', 'next'), null);
  assert.equal(neighborTab(tabs, 'all', null), null);
});
