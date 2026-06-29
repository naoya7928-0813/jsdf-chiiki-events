# 自衛隊地本イベント情報アプリ（非公式）

全国47都道府県の自衛隊地方協力本部（地本）・募集案内所のイベント情報を集約して表示する
モバイル Web アプリ（PWA）です。GitHub Actions が各地本サイトを1日3回スクレイピングし、
Vercel で配信します。

> ⚠️ 本プロジェクトは**有志による非公式サービス**です。防衛省・自衛隊および各地方協力本部
> とは関係ありません。開催可否・申込方法等は必ず公式情報をご確認ください。

## 機能

- **全国47都道府県＋募集案内所（全国314拠点）** のイベント集約
- **地図ホーム / 都道府県別一覧 / イベント詳細**
- **開催日の天気予報**（詳細画面・Open-Meteo＋国土地理院ジオコーディング、精度別表示）
- **お気に入り・申請済み・通知（Web Push）・誤情報報告**
- **イベント名の自動整形・品質防御**（住所/OCR断片/年ズレ/重複の除外）
- **公開PWA と 運営用PWA（管理画面）の分離**（`/admin.html`）
- **管理画面**: イベント追加・編集・削除・下書き・公開・上書き修正（RBAC・監査ログ）
- **5分ごと自動更新・ダークモード・陸/海/空 カラーテーマ・PWA インストール**

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | React 18 + Vite 6 |
| PWA | vite-plugin-pwa + Workbox |
| スクレイパー | Playwright (Chromium) + Cheerio + 多段OCR |
| サーバー機能 | Vercel Functions（`/api/*`） |
| データストア | 静的 `/data/events.json` + Upstash Redis（管理データ・セッション・キャッシュ） |
| 自動更新 | GitHub Actions（1日3回。`npm test`＋データ品質チェックをデプロイ前ゲート） |
| デプロイ | Vercel |

## ドキュメント
- [DEPLOY.md](./DEPLOY.md) — デプロイ・環境変数・シークレットローテーション
- [OPERATIONS.md](./OPERATIONS.md) — 日常運用・障害対応・バックアップ
- [SECURITY.md](./SECURITY.md) — 認証・認可・監査・既知の制約
- [DATA_SOURCES.md](./DATA_SOURCES.md) / [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — 出典・ライセンス
- [CLAUDE.md](./CLAUDE.md) — 詳細仕様（イベントカード正準・天気・セキュリティ）

## 主な API（`/api/*`）
- `weather`（天気）, `manual-events`（手動イベント公開）, `subscribe`/`notify`（通知）, `report`（誤情報報告）
- 管理（要認証・RBAC）: `admin/login`, `admin/logout`, `admin/events`, `admin/overrides`, `admin/history`

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

自作コードは MIT（[LICENSE](./LICENSE)）。イベント情報（防衛省・自衛隊の公開情報）、
国土地理院の座標、Open-Meteo の気象データ等は本ライセンスの対象外で、各出典の条件に従います。
詳細は [DATA_SOURCES.md](./DATA_SOURCES.md) / [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
