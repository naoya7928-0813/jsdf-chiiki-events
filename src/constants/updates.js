/**
 * アプリ更新ノート
 * { date, version, type, content } の配列。新しい順（上が最新）。
 * type: 'feature' | 'fix' | 'improvement'
 */
export const UPDATE_NOTES = [
  {
    date:    '2026-06-03',
    version: '1.8.0',
    type:    'feature',
    content: '東京都・神奈川県の各募集案内所のイベント情報も収集対象に追加',
  },
];

export const TYPE_LABEL = {
  feature:     { label: '追加',    color: '#3a7d44' },
  fix:         { label: 'バグ修正', color: '#c0392b' },
  improvement: { label: '改善',    color: '#1a5a9a' },
};
