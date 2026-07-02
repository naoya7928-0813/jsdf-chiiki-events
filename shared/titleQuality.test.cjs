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

test('cleanEventTitle: 更新バッジ接頭辞・会場連結・末尾断片を整形（2026-06-16 帯広で検出）', () => {
  // 「更新情報new」バッジ + 「！！ 会場名 ～」連結 + 末尾助詞断片をすべて除去
  assert.equal(
    cleanEventTitle('更新情報new 公務員合同説明会の！！ 帯広とかちプラザ１Ｆアトリウム ～'),
    '公務員合同説明会');
  // 更新バッジの各種表記
  assert.equal(cleanEventTitle('更新情報New 高等工科学校説明会'), '高等工科学校説明会');
  assert.equal(cleanEventTitle('新着情報 ヘリコプター体験搭乗'), 'ヘリコプター体験搭乗');
  // 末尾の波ダッシュ・助詞断片
  assert.equal(cleanEventTitle('自衛官募集説明会 ～'), '自衛官募集説明会');
  assert.equal(cleanEventTitle('採用説明会の'), '採用説明会');
  // 年号サフィックスや！！直後に空白の無い本文は切らない（誤爆防止）
  assert.equal(cleanEventTitle('自衛隊体験フェスタ!! 2026'), '自衛隊体験フェスタ!! 2026');
  assert.equal(cleanEventTitle('公務員合同説明会入場無料！！どなたでも参加できます！！'),
    '公務員合同説明会入場無料！！どなたでも参加できます！！');
});

test('cleanEventTitle: 複数イベントの連結は先頭イベントのみ残す（2026-06-16 広島で検出）', () => {
  assert.equal(
    cleanEventTitle('第１回公安系公務員合同説明会in広島の 公安系公務員合同説明会inふくやまの 公安職公務員ガイダンスのご案内'),
    '第１回公安系公務員合同説明会in広島');
  // 単独イベント（イベント語1回）は連結扱いしない（※末尾「のご案内」は2026-07-02から除去仕様）
  assert.equal(cleanEventTitle('公務員合同説明会のご案内'), '公務員合同説明会');
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

test('isStaleDatedEvent: 和暦の年ズレ（令和元年・R6スタンプ）を検出する', () => {
  // 令和元年(2019) をタイトルに含むのに 2026 で登録（江の島・掃海艇はつしま型）
  assert.equal(isStaleDatedEvent({ date: '2026-12-21', title: '令和元年「掃海艇はつしま」一般公開', url: '' }), true);
  // 平成31年(2019)
  assert.equal(isStaleDatedEvent({ date: '2026-05-10', title: '平成31年度 記念行事', url: '' }), true);
  // URL の和暦ファイル名スタンプ R6.9.23（令和6年=2024）（函館型）
  assert.equal(isStaleDatedEvent({
    date: '2026-09-23', title: 'はたらくのりものin函館 一般広報',
    url: 'https://www.mod.go.jp/pco/hakodate/img/R6.9.23hataraknorimono.pdf',
  }), true);
  assert.equal(isStaleDatedEvent({
    date: '2026-08-03', title: '掃海母艦うらが 艦艇広報',
    url: 'https://www.mod.go.jp/pco/hakodate/img/R6.8.3uragakantei.pdf',
  }), true);
  // 当年(令和8=2026)は維持。会計年度「令和8年度」も誤検出しない。
  assert.equal(isStaleDatedEvent({ date: '2026-06-15', title: '令和8年度 自衛官候補生募集', url: '' }), false);
  assert.equal(isStaleDatedEvent({ date: '2026-04-10', title: '令和8年度採用説明会', url: '' }), false);
  // 当年の R8 スタンプURLは維持
  assert.equal(isStaleDatedEvent({
    date: '2026-07-20', title: '護衛艦一般公開',
    url: 'https://www.mod.go.jp/pco/x/img/R8.7.20kantei.pdf',
  }), false);
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

// ── 2026-07-02 全件監査で検出した新パターン ─────────────────────────

test('cleanEventTitle: 画像キャプション「クリックで拡大します。）」の混入除去（新潟）', () => {
  assert.equal(cleanEventTitle('クリックで拡大します。） 自衛隊就職説明会'), '自衛隊就職説明会');
  assert.equal(cleanEventTitle('新発田駐屯地夏まつり （クリックで拡大します。）'), '新発田駐屯地夏まつり');
});

test('cleanEventTitle: 先頭の孤立閉じ括弧「艦艇広報】」「見学】」を除去（大阪）', () => {
  assert.equal(cleanEventTitle('艦艇広報】 海上自衛隊 阪神基地隊サマーフェスタ2026'), '海上自衛隊 阪神基地隊サマーフェスタ2026');
  assert.equal(cleanEventTitle('見学】夏休み特別企画第一弾 海上自衛隊 舞鶴基地'), '夏休み特別企画第一弾 海上自衛隊 舞鶴基地');
  // 正常な【…】付きタイトルは変更しない
  assert.equal(cleanEventTitle('【伊那市】自衛隊採用説明会'), '【伊那市】自衛隊採用説明会');
});

test('cleanEventTitle: 先頭の波ダッシュ断片を除去（山形）', () => {
  assert.equal(cleanEventTitle('～ YAMACHI BASE（ヤマチベース）'), 'YAMACHI BASE（ヤマチベース）');
});

test('cleanEventTitle: 先頭のバッジ語連なり＋末尾CTAを除去（石川）', () => {
  assert.equal(cleanEventTitle('イベント事前予約制無 料 公安系公務員合同職場見学会 ご応募はコチラ'),
    '公安系公務員合同職場見学会');
  // 「イベント」単独で始まる正常タイトルは変更しない（連なり2語以上のみ除去）
  assert.equal(cleanEventTitle('イベント盛りだくさんの夏まつり'), 'イベント盛りだくさんの夏まつり');
});

test('cleanEventTitle: 先頭連番＋文書件名「募集の件」を除去（福島）', () => {
  assert.equal(cleanEventTitle('2 2026サマーキャンプ(神町駐屯地)参加募集の件'), '2026サマーキャンプ(神町駐屯地)');
  assert.equal(cleanEventTitle('2026航空学生説明会募集の件'), '2026航空学生説明会');
  assert.equal(cleanEventTitle('2026秋季インターンシップ(市ヶ谷・入間)参加募集の件'), '2026秋季インターンシップ(市ヶ谷・入間)');
});

test('cleanEventTitle: 末尾「のお知らせ」「のご案内」を除去（旭川・広島）', () => {
  assert.equal(cleanEventTitle('艦艇広報 護衛艦「きりさめ」「あさぎり」一般公開のお知らせ'),
    '艦艇広報 護衛艦「きりさめ」「あさぎり」一般公開');
  assert.equal(cleanEventTitle('第１回公安系公務員合同説明会ｉｎ広島のお知らせ'), '第１回公安系公務員合同説明会ｉｎ広島');
  assert.equal(cleanEventTitle('公安職公務員ガイダンスのご案内'), '公安職公務員ガイダンス');
});

test('cleanEventTitle: 閉じ括弧直後のファイル名残骸を除去・型番は残す（秋田）', () => {
  assert.equal(cleanEventTitle('多用途支援艦すおう一般公開（秋田港）-26[PDF'), '多用途支援艦すおう一般公開（秋田港）');
  assert.equal(cleanEventTitle('多用途支援艦ひうち一般公開（能代港）-5'), '多用途支援艦ひうち一般公開（能代港）');
  // 型番の「-90」等は閉じ括弧直後ではないため残す
  assert.equal(cleanEventTitle('体験搭乗 練習機TC－90'), '体験搭乗 練習機TC－90');
});

test('cleanEventTitle: 破損した日付範囲括弧「の （～31…）」を除去（岩手）', () => {
  assert.equal(cleanEventTitle('2026自衛隊サテライトブースの （～31キオクシアアイーナ）'), '2026自衛隊サテライトブース');
});

test('cleanEventTitle: カレンダー複数項目の連結を先頭項目に切り詰め（新潟）', () => {
  assert.equal(cleanEventTitle('公務員合同説明会 平日～令和７年度柏崎入隊激励会'), '公務員合同説明会');
});

test('isJunkOrStubTitle: 艦艇公開ページの表の行・ラベル行を除外（岩手）', () => {
  assert.equal(isJunkOrStubTitle('乗艦受付時刻'), true);
  assert.equal(isJunkOrStubTitle('最大発射速度:30発／分、最大射程約:5,600m'), true);
  assert.equal(isJunkOrStubTitle('宮古港上空を航過'), true);
  assert.equal(isJunkOrStubTitle('岩手地本公式'), true);
  assert.equal(isJunkOrStubTitle('内 容 職業概要説明・採用試験説明'), true);
  // 正常な艦艇イベントは通す
  assert.equal(isJunkOrStubTitle('海上自衛隊艦艇一般公開'), false);
});

test('isJunkOrStubTitle: 主催組織名のみ・調達文書・試験日程行を除外', () => {
  assert.equal(isJunkOrStubTitle('二戸地区広域行政事務組合消防本部'), true);
  assert.equal(isJunkOrStubTitle('分任契約担当官'), true);
  assert.equal(isJunkOrStubTitle('医科・歯科幹部 第1回採用試験 第2回採用試験'), true);
  assert.equal(isJunkOrStubTitle('技術曹 第1回採用試験 第2回採用試験 (海)'), true);
  // 消防含みでもイベント語があれば通す
  assert.equal(isJunkOrStubTitle('警察・消防・自衛隊合同職業説明会(名取）'), false);
});

test('isJunkOrStubTitle: 矛盾連結・学校名のみ・「から」終わりを除外', () => {
  assert.equal(isJunkOrStubTitle('見学】夏休み特別企画第二弾 航空自衛隊 阪神基地隊サマーフェスタ2026'), true);
  assert.equal(isJunkOrStubTitle('防衛医科大学校'), true);
  assert.equal(isJunkOrStubTitle('令和８年度 キャリア採用幹部（２回目）から'), true);
  // 種別付きの学校イベントは通す
  assert.equal(isJunkOrStubTitle('防衛大学校 Open Campus'), false);
  assert.equal(isJunkOrStubTitle('防衛医科大学校説明会'), false);
});

test('dedupEvents: ［艦艇広報］タグ・「部隊見学会」表記ゆれを統合（秋田・埼玉）', () => {
  // ［艦艇広報］全角角括弧タグの有無 → 統合
  const a = dedupEvents([
    { date: '2026-07-25', title: '［艦艇広報］多用途支援艦すおう一般公開(秋田港)', place: '' },
    { date: '2026-07-25', title: '多用途支援艦すおう一般公開（秋田港）', place: '秋田港' },
  ]);
  assert.equal(a.length, 1);
  // 「見学会」vs「部隊見学会」 → 統合
  const b = dedupEvents([
    { date: '2026-07-25', title: '陸上自衛隊松戸駐屯地見学会', place: '' },
    { date: '2026-07-25', title: '陸上自衛隊松戸駐屯地部隊見学会', place: '' },
  ]);
  assert.equal(b.length, 1);
});

test('dedupEvents: 同名・同日・同一チラシ(jpg/pdf版違い)は場所表記が違っても統合（新潟）', () => {
  const a = dedupEvents([
    { date: '2026-07-18', title: '公務員合同説明会', place: '柏崎市役所1F 多目的室', time: '13:00～16:00',
      url: 'https://www.mod.go.jp/pco/niigata/images/honbu/8.7.18kashiwazakisetumei.jpg' },
    { date: '2026-07-18', title: '公務員合同説明会', place: '柏崎地域事務所',
      url: 'https://www.mod.go.jp/pco/niigata/files/honbu/8.7.18kashiwazakisetumei.pdf' },
    // 別ソース・別会場の同名イベント（上越）は残す
    { date: '2026-07-18', title: '公務員合同説明会', place: '上越地域事務所',
      url: 'https://www.mod.go.jp/pco/niigata/HP/setumeikai.html' },
  ]);
  assert.equal(a.length, 2);
  // 情報量の多い方（実会場＋時間あり）が残る
  assert.ok(a.some(e => e.place === '柏崎市役所1F 多目的室'));
  assert.ok(a.some(e => e.place === '上越地域事務所'));
});
