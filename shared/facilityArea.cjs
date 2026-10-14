'use strict';
// 駐屯地・基地の広さくらべ（イベント詳細の「会場の広さくらべ」）。
// 面積は「だいたいの広さ」をつかむための目安。実際の敷地の形・境界とは一致しない。
//  - src: 'wiki' … Wikipedia に出典付きで記載された面積
//  - src: 'osm'  … OpenStreetMap（© OpenStreetMap contributors・ODbL）の敷地の形から計算した面積
//    （2026-10-14 取得。公表値のある施設で突き合わせ、帯広 260→253ha・神町 170→169ha・那覇 212→211ha とほぼ一致）
// 地図データが敷地の一部しか表していないもの（駐機場だけ等）は載せない。分からない施設は表示しない（推測で埋めない）。
// 施設を足すときは name を src/data/jsdfFacilities.js の施設名（「陸上自衛隊」等を除いた部分）と揃える。

/** 比較対象（ha）。公表値・報道の値の目安 */
const REFERENCES = [
  { id: 'dome', label: '東京ドーム', short: 'ドーム', ha: 4.7, note: '建築面積 46,755㎡（東京ドーム公式）' },
  { id: 'tdl', label: '東京ディズニーランド', short: 'ランド', ha: 51, note: 'パーク面積 約51ha' },
  { id: 'tds', label: '東京ディズニーシー', short: 'シー', ha: 59, note: 'パーク面積 約59ha（ファンタジースプリングス開業後の目安）' },
  { id: 'tdr', label: '東京ディズニーリゾート', short: 'リゾート', ha: 201, note: '2つのパーク・ホテル・駐車場などを含む全体 約201ha' },
];

const FACILITY_AREAS = [
  { name: '千歳基地', pref: 'sapporo', branch: 'air', ha: 991, src: 'osm' },
  { name: '横田基地', pref: 'tokyo', branch: 'air', ha: 663, src: 'osm' },
  { name: '厚木航空基地', pref: 'kanagawa', branch: 'navy', ha: 505.6, src: 'wiki' },
  { name: '東千歳駐屯地', pref: 'sapporo', branch: 'army', ha: 442, src: 'osm' },
  { name: '鹿屋航空基地', pref: 'kagoshima', branch: 'navy', ha: 392, src: 'osm' },
  { name: '岐阜基地', pref: 'gifu', branch: 'air', ha: 387, src: 'osm' },
  { name: '松島基地', pref: 'miyagi', branch: 'air', ha: 377, src: 'osm' },
  { name: '八戸駐屯地', pref: 'aomori', branch: 'army', ha: 360, src: 'osm' },
  { name: '入間基地', pref: 'saitama', branch: 'air', ha: 300, src: 'wiki' },
  { name: '浜松基地', pref: 'shizuoka', branch: 'air', ha: 292, src: 'osm' },
  { name: '新田原基地', pref: 'miyazaki', branch: 'air', ha: 286, src: 'wiki' },
  { name: '下総航空基地', pref: 'chiba', branch: 'navy', ha: 271, src: 'osm' },
  { name: '帯広駐屯地', pref: 'obihiro', branch: 'army', ha: 260, src: 'wiki' },
  { name: '名寄駐屯地', pref: 'asahikawa', branch: 'army', ha: 254, src: 'osm' },
  { name: '築城基地', pref: 'fukuoka', branch: 'air', ha: 252, src: 'osm' },
  { name: '木更津駐屯地', pref: 'chiba', branch: 'army', ha: 220, src: 'osm' },
  { name: '那覇基地', pref: 'okinawa', branch: 'air', ha: 212, src: 'wiki' },
  { name: '三軒屋駐屯地', pref: 'okayama', branch: 'army', ha: 190, src: 'osm' },
  { name: '北千歳駐屯地', pref: 'sapporo', branch: 'army', ha: 174, src: 'osm' },
  { name: '神町駐屯地', pref: 'yamagata', branch: 'army', ha: 170, src: 'wiki' },
  { name: '小牧基地', pref: 'aichi', branch: 'air', ha: 137, src: 'osm' },
  { name: '旭川駐屯地', pref: 'asahikawa', branch: 'army', ha: 121, src: 'osm' },
  { name: '那覇駐屯地', pref: 'okinawa', branch: 'army', ha: 120, src: 'osm' },
  { name: '立川駐屯地', pref: 'tokyo', branch: 'army', ha: 110, src: 'osm' },
  { name: '朝霞駐屯地', pref: 'saitama', branch: 'army', ha: 93, src: 'osm' },
  { name: '相浦駐屯地', pref: 'nagasaki', branch: 'army', ha: 92.7, src: 'wiki' },
  { name: '武山駐屯地', pref: 'kanagawa', branch: 'army', ha: 92, src: 'osm' },
  { name: '宇都宮駐屯地', pref: 'tochigi', branch: 'army', ha: 83, src: 'osm' },
  { name: '仙台駐屯地', pref: 'miyagi', branch: 'army', ha: 72, src: 'osm' },
  { name: '多賀城駐屯地', pref: 'miyagi', branch: 'army', ha: 72, src: 'osm' },
  { name: '青野原駐屯地', pref: 'hyogo', branch: 'army', ha: 58, src: 'osm' },
  { name: '下志津駐屯地', pref: 'chiba', branch: 'army', ha: 57, src: 'osm' },
  { name: '明野駐屯地', pref: 'mie', branch: 'army', ha: 54, src: 'osm' },
  { name: '目達原駐屯地', pref: 'saga', branch: 'army', ha: 54, src: 'osm' },
  { name: '熊谷基地', pref: 'saitama', branch: 'air', ha: 53, src: 'osm' },
  { name: '古河駐屯地', pref: 'ibaraki', branch: 'army', ha: 49, src: 'osm' },
  { name: '大湊基地', pref: 'aomori', branch: 'navy', ha: 43, src: 'osm' },
  { name: '海田市駐屯地', pref: 'hiroshima', branch: 'army', ha: 43, src: 'osm' },
  { name: '土浦駐屯地', pref: 'ibaraki', branch: 'army', ha: 42, src: 'osm' },
  { name: '大久保駐屯地', pref: 'kyoto', branch: 'army', ha: 41, src: 'osm' },
  { name: '福島駐屯地', pref: 'fukushima', branch: 'army', ha: 39, src: 'osm' },
  { name: '豊川駐屯地', pref: 'aichi', branch: 'army', ha: 38, src: 'osm' },
  { name: '桂駐屯地', pref: 'kyoto', branch: 'army', ha: 38, src: 'osm' },
  { name: '久里浜駐屯地', pref: 'kanagawa', branch: 'army', ha: 37, src: 'osm' },
  { name: '別府駐屯地', pref: 'oita', branch: 'army', ha: 35, src: 'osm' },
  { name: '松戸駐屯地', pref: 'chiba', branch: 'army', ha: 35, src: 'osm' },
  { name: '秋田駐屯地', pref: 'akita', branch: 'army', ha: 33, src: 'osm' },
  { name: '松本駐屯地', pref: 'nagano', branch: 'army', ha: 33, src: 'osm' },
  { name: '福岡駐屯地', pref: 'fukuoka', branch: 'army', ha: 32, src: 'osm' },
  { name: '大村駐屯地', pref: 'nagasaki', branch: 'army', ha: 32, src: 'osm' },
  { name: '国分駐屯地', pref: 'kagoshima', branch: 'army', ha: 32, src: 'osm' },
  { name: '青森駐屯地', pref: 'aomori', branch: 'army', ha: 31, src: 'osm' },
  { name: '郡山駐屯地', pref: 'fukushima', branch: 'army', ha: 31, src: 'osm' },
  { name: '高知駐屯地', pref: 'kochi', branch: 'army', ha: 30, src: 'osm' },
  { name: '姫路駐屯地', pref: 'hyogo', branch: 'army', ha: 29, src: 'osm' },
  { name: '函館駐屯地', pref: 'hakodate', branch: 'army', ha: 28, src: 'osm' },
  { name: '弘前駐屯地', pref: 'aomori', branch: 'army', ha: 28, src: 'osm' },
  { name: '習志野駐屯地', pref: 'chiba', branch: 'army', ha: 27, src: 'osm' },
  { name: '相馬原駐屯地', pref: 'gunma', branch: 'army', ha: 27, src: 'osm' },
  { name: '春日基地', pref: 'fukuoka', branch: 'air', ha: 26, src: 'osm' },
  { name: '春日井駐屯地', pref: 'aichi', branch: 'army', ha: 25, src: 'osm' },
  { name: '川内駐屯地', pref: 'kagoshima', branch: 'army', ha: 25, src: 'osm' },
  { name: '練馬駐屯地', pref: 'tokyo', branch: 'army', ha: 22.4, src: 'wiki' },
  { name: '伊丹駐屯地', pref: 'hyogo', branch: 'army', ha: 22, src: 'osm' },
  { name: '新町駐屯地', pref: 'gunma', branch: 'army', ha: 21, src: 'osm' },
  { name: '勝田駐屯地', pref: 'ibaraki', branch: 'army', ha: 21, src: 'osm' },
  { name: '信太山駐屯地', pref: 'osaka', branch: 'army', ha: 20, src: 'osm' },
  { name: '米子駐屯地', pref: 'tottori', branch: 'army', ha: 20, src: 'osm' },
  { name: '北富士駐屯地', pref: 'yamanashi', branch: 'army', ha: 19, src: 'osm' },
  { name: '久留米駐屯地', pref: 'fukuoka', branch: 'army', ha: 19, src: 'osm' },
  { name: '府中基地', pref: 'tokyo', branch: 'air', ha: 18, src: 'osm' },
  { name: '高田駐屯地', pref: 'niigata', branch: 'army', ha: 18, src: 'osm' },
  { name: '川西駐屯地', pref: 'hyogo', branch: 'army', ha: 18, src: 'osm' },
  { name: '奈良基地', pref: 'nara', branch: 'air', ha: 17, src: 'osm' },
  { name: '大津駐屯地', pref: 'shiga', branch: 'army', ha: 16, src: 'osm' },
  { name: '出雲駐屯地', pref: 'shimane', branch: 'army', ha: 15, src: 'osm' },
  { name: '新発田駐屯地', pref: 'niigata', branch: 'army', ha: 14, src: 'osm' },
  { name: '舞鶴基地', pref: 'kyoto', branch: 'navy', ha: 14, src: 'osm' },
  { name: '福知山駐屯地', pref: 'kyoto', branch: 'army', ha: 14, src: 'osm' },
  { name: '呉基地', pref: 'hiroshima', branch: 'navy', ha: 13, src: 'osm' },
  { name: '都城駐屯地', pref: 'miyazaki', branch: 'army', ha: 13, src: 'osm' },
  { name: '山口駐屯地', pref: 'yamaguchi', branch: 'army', ha: 13, src: 'osm' },
  { name: '丘珠駐屯地', pref: 'sapporo', branch: 'army', ha: 12, src: 'osm' },
  { name: '十条駐屯地', pref: 'tokyo', branch: 'army', ha: 11, src: 'osm' },
  { name: '守山駐屯地', pref: 'aichi', branch: 'army', ha: 11, src: 'osm' },
  { name: '北熊本駐屯地', pref: 'kumamoto', branch: 'army', ha: 7, src: 'osm' },
  { name: '霞目駐屯地', pref: 'miyagi', branch: 'army', ha: 7, src: 'osm' },
  { name: '鯖江駐屯地', pref: 'fukui', branch: 'army', ha: 3, src: 'osm' },
  { name: '阪神基地隊', pref: 'hyogo', branch: 'navy', ha: 3, src: 'osm' },
];

const BRANCH_LABEL = { army: '陸上自衛隊', navy: '海上自衛隊', air: '航空自衛隊' };

// 長い名前から照合する（「北宇都宮駐屯地」を「宇都宮駐屯地」と取り違えない）
const BY_LENGTH = [...FACILITY_AREAS].sort((a, b) => b.name.length - a.name.length);

/** イベントの会場（無ければタイトル）から施設を探す。見つからなければ null */
function findFacilityArea(ev) {
  if (!ev) return null;
  for (const field of [ev.place, ev.title]) {
    const t = String(field || '').replace(/\s+/g, '').replace(/ケ/g, 'ヶ');
    if (!t) continue;
    for (const f of BY_LENGTH) {
      const i = t.indexOf(f.name);
      if (i < 0) continue;
      // 「北宇都宮駐屯地」の中の「宇都宮駐屯地」のように、直前に地名の続きがある場合は別の施設
      const before = t.slice(0, i);
      if (/[一-龥ぁ-んァ-ヶ]$/.test(before) && !/(自衛隊|空自|陸自|海自|航空|海上|陸上|・|　)$/.test(before)) continue;
      return f;
    }
    // 「入間航空祭」のように、会場名が無く基地名の代わりに航空祭の名前だけがあるとき
    for (const f of BY_LENGTH) {
      const stem = f.name.replace(/(航空)?基地$/, '');
      if (stem !== f.name && t.includes(`${stem}航空祭`)) return f;
    }
  }
  return null;
}

/** 面積 ha を比較対象ごとの倍率にする */
function compareArea(ha) {
  return REFERENCES.map(r => ({ ...r, ratio: ha / r.ha }));
}

/** 倍率の読み上げ用の文言（「約64個分」「約0.6倍」） */
function ratioText(ratio) {
  if (!(ratio > 0)) return '';
  if (ratio >= 1) return `約${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}個分`;
  return `約${Math.max(0.1, Math.round(ratio * 10) / 10)}倍`;
}

/** ha を表示用に（10ha 未満は小数1桁） */
function haText(ha) {
  return `約${ha >= 10 ? Math.round(ha).toLocaleString('ja-JP') : Math.round(ha * 10) / 10}ha`;
}

module.exports = { REFERENCES, FACILITY_AREAS, BRANCH_LABEL, findFacilityArea, compareArea, ratioText, haText };
