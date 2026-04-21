# 自衛隊地本イベント情報アプリ

自衛隊地方協力本部（神奈川・東京）のイベント情報を表示するモバイルWebアプリです。  
GitHub Actions がイベントサイトを定期スクレイピングし、Vercel で静的配信します。

## 機能

- **神奈川地本 / 東京地本** タブ切替
- **通知一覧** — 未読バッジ付きイベントお知らせ
- **お気に入り** — スター登録 + 一覧画面
- **検索** — タイトル・場所・カテゴリで絞り込み
- **5分ごと自動リフレッシュ**（バックグラウンド復帰時も更新）
- **PWA 対応** — iPhone ホーム画面追加でアプリ風表示
- **ダークモード** — システム設定連動 or 手動切替
- **陸自 / 海自 / 空自** カラーテーマ切替

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React 18 + Vite 6 |
| PWA | vite-plugin-pwa + Workbox |
| スクレイパー | Playwright (Chromium) + Cheerio |
| データ配信 | Vercel 静的ファイル（`/data/events.json`） |
| 自動更新 | GitHub Actions（1日3回スケジュール実行） |
| デプロイ | Vercel |

## ディレクトリ構成

```
jsdf-chiiki-events/
├── .github/
│   └── workflows/
│       └── scrape.yml          # GitHub Actions — 自動スクレイピング
├── public/
│   ├── data/
│   │   └── events.json         # スクレイパーが生成する静的データ
│   └── icons/
├── scraper/                    # スクレイパー（アプリ本体と独立）
│   ├── index.js                # メインスクリプト
│   ├── package.json            # 独立した依存関係
│   └── parsers/
│       ├── kanagawa.js         # 神奈川地本パーサー
│       ├── tokyo.js            # 東京地本パーサー
│       └── utils.js            # 共通ユーティリティ
├── src/
│   ├── App.jsx
│   ├── config.js               # API_URL = '/data/events.json'
│   ├── hooks/useEvents.js
│   └── components/
│       ├── HomeScreen.jsx
│       ├── ListScreen.jsx
│       ├── DetailScreen.jsx
│       ├── SettingsScreen.jsx
│       ├── NotificationScreen.jsx
│       ├── FavoritesScreen.jsx
│       ├── Shared.jsx
│       └── Icons.jsx
├── package.json
└── vite.config.js
```

## スクレイピングの仕組み

```
GitHub Actions（1日3回）
  └─ node scraper/index.js
       ├─ Playwright Chromium でサイトにアクセス
       │    （Cloudflare ボット検知回避設定済み）
       ├─ 神奈川: Shift_JIS デコード → Cheerio パース
       ├─ 東京:   UTF-8 → Cheerio パース
       └─ public/data/events.json に書き出し
            └─ git commit & push → Vercel が自動デプロイ
```

アプリは起動時に `/data/events.json` をフェッチします。  
取得失敗時は `src/config.js` のモックデータを表示します。

## 手動実行（GitHub Actions UI）

1. GitHubリポジトリの **Actions** タブを開く
2. **スクレイピング & データ更新** ワークフローを選択
3. **Run workflow** ボタンをクリック

## ローカルでのテスト

### モックモード（HTTPアクセスなし）
```bash
cd scraper
npm install
node index.js --mock
# → public/data/events.json にサンプルデータが書き出される
```

### 実スクレイピング
```bash
cd scraper
npm install
npx playwright install chromium --with-deps
node index.js
```

## アプリのローカル開発

```bash
npm install
npm run dev
# → http://localhost:5173
```

## デプロイ

```bash
# ビルド（アイコン生成 + Vite ビルド）
npm run build

# Vercel CLI でデプロイ
npx vercel --prod
```

詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

## イベントデータのスキーマ

`public/data/events.json` の形式：

```json
{
  "kanagawa": [
    {
      "id":       "k-20260425-1",
      "date":     "2026-04-25",
      "weekday":  "土",
      "title":    "自衛官候補生 募集説明会",
      "place":    "横浜地域事務所",
      "address":  "横浜市中区山下町1-2",
      "time":     "13:30～15:30",
      "category": "説明会",
      "tag":      "要予約",
      "url":      "",
      "notes":    "事前予約が必要です。"
    }
  ],
  "tokyo": [ ... ],
  "updatedAt": "2026/04/21 08:00"
}
```

## ライセンス

MIT
