// ─── プッシュ通知 (ntfy.sh) ──────────────────────────────────
export const NTFY_TOPIC = 'jsdf-chiiki-events-7928';
export const NTFY_URL   = `https://ntfy.sh/${NTFY_TOPIC}`;

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
  kanagawa: { name: '神奈川地方協力本部', tel: '045-662-9476', emblem: '神' },
  tokyo:    { name: '東京地方協力本部',   tel: '03-3268-3111', emblem: '東' },
  saitama:  { name: '埼玉地方協力本部',   tel: '048-831-6044', emblem: '埼' },
};

// ─── データ出典情報 ───────────────────────────────────────────
export const REGION_SOURCE = {
  kanagawa: {
    name: '自衛隊神奈川地方協力本部ウェブサイト',
    url:  'https://www.mod.go.jp/pco/kanagawa/',
  },
  tokyo: {
    name: '自衛隊東京地方協力本部ホームページ',
    url:  'https://www.mod.go.jp/pco/tokyo/event2/',
  },
  saitama: {
    name: '自衛隊埼玉地方協力本部ウェブサイト',
    url:  'https://www.mod.go.jp/pco/saitama/event/',
  },
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
