'use strict';

/**
 * titleQuality.cjs のテスト
 * 実行: node --test shared/*.test.cjs（npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyVerifiedOverrides, cleanEventTitle, cleanPlaceText, cleanTimeText, cleanDeadlineText,
  isJunkOrStubTitle, isSuspiciousTitle, isStaleDatedEvent, dedupEvents,
  safeUrl,
  toJapaneseKanji,
  hasForeignChinese,
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
  // URL が無いイベント: pref+date+titleIncludes で適用（茨城 7/28 つくば市の会場誤記）
  const d = applyVerifiedOverrides({
    pref: 'ibaraki', date: '2026-07-28',
    title: 'つくば市公安系公務員 合同説明会 【参加団体】・警察・消防・海上保安庁・刑務所・少年院・入国警備官・自衛隊',
    place: '土浦市役所2F201会議室', url: '',
  });
  assert.equal(d.place, 'イオンモールつくば 3Fイオンホール');
  // 同名でも日付・地本が違えば適用しない
  const e = applyVerifiedOverrides({ pref: 'ibaraki', date: '2026-07-27', title: 'つくば市公安系公務員 合同説明会', place: 'X', url: '' });
  assert.equal(e.place, 'X');
});

test('applyVerifiedOverrides: 2026-07-17 監査分（帯広やはぎ/秋田すおう/熊本インターン）', () => {
  // 帯広: url無し → pref+date+titleIncludes で種別・終了日を補完
  const yah = applyVerifiedOverrides({ pref: 'obihiro', date: '2026-07-24', title: '護衛艦「やはぎ」', url: '' });
  assert.equal(yah.title, '護衛艦「やはぎ」一般公開');
  assert.equal(yah.endDate, '2026-07-26');
  assert.equal(yah.category, '艦艇公開');
  // 秋田すおう: OCR断片 → チラシ正式名＋終了日
  const suou = applyVerifiedOverrides({
    pref: 'akita', date: '2026-07-25', title: 'すおう in秋田港',
    url: 'https://www.mod.go.jp/pco/akita/file/result/20260725_26.pdf',
  });
  assert.equal(suou.title, '多用途支援艦すおう一般公開(秋田港)');
  assert.equal(suou.endDate, '2026-07-26');
  // 熊本: OCR誤読「現場の仕事体夏。」→ チラシ正式名（。付き長文junkルールに抵触しない形）
  const km = applyVerifiedOverrides({
    pref: 'kumamoto', date: '2026-08-24', title: '現場の仕事体夏。',
    url: 'https://www.mod.go.jp/pco/kumamoto/event/event/20260824_28_intern/img/20260824_28_intern.pdf',
  });
  assert.equal(km.endDate, '2026-08-28');
  assert.equal(isJunkOrStubTitle(cleanEventTitle(km.title)), false);
});

test('dedupEvents: 秋田すおう（iCal と チラシOCR）が名称包含で統合される', () => {
  const merged = dedupEvents([
    { id: 'a1', pref: 'akita', date: '2026-07-25', title: '［艦艇広報］多用途支援艦すおう一般公開(秋田港)', place: '' },
    // オーバーライド適用後の OCR 側（place・notes を持つ＝情報量スコアで勝つ）
    { id: 'a2', pref: 'akita', date: '2026-07-25', title: '多用途支援艦すおう一般公開(秋田港)',
      place: '中島埠頭2号岸壁', endDate: '2026-07-26', url: 'https://example.com/20260725_26.pdf',
      notes: '7/25 09:00～12:00・13:00～16:00／7/26 09:00～12:00（乗艦締切は各回30分前）' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].place, '中島埠頭2号岸壁'); // 情報量の多い方が残る
});

test('cleanEventTitle: 全角英数を半角へ統一（表記ゆれ解消）', () => {
  assert.equal(cleanEventTitle('第５６回 ひがしね祭'), '第56回 ひがしね祭');
  assert.equal(cleanEventTitle('公安系公務員 合同説明会 ｉｎ 呉'), '公安系公務員 合同説明会 in 呉');
  assert.equal(cleanEventTitle('高田駐屯地サマーフレンドシップキャンペーン２０２６ｉｎパティオ'),
    '高田駐屯地サマーフレンドシップキャンペーン2026inパティオ');
  assert.equal(cleanEventTitle('２Daysインターンシップ'), '2Daysインターンシップ');
  // 記号・カナは触らない
  assert.equal(cleanEventTitle('夏だ！自衛官と一緒に楽しもう！'), '夏だ！自衛官と一緒に楽しもう！');
});

test('cleanEventTitle: 末尾の宣伝フレーズ連結を除去（帯広の表セル連結）', () => {
  assert.equal(cleanEventTitle('公務員合同説明会入場無料！！どなたでも参加できます！！'), '公務員合同説明会');
  assert.equal(cleanEventTitle('防災フェスタ 入場無料'), '防災フェスタ');
  // 名称の一部としての「無料」は誤爆しない（末尾連結のみ対象）
  assert.equal(cleanEventTitle('無料相談会'), '無料相談会');
});

test('isJunkOrStubTitle: 採用文書（募集要項/募集案内）・OCR簡体字を除外', () => {
  assert.equal(isJunkOrStubTitle('防衛省職員（任期付自衛官）募集要項'), true);
  assert.equal(isJunkOrStubTitle('任期付自衛官の募集要项'), true);   // 簡体字「项」
  assert.equal(isJunkOrStubTitle('防衛省職員（非常勤隊員）募集案内'), true);
  // イベント名は除外しない
  assert.equal(isJunkOrStubTitle('自衛官募集説明会'), false);
  assert.equal(isJunkOrStubTitle('自衛官採用説明会'), false);
});

test('isSuspiciousTitle: 会場名で終わるタイトルを検疫（イベント語があれば素通し）', () => {
  assert.equal(isSuspiciousTitle('イーストピアみやこ 2階 多目的ホール'), true);
  assert.equal(isSuspiciousTitle('中島埠頭'), true);
  // イベント語を含めば検疫しない
  assert.equal(isSuspiciousTitle('市民ホールまつり'), false);
  assert.equal(isSuspiciousTitle('文化センター 見学会'), false);
});

test('cleanEventTitle: 表の内訳（【参加団体】/【場所】）の連結を切り落とす', () => {
  assert.equal(
    cleanEventTitle('つくば市公安系公務員 合同説明会 【参加団体】・警察・消防・海上保安庁・刑務所・少年院・入国警備官・自衛隊'),
    'つくば市公安系公務員 合同説明会');
  assert.equal(cleanEventTitle('石岡市公安系公務員 合同説明会 【参加団体】・警察・消防・自衛隊'), '石岡市公安系公務員 合同説明会');
  assert.equal(cleanEventTitle('採用説明会【場所】土浦地域事務所'), '採用説明会');
  // 【参加団体】を含まない通常タイトルは不変
  assert.equal(cleanEventTitle('公務員合同説明会'), '公務員合同説明会');
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
  // 末尾の宣伝フレーズ連結は 2026-07-17 から除去仕様（帯広の表セル連結）
  assert.equal(cleanEventTitle('公務員合同説明会入場無料！！どなたでも参加できます！！'),
    '公務員合同説明会');
});

test('cleanEventTitle: 複数イベントの連結は先頭イベントのみ残す（2026-06-16 広島で検出）', () => {
  // 全角英数は 2026-07-17 から半角へ統一（第１回→第1回）
  assert.equal(
    cleanEventTitle('第１回公安系公務員合同説明会in広島の 公安系公務員合同説明会inふくやまの 公安職公務員ガイダンスのご案内'),
    '第1回公安系公務員合同説明会in広島');
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
  assert.equal(cleanEventTitle('第１回公安系公務員合同説明会ｉｎ広島のお知らせ'), '第1回公安系公務員合同説明会in広島');
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

test('isJunkOrStubTitle: 旧「公式確認」スタブのタイトルを除外（2026-07-02 生成廃止）', () => {
  assert.equal(isJunkOrStubTitle('自衛隊山梨地方協力本部のイベント情報'), true);
  assert.equal(isJunkOrStubTitle('自衛隊岐阜地方協力本部のイベント情報'), true);
  assert.equal(isJunkOrStubTitle('自衛隊島根地方協力本部のイベント情報'), true);
  // 地方協力本部が主催として含まれるだけの正規イベント名は通す
  assert.equal(isJunkOrStubTitle('東京地方協力本部 説明会'), false);
  assert.equal(isJunkOrStubTitle('自衛隊山梨地方協力本部 夏まつり広報ブース'), false);
});

test('isJunkOrStubTitle: 採用試験の試験日そのものは除外・試験説明会は通す', () => {
  assert.equal(isJunkOrStubTitle('公安系公務員採用試験'), true);
  assert.equal(isJunkOrStubTitle('一般曹候補生採用試験'), true);
  assert.equal(isJunkOrStubTitle('自衛官採用試験説明会'), false);
  assert.equal(isJunkOrStubTitle('採用試験対策セミナー'), false);
});

test('cleanEventTitle: 「〜説明会同日」の切れ端を整形（香川）', () => {
  assert.equal(cleanEventTitle('4種説明会同日'), '4種説明会');
  // 「同日」を含む正規の文言は変えない
  assert.equal(cleanEventTitle('同日開催の説明会もあります'), '同日開催の説明会もあります');
});

test('cleanTimeText: 時分/午前午後/4桁/区切りを HH:MM～HH:MM に正規化', () => {
  assert.equal(cleanTimeText('14時から16時'), '14:00～16:00');
  assert.equal(cleanTimeText('10時00分～15時00分'), '10:00～15:00');
  assert.equal(cleanTimeText('午前9時～午後4時'), '09:00～16:00');
  assert.equal(cleanTimeText('1400〜1600'), '14:00～16:00');
  assert.equal(cleanTimeText('0900～1630'), '09:00～16:30');
  assert.equal(cleanTimeText('10:00-15:00'), '10:00～15:00');
  assert.equal(cleanTimeText('08:30~17:00'), '08:30～17:00');
  assert.equal(cleanTimeText('13時半～16時'), '13:30～16:00');
  // 午前/午後＋コロン形式・2部制（東京 2026-07 で実際に出た表記）
  assert.equal(cleanTimeText('午前10:30～11:30、午後13:30～14:30'), '10:30～11:30／13:30～14:30');
  assert.equal(cleanTimeText('10:00～12:00、14:00～16:00'), '10:00～12:00／14:00～16:00');
  // 先頭の開催日プレフィックス（date と重複）・括弧の全半角混在
  assert.equal(cleanTimeText('8/28(金）10:00～15:00'), '10:00～15:00');
  assert.equal(cleanTimeText('7/26（日）13:00～16:30'), '13:00～16:30');
  // 開始時刻のみ（末尾の～は落とす）
  assert.equal(cleanTimeText('9/2（水）10:00～'), '10:00');
  assert.equal(cleanTimeText('13:30～'), '13:30');
  // ①②枠・第N部ラベルは「／」区切りへ（番号の重複ミスにも頑健）
  assert.equal(cleanTimeText('①10:00～11:30 ②13:10～14:40 ②15:00～16:30'), '10:00～11:30／13:10～14:40／15:00～16:30');
  assert.equal(cleanTimeText('①13:00②15:00③17:00④19:00'), '13:00／15:00／17:00／19:00');
  assert.equal(cleanTimeText('第1部10:00～12:00 第2部13:00～15:00'), '10:00～12:00／13:00～15:00');
  assert.equal(cleanTimeText('第一部 09:30～12:00、第二部 13:30～16:00'), '09:30～12:00／13:30～16:00');
  assert.equal(cleanTimeText('第一部 10:00～12:00 第二部 14:00～16:00 第三部 17:00～19:00'), '10:00～12:00／14:00～16:00／17:00～19:00');
  // 受付/開場/※注記は除去
  assert.equal(cleanTimeText('18:00～19:45(開場17:00)'), '18:00～19:45');
  assert.equal(cleanTimeText('10:00～18:00 ※金曜日のみ12:00～'), '10:00～18:00');
  assert.equal(cleanTimeText('13時30分～16時30分…受付13時～'), '13:30～16:30');
  // ラベル/断片/null は空
  assert.equal(cleanTimeText('一般公開時間'), '');
  assert.equal(cleanTimeText('開'), '');
  assert.equal(cleanTimeText('null'), '');
  assert.equal(cleanTimeText(null), '');
  // 既に正準なものは維持
  assert.equal(cleanTimeText('10:00～12:00'), '10:00～12:00');
  assert.equal(cleanTimeText('終日'), '終日');
});

test('cleanDeadlineText: "null" は空・英語表記を日本語化・正規は維持', () => {
  assert.equal(cleanDeadlineText('null'), '');
  assert.equal(cleanDeadlineText(null), '');
  assert.equal(cleanDeadlineText('7/8 wed.'), '7月8日（水）');
  assert.equal(cleanDeadlineText('7月10日（金）'), '7月10日（金）');
  assert.equal(cleanDeadlineText('令和8年7月2日(木)まで'), '令和8年7月2日(木)まで');
});

test('cleanPlaceText: ジオコーダ住所サフィックス除去・活動羅列は空', () => {
  assert.equal(cleanPlaceText('メセナホール, 日本、〒382-0098 長野県須坂市墨坂南4丁目5−1'), 'メセナホール');
  assert.equal(cleanPlaceText('イオンモール松本 「風庭」エリア, 日本、〒390-8560 長野県松本市中央4丁目9−51'), 'イオンモール松本 「風庭」エリア');
  assert.equal(cleanPlaceText('・Ｆ－２戦闘機見学・救難隊の見学・体験喫食 等（食事代５１４円ご負担いただきます）'), '');
  assert.equal(cleanPlaceText('null'), '');
  // 会場語を含む正規の会場は維持
  assert.equal(cleanPlaceText('留萌港'), '留萌港');
  assert.equal(cleanPlaceText('かが交流プラザさくら'), 'かが交流プラザさくら');
});

// ── 検疫（isSuspiciousTitle）: 新種ゴミの公開保留（2026-07-03 岩手事故の再発防止） ──
// isSuspiciousTitle はファイル先頭でまとめて require 済み

test('isSuspiciousTitle: 表の行・ラベル・組織名・スペック・述語断片を検疫する', () => {
  const suspicious = [
    '乗艦受付時刻',                              // ラベル語終わり（岩手・実例）
    '最大発射速度:30発／分、最大射程約:5,600m',   // 装備スペック（岩手・実例）
    '宮古港上空を航過',                          // 述語断片（岩手・実例）
    '岩手地本公式',                              // 「公式」ラベル（岩手・実例）
    '二戸地区広域行政事務組合消防本部',           // 組織名のみ（岩手・実例）
    '集合場所までのアクセス',                    // ラベル語終わり（新種想定）
    '駐車場のご案内図',                          // 〃
    'participants 定員',                        // 〃
  ];
  for (const t of suspicious) assert.equal(isSuspiciousTitle(t), true, `検疫すべき: ${t}`);
});

test('isSuspiciousTitle: イベント語を含む・固有名の正規イベントは検疫しない', () => {
  const legit = [
    // イベント語あり
    '自衛隊職場体験（岩手駐屯地）', '海上自衛隊八戸航空基地見学', '公務員合同説明会',
    '第４１回ファミリーコンサート', '千歳のまちの航空祭', 'ヘリコプター体験搭乗',
    // イベント語なしの固有名イベント（誤検疫させない）
    '県民の日', 'つばめのチカラ', '新潟「セリカday」', 'ＹＡＭＡＣＨＩ ＢＡＳＥ ｉｎ酒田',
    '【駒ケ根市】KOMA夏', '群馬パーツショー', 'PREMIUM TOUR 2026', '自衛隊を「知る」「感じる」',
  ];
  for (const t of legit) assert.equal(isSuspiciousTitle(t), false, `公開すべき: ${t}`);
});

// ── splitPlaceAddress（会場名と住所の分離。フィードバック§1-2⑥） ──
const { splitPlaceAddress } = require('./titleQuality.cjs');

test('splitPlaceAddress: 会場＋住所を分離（都道府県/市区町村＋番地・括弧内）', () => {
  const cases = [
    ['陸上自衛隊幌別駐屯地 登別市緑町３丁目１番地', '陸上自衛隊幌別駐屯地', '登別市緑町３丁目１番地'],
    ['陸上自衛隊岩手駐屯地（岩手県滝沢市後268-433）', '陸上自衛隊岩手駐屯地', '岩手県滝沢市後268-433'],
    ['郡山労働福祉会館 郡山市虎丸町7番7号', '郡山労働福祉会館', '郡山市虎丸町7番7号'],
    ['自衛隊 神町駐屯地 山形県東根市神町南3-1-1', '自衛隊 神町駐屯地', '山形県東根市神町南3-1-1'],
    ['福島第二合同庁舎 １階会議室 (福島市花園町５番１７号)', '福島第二合同庁舎 １階会議室', '福島市花園町５番１７号'],
  ];
  for (const [inp, ep, ea] of cases) {
    const r = splitPlaceAddress(inp, '');
    assert.equal(r.place, ep, `place: ${inp}`);
    assert.equal(r.address, ea, `address: ${inp}`);
  }
});

test('splitPlaceAddress: 会場名のみは分離しない（誤分離防止）', () => {
  for (const t of ['平塚地域事務所', '留萌港', 'イオンモール松本 「風庭」エリア', '村山市民会館',
                   '熊本地方合同庁舎A棟', '高松サンポート合同庁舎アイホール', '京都募集案内所', '善通寺市民会館']) {
    const r = splitPlaceAddress(t, '');
    assert.equal(r.place, t, `維持: ${t}`);
    assert.equal(r.address, '', `address空: ${t}`);
  }
});

test('splitPlaceAddress: 既存 address は上書きしない・空入力は安全', () => {
  const r = splitPlaceAddress('郡山労働福祉会館 郡山市虎丸町7番7号', '正しい住所');
  assert.equal(r.place, '郡山労働福祉会館');
  assert.equal(r.address, '正しい住所'); // 既存優先
  assert.deepEqual(splitPlaceAddress('', ''), { place: '', address: '' });
  assert.deepEqual(splitPlaceAddress(null, null), { place: '', address: '' });
});


// ── URL スキームの検証（格納型XSS対策） ─────────────────────────
test('safeUrl: http/https だけを通す', () => {
  assert.strictEqual(safeUrl('https://www.mod.go.jp/pco/aomori/'), 'https://www.mod.go.jp/pco/aomori/');
  assert.strictEqual(safeUrl('http://example.jp/a.pdf'), 'http://example.jp/a.pdf');
});

test('safeUrl: スクリプト実行につながるスキームを落とす', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.strictEqual(safeUrl(bad), '', `通してしまった: ${JSON.stringify(bad)}`);
  }
});

test('safeUrl: 空・非文字列は空文字', () => {
  assert.strictEqual(safeUrl(''), '');
  assert.strictEqual(safeUrl(null), '');
  assert.strictEqual(safeUrl(undefined), '');
  assert.strictEqual(safeUrl(123), '');
  assert.strictEqual(safeUrl({}), '');
});


// ── 簡体字（中国語）の扱い ───────────────────────────────────────
// 地本サイトは日本語だが、チラシOCRが日本語の漢字を簡体字として誤読することがある。
// 単純に弾くと正規のイベントごと消えるため、まず日本語へ直してから判定する。
test('toJapaneseKanji: 実際に化けた会場名を日本語へ直す', () => {
  assert.strictEqual(toJapaneseKanji('关山演习場（新妙高市）'), '関山演習場（新妙高市）');
  assert.strictEqual(toJapaneseKanji('门司港西海岸小頭1号岸壁'), '門司港西海岸小頭1号岸壁');
  assert.strictEqual(toJapaneseKanji('募集要项'), '募集要項');
  assert.strictEqual(toJapaneseKanji('海上自衛队舞鹤基地'), '海上自衛隊舞鶴基地');
});

test('toJapaneseKanji: 日本語はそのまま（誤変換しない）', () => {
  for (const s of ['千歳のまちの航空祭', '陸上自衛隊高等工科学校 説明会', '護衛艦「いずも」一般公開']) {
    assert.strictEqual(toJapaneseKanji(s), s);
  }
});

test('cleanEventTitle / cleanPlaceText が簡体字を日本語へ直す', () => {
  assert.strictEqual(cleanEventTitle('募集要项'), '募集要項');
  assert.strictEqual(cleanPlaceText('关山演习場（新妙高市）'), '関山演習場（新妙高市）');
});

test('日本語へ直せない中国語は不正として弾く', () => {
  assert.ok(hasForeignChinese('这是中国语的说明'));
  assert.ok(isJunkOrStubTitle('这是中国语的说明会'));
  assert.ok(isJunkOrStubTitle('四国大学交流亏'));   // 変換表に無いOCR残骸
});

test('日本語のイベント名は中国語判定に引っかからない', () => {
  for (const s of ['千歳のまちの航空祭', '関山演習場での訓練見学', '門司港 艦艇一般公開', '募集要項の説明会']) {
    assert.ok(!hasForeignChinese(s), s);
    assert.ok(!isJunkOrStubTitle(s), s);
  }
});
