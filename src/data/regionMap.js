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
  miyagi:    { label: '宮城',   emblem: '宮', region: 'tohoku' },
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
  niigata:   { label: '新潟',   emblem: '潟', region: 'chubu' },
  toyama:    { label: '富山',   emblem: '富', region: 'chubu' },
  ishikawa:  { label: '石川',   emblem: '石', region: 'chubu' },
  fukui:     { label: '福井',   emblem: '福', region: 'chubu' },
  yamanashi: { label: '山梨',   emblem: '梨', region: 'chubu' },
  nagano:    { label: '長野',   emblem: '長', region: 'chubu' },
  gifu:      { label: '岐阜',   emblem: '岐', region: 'chubu' },
  shizuoka:  { label: '静岡',   emblem: '静', region: 'chubu' },
  aichi:     { label: '愛知',   emblem: '愛', region: 'chubu' },
};

/** 都道府県ID → 地域ID の逆引きマップ */
export const PREFECTURE_TO_REGION = Object.fromEntries(
  Object.entries(PREFECTURE_INFO).map(([id, v]) => [id, v.region])
);

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
      { id: 'miyagi',    label: '宮城', emblem: '宮' },
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
      { id: 'niigata',   label: '新潟', emblem: '潟' },
      { id: 'toyama',    label: '富山', emblem: '富' },
      { id: 'ishikawa',  label: '石川', emblem: '石' },
      { id: 'fukui',     label: '福井', emblem: '福' },
      { id: 'yamanashi', label: '山梨', emblem: '梨' },
      { id: 'nagano',    label: '長野', emblem: '長' },
      { id: 'shizuoka',  label: '静岡', emblem: '静' },
      { id: 'aichi',     label: '愛知', emblem: '愛' },
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
      { id: 'osaka',    label: '大阪',   emblem: '大' },
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
      { id: 'okayama',   label: '岡山', emblem: '岡' },
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
      { id: 'kochi',     label: '高知', emblem: '知' },
    ],
  },
  {
    id: 'kyushu',
    label: '九州・沖縄',
    prefectures: [
      { id: 'fukuoka',   label: '福岡',   emblem: '岡' },
      { id: 'saga',      label: '佐賀',   emblem: '佐' },
      { id: 'nagasaki',  label: '長崎',   emblem: '崎' },
      { id: 'kumamoto',  label: '熊本',   emblem: '熊' },
      { id: 'oita',      label: '大分',   emblem: '分' },
      { id: 'miyazaki',  label: '宮崎',   emblem: '崎' },
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
    counts[regionId] = (counts[regionId] ?? 0) + evs.length;
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
    .map(p => ({ ...p, count: (events[p.id] ?? []).length }));
}
