'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isExamResultSource, isExamResultEvent } = require('./examResult.cjs');
const { isNonEventDocument, isArchivableEvent } = require('./titleQuality.cjs');

// 2026-10 に実際に公開・アーカイブされていたもの（OCR の読み違いを含む）
const REAL = [
  { title: '一般 ・技能 第2回採用候補者名簿記載通知者発表', url: 'https://www.mod.go.jp/pco/kanagawa/bosyu/goukaku/goukaku.html' },
  { title: '今和8年度航空学生探用第1次試合格者', url: 'https://www.mod.go.jp/pco/sizuoka/bosyu/pdf/57.pdf' },
  { title: '総合選抜採用試験 第1次試験合格者', url: 'https://www.mod.go.jp/pco/kanagawa/bosyu/goukaku/8.10.8boudai.pdf' },
  { title: '第75期防衛大学校学生合拔探用試1次合格者', url: 'https://www.mod.go.jp/pco/tokyo/saiyou/goukaku_pdf/1008_boudai.pdf' },
  { title: '連番 受験番号 連番 受験番号', url: 'https://www.mod.go.jp/pco/tokyo/saiyou/goukaku_pdf/0917_kankousou.pdf' },
  { title: '航空要員）採用試験合格者', url: 'https://www.mod.go.jp/pco/sizuoka/bosyu/pdf/51.pdf' },
  { title: '令和８年度第２回一般幹部候補生及び幹部候補曹採用第１次試験合格者', url: 'https://www.mod.go.jp/pco/sizuoka/bosyu/pdf/42.pdf' },
  { title: '合格発表 令和８年度 航空学生採用第１次試験合格者発表', url: 'https://www.mod.go.jp/pco/tochigi/' },
];

test('合格者発表・試験結果はイベントとして扱わない（実例）', () => {
  for (const ev of REAL) {
    assert.equal(isExamResultEvent(ev), true, ev.title);
    assert.equal(isNonEventDocument(ev), true, ev.title);
    assert.equal(isArchivableEvent({ ...ev, id: 'x', pref: 'tokyo', date: '2026-10-01' }), false, ev.title);
  }
});

test('リンク探索の段階で合格者PDF・ページを除外する（OCR を使わない）', () => {
  assert.equal(isExamResultSource({ url: 'https://www.mod.go.jp/pco/tokyo/saiyou/goukaku_pdf/1008_boudai.pdf' }), true);
  assert.equal(isExamResultSource({ url: 'https://www.mod.go.jp/pco/kanagawa/bosyu/goukaku/goukaku.html' }), true);
  assert.equal(isExamResultSource({ url: 'https://www.mod.go.jp/pco/x/pdf/57.pdf', text: '第1次試験合格者' }), true);
  assert.equal(isExamResultSource({ url: 'https://www.mod.go.jp/pco/x/pdf/57.pdf', text: '試験結果について' }), true);
  assert.equal(isExamResultSource({ url: 'https://www.mod.go.jp/pco/x/event/flyer.pdf', text: '駐屯地見学ツアー' }), false);
});

test('合格者向けの説明会・激励会などの参加イベントは残す', () => {
  for (const title of ['合格者説明会', '自衛官候補生 合格者向け入隊説明会', '入隊予定者激励会', '合格者の皆さまへ 駐屯地見学会']) {
    assert.equal(isExamResultEvent({ title, url: 'https://www.mod.go.jp/pco/tokyo/event/a.html' }), false, title);
  }
  // 合格者ディレクトリにあっても、明確なイベントは残す
  assert.equal(isExamResultEvent({ title: '合格者説明会', url: 'https://www.mod.go.jp/pco/kanagawa/bosyu/goukaku/setsumei.pdf' }), false);
});

test('一般のイベントを巻き込まない（「格」「結果」を含む別の語）', () => {
  for (const title of ['自衛隊説明会', '資格取得説明会', '格闘技体験', '防災フェア（結果発表は後日）', '合同企業説明会', '駐屯地創立記念行事', '合唱コンクール']) {
    assert.equal(isExamResultEvent({ title, url: 'https://www.mod.go.jp/pco/tokyo/event/a.html' }), false, title);
  }
});
