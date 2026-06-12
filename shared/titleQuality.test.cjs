'use strict';

/**
 * titleQuality.cjs のテスト
 * 実行: node --test shared/*.test.cjs（npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyVerifiedOverrides, cleanEventTitle, cleanPlaceText,
  isJunkOrStubTitle, isStaleDatedEvent, dedupEvents,
} = require('./titleQuality.cjs');

test('applyVerifiedOverrides: チラシ照合済みの修正がURLで適用される', () => {
  // 新潟てんりゅう: タイトル・終了日・カテゴリ
  const a = applyVerifiedOverrides({
    date: '2026-07-18', title: 'てんゆう',
    url: 'https://www.mod.go.jp/pco/niigata/files/event/r8.7.18tenryu.pdf',
  });
  assert.equal(a.title, '訓練支援艦てんりゅう 一般公開');
  assert.equal(a.endDate, '2026-07-20');
  // 岩手: 部隊名のみ → 正式名
  const b = applyVerifiedOverrides({
    date: '2026-08-07', title: '海上自衛隊',
    url: 'https://www.mod.go.jp/pco/iwate/assets/img/event/until20260807/hachinohe.pdf',
  });
  assert.equal(b.title, '海上自衛隊八戸航空基地見学');
  // 岩手北上PDF: 日付で場所を出し分け
  const kita = 'https://www.mod.go.jp/pco/iwate/assets/img/event/until20260627/kitakami.pdf';
  assert.equal(applyVerifiedOverrides({ date: '2026-06-20', title: '公務員・合同説明会', url: kita }).place, 'なはんプラザ（花巻市）');
  assert.equal(applyVerifiedOverrides({ date: '2026-06-27', title: '公務員・合同説明会', url: kita }).place, '北上市生涯学習センター');
  // 無関係なURLは変更しない
  const c = applyVerifiedOverrides({ date: '2026-07-01', title: 'そのまま', url: 'https://example.com/x.pdf' });
  assert.equal(c.title, 'そのまま');
});

test('isJunkOrStubTitle: 部隊名のみ・助詞終わりの断片を除外する', () => {
  const junk = ['海上自衛隊', '自衛隊仙台病院', '航空自衛隊秋田救難隊', '陸上自衛隊', '自衛隊', '最新の', '入隊式について、',
    '募集案内所イベント', 'イベント', '地域事務所イベント',
    // 2026-06-12 に検出した新パターン
    'ダウンロード',
    '主催:防衛省自衛隊愛知地方協力本部',
    '開催場所:海上自衛隧舞鹤基地（京都府舞鹤市）',
    '陸上自衛隊 オープンカウンター方式実施要領',
    '三自衛隊統一募集広報申込みリンク',
    '1 試験期日',
    'タイトル不明)',
    // 2026-06-13 に検出した新パターン
    '四国大学交流亏德島市寺島本町2丁目35-8',
    '一般曹候補生',
    '幹部候補生・幹部候補曹'];
  for (const t of junk) assert.equal(isJunkOrStubTitle(t), true, `junk扱いのはず: ${t}`);
  // イベント種別を含む正規タイトルは除外しない
  const valid = [
    '海上自衛隊八戸航空基地見学',
    '海上自衛隊佐世保音楽隊 定例演奏会＜佐賀公演＞',
    '自衛隊フリースペースイベント',
    '自衛隊女子会のご案内',
    '陸上自衛隊体験型説明会 in 陸上自衛隊信太山駐屯地',
  ];
  for (const t of valid) assert.equal(isJunkOrStubTitle(t), false, `正規のはず: ${t}`);
});

test('cleanPlaceText: パイプ残骸の除去と事務所リストの排除', () => {
  assert.equal(cleanPlaceText('| 海上自衛隊八戸航空基地（青森県八戸市高館） |'), '海上自衛隊八戸航空基地（青森県八戸市高館）');
  assert.equal(cleanPlaceText('今金地域事務所・八雲地域事務所・江差地域事務所 ほか1拠点'), '');
  assert.equal(cleanPlaceText('敦賀地域事務所・敦賀出張所・越前地域事務所 ほか1拠点'), '');
  assert.equal(cleanPlaceText('金沢募集案内所・七尾出張所'), '');
  // 実会場はそのまま（事務所1つだけの会場名は正規）
  assert.equal(cleanPlaceText('横浜地域事務所'), '横浜地域事務所');
  assert.equal(cleanPlaceText('かが交流プラザさくら'), 'かが交流プラザさくら');
  assert.equal(cleanPlaceText(''), '');
});

test('cleanEventTitle: 先頭・末尾のゴミを整形する', () => {
  assert.equal(cleanEventTitle('# 海上自衛隊'), '海上自衛隊');
  assert.equal(cleanEventTitle('&自衛隊フリースペースイベント'), '自衛隊フリースペースイベント');
  assert.equal(cleanEventTitle('NEW6/14&7/11 自衛隊フリースペースイベント'), '自衛隊フリースペースイベント');
  assert.equal(cleanEventTitle('1オンライン説明会'), 'オンライン説明会');
  assert.equal(
    cleanEventTitle('自衛隊体験道東フェスタ航空自衛隊（CH-47J）ヘリコプター帯広上空パノラマフライト！！参加費 無料！！'),
    '自衛隊体験道東フェスタ航空自衛隊（CH-47J）ヘリコプター帯広上空パノラマフライト！！');
  // 見出し残骸・絵文字（2026-06-12 三重で検出）
  assert.equal(cleanEventTitle('イベント情報 NEW＼ 高等工科学校説明会🏫'), '高等工科学校説明会');
  // 案内所名のみ → 説明会イベントとして補完（京都）
  assert.equal(cleanEventTitle('京都募集案内所'), '自衛隊説明会（京都募集案内所）');
  assert.equal(cleanEventTitle('河原町募集案内所'), '自衛隊説明会（河原町募集案内所）');
  // 正規タイトルは変更しない
  assert.equal(cleanEventTitle('4機関合同就職説明会'), '4機関合同就職説明会');
  assert.equal(cleanEventTitle('第41回ファミリーコンサート'), '第41回ファミリーコンサート');
  assert.equal(cleanEventTitle('自衛隊説明会（ハローワーク伏見）'), '自衛隊説明会（ハローワーク伏見）');
});

test('isJunkOrStubTitle: 不正タイトルを検出する', () => {
  const junk = [
    '↑申し込みはこちら↑ 【お問合せ先】自衛隊京都地方協力本部 〒604-8482京',
    '自衛隊岩手地本イベント',
    '自衛隊岩手地本イベント（釜石）',
    '期及び定員',
    '時期及び定員',
    '入札公告のご案内 試験艦あすか一般公開（秋田港）予備自衛官訓練日程',
    '★詳細は以下チラシを参照願います。 ★1dayコースの定員はありませんが、 宿泊コースの定員は30名になります。 ★1d',
    'イベント参加無料 親子で学ぼう！防災マルシェ かが交流プラザさくら 本イベントに自衛隊ブースを出展・展示などを行います。',
    '1 R.22〜＃2 R.24',
  ];
  for (const t of junk) assert.equal(isJunkOrStubTitle(t), true, `junk扱いのはず: ${t}`);
});

test('isJunkOrStubTitle: 正規のイベント名は除外しない', () => {
  const valid = [
    '自衛官 就職・進学説明会',
    '公務員・合同説明会',
    'PREMIUM TOUR 2026',
    'てんゆう',
    '県民の日',
    '自衛隊を「知る」「感じる」',
    '名取市 警察・消防・自衛隊合同職業説明会',
    '2026サマーキャンプ参加募集の件',
  ];
  for (const t of valid) assert.equal(isJunkOrStubTitle(t), false, `正規のはず: ${t}`);
});

test('isStaleDatedEvent: 過去年イベントの年ズレ再登録を検出する', () => {
  assert.equal(isStaleDatedEvent({ date: '2026-10-12', title: '2024 ぎょぎょフェス', url: '' }), true);
  assert.equal(isStaleDatedEvent({ date: '2026-09-20', title: '佐世保地方隊オータムフェスタ2025', url: '' }), true);
  assert.equal(isStaleDatedEvent({
    date: '2026-10-26', title: '水辺の森ワイヤーフェス一般公開',
    url: 'https://www.mod.go.jp/pco/nagasaki/pdf/event/20241027_mama.pdf',
  }), true);
  // 同年・全角年は維持
  assert.equal(isStaleDatedEvent({ date: '2026-07-25', title: '自衛隊体験フェスタ!! 2026', url: '' }), false);
  assert.equal(isStaleDatedEvent({ date: '2026-06-14', title: 'サマーコンサート２０２６', url: '' }), false);
});

test('dedupEvents: 同一イベントは統合し、場所違いの同名イベントは残す', () => {
  // 場所が片方空 → 統合（情報の多い方を残す）
  const a = dedupEvents([
    { date: '2026-08-17', title: 'PREMIUM TOUR 2026', place: '', time: '7:00出発' },
    { date: '2026-08-17', title: 'PREMIUM TOUR 2026', place: '敦賀地域事務所', time: '7:00出発' },
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].place, '敦賀地域事務所');

  // 包含関係（名取の合同説明会の表記ゆれ） → 統合
  const b = dedupEvents([
    { date: '2026-06-28', title: '警察・消防・自衛隊合同職業説明会(名取）', place: '' },
    { date: '2026-06-28', title: '名取市 警察・消防・自衛隊合同職業説明会', place: '' },
  ]);
  assert.equal(b.length, 1);

  // 同名・同日でも場所が異なれば別イベントとして残す
  const c = dedupEvents([
    { date: '2026-06-20', title: '高等工科学校説明会', place: '平塚地域事務所', time: '10:00～12:00' },
    { date: '2026-06-20', title: '高等工科学校説明会', place: '相模原地域事務所', time: '10:00～11:00' },
  ]);
  assert.equal(c.length, 2);

  // 日付が違えば統合しない
  const d = dedupEvents([
    { date: '2026-10-12', title: '島原城大手門市', place: '' },
    { date: '2026-10-18', title: '島原城大手門市', place: '島原市役所大手広場' },
  ]);
  assert.equal(d.length, 2);

  // 軍種名の有無による表記ゆれ（大阪 6/27）→ 統合
  const e = dedupEvents([
    { date: '2026-06-27', title: '陸上自衛隊体験型説明会 in 陸上自衛隊信太山駐屯地', place: '' },
    { date: '2026-06-27', title: '体験型説明会 in 信太山駐屯地', place: '岸和田地域事務所' },
  ]);
  assert.equal(e.length, 1);

  // 学校名の省略による包含（岡山 7/5）→ 統合
  const f = dedupEvents([
    { date: '2026-07-05', title: '陸上自衛隊 高等工科学校 オンライン説明会', place: '' },
    { date: '2026-07-05', title: 'オンライン説明会', place: '' },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].title, '陸上自衛隊 高等工科学校 オンライン説明会');
});
