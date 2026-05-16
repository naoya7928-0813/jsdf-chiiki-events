# jsdf-chiiki-events — CLAUDE.md

自衛隊地本（地方協力本部）イベント情報をスクレイピングして表示する PWA。

## プロジェクト構成

```
jsdf-chiiki-events/
├── src/                        # React 18 + Vite 6 フロントエンド
│   ├── components/             # UI コンポーネント
│   │   ├── HomeScreen.jsx      # 地図ホーム画面
│   │   ├── JapanMap.jsx        # SVG 日本地図
│   │   ├── ListScreen.jsx      # イベント一覧（都道府県タブ付き）
│   │   └── Shared.jsx          # 共通コンポーネント
│   ├── data/
│   │   ├── regionMap.js        # 地域・都道府県マッピング（emblem フィールドあり）
│   │   └── prefectureShapes.js # SVG パス + REGION_LABEL_POSITIONS
│   └── hooks/
│       └── useEvents.js        # events.json フェッチ + 通知管理
├── scraper/                    # Node.js スクレイパー（Playwright + cheerio）
│   ├── index.js                # エントリポイント・全府県ループ
│   └── parsers/                # 都道府県別パーサー（50 ファイル）
│       └── utils.js            # guessCategory / guessTag / isPast など共通関数
├── public/
│   ├── data/events.json        # スクレイプ結果（全イベントデータ）
│   ├── events.html             # 全イベント一覧（SEO向け静的HTML）
│   ├── events/                 # 都道府県別静的ページ（SEO向け・スクレイプ毎に生成）
│   │   └── <pref>.html         # 例: kagawa.html, tokyo.html
│   ├── sitemap.xml             # 全URL一覧（Google Search Console に送信済み）
│   ├── robots.txt              # クローラー制御
│   └── google3d6aa643f6d363c1.html # Google Search Console 所有権確認ファイル
├── scripts/
│   ├── generate-events-html.mjs # events.html / events/<pref>.html / sitemap.xml 生成
│   └── generate-icons.mjs       # PWA アイコン生成
└── .github/workflows/
    ├── scrape.yml              # スクレイプ自動化（1日4回 + Vercel デプロイ）
    └── deploy.yml              # フロントエンド変更時の自動デプロイ（push トリガー）
```

## 主要コマンド

```bash
# フロントエンド開発サーバー
npm run dev

# 本番ビルド（アイコン生成 → HTML 生成 → Vite ビルド）
npm run build

# スクレイパー実行（要 GEMINI_API_KEY 環境変数）
cd scraper && node index.js
```

## デプロイ

- **scrape.yml**: データ変更時のみ Vercel デプロイ（`changed=true` の場合）
- **deploy.yml**: `src/`, `public/`, `scripts/`, `index.html`, `vite.config.js`, `vercel.json`, `package.json` の変更時に自動デプロイ
- 手動デプロイ: `gh workflow run deploy.yml`
- 必要シークレット: `GEMINI_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NTFY_ADMIN_TOPIC`

## スクレイパー仕様

- スケジュール: 日本時間 8/12/16/20 時（1日4回）
- 対象: 47 都道府県の自衛隊地本公式サイト
- 出力: `public/data/events.json`（`updatedAt` フィールド付き）
- カテゴリ標準値: `説明会` / `採用イベント` / `一般公開` / `艦艇公開` / `体験` / `演奏会` / `記念行事` / `広報活動` / `地域参加`
- `guessCategory()` / `guessTag()` は `scraper/parsers/utils.js` に集約

## フロントエンド仕様

- **地域マップ**: 8地域（北海道・東北・関東・中部・近畿・中国・四国・九州）
- **都道府県 emblem**: `regionMap.js` の PREFECTURE_INFO と REGIONS 両方に同じ値が必要（全50件ユニーク）
- **テーマ**: CSS 変数 `var(--bg)` / `var(--text)` / `var(--card)` / `var(--border)` でライト/ダーク切替
- **プッシュ通知**: ntfy.sh トピック `jsdf-chiiki-events-7928`

## MCP ツール活用ガイド

このプロジェクトでは以下の MCP サーバーを設定済み（`~/.claude/settings.json`）:

### fetch — ウェブページ取得
- 地本サイトの HTML 構造調査
- 新しい都道府県パーサー開発時のソース確認
- `fetch` ツールで任意の URL を取得してパーサーを書ける

### github — GitHub リポジトリ操作
- Actions ワークフローの実行状況確認
- Issues / PR の作成・管理
- スクレイプ失敗の通知ログ確認
- リポジトリ: `github.com/<owner>/jsdf-chiiki-events`

### playwright — ブラウザ自動操作
- JavaScript レンダリングが必要なページのスクレイプ調査
- 新パーサー開発時の動的コンテンツ確認
- ローカルでの E2E 動作検証

## SEO 構成

| 要素 | 内容 |
|------|------|
| **Google Search Console** | 登録済み・サイトマップ送信済み（2026/05/17）|
| **sitemap.xml** | スクレイプ毎に自動更新（トップ・events.html・都道府県別ページ含む）|
| **JSON-LD（Event スキーマ）** | events.html と都道府県別ページに埋め込み |
| **canonical タグ** | index.html・events.html・各都道府県ページに設定済み |
| **Twitter Card** | 全静的ページに設定済み |
| **都道府県別ページ** | `/events/<pref>.html` 形式・スクレイプ毎に自動生成 |
| **vercel.json rewrite** | `sitemap.xml`・`events/`・`data/`・`robots.txt`・`google*` を除外設定済み |

### generate-events-html.mjs の出力物
`node scripts/generate-events-html.mjs` を実行すると以下が生成される:
- `public/events.html` — 全イベント一覧（JSON-LD・canonical・Twitter Card付き）
- `public/events/<pref>.html` — イベントがある都道府県分（JSON-LD・canonical付き）
- `public/sitemap.xml` — 全URLを含む更新済みサイトマップ

## よくある作業

### 新しい都道府県パーサーを追加
1. `scraper/parsers/<pref>.js` を作成（既存パーサーを参照）
2. `scraper/index.js` の `URLS` と呼び出し部分に追加
3. `src/data/regionMap.js` の `SUPPORTED_PREFECTURES` と `PREFECTURE_TO_REGION` に追加

### カテゴリルールを修正
- `scraper/parsers/utils.js` の `guessCategory()` を編集
- `public/data/events.json` の既存データも手動修正が必要な場合あり

### emblem 重複チェック
```bash
cd /c/Users/user/jsdf-chiiki-events
node -e "
const { PREFECTURE_INFO } = require('./src/data/regionMap.js');
// ESM なので直接実行不可 — ブラウザ DevTools で確認すること
"
```
→ ブラウザの DevTools コンソールで `PREFECTURE_INFO.map(p=>p.emblem)` を確認

### GitHub Actions 手動実行
GitHub リポジトリ → Actions → 「スクレイピング & データ更新」→ Run workflow
