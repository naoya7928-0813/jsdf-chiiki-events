'use strict';
// 山梨地本パーサーの回帰テスト（実ページ fixture: shared/fixtures/yamanashi-event-2026-09.html）。
// 2026-09-23 事故: ページ構造の変更（.event_block → .uketsuke の表）でパーサーが毎回 0 件を返し、
// 公式に掲載のある3件（ふじざくらＦＣ 等）が公開データから消えた。
//
// cheerio はスクレイパー側（scraper/node_modules）にだけ入っているため、未インストールの環境
// （ルートの npm ci のみの PR チェック等）ではスキップする。scrape.yml のスモークテストでは実行される。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let cheerio = null;
try { cheerio = require(require.resolve('cheerio', { paths: [path.join(__dirname, '../scraper')] })); } catch { /* 未インストール */ }
const skip = cheerio ? false : 'cheerio 未インストール（scraper の依存が必要）';

const html = fs.readFileSync(path.join(__dirname, 'fixtures/yamanashi-event-2026-09.html'), 'utf8');
const parserHealth = require('./parserHealth.cjs');

// isPast は実時刻を見るため、fixture 取得日（2026-09-17 JST）に固定する
function parseAt(isoNow) {
  const RealDate = Date;
  const fixed = new RealDate(isoNow).getTime();
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
  try {
    delete require.cache[require.resolve('../scraper/parsers/yamanashi')];
    delete require.cache[require.resolve('../scraper/parsers/utils')];
    const { parseYamanashi } = require('../scraper/parsers/yamanashi');
    return parseYamanashi(cheerio.load(html, { decodeEntities: false }));
  } finally { global.Date = RealDate; }
}

test('山梨: .uketsuke の表から説明会・イベント予定を全件取得する', { skip }, () => {
  const evs = parseAt('2026-09-17T09:00:00+09:00');
  const titles = evs.map(e => e.title);
  assert.deepEqual(titles, [
    '防衛大学校説明会', '海上自衛隊東京音楽隊演奏会', '交通安全フェスティバル',
    'ふじざくらＦＣ', '上野原防災フェスタ', '富士急ハイランド防災フェス',
  ]);
  // コメントアウトされた過去ブロック・「準備中」は拾わない
  assert.ok(!titles.some(t => /チヌーク|北富士|準備中/.test(t)));
});

test('山梨: 日付・会場・時刻・対象・締切・曜日を正しく取る（会場を案内所名で埋めない）', { skip }, () => {
  const evs = parseAt('2026-09-17T09:00:00+09:00');
  const by = Object.fromEntries(evs.map(e => [e.title, e]));
  assert.equal(by['ふじざくらＦＣ'].date, '2026-09-26');
  assert.equal(by['ふじざくらＦＣ'].weekday, '土');
  assert.equal(by['ふじざくらＦＣ'].place, '小瀬スポーツ公園');
  assert.equal(by['上野原防災フェスタ'].place, '上野原市役所');
  assert.equal(by['交通安全フェスティバル'].weekday, '月'); // 「（祝月）」
  const bd = by['防衛大学校説明会'];
  assert.equal(bd.date, '2026-09-18');
  assert.match(bd.time, /^16時～18時/);
  assert.match(bd.deadline, /^9月17日[（(]木[）)]$/);
  assert.match(bd.ageRequirement, /保護者/);
  assert.match(bd.notes, /概要説明/);
  assert.match(by['海上自衛隊東京音楽隊演奏会'].notes, /音楽演奏/);
  for (const e of evs) {
    assert.equal(e.pref, 'yamanashi');
    assert.match(e.id, /^ya-\d{8}-/);
    assert.equal(e.url, 'https://www.mod.go.jp/pco/yamanashi/event.html');
  }
});

test('山梨: 開催日を過ぎたイベントは返さない', { skip }, () => {
  const evs = parseAt('2026-09-22T09:00:00+09:00');
  assert.deepEqual(evs.map(e => e.date), ['2026-09-26', '2026-09-26', '2026-09-26']);
});

test('パーサー健全性: 実ページの本文に今日以降の日付があるのに 0 件なら失敗扱い（旧パーサーの状態）', { skip }, () => {
  const $ = cheerio.load(html, { decodeEntities: false });
  const text = $('body').text();
  const bad = parserHealth.assessParseResult({ text, eventCount: 0, today: '2026-09-17' });
  assert.equal(bad.ok, false);
  assert.ok(bad.futureDateMarkers >= 4);
  const good = parserHealth.assessParseResult({ text, eventCount: 6, today: '2026-09-17' });
  assert.equal(good.ok, true);
});
