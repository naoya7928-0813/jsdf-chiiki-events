'use strict';
/**
 * 実在ページの文言に対する日付抽出の回帰テスト。
 *
 * 抜粋元は 2026-08-18 に実際に取得した地本サイト:
 *   https://www.mod.go.jp/pco/aichi/      （静的HTML・カレンダー型）
 *   https://www.mod.go.jp/pco/hiroshima/  （WordPress型）
 *
 * 合成した文字列ではなく実物を固定することで、
 * 「緩めすぎて誤検出する」「厳しすぎて取りこぼす」の両方を押さえる。
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const { parseDateFromText, extractAllDateParts } = require('../scraper/lib/ocrDate');

const NOW = new Date('2026-08-18T00:00:00Z');
const at  = (text, opts = {}) => parseDateFromText(text, { now: NOW, ...opts });

test('愛知トップの壊れた日付 2026/00/00 で打ち切られない', () => {
  // 実際にページ内に存在するプレースホルダ。これを拾って終了すると
  // 後ろにある本物の日付を全て取り逃す。
  assert.equal(at('2026/00/00'), null);
  const text = 'トピック 2026/00/00 令和８年度自衛官等採用案内 12月5日（土） お申込はこちら';
  assert.deepEqual(at(text), { dateStr: '2026-12-05', weekday: '土' });
});

test('愛知: 受付終了済みの日付を飛ばして次の開催日を採る', () => {
  // 実際の文言。7/25 は終了済み、12/5 と 2/20 が有効。
  const text = [
    '公安系 公務員合同説明会',
    '自衛隊・愛知県警察・海上保安庁・名古屋市消防の合同説明会を行います。',
    '- 7月25日（土）受付終了しました',
    '- 12月5日（土） お申込はこちら',
    '- 2月20日（土） お申込はこちら',
  ].join('\n');
  assert.deepEqual(at(text), { dateStr: '2026-12-05', weekday: '土' });
});

test('愛知: 住所・郵便番号・電話番号を日付と誤認しない', () => {
  // 実際のフッタ表記（全角）
  assert.equal(at('〒４５４-０００３'), null);
  assert.equal(at('名古屋市中川区松重町３-４１'), null);
  assert.equal(at('【電話番号】代表 ０５２-３３１-６２６６'), null);
  assert.equal(at('【電話受付】８時３０分～１７時１５分'), null);
});

test('愛知: 年度表記だけの行から日付を作らない', () => {
  assert.equal(at('令和８年度自衛官等採用案内'), null);
  assert.equal(at('令和８年度第１回一般曹候補生採用候補者について'), null);
  assert.equal(at('２等陸・海・空士（任期制自衛官）採用試験（ＷＥＢ）'), null);
});

test('愛知: お知らせ欄の全角スラッシュ日付を拾える', () => {
  // 「2026/08/06」形式。過去日なので既定では除外され、allowPast で取れる。
  assert.equal(at('2026/08/06 令和８年度第１回一般幹部候補生'), null);
  assert.deepEqual(at('2026/08/06 令和８年度第１回一般幹部候補生', { allowPast: true }),
    { dateStr: '2026-08-06', weekday: '木' });
});

test('広島: WordPress のドット区切り投稿日を拾える', () => {
  // 「2026.08.06」形式が実際に使われている
  assert.deepEqual(at('2026.08.06 お知らせ 庄原よいとこ祭のお知らせ', { allowPast: true }),
    { dateStr: '2026-08-06', weekday: '木' });
});

test('広島: ナビゲーション文言から日付を作らない', () => {
  for (const s of ['現在募集中の採用情報', '予備自衛官等の制度', 'イベントアーカイブ',
    'リアル VOICE 一般曹候補生とは？', '© Japan Self-Defense Forces Hiroshima Provincial Cooperation Office.',
    'WordPress 7.0.3', 'width=device-width, initial-scale=1, shrink-to-fit=no']) {
    assert.equal(at(s), null, `誤検出: ${s}`);
  }
});

test('愛知カレンダー: 見出しの年月と日セルが離れていても暴発しない', () => {
  // カレンダーは「2026年 8月」と「22 (土)」が別要素。連結しても
  // 「2026年 8月」だけでは日が無いので日付にしない。
  assert.equal(at('2026年 8月'), null);
  assert.equal(at('22 (土)'), null);
});

test('実ページ全文を通しても妥当な件数しか拾わない', () => {
  // 愛知トップの主要文言を連結した擬似全文
  const page = [
    'イベント情報＆お知らせEvents & Topics',
    '2026/08/06 令和８年度第１回一般幹部候補生（海上要員）、及び幹部候補曹（海上要員）採用試験の合格者及び補欠者について',
    '2026/07/30 令和８年度第１回一般幹部候補生（陸上要員）',
    '2026/07/24 令和８年度第１回一般曹候補生採用候補者について',
    '★カレンダー★イベント情報＆各種説明会スケジュール★',
    '2026年 8月 22 (土) 自衛隊制度陸上自衛隊高等工科学校説明会',
    '公安系 公務員合同説明会',
    '- 7月25日（土）受付終了しました',
    '- 12月5日（土） お申込はこちら',
    '- 2月20日（土） お申込はこちら',
    '2026/00/00 令和８年度自衛官等採用案内',
    '〒４５４-０００３ 名古屋市中川区松重町３-４１',
    '【電話番号】代表 ０５２-３３１-６２６６',
    '【電話受付】８時３０分～１７時１５分',
    '2026/07/26 2026年インターンシップの申込は終了いたしました。',
    '2026/07/13 7月18日 自衛官等募集用ポスターデザイン総選挙を行います。',
  ].join('\n');

  const all = extractAllDateParts(page);
  // 拾った候補が住所・電話番号に由来していないこと
  for (const c of all) {
    assert.ok(c.month >= 0 && c.month <= 12, `月が異常: ${c.raw}`);
    assert.ok(!/^\d{3}-\d{4}$/.test(c.raw), `郵便番号を拾った: ${c.raw}`);
  }
  // 全文からは「まだ来ていない最も確度の高い日付」= 12月5日（土）を返す
  assert.deepEqual(parseDateFromText(page, { now: NOW }), { dateStr: '2026-12-05', weekday: '土' });
});
