// ─── プッシュ通知 (ntfy.sh) ──────────────────────────────────
// トピック名は環境変数で管理（.env.local または Vercel 環境変数 VITE_NTFY_TOPIC）
export const NTFY_TOPIC = import.meta.env.VITE_NTFY_TOPIC ?? '';
export const NTFY_URL   = NTFY_TOPIC ? `https://ntfy.sh/${NTFY_TOPIC}` : '';

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
  sapporo:   { name: '自衛隊札幌地方協力本部',   tel: '011-631-5471', emblem: '札' },
  asahikawa: { name: '自衛隊旭川地方協力本部',   tel: '0166-51-7330', emblem: '旭' },
  obihiro:   { name: '自衛隊帯広地方協力本部',   tel: '0155-23-2485', emblem: '帯' },
  hakodate:  { name: '自衛隊函館地方協力本部',   tel: '0138-53-6241', emblem: '函' },
  // 東北
  miyagi:    { name: '自衛隊宮城地方協力本部',   tel: '022-295-2612', emblem: '宮' },
  aomori:    { name: '自衛隊青森地方協力本部',   tel: '017-777-7917', emblem: '青' },
  iwate:     { name: '自衛隊岩手地方協力本部',   tel: '019-651-3351', emblem: '岩' },
  akita:     { name: '自衛隊秋田地方協力本部',   tel: '018-823-1451', emblem: '秋' },
  yamagata:  { name: '自衛隊山形地方協力本部',   tel: '023-622-7314', emblem: '形' },
  fukushima: { name: '自衛隊福島地方協力本部',   tel: '024-531-2351', emblem: '福' },
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

// ─── フォールバック用モックデータ ────────────────────────────
// GAS URL 未設定時・オフライン時に表示する。
export const MOCK_EVENTS = {
  kanagawa: [
    { id: 'k-01', date: '2026-04-25', weekday: '土', title: '自衛官候補生 募集説明会', place: '横浜地域事務所', address: '横浜市中区山下町1-2', time: '13:30 – 15:30', category: '説明会', tag: '要予約', url: '', notes: '参加には事前予約が必要です。お電話またはウェブフォームよりお申し込みください。定員になり次第締め切ります。' },
    { id: 'k-02', date: '2026-04-29', weekday: '水・祝', title: '横須賀地方総監部 一般公開', place: '海上自衛隊 横須賀基地', address: '横須賀市西逸見町1丁目', time: '09:00 – 16:00', category: '一般公開', tag: '入場無料', url: '', notes: '基地内への入場には本人確認書類が必要です。車でのご来場はご遠慮ください。最寄り駅からシャトルバスを運行予定。' },
    { id: 'k-03', date: '2026-05-05', weekday: '火・祝', title: '子ども自衛隊体験デー', place: '陸上自衛隊 武山駐屯地', address: '横須賀市御幸浜1-1', time: '10:00 – 15:00', category: '体験', tag: '家族向け', url: '', notes: '小学生以下のお子様は保護者同伴でご参加ください。動きやすい服装・靴でお越しください。雨天の場合は一部プログラムが変更になる場合があります。' },
    { id: 'k-04', date: '2026-05-17', weekday: '日', title: '相模原補給廠 業務説明会', place: '相模原市民会館 2F 会議室', address: '相模原市中央区中央3-13-15', time: '14:00 – 16:00', category: '説明会', tag: '学生歓迎', url: '', notes: null },
    { id: 'k-05', date: '2026-05-23', weekday: '土', title: '厚木航空基地 フライトフェスタ', place: '海上自衛隊 厚木航空基地', address: '綾瀬市本蓼川3300', time: '09:30 – 15:00', category: '一般公開', tag: '駐車場なし', url: '', notes: '駐車場がありません。公共交通機関でお越しください。最寄りバス停「厚木基地前」下車徒歩3分。' },
    { id: 'k-06', date: '2026-06-07', weekday: '日', title: '女性自衛官 キャリア座談会', place: 'オンライン（Zoom）', address: '事前登録制', time: '19:00 – 20:30', category: '座談会', tag: 'オンライン', url: '', notes: '参加用のZoom URLは事前登録メールにてお送りします。顔出し任意。録画・録音はご遠慮ください。' },
  ],
  tokyo: [
    { id: 't-01', date: '2026-04-26', weekday: '日', title: '自衛官候補生 採用試験説明会', place: '市ヶ谷駐屯地 厚生センター', address: '新宿区市谷本村町5-1', time: '10:00 – 12:00', category: '説明会', tag: '要予約', url: '', notes: '事前予約制です。当日のキャンセルはお電話にてご連絡ください。' },
    { id: 't-02', date: '2026-05-02', weekday: '土', title: '練馬駐屯地 創立記念行事', place: '陸上自衛隊 練馬駐屯地', address: '練馬区北町4-1-1', time: '09:00 – 15:00', category: '記念行事', tag: '入場無料', url: '', notes: null },
    { id: 't-03', date: '2026-05-10', weekday: '日', title: '防衛医科大学校 オープンキャンパス', place: '防衛医科大学校 本館', address: '所沢市並木3-2', time: '10:00 – 16:00', category: '学校説明', tag: '高校生向け', url: '', notes: '保護者の方も同伴参加いただけます。学生証または生徒手帳をお持ちください。個別相談コーナーも設置予定です。' },
    { id: 't-04', date: '2026-05-16', weekday: '土', title: '技術・語学系採用 個別相談会', place: '東京地方協力本部 本部庁舎', address: '新宿区市谷本村町5-1', time: '13:00 – 17:00', category: '相談会', tag: '個別', url: '', notes: '完全予約制・1組30分。履歴書・職務経歴書等をお持ちください（任意）。' },
    { id: 't-05', date: '2026-05-30', weekday: '土', title: '海上自衛隊東京音楽隊 演奏会', place: '東京オペラシティ コンサートホール', address: '新宿区西新宿3-20-2', time: '18:30 開演', category: 'イベント', tag: '抽選', url: '', notes: '入場は抽選制です。公式サイトからハガキまたはウェブフォームにてお申し込みください。当選者には招待状を郵送します。' },
    { id: 't-06', date: '2026-06-14', weekday: '日', title: '元自衛官 キャリア交流会', place: '都庁前 サテライト会場', address: '新宿区西新宿2-8-1', time: '14:00 – 16:30', category: '交流会', tag: 'OB・OG', url: '', notes: null },
  ],
  updatedAt: null,
};

// ─── GAS が返す JSON スキーマ例（GAS 実装時に参照）──────────
// {
//   "kanagawa": [{ id, date, weekday, title, place, address, time, category, tag, url }, ...],
//   "tokyo":    [{ ... }, ...],
//   "updatedAt": "2026/04/20 09:00"
// }
