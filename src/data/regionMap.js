'use strict';

// ─── 地域・都道府県マッピング ────────────────────────────────────
// events.json のキーは都道府県IDと一致する（kanagawa, tokyo, ...）

/** 対応済み都道府県 — events.json に実データが存在するもの */
export const SUPPORTED_PREFECTURES = new Set([
  // 北海道
  'sapporo', 'asahikawa', 'obihiro', 'hakodate',
  // 東北
  'miyagi', 'aomori', 'iwate', 'yamagata', 'fukushima', 'akita',
  // 関東
  'kanagawa', 'tokyo', 'saitama', 'gunma', 'tochigi', 'ibaraki', 'chiba',
  // 中部
  'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu', 'shizuoka', 'aichi',
  // 近畿
  'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama',
  // 四国
  'tokushima', 'kagawa', 'ehime', 'kochi',
  // 中国
  'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi',
  // 九州・沖縄
  'fukuoka', 'saga', 'nagasaki', 'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa',
]);

/** 都道府県個別情報 */
export const PREFECTURE_INFO = {
  // 北海道
  sapporo:   { label: '札幌',   emblem: '札', region: 'hokkaido' },
  asahikawa: { label: '旭川',   emblem: '旭', region: 'hokkaido' },
  obihiro:   { label: '帯広',   emblem: '帯', region: 'hokkaido' },
  hakodate:  { label: '函館',   emblem: '函', region: 'hokkaido' },
  // 東北
  aomori:    { label: '青森',   emblem: '青', region: 'tohoku' },
  iwate:     { label: '岩手',   emblem: '岩', region: 'tohoku' },
  miyagi:    { label: '宮城',   emblem: '城', region: 'tohoku' },
  akita:     { label: '秋田',   emblem: '秋', region: 'tohoku' },
  yamagata:  { label: '山形',   emblem: '形', region: 'tohoku' },
  fukushima: { label: '福島',   emblem: '福', region: 'tohoku' },
  // 関東
  kanagawa:  { label: '神奈川', emblem: '神', region: 'kanto' },
  tokyo:     { label: '東京',   emblem: '東', region: 'kanto' },
  saitama:   { label: '埼玉',   emblem: '埼', region: 'kanto' },
  gunma:     { label: '群馬',   emblem: '群', region: 'kanto' },
  tochigi:   { label: '栃木',   emblem: '栃', region: 'kanto' },
  ibaraki:   { label: '茨城',   emblem: '茨', region: 'kanto' },
  chiba:     { label: '千葉',   emblem: '千', region: 'kanto' },
  // 中部
  niigata:   { label: '新潟',   emblem: '新', region: 'chubu' },
  toyama:    { label: '富山',   emblem: '富', region: 'chubu' },
  ishikawa:  { label: '石川',   emblem: '石', region: 'chubu' },
  fukui:     { label: '福井',   emblem: '井', region: 'chubu' },
  yamanashi: { label: '山梨',   emblem: '梨', region: 'chubu' },
  nagano:    { label: '長野',   emblem: '野', region: 'chubu' },
  gifu:      { label: '岐阜',   emblem: '岐', region: 'chubu' },
  shizuoka:  { label: '静岡',   emblem: '静', region: 'chubu' },
  aichi:     { label: '愛知',   emblem: '知', region: 'chubu' },
  // 近畿
  mie:       { label: '三重',   emblem: '三', region: 'kinki' },
  shiga:     { label: '滋賀',   emblem: '滋', region: 'kinki' },
  kyoto:     { label: '京都',   emblem: '京', region: 'kinki' },
  osaka:     { label: '大阪',   emblem: '阪', region: 'kinki' },
  hyogo:     { label: '兵庫',   emblem: '兵', region: 'kinki' },
  nara:      { label: '奈良',   emblem: '奈', region: 'kinki' },
  wakayama:  { label: '和歌山', emblem: '和', region: 'kinki' },
  // 四国
  tokushima: { label: '徳島',   emblem: '徳', region: 'shikoku' },
  kagawa:    { label: '香川',   emblem: '香', region: 'shikoku' },
  ehime:     { label: '愛媛',   emblem: '媛', region: 'shikoku' },
  kochi:     { label: '高知',   emblem: '高', region: 'shikoku' },
  // 中国
  tottori:   { label: '鳥取',   emblem: '鳥', region: 'chugoku' },
  shimane:   { label: '島根',   emblem: '島', region: 'chugoku' },
  okayama:   { label: '岡山',   emblem: '山', region: 'chugoku' },
  hiroshima: { label: '広島',   emblem: '広', region: 'chugoku' },
  yamaguchi: { label: '山口',   emblem: '口', region: 'chugoku' },
  // 九州・沖縄
  fukuoka:   { label: '福岡',   emblem: '岡', region: 'kyushu' },
  saga:      { label: '佐賀',   emblem: '佐', region: 'kyushu' },
  nagasaki:  { label: '長崎',   emblem: '長', region: 'kyushu' },
  kumamoto:  { label: '熊本',   emblem: '熊', region: 'kyushu' },
  oita:      { label: '大分',   emblem: '分', region: 'kyushu' },
  miyazaki:  { label: '宮崎',   emblem: '宮', region: 'kyushu' },
  kagoshima: { label: '鹿児島', emblem: '鹿', region: 'kyushu' },
  okinawa:   { label: '沖縄',   emblem: '沖', region: 'kyushu' },
};

/** 都道府県ID → 地域ID の逆引きマップ */
export const PREFECTURE_TO_REGION = Object.fromEntries(
  Object.entries(PREFECTURE_INFO).map(([id, v]) => [id, v.region])
);

/**
 * 地本キーの隣接（地理的に隣り合う地本）マップ。
 * 0件の地本を選んだとき「隣の◯◯で開催予定」と近隣を案内するために使う（フィードバック§2-2-4）。
 * 北海道は4地本に分割されているため道内＋函館〜青森（津軽海峡）で接続する。
 */
export const NEIGHBORS = {
  // 北海道（道内の地本間 + 函館〜青森）
  sapporo:   ['asahikawa', 'obihiro', 'hakodate'],
  asahikawa: ['sapporo', 'obihiro'],
  obihiro:   ['sapporo', 'asahikawa', 'hakodate'],
  hakodate:  ['sapporo', 'obihiro', 'aomori'],
  // 東北
  aomori:    ['akita', 'iwate', 'hakodate'],
  iwate:     ['aomori', 'akita', 'miyagi'],
  miyagi:    ['iwate', 'akita', 'yamagata', 'fukushima'],
  akita:     ['aomori', 'iwate', 'yamagata'],
  yamagata:  ['akita', 'miyagi', 'fukushima', 'niigata'],
  fukushima: ['miyagi', 'yamagata', 'niigata', 'gunma', 'tochigi', 'ibaraki'],
  // 関東
  ibaraki:   ['fukushima', 'tochigi', 'saitama', 'chiba'],
  tochigi:   ['fukushima', 'ibaraki', 'gunma', 'saitama'],
  gunma:     ['fukushima', 'tochigi', 'saitama', 'niigata', 'nagano'],
  saitama:   ['gunma', 'tochigi', 'ibaraki', 'chiba', 'tokyo', 'yamanashi', 'nagano'],
  chiba:     ['ibaraki', 'saitama', 'tokyo'],
  tokyo:     ['saitama', 'chiba', 'kanagawa', 'yamanashi'],
  kanagawa:  ['tokyo', 'yamanashi', 'shizuoka'],
  // 中部
  niigata:   ['yamagata', 'fukushima', 'gunma', 'nagano', 'toyama'],
  toyama:    ['niigata', 'nagano', 'gifu', 'ishikawa'],
  ishikawa:  ['toyama', 'gifu', 'fukui'],
  fukui:     ['ishikawa', 'gifu', 'shiga', 'kyoto'],
  yamanashi: ['saitama', 'tokyo', 'kanagawa', 'shizuoka', 'nagano'],
  nagano:    ['niigata', 'gunma', 'saitama', 'yamanashi', 'shizuoka', 'aichi', 'gifu', 'toyama'],
  gifu:      ['toyama', 'ishikawa', 'fukui', 'nagano', 'aichi', 'mie', 'shiga'],
  shizuoka:  ['kanagawa', 'yamanashi', 'nagano', 'aichi'],
  aichi:     ['nagano', 'gifu', 'shizuoka', 'mie'],
  // 近畿
  mie:       ['gifu', 'aichi', 'shiga', 'kyoto', 'nara', 'wakayama'],
  shiga:     ['fukui', 'gifu', 'mie', 'kyoto'],
  kyoto:     ['fukui', 'shiga', 'mie', 'nara', 'osaka', 'hyogo'],
  osaka:     ['kyoto', 'nara', 'wakayama', 'hyogo'],
  hyogo:     ['kyoto', 'osaka', 'tottori', 'okayama'],
  nara:      ['kyoto', 'mie', 'osaka', 'wakayama'],
  wakayama:  ['mie', 'osaka', 'nara'],
  // 中国
  tottori:   ['hyogo', 'okayama', 'shimane'],
  shimane:   ['tottori', 'hiroshima', 'yamaguchi'],
  okayama:   ['hyogo', 'tottori', 'hiroshima', 'kagawa'],
  hiroshima: ['okayama', 'shimane', 'yamaguchi', 'ehime'],
  yamaguchi: ['shimane', 'hiroshima', 'fukuoka'],
  // 四国
  tokushima: ['kagawa', 'ehime', 'kochi'],
  kagawa:    ['tokushima', 'ehime', 'okayama'],
  ehime:     ['kagawa', 'tokushima', 'kochi', 'hiroshima', 'oita'],
  kochi:     ['tokushima', 'ehime'],
  // 九州・沖縄
  fukuoka:   ['yamaguchi', 'saga', 'oita', 'kumamoto'],
  saga:      ['fukuoka', 'nagasaki'],
  nagasaki:  ['saga', 'kumamoto'],
  kumamoto:  ['fukuoka', 'saga', 'nagasaki', 'oita', 'miyazaki', 'kagoshima'],
  oita:      ['fukuoka', 'kumamoto', 'miyazaki', 'ehime'],
  miyazaki:  ['kumamoto', 'oita', 'kagoshima'],
  kagoshima: ['kumamoto', 'miyazaki', 'okinawa'],
  okinawa:   ['kagoshima'],
};

/** 8地域の定義 */
export const REGIONS = [
  {
    id: 'hokkaido',
    label: '北海道',
    prefectures: [
      { id: 'sapporo',   label: '札幌', emblem: '札' },
      { id: 'asahikawa', label: '旭川', emblem: '旭' },
      { id: 'obihiro',   label: '帯広', emblem: '帯' },
      { id: 'hakodate',  label: '函館', emblem: '函' },
    ],
  },
  {
    id: 'tohoku',
    label: '東北',
    prefectures: [
      { id: 'aomori',    label: '青森', emblem: '青' },
      { id: 'iwate',     label: '岩手', emblem: '岩' },
      { id: 'miyagi',    label: '宮城', emblem: '城' },
      { id: 'akita',     label: '秋田', emblem: '秋' },
      { id: 'yamagata',  label: '山形', emblem: '形' },
      { id: 'fukushima', label: '福島', emblem: '福' },
    ],
  },
  {
    id: 'kanto',
    label: '関東',
    prefectures: [
      { id: 'ibaraki',  label: '茨城',   emblem: '茨' },
      { id: 'tochigi',  label: '栃木',   emblem: '栃' },
      { id: 'gunma',    label: '群馬',   emblem: '群' },
      { id: 'saitama',  label: '埼玉',   emblem: '埼' },
      { id: 'chiba',    label: '千葉',   emblem: '千' },
      { id: 'tokyo',    label: '東京',   emblem: '東' },
      { id: 'kanagawa', label: '神奈川', emblem: '神' },
    ],
  },
  {
    id: 'chubu',
    label: '中部',
    prefectures: [
      { id: 'niigata',   label: '新潟', emblem: '新' },
      { id: 'toyama',    label: '富山', emblem: '富' },
      { id: 'ishikawa',  label: '石川', emblem: '石' },
      { id: 'fukui',     label: '福井', emblem: '井' },
      { id: 'yamanashi', label: '山梨', emblem: '梨' },
      { id: 'nagano',    label: '長野', emblem: '野' },
      { id: 'shizuoka',  label: '静岡', emblem: '静' },
      { id: 'aichi',     label: '愛知', emblem: '知' },
      { id: 'gifu',      label: '岐阜', emblem: '岐' },
    ],
  },
  {
    id: 'kinki',
    label: '近畿',
    prefectures: [
      { id: 'mie',      label: '三重',   emblem: '三' },
      { id: 'shiga',    label: '滋賀',   emblem: '滋' },
      { id: 'kyoto',    label: '京都',   emblem: '京' },
      { id: 'osaka',    label: '大阪',   emblem: '阪' },
      { id: 'hyogo',    label: '兵庫',   emblem: '兵' },
      { id: 'nara',     label: '奈良',   emblem: '奈' },
      { id: 'wakayama', label: '和歌山', emblem: '和' },
    ],
  },
  {
    id: 'chugoku',
    label: '中国',
    prefectures: [
      { id: 'tottori',   label: '鳥取', emblem: '鳥' },
      { id: 'shimane',   label: '島根', emblem: '島' },
      { id: 'okayama',   label: '岡山', emblem: '山' },
      { id: 'hiroshima', label: '広島', emblem: '広' },
      { id: 'yamaguchi', label: '山口', emblem: '口' },
    ],
  },
  {
    id: 'shikoku',
    label: '四国',
    prefectures: [
      { id: 'tokushima', label: '徳島', emblem: '徳' },
      { id: 'kagawa',    label: '香川', emblem: '香' },
      { id: 'ehime',     label: '愛媛', emblem: '媛' },
      { id: 'kochi',     label: '高知', emblem: '高' },
    ],
  },
  {
    id: 'kyushu',
    label: '九州・沖縄',
    prefectures: [
      { id: 'fukuoka',   label: '福岡',   emblem: '岡' },
      { id: 'saga',      label: '佐賀',   emblem: '佐' },
      { id: 'nagasaki',  label: '長崎',   emblem: '長' },
      { id: 'kumamoto',  label: '熊本',   emblem: '熊' },
      { id: 'oita',      label: '大分',   emblem: '分' },
      { id: 'miyazaki',  label: '宮崎',   emblem: '宮' },
      { id: 'kagoshima', label: '鹿児島', emblem: '鹿' },
      { id: 'okinawa',   label: '沖縄',   emblem: '沖' },
    ],
  },
];

/** 地域IDから地域定義を引くマップ */
export const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));

/**
 * events オブジェクトから地域ごとのイベント件数を返す。
 * 対応済み都道府県のイベント数を地域IDでまとめる。
 */
export function countEventsByRegion(events) {
  const counts = {};
  for (const [prefId, evs] of Object.entries(events)) {
    if (!Array.isArray(evs)) continue;
    const regionId = PREFECTURE_TO_REGION[prefId];
    if (!regionId) continue;
    // 終了済みは件数に含めない（地図バッジ・総数は開催予定のみ）
    counts[regionId] = (counts[regionId] ?? 0) + evs.filter(e => !e.ended).length;
  }
  return counts;
}

/**
 * 地域内で対応済みの都道府県IDと、そのイベント数を返す。
 */
export function getSupportedPrefsByRegion(regionId, events) {
  const region = REGION_BY_ID[regionId];
  if (!region) return [];
  return region.prefectures
    .filter(p => SUPPORTED_PREFECTURES.has(p.id))
    // 終了済みは件数に含めない（開催予定のみ）
    .map(p => ({ ...p, count: (events[p.id] ?? []).filter(e => !e.ended).length }));
}
