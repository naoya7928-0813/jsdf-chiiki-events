/**
 * アプリ更新ノート
 * { date, version, type, content } の配列。新しい順（上が最新）。
 * type: 'feature' | 'fix' | 'improvement'
 */
export const UPDATE_NOTES = [
  {
    date:    '2026-06-05',
    version: '1.13.15',
    type:    'fix',
    content: 'タイトルが同じイベントを「お気に入り」にすると、別の同名イベントまで連動して登録される不具合を修正',
  },
  {
    date:    '2026-06-05',
    version: '1.13.14',
    type:    'fix',
    content: 'スマホでイベントカードが右にずれて余白ができる表示崩れを修正',
  },
  {
    date:    '2026-06-05',
    version: '1.13.13',
    type:    'improvement',
    content: 'イベント一覧で、採用イベントなど長いタイトルが2行で省略表示されるようにし、カードの高さを揃えて見やすく改善',
  },
  {
    date:    '2026-06-05',
    version: '1.13.12',
    type:    'improvement',
    content: '掲載元で地本を開いたとき、それまで開いていた他の地本が自動で閉じるようにし、一覧を見やすく改善',
  },
  {
    date:    '2026-06-04',
    version: '1.13.11',
    type:    'improvement',
    content: '掲載元で、個別の公式ページがある拠点だけをタップ可能にし、個別ページが無い拠点はリンクなしの表示に変更',
  },
  {
    date:    '2026-06-04',
    version: '1.13.10',
    type:    'feature',
    content: '掲載元の各拠点の公式ページリンクを全国に拡大。関東以外の道府県でも、募集案内所・事務所をタップすると各拠点の公式ページが開くようになりました（個別ページが無い拠点は従来どおり地本ページ）',
  },
  {
    date:    '2026-06-04',
    version: '1.12.10',
    type:    'fix',
    content: '掲載元で関東各県の募集案内所・事務所をタップした際、地本トップではなく各拠点の公式ページが開くよう修正',
  },
  {
    date:    '2026-06-04',
    version: '1.12.9',
    type:    'improvement',
    content: '設定の「掲載元」で各募集案内所・事務所をタップすると公式ページを開けるよう改善（誤操作防止のため、1回目のタップで選択・2回目で遷移）',
  },
  {
    date:    '2026-06-04',
    version: '1.12.8',
    type:    'feature',
    content: '全国の募集案内所・地域事務所ページを巡回し、説明会や相談会などのイベント情報も収集対象に追加',
  },
  {
    date:    '2026-06-04',
    version: '1.11.8',
    type:    'fix',
    content: '通知タブの自動更新時刻表示を、1日3回のスクレイピング予定に合わせて修正',
  },
  {
    date:    '2026-06-04',
    version: '1.11.7',
    type:    'feature',
    content: '京都府・大阪府の各事務所のイベント情報も収集対象に追加',
  },
  {
    date:    '2026-06-04',
    version: '1.10.7',
    type:    'fix',
    content: '都道府県を切り替えた際に、他県のイベントが一覧に残って表示される不具合を修正',
  },
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
