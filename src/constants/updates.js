/**
 * アプリ更新ノート
 * { date, version, type, content } の配列。新しい順（上が最新）。
 * type: 'feature' | 'fix' | 'improvement'
 */
export const UPDATE_NOTES = [
  {
    date:    '2026-06-04',
    version: '1.10.6',
    type:    'feature',
    content: '茨城県の各事務所のイベント情報も収集対象に追加',
  },
  {
    date:    '2026-06-04',
    version: '1.9.6',
    type:    'fix',
    content: '群馬県の一部イベントが表示されない不具合を修正',
  },
  {
    date:    '2026-06-03',
    version: '1.9.5',
    type:    'improvement',
    content: '更新ノートが増えても見やすいよう、一覧をブロック内でスクロール表示に改善',
  },
  {
    date:    '2026-06-03',
    version: '1.9.4',
    type:    'feature',
    content: '埼玉県の各事務所のイベント情報も収集対象に追加',
  },
  {
    date:    '2026-06-03',
    version: '1.8.4',
    type:    'improvement',
    content: 'アプリ名を「地本イベントナビ」に変更し、非公式であることをわかりやすく明記',
  },
  {
    date:    '2026-06-03',
    version: '1.8.3',
    type:    'improvement',
    content: '設定の「掲載元」に各地本の事務所一覧（位置情報取得済み）を追加',
  },
  {
    date:    '2026-06-03',
    version: '1.8.2',
    type:    'fix',
    content: '神奈川県のイベントが表示されない不具合を修正',
  },
  {
    date:    '2026-06-03',
    version: '1.8.1',
    type:    'feature',
    content: '東京都・神奈川県の各募集案内所のイベント情報も収集対象に追加',
  },
];

export const TYPE_LABEL = {
  feature:     { label: '追加',    color: '#3a7d44' },
  fix:         { label: 'バグ修正', color: '#c0392b' },
  improvement: { label: '改善',    color: '#1a5a9a' },
};
