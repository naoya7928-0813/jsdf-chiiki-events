// ─── プッシュ通知 ─────────────────────────────────────────────
// イベントのプッシュ通知は Web Push (VAPID) を使用（src/hooks/usePushNotification.js）。
// 旧 ntfy.sh トピック方式（NTFY_TOPIC / NtfyGuideModal）は廃止済み。

// バグ・不具合報告は /api/report（サーバー関数）経由でサーバー側 Redis に保存する。
// 外部サービス（ntfy 等）へは送信しない。運営者は管理画面「報告」タブで閲覧・対応する
// （2026-07-17 ntfy から運営コンソールへ完全移行。個人情報を公開経路に出さないため）。

// ─── データソース ─────────────────────────────────────────────
// GitHub Actions が定期スクレイピングし public/data/events.json に書き出す。
// Vercel はこのファイルを静的配信するため、サーバーレス関数は不要。
export const API_URL = '/data/events.json';

// 自動リフレッシュ間隔（ミリ秒）
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5分

// ─── カラースキーム ───────────────────────────────────────────
export const COLOR_SCHEMES = {
  jgsdf: { primary: '#3a4130', accent: '#8b5a2e', label: '陸上自衛隊', sub: 'JGSDF' },
  jmsdf: { primary: '#0b2545', accent: '#8b2e2e', label: '海上自衛隊', sub: 'JMSDF' },
  jasdf: { primary: '#2a4a6b', accent: '#b07a1f', label: '航空自衛隊', sub: 'JASDF' },
};

export const DEFAULT_SCHEME = 'jgsdf';

// ─── 地方協力本部 連絡先 ──────────────────────────────────────
export const REGION_HQ = {
  // 北海道
  sapporo:   { name: '札幌地方協力本部',   tel: '011-631-5471', emblem: '札' },
  asahikawa: { name: '旭川地方協力本部',   tel: '0166-51-7330', emblem: '旭' },
  obihiro:   { name: '帯広地方協力本部',   tel: '0155-23-2485', emblem: '帯' },
  hakodate:  { name: '函館地方協力本部',   tel: '0138-53-6241', emblem: '函' },
  // 東北
  miyagi:    { name: '宮城地方協力本部',   tel: '022-295-2612', emblem: '宮' },
  aomori:    { name: '青森地方協力本部',   tel: '017-777-7917', emblem: '青' },
  iwate:     { name: '岩手地方協力本部',   tel: '019-651-3351', emblem: '岩' },
  akita:     { name: '秋田地方協力本部',   tel: '018-823-1451', emblem: '秋' },
  yamagata:  { name: '山形地方協力本部',   tel: '023-622-7314', emblem: '形' },
  fukushima: { name: '福島地方協力本部',   tel: '024-531-2351', emblem: '福' },
  // 関東
  kanagawa:  { name: '神奈川地方協力本部', tel: '045-662-9476', emblem: '神' },
  tokyo:     { name: '東京地方協力本部',   tel: '03-3268-3111', emblem: '東' },
  saitama:   { name: '埼玉地方協力本部',   tel: '048-831-6044', emblem: '埼' },
  gunma:     { name: '群馬地方協力本部',   tel: '027-251-0016', emblem: '群' },
  tochigi:   { name: '栃木地方協力本部',   tel: '028-634-3385', emblem: '栃' },
  ibaraki:   { name: '茨城地方協力本部',   tel: '029-231-3315', emblem: '茨' },
  chiba:     { name: '千葉地方協力本部',   tel: '043-242-5501', emblem: '千' },
  // 中部
  niigata:   { name: '新潟地方協力本部',   tel: '025-285-0513', emblem: '潟' },
  toyama:    { name: '富山地方協力本部',   tel: '076-432-3730', emblem: '富' },
  ishikawa:  { name: '石川地方協力本部',   tel: '076-291-6214', emblem: '石' },
  fukui:     { name: '福井地方協力本部',   tel: '0776-22-3070', emblem: '福' },
  yamanashi: { name: '山梨地方協力本部',   tel: '055-252-3838', emblem: '梨' },
  nagano:    { name: '長野地方協力本部',   tel: '026-232-3831', emblem: '長' },
  gifu:      { name: '岐阜地方協力本部',   tel: '058-262-1818', emblem: '岐' },
  shizuoka:  { name: '静岡地方協力本部',   tel: '054-252-4000', emblem: '静' },
  aichi:     { name: '愛知地方協力本部',   tel: '052-961-4366', emblem: '愛' },
  // 近畿
  mie:       { name: '三重地方協力本部',   tel: '059-213-2007', emblem: '三' },
  shiga:     { name: '滋賀地方協力本部',   tel: '077-524-6130', emblem: '滋' },
  kyoto:     { name: '京都地方協力本部',   tel: '075-641-0501', emblem: '京' },
  osaka:     { name: '大阪地方協力本部',   tel: '06-6942-0744', emblem: '大' },
  hyogo:     { name: '兵庫地方協力本部',   tel: '078-261-9777', emblem: '兵' },
  nara:      { name: '奈良地方協力本部',   tel: '0742-23-7001', emblem: '奈' },
  wakayama:  { name: '和歌山地方協力本部', tel: '073-422-5116', emblem: '和' },
  // 四国
  tokushima: { name: '徳島地方協力本部',   tel: '088-623-2220', emblem: '徳' },
  kagawa:    { name: '香川地方協力本部',   tel: '087-823-9207', emblem: '香' },
  ehime:     { name: '愛媛地方協力本部',   tel: '089-941-8381', emblem: '媛' },
  kochi:     { name: '高知地方協力本部',   tel: '088-822-6128', emblem: '知' },
  // 中国
  tottori:   { name: '鳥取地方協力本部',   tel: '0857-22-3468', emblem: '鳥' },
  shimane:   { name: '島根地方協力本部',   tel: '0852-21-0935', emblem: '島' },
  okayama:   { name: '岡山地方協力本部',   tel: '086-224-3302', emblem: '岡' },
  hiroshima: { name: '広島地方協力本部',   tel: '082-221-5891', emblem: '広' },
  yamaguchi: { name: '山口地方協力本部',   tel: '083-922-5101', emblem: '口' },
  // 九州・沖縄
  fukuoka:   { name: '福岡地方協力本部',   tel: '092-781-9321', emblem: '福' },
  saga:      { name: '佐賀地方協力本部',   tel: '0952-32-4431', emblem: '佐' },
  nagasaki:  { name: '長崎地方協力本部',   tel: '095-823-7196', emblem: '崎' },
  kumamoto:  { name: '熊本地方協力本部',   tel: '096-297-2051', emblem: '熊' },
  oita:      { name: '大分地方協力本部',   tel: '097-536-6271', emblem: '分' },
  miyazaki:  { name: '宮崎地方協力本部',   tel: '0985-27-7191', emblem: '宮' },
  kagoshima: { name: '鹿児島地方協力本部', tel: '099-253-8920', emblem: '鹿' },
  okinawa:   { name: '沖縄地方協力本部',   tel: '098-863-3146', emblem: '沖' },
};

// ─── データ出典情報 ───────────────────────────────────────────
export const REGION_SOURCE = {
  // 北海道
  sapporo:   { name: '自衛隊札幌地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/sapporo/event.html' },
  asahikawa: { name: '自衛隊旭川地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/asahikawa/event.html' },
  obihiro:   { name: '自衛隊帯広地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/obihiro/topics_event.html' },
  hakodate:  { name: '自衛隊函館地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/hakodate/publicity/' },
  // 東北
  miyagi:    { name: '自衛隊宮城地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/miyagi/' },
  aomori:    { name: '自衛隊青森地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/aomori/' },
  iwate:     { name: '自衛隊岩手地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/iwate/event/index.html' },
  akita:     { name: '自衛隊秋田地方協力本部（Googleカレンダー）', url: 'https://www.mod.go.jp/pco/akita/asset/event/index.html' },
  yamagata:  { name: '自衛隊山形地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/yamagata/event/event.html' },
  fukushima: { name: '自衛隊福島地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/fukushima/pr/event.html' },
  // 関東
  kanagawa:  { name: '自衛隊神奈川地方協力本部ウェブサイト', url: 'https://www.mod.go.jp/pco/kanagawa/' },
  tokyo:     { name: '自衛隊東京地方協力本部ホームページ',   url: 'https://www.mod.go.jp/pco/tokyo/event2/' },
  saitama:   { name: '自衛隊埼玉地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/saitama/event/' },
  gunma:     { name: '自衛隊群馬地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/gunma/event.html' },
  tochigi:   { name: '自衛隊栃木地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/tochigi/' },
  ibaraki:   { name: '自衛隊茨城地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/ibaraki/event.html' },
  chiba:     { name: '自衛隊千葉地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/chiba/event.html' },
  // 中部
  niigata:   { name: '自衛隊新潟地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html' },
  toyama:    { name: '自衛隊富山地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html' },
  ishikawa:  { name: '自衛隊石川地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/ishikawa/event29/index.html' },
  fukui:     { name: '自衛隊福井地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html' },
  yamanashi: { name: '自衛隊山梨地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/yamanashi/event.html' },
  nagano:    { name: '自衛隊長野地方協力本部（Googleカレンダー）', url: 'https://www.mod.go.jp/pco/nagano/' },
  gifu:      { name: '自衛隊岐阜地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/gifu/event/event.html' },
  shizuoka:  { name: '自衛隊静岡地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/sizuoka/event/index.html' },
  aichi:     { name: '自衛隊愛知地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/aichi/calendar.html' },
  // 近畿
  mie:       { name: '自衛隊三重地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/mie/events-page/' },
  shiga:     { name: '自衛隊滋賀地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/shiga/event-briefing/' },
  kyoto:     { name: '自衛隊京都地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html' },
  osaka:     { name: '自衛隊大阪地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/osaka/experience/event.html' },
  hyogo:     { name: '自衛隊兵庫地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/hyogo/' },
  nara:      { name: '自衛隊奈良地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/nara/events/' },
  wakayama:  { name: '自衛隊和歌山地方協力本部ウェブサイト', url: 'https://www.mod.go.jp/pco/wakayama/category/event/' },
  // 四国
  tokushima: { name: '自衛隊徳島地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/tokushima/event.html' },
  kagawa:    { name: '自衛隊香川地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/kagawa/event.html' },
  ehime:     { name: '自衛隊愛媛地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/ehime/event.html' },
  kochi:     { name: '自衛隊高知地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/kochi/event_info.html' },
  // 中国
  tottori:   { name: '自衛隊鳥取地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/tottori/content/02-event/event.html' },
  shimane:   { name: '自衛隊島根地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/shimane/event/event.html' },
  okayama:   { name: '自衛隊岡山地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/okayama/iku/kohogyoumu.html' },
  hiroshima: { name: '自衛隊広島地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/hiroshima/events/' },
  yamaguchi: { name: '自衛隊山口地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/yamaguchi/event.html' },
  // 九州・沖縄
  fukuoka:   { name: '自衛隊福岡地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/fukuoka/event/index.html' },
  saga:      { name: '自衛隊佐賀地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/saga/event/index.html' },
  nagasaki:  { name: '自衛隊長崎地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/nagasaki/event/index.html' },
  kumamoto:  { name: '自衛隊熊本地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/kumamoto/event/index.html' },
  oita:      { name: '自衛隊大分地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/oita/03_event.html' },
  miyazaki:  { name: '自衛隊宮崎地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/miyazaki/event.html' },
  kagoshima: { name: '自衛隊鹿児島地方協力本部ウェブサイト', url: 'https://www.mod.go.jp/pco/kagoshima/event/index.html' },
  okinawa:   { name: '自衛隊沖縄地方協力本部ウェブサイト',   url: 'https://www.mod.go.jp/pco/okinawa/event.html' },
};
