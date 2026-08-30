/**
 * 全国の主要な自衛隊施設（駐屯地・基地）— 会場名/住所の入力支援プルダウン用。
 * { pref, name, address, branch }  branch: 'army'|'navy'|'air'
 * ※ 主要施設の一覧。網羅ではなく順次追加可能（自由入力も併用）。
 * 住所は市区町村レベル中心（会場補助が目的）。
 */
export const JSDF_FACILITIES = [
  // 北海道
  { pref: 'sapporo', name: '陸上自衛隊 丘珠駐屯地', address: '北海道札幌市東区丘珠町', branch: 'army' },
  { pref: 'sapporo', name: '陸上自衛隊 真駒内駐屯地', address: '北海道札幌市南区真駒内', branch: 'army' },
  { pref: 'sapporo', name: '航空自衛隊 千歳基地', address: '北海道千歳市平和', branch: 'air' },
  { pref: 'asahikawa', name: '陸上自衛隊 旭川駐屯地', address: '北海道旭川市春光町', branch: 'army' },
  { pref: 'asahikawa', name: '陸上自衛隊 名寄駐屯地', address: '北海道名寄市内淵', branch: 'army' },
  { pref: 'obihiro', name: '陸上自衛隊 帯広駐屯地', address: '北海道帯広市西', branch: 'army' },
  { pref: 'hakodate', name: '陸上自衛隊 函館駐屯地', address: '北海道函館市広野町', branch: 'army' },
  { pref: 'hakodate', name: '海上自衛隊 函館基地', address: '北海道函館市大町', branch: 'navy' },

  // 東北
  { pref: 'aomori', name: '航空自衛隊 三沢基地', address: '青森県三沢市', branch: 'air' },
  { pref: 'aomori', name: '海上自衛隊 大湊基地', address: '青森県むつ市大湊', branch: 'navy' },
  { pref: 'aomori', name: '陸上自衛隊 青森駐屯地', address: '青森県青森市浪館', branch: 'army' },
  { pref: 'aomori', name: '陸上自衛隊 八戸駐屯地', address: '青森県八戸市', branch: 'army' },
  { pref: 'iwate', name: '陸上自衛隊 岩手駐屯地', address: '岩手県滝沢市後', branch: 'army' },
  { pref: 'miyagi', name: '陸上自衛隊 仙台駐屯地', address: '宮城県仙台市宮城野区南目館', branch: 'army' },
  { pref: 'miyagi', name: '航空自衛隊 松島基地', address: '宮城県東松島市矢本', branch: 'air' },
  { pref: 'akita', name: '陸上自衛隊 秋田駐屯地', address: '秋田県秋田市寺内', branch: 'army' },
  { pref: 'yamagata', name: '陸上自衛隊 神町駐屯地', address: '山形県東根市神町', branch: 'army' },
  { pref: 'fukushima', name: '陸上自衛隊 福島駐屯地', address: '福島県福島市荒井', branch: 'army' },

  // 関東
  { pref: 'tokyo', name: '陸上自衛隊 市ヶ谷駐屯地', address: '東京都新宿区市谷本村町', branch: 'army' },
  { pref: 'tokyo', name: '陸上自衛隊 練馬駐屯地', address: '東京都練馬区北町', branch: 'army' },
  { pref: 'tokyo', name: '航空自衛隊 横田基地', address: '東京都福生市', branch: 'air' },
  { pref: 'saitama', name: '陸上自衛隊 朝霞駐屯地', address: '埼玉県朝霞市', branch: 'army' },
  { pref: 'saitama', name: '陸上自衛隊 大宮駐屯地', address: '埼玉県さいたま市北区', branch: 'army' },
  { pref: 'saitama', name: '航空自衛隊 入間基地', address: '埼玉県狭山市', branch: 'air' },
  { pref: 'chiba', name: '陸上自衛隊 習志野駐屯地', address: '千葉県船橋市薬円台', branch: 'army' },
  { pref: 'chiba', name: '陸上自衛隊 木更津駐屯地', address: '千葉県木更津市', branch: 'army' },
  { pref: 'chiba', name: '海上自衛隊 下総航空基地', address: '千葉県柏市', branch: 'navy' },
  { pref: 'kanagawa', name: '海上自衛隊 横須賀基地', address: '神奈川県横須賀市西逸見町', branch: 'navy' },
  { pref: 'kanagawa', name: '陸上自衛隊 武山駐屯地', address: '神奈川県横須賀市御幸浜', branch: 'army' },
  { pref: 'kanagawa', name: '陸上自衛隊 座間駐屯地', address: '神奈川県座間市', branch: 'army' },
  { pref: 'ibaraki', name: '陸上自衛隊 土浦駐屯地（武器学校）', address: '茨城県稲敷郡阿見町', branch: 'army' },
  { pref: 'ibaraki', name: '航空自衛隊 百里基地', address: '茨城県小美玉市', branch: 'air' },
  { pref: 'tochigi', name: '陸上自衛隊 宇都宮駐屯地', address: '栃木県宇都宮市茂原', branch: 'army' },
  { pref: 'gunma', name: '陸上自衛隊 相馬原駐屯地', address: '群馬県北群馬郡榛東村', branch: 'army' },

  // 中部
  { pref: 'niigata', name: '陸上自衛隊 新発田駐屯地', address: '新潟県新発田市大手町', branch: 'army' },
  { pref: 'toyama', name: '陸上自衛隊 富山駐屯地', address: '富山県富山市', branch: 'army' },
  { pref: 'ishikawa', name: '航空自衛隊 小松基地', address: '石川県小松市', branch: 'air' },
  { pref: 'ishikawa', name: '陸上自衛隊 金沢駐屯地', address: '石川県金沢市野田町', branch: 'army' },
  { pref: 'fukui', name: '陸上自衛隊 鯖江駐屯地', address: '福井県鯖江市', branch: 'army' },
  { pref: 'yamanashi', name: '陸上自衛隊 北富士駐屯地', address: '山梨県富士吉田市', branch: 'army' },
  { pref: 'nagano', name: '陸上自衛隊 松本駐屯地', address: '長野県松本市', branch: 'army' },
  { pref: 'gifu', name: '航空自衛隊 岐阜基地', address: '岐阜県各務原市', branch: 'air' },
  { pref: 'gifu', name: '陸上自衛隊 守山駐屯地', address: '愛知県名古屋市守山区', branch: 'army' },
  { pref: 'shizuoka', name: '陸上自衛隊 富士駐屯地', address: '静岡県駿東郡小山町', branch: 'army' },
  { pref: 'shizuoka', name: '陸上自衛隊 板妻駐屯地', address: '静岡県御殿場市', branch: 'army' },
  { pref: 'aichi', name: '航空自衛隊 小牧基地', address: '愛知県小牧市', branch: 'air' },
  { pref: 'aichi', name: '陸上自衛隊 豊川駐屯地', address: '愛知県豊川市', branch: 'army' },

  // 近畿
  { pref: 'mie', name: '陸上自衛隊 久居駐屯地', address: '三重県津市久居', branch: 'army' },
  { pref: 'mie', name: '海上自衛隊 鳥羽（航空基地）', address: '三重県', branch: 'navy' },
  { pref: 'shiga', name: '陸上自衛隊 大津駐屯地', address: '滋賀県大津市', branch: 'army' },
  { pref: 'shiga', name: '陸上自衛隊 今津駐屯地', address: '滋賀県高島市今津町', branch: 'army' },
  { pref: 'kyoto', name: '海上自衛隊 舞鶴基地', address: '京都府舞鶴市', branch: 'navy' },
  { pref: 'kyoto', name: '陸上自衛隊 福知山駐屯地', address: '京都府福知山市', branch: 'army' },
  { pref: 'osaka', name: '陸上自衛隊 信太山駐屯地', address: '大阪府和泉市', branch: 'army' },
  { pref: 'osaka', name: '海上自衛隊 阪神基地隊', address: '兵庫県神戸市東灘区', branch: 'navy' },
  { pref: 'hyogo', name: '陸上自衛隊 姫路駐屯地', address: '兵庫県姫路市峰南町', branch: 'army' },
  { pref: 'hyogo', name: '陸上自衛隊 伊丹駐屯地', address: '兵庫県伊丹市', branch: 'army' },
  { pref: 'nara', name: '航空自衛隊 奈良基地', address: '奈良県奈良市', branch: 'air' },
  { pref: 'wakayama', name: '海上自衛隊 和歌山（基地分遣隊）', address: '和歌山県', branch: 'navy' },

  // 中国
  { pref: 'tottori', name: '陸上自衛隊 米子駐屯地', address: '鳥取県米子市', branch: 'army' },
  { pref: 'shimane', name: '陸上自衛隊 出雲駐屯地', address: '島根県出雲市', branch: 'army' },
  { pref: 'okayama', name: '陸上自衛隊 三軒屋駐屯地', address: '岡山県岡山市中区', branch: 'army' },
  { pref: 'okayama', name: '陸上自衛隊 日本原駐屯地', address: '岡山県勝田郡奈義町', branch: 'army' },
  { pref: 'hiroshima', name: '海上自衛隊 呉基地', address: '広島県呉市幸町', branch: 'navy' },
  { pref: 'hiroshima', name: '陸上自衛隊 海田市駐屯地', address: '広島県安芸郡海田町', branch: 'army' },
  { pref: 'yamaguchi', name: '海上自衛隊 岩国航空基地', address: '山口県岩国市', branch: 'navy' },
  { pref: 'yamaguchi', name: '航空自衛隊 防府北基地', address: '山口県防府市', branch: 'air' },

  // 四国
  { pref: 'tokushima', name: '海上自衛隊 徳島航空基地', address: '徳島県板野郡松茂町', branch: 'navy' },
  { pref: 'kagawa', name: '陸上自衛隊 善通寺駐屯地', address: '香川県善通寺市', branch: 'army' },
  { pref: 'ehime', name: '陸上自衛隊 松山駐屯地', address: '愛媛県松山市', branch: 'army' },
  { pref: 'kochi', name: '陸上自衛隊 高知駐屯地', address: '高知県香南市', branch: 'army' },

  // 九州・沖縄
  { pref: 'fukuoka', name: '航空自衛隊 春日基地', address: '福岡県春日市', branch: 'air' },
  { pref: 'fukuoka', name: '陸上自衛隊 福岡駐屯地', address: '福岡県春日市', branch: 'army' },
  { pref: 'fukuoka', name: '航空自衛隊 築城基地', address: '福岡県築上郡築上町', branch: 'air' },
  { pref: 'saga', name: '陸上自衛隊 目達原駐屯地', address: '佐賀県神埼郡吉野ヶ里町', branch: 'army' },
  { pref: 'nagasaki', name: '海上自衛隊 佐世保基地', address: '長崎県佐世保市平瀬町', branch: 'navy' },
  { pref: 'nagasaki', name: '陸上自衛隊 大村駐屯地', address: '長崎県大村市', branch: 'army' },
  { pref: 'kumamoto', name: '陸上自衛隊 健軍駐屯地', address: '熊本県熊本市東区', branch: 'army' },
  { pref: 'kumamoto', name: '陸上自衛隊 北熊本駐屯地', address: '熊本県熊本市北区', branch: 'army' },
  { pref: 'oita', name: '陸上自衛隊 別府駐屯地', address: '大分県別府市', branch: 'army' },
  { pref: 'oita', name: '航空自衛隊 築城（分屯）/ 日出生台演習場', address: '大分県', branch: 'army' },
  { pref: 'miyazaki', name: '航空自衛隊 新田原基地', address: '宮崎県児湯郡新富町', branch: 'air' },
  { pref: 'miyazaki', name: '陸上自衛隊 都城駐屯地', address: '宮崎県都城市', branch: 'army' },
  { pref: 'kagoshima', name: '海上自衛隊 鹿屋航空基地', address: '鹿児島県鹿屋市', branch: 'navy' },
  { pref: 'kagoshima', name: '陸上自衛隊 国分駐屯地', address: '鹿児島県霧島市', branch: 'army' },
  { pref: 'okinawa', name: '航空自衛隊 那覇基地', address: '沖縄県那覇市', branch: 'air' },
  { pref: 'okinawa', name: '陸上自衛隊 那覇駐屯地', address: '沖縄県那覇市', branch: 'army' },
];

/** 指定地本（pref）の施設一覧 */
export function facilitiesForPref(pref) {
  return JSDF_FACILITIES.filter(f => f.pref === pref);
}

// 年齢・対象の定型候補（ageRequirement に保存）
export const AGE_OPTIONS = [
  '', '18歳以上33歳未満', '18歳以上33歳未満（採用対象）', '高校生以上', '中学生以上',
  '小学生以上', '15歳以上17歳未満（高等工科学校）', '一般（どなたでも）', 'ご家族向け',
];
