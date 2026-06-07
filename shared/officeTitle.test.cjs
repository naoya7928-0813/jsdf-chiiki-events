'use strict';
/**
 * shared/officeTitle.cjs の回帰テスト。
 * 実際に発生した不具合タイトルを「生入力 → 期待出力」で固定し、
 * 整形ロジックの修正が別の表記を壊さないことを保証する。
 *
 *   node --test shared/officeTitle.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanOfficeTitle, officeIsJunk, stripTrailingCta, cleanOfficePlace } = require('./officeTitle.cjs');

// ── cleanOfficeTitle: 余計な文章の除去（生入力 → 期待出力）──────────
const CLEAN_CASES = [
  // 長崎「時間／場所／…」の残骸（語が先に消えても全角／で切る）
  ['ジョブガイダンス ／～／長崎会場…防衛省長崎合同庁舎4階 大村会場…大村地域事務所', 'ジョブガイダンス'],
  // 生データ（時間／場所／ をそのまま切り落とす）
  ['(月・祝) ジョブガイダンス 時間／13時30分～16時場所／長崎会場…防衛省長崎合同庁舎4階', 'ジョブガイダンス'],
  // 区切りがコロンでも切れる
  ['自衛隊説明会 時間:13:30〜16:00 場所:長崎合同庁舎', '自衛隊説明会'],
  // 区切りが空白でも切れる
  ['自衛隊フェス 時間 13時30分 場所 長崎港', '自衛隊フェス'],
  // 表ヘッダー（月日（曜日） イベント名 場 所）を除去
  ['月日（曜日） イベント名 場 所 護衛艦ひゅうが艦艇広報 高知新港', '護衛艦ひゅうが艦艇広報 高知新港'],
  // セッションマーカー ●【…】 を除去し括弧は保持
  ['●【 13:00～16:00】自衛隊説明会（ハローワークプラザかめおか）', '自衛隊説明会（ハローワークプラザかめおか）'],
  // 『…』の正式名称を優先
  ['説明会 令和８年７月５日（日）開催 『公安系・公務員採用試験合同説明会』', '公安系・公務員採用試験合同説明会'],
  // 末尾の誘導文言
  ['帯広駐屯地創立記念行事 詳細はこちら', '帯広駐屯地創立記念行事'],
  // 公式ページ参照などの注記を除去
  ['令和8年度自衛官等採用案内（日程は公式ページ参照）', '令和8年度自衛官等採用案内'],
  // 先頭の曜日断片は消すが、実在語の先頭文字（水/金/土 等）は残す
  ['・27日(日) 水辺の森ワイヤーフェス2024一般公開', '水辺の森ワイヤーフェス2024一般公開'],
  // 連結した複数イベントは最初の項目だけ
  ['試験艦あすか一般公開（秋田港）令和７年度即応予備自衛官雇用企業研修 令和７年度第２次予備自衛官補辞令書交付式', '試験艦あすか一般公開（秋田港）'],
];

// 整形しても元の正規タイトルを壊さない（変更されない）ことの確認
const PRESERVE_CASES = [
  '防府航空祭～幸せます防府～',
  '護衛艦のしろ一般公開',
  '公安系・公務員採用試験合同説明会',
  '自衛官 就職・進学説明会',
];

// ── officeIsJunk: 除外すべき塊 / 残すべきイベント ──────────────────
const JUNK_TRUE = [
  '海上自備隧佐世保音乐队',                                   // OCR文字化け（簡体字）
  '毎日実施しています！（Mail: kyoto.pco@rct.gsdf.mod.go.jp）', // 常時開催＋メール
  '防衛大学校学生 将来、各自衛隊の幹部となる者を養成する制度です', // 制度説明
  '熊本県熊本市中央区水前寺6丁目18',                          // 住所塊
  '公務員合同就職フェス 熊本地本募集課 096-297-2051',          // 電話番号
  '日 火 9 水 10 木 11 金 12 航空自衛隊 小牧基地見学',          // カレンダー表
  '時期及び定員',                                            // フォーム項目
  'NEWSお知らせ VIEW ALL 説明会 説明会の案内を更新しました',    // お知らせ＋過去報告
  'お知らせ すべて 採用試験情報 イベント情報 入札情報 イベント情報', // ナビメニュー
];
const JUNK_FALSE = [
  'ジョブガイダンス',
  '護衛艦のしろ一般公開',
  '公安系・公務員採用試験合同説明会',
  '水辺の森ワイヤーフェス2024一般公開',
];

test('cleanOfficeTitle: 余計な文章を除去して期待どおり整形する', () => {
  for (const [input, expected] of CLEAN_CASES) {
    assert.equal(cleanOfficeTitle(input), expected, `入力: ${input}`);
  }
});

test('cleanOfficeTitle: 整形結果に区切り残骸（全角／・時間/場所の語）を含まない', () => {
  for (const [input] of CLEAN_CASES) {
    const out = cleanOfficeTitle(input);
    assert.ok(!out.includes('／'), `／が残存: ${out}`);
    assert.ok(!/時間|場所|日時/.test(out) || out.length <= 6, `時間/場所が残存: ${out}`);
  }
});

test('cleanOfficeTitle: 正規のタイトルは変更しない', () => {
  for (const t of PRESERVE_CASES) {
    assert.equal(cleanOfficeTitle(t), t, `変更された: ${t}`);
  }
});

test('cleanOfficeTitle: 60文字を超えない', () => {
  const long = 'あ'.repeat(200);
  assert.ok(cleanOfficeTitle(long).length <= 60);
});

test('cleanOfficeTitle: 空・null は空文字を返す', () => {
  assert.equal(cleanOfficeTitle(''), '');
  assert.equal(cleanOfficeTitle(null), '');
});

test('officeIsJunk: 整形不能な塊を除外対象と判定する', () => {
  for (const t of JUNK_TRUE) {
    assert.equal(officeIsJunk(t), true, `JUNKと判定されない: ${t}`);
  }
});

test('officeIsJunk: 正規のイベントは除外しない', () => {
  for (const t of JUNK_FALSE) {
    assert.equal(officeIsJunk(t), false, `誤ってJUNK判定: ${t}`);
  }
});

test('cleanOfficePlace: 時間/場所が混ざった塊から会場名を取り出す', () => {
  assert.equal(cleanOfficePlace('時間／：13時30分～16時場所／防衛省長崎合同庁舎(4階会議室)'), '防衛省長崎合同庁舎(4階会議室)');
  assert.equal(cleanOfficePlace('時間／：10時～16時場所／島原新港一般公開・展示広報募集ブース設置'), '島原新港');
  assert.equal(cleanOfficePlace('場所／厳原港東浜ふ頭展示広報募集ブース設置'), '厳原港東浜ふ頭');
  assert.equal(cleanOfficePlace('時間／13時～17時 場所／五島・福江港'), '五島・福江港');
  // 既に綺麗な会場名はそのまま
  assert.equal(cleanOfficePlace('JR富山駅周辺'), 'JR富山駅周辺');
  assert.equal(cleanOfficePlace('ハローワーク半田'), 'ハローワーク半田');
  assert.equal(cleanOfficePlace(''), '');
});

test('officeIsJunk: フォーム項目「期及び定員」も除外する', () => {
  assert.equal(officeIsJunk('期及び定員'), true);
  assert.equal(officeIsJunk('時期及び定員'), true);
});

test('stripTrailingCta: 末尾の誘導文言を除去する', () => {
  assert.equal(stripTrailingCta('第41回ファミリーコンサート 詳細はこちら'), '第41回ファミリーコンサート');
  assert.equal(stripTrailingCta('体験搭乗 詳しくはこちら'), '体験搭乗');
  // 誘導文言が無いものはそのまま
  assert.equal(stripTrailingCta('護衛艦のしろ一般公開'), '護衛艦のしろ一般公開');
});
