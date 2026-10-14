'use strict';
// 駐屯地・基地の広さくらべ・滑走路の長さくらべ（イベント詳細の「会場の広さくらべ」）。
// 面積・長さは「だいたいの大きさ」をつかむための目安。測量した値ではなく、正確でない可能性がある。
//  - src: 'pub'  … 自治体の資料・報道で公表された面積（from に出どころ）
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
  { name: '千歳基地', pref: 'sapporo', branch: 'air', ha: 1060, src: 'pub', from: '乗りものニュース（2020年）' },
  { name: '横田基地', pref: 'tokyo', branch: 'air', ha: 663, src: 'osm' },
  { name: '厚木航空基地', pref: 'kanagawa', branch: 'navy', ha: 505.6, src: 'wiki' },
  { name: '東千歳駐屯地', pref: 'sapporo', branch: 'army', ha: 672, src: 'pub', from: '乗りものニュース（2020年）' },
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
  { name: '三沢基地', pref: 'aomori', branch: 'air', ha: 1600, src: 'pub', from: '横浜市会の視察報告（2025年）', note: '米軍と共同で使う基地全体の広さ' },
  { name: '岩国航空基地', pref: 'yamaguchi', branch: 'navy', ha: 565, src: 'pub', from: '乗りものニュース（2020年）', note: '自衛隊が使う区域（米軍との共同使用を含む）。飛行場全体は約793ha' },
  { name: '百里基地', pref: 'ibaraki', branch: 'air', ha: 457, src: 'pub', from: '乗りものニュース（2020年）' },
  { name: '芦屋基地', pref: 'fukuoka', branch: 'air', ha: 432, src: 'pub', from: '乗りものニュース（2020年）' },
  { name: '小松基地', pref: 'ishikawa', branch: 'air', ha: 392, src: 'pub', from: '石川県の資料（2012年）', note: '小松飛行場のうち防衛省が所管する部分' },
  { name: '防府北基地', pref: 'yamaguchi', branch: 'air', ha: 248, src: 'osm', note: '同じ敷地の防府分屯地を含む' },
  { name: '北宇都宮駐屯地', pref: 'tochigi', branch: 'army', ha: 91, src: 'osm', note: '宇都宮飛行場を含む' },
  { name: '富士駐屯地', pref: 'shizuoka', branch: 'army', ha: 82, src: 'osm' },
  { name: '滝ヶ原駐屯地', pref: 'shizuoka', branch: 'army', ha: 51, src: 'osm' },
  { name: '横須賀基地', pref: 'kanagawa', branch: 'navy', ha: 31, src: 'osm', note: '横須賀地方総監部（吉倉地区）の敷地のみ。船越などほかの地区は含まない' },
  { name: '市ヶ谷駐屯地', pref: 'tokyo', branch: 'army', ha: 23, src: 'osm', note: '防衛省 市ヶ谷地区の敷地' },
  { name: '板妻駐屯地', pref: 'shizuoka', branch: 'army', ha: 19, src: 'osm' },
  { name: '由良基地分遣隊', pref: 'wakayama', branch: 'navy', ha: 3, src: 'osm' },
];

/** 面積の求め方（画面の注釈） */
const AREA_METHOD = {
  pub: '自治体の資料・報道で公表された面積',
  wiki: 'Wikipedia に記載された面積',
  osm: '地図データ（© OpenStreetMap contributors）に描かれた敷地の範囲から計算した面積',
};

/**
 * 滑走路の長さ（m）。いちばん長い滑走路。Wikipedia の各基地の記事（航空路誌などの公表値）から（2026-10-14 取得）。
 * 地図データの線の長さは延長部分（オーバーラン）まで含むため使わない。分からない施設は載せない。
 */
const RUNWAYS = [
  { name: '横田基地', pref: 'tokyo', branch: 'air', m: 3353 },
  { name: '三沢基地', pref: 'aomori', branch: 'air', m: 3050 },
  { name: '千歳基地', pref: 'sapporo', branch: 'air', m: 3000 },
  { name: '那覇基地', pref: 'okinawa', branch: 'air', m: 3000, note: '那覇空港と共用' },
  { name: '小牧基地', pref: 'aichi', branch: 'air', m: 2740, note: '県営名古屋空港と共用' },
  { name: '岐阜基地', pref: 'gifu', branch: 'air', m: 2710 },
  { name: '松島基地', pref: 'miyagi', branch: 'air', m: 2701 },
  { name: '新田原基地', pref: 'miyazaki', branch: 'air', m: 2701 },
  { name: '百里基地', pref: 'ibaraki', branch: 'air', m: 2700, note: '茨城空港と共用' },
  { name: '小松基地', pref: 'ishikawa', branch: 'air', m: 2700, note: '小松空港と共用' },
  { name: '浜松基地', pref: 'shizuoka', branch: 'air', m: 2550 },
  { name: '徳島航空基地', pref: 'tokushima', branch: 'navy', m: 2500, note: '徳島空港と共用' },
  { name: '岩国航空基地', pref: 'yamaguchi', branch: 'navy', m: 2440 },
  { name: '厚木航空基地', pref: 'kanagawa', branch: 'navy', m: 2438 },
  { name: '築城基地', pref: 'fukuoka', branch: 'air', m: 2399 },
  { name: '下総航空基地', pref: 'chiba', branch: 'navy', m: 2250 },
  { name: '鹿屋航空基地', pref: 'kagoshima', branch: 'navy', m: 2250 },
  { name: '入間基地', pref: 'saitama', branch: 'air', m: 2000 },
  { name: '木更津駐屯地', pref: 'chiba', branch: 'army', m: 1830 },
  { name: '北宇都宮駐屯地', pref: 'tochigi', branch: 'army', m: 1700 },
  { name: '芦屋基地', pref: 'fukuoka', branch: 'air', m: 1640 },
  { name: '丘珠駐屯地', pref: 'sapporo', branch: 'army', m: 1500, note: '札幌飛行場（丘珠空港）と共用' },
  { name: '帯広駐屯地', pref: 'obihiro', branch: 'army', m: 1500 },
  { name: '防府北基地', pref: 'yamaguchi', branch: 'air', m: 1480 },
  { name: '霞目駐屯地', pref: 'miyagi', branch: 'army', m: 708 },
  { name: '目達原駐屯地', pref: 'saga', branch: 'army', m: 660 },
  { name: '八戸駐屯地', pref: 'aomori', branch: 'army', m: 640 },
  { name: '明野駐屯地', pref: 'mie', branch: 'army', m: 500 },
];

/** 長さの比較対象（m） */
const LENGTH_REFERENCES = [
  { id: 'tower', label: '東京タワー', m: 333, unit: '本', note: '高さ 333m' },
  { id: 'skytree', label: '東京スカイツリー', m: 634, unit: '本', note: '高さ 634m' },
  { id: 'whale', label: 'シロナガスクジラ', m: 25, unit: '頭', note: '体長 約25m（大きなもので30m前後）' },
  { id: 'car', label: '乗用車・タクシー', m: 4.7, unit: '台', note: '全長 約4.7m（普通車の上限の目安）' },
  { id: 'bus', label: '大型バス', m: 12, unit: '台', note: '全長 約12m（大型バスの上限の目安）' },
];

const BRANCH_LABEL = { army: '陸上自衛隊', navy: '海上自衛隊', air: '航空自衛隊' };

// 面積・滑走路のどちらかが分かる施設（長い名前から照合する＝「北宇都宮駐屯地」を「宇都宮駐屯地」と取り違えない）
const KNOWN = (() => {
  const m = new Map();
  for (const f of FACILITY_AREAS) m.set(f.name, { name: f.name, pref: f.pref, branch: f.branch, area: f, runway: null });
  for (const r of RUNWAYS) {
    const cur = m.get(r.name) || { name: r.name, pref: r.pref, branch: r.branch, area: null, runway: null };
    cur.runway = r; m.set(r.name, cur);
  }
  return [...m.values()];
})();
const BY_LENGTH = [...KNOWN].sort((a, b) => b.name.length - a.name.length);

/** イベントの会場（無ければタイトル）から施設を探す。{ name, branch, area|null, runway|null } または null */
function findFacility(ev) {
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

/** 面積が分かる施設だけ（従来の呼び方） */
function findFacilityArea(ev) {
  return findFacility(ev)?.area || null;
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

/** 長さ m を比較対象ごとの倍率にする */
function compareLength(m) {
  return LENGTH_REFERENCES.map(r => ({ ...r, ratio: m / r.m }));
}

/** 長さの倍率の文言（「約6本分」「約425台分」「約0.5本分」） */
function lengthRatioText(ratio, unit) {
  if (!(ratio > 0)) return '';
  const v = ratio >= 10 ? Math.round(ratio).toLocaleString('ja-JP') : Math.round(ratio * 10) / 10;
  return `約${v}${unit}分`;
}

/** m を表示用に */
function mText(m) {
  return `${Math.round(m).toLocaleString('ja-JP')}m`;
}

/** ha を表示用に（10ha 未満は小数1桁） */
function haText(ha) {
  return `約${ha >= 10 ? Math.round(ha).toLocaleString('ja-JP') : Math.round(ha * 10) / 10}ha`;
}

module.exports = {
  REFERENCES, FACILITY_AREAS, AREA_METHOD, RUNWAYS, LENGTH_REFERENCES, BRANCH_LABEL,
  findFacility, findFacilityArea, compareArea, ratioText, haText, compareLength, lengthRatioText, mText,
};
