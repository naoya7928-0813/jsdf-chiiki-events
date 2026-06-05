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
    ├── scrape.yml              # スクレイプ自動化（1日3回 + Vercel デプロイ）
    └── deploy.yml              # フロントエンド変更時の自動デプロイ（push トリガー）
```

## 主要コマンド

```bash
# フロントエンド開発サーバー
npm run dev

# 本番ビルド（アイコン生成 → HTML 生成 → Vite ビルド）
npm run build

# スクレイパー実行（OCR APIキーは任意。RapidOCR/Tesseractはローカル実行）
cd scraper && node index.js
```

## デプロイ

- **scrape.yml**: データ変更時のみ Vercel デプロイ（`changed=true` の場合）
- **deploy.yml**: `src/`, `public/`, `scripts/`, `index.html`, `vite.config.js`, `vercel.json`, `package.json` の変更時に自動デプロイ
- 手動デプロイ: `gh workflow run deploy.yml`
- 必要シークレット: `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OCR_SPACE_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NTFY_ADMIN_TOPIC`

## スクレイパー仕様

- スケジュール: 日本時間 8/12/18 時（1日3回）
- 対象: 47 都道府県の自衛隊地本公式サイト
- 出力: `public/data/events.json`（`updatedAt` フィールド付き）
- カテゴリ標準値: `説明会` / `採用イベント` / `一般公開` / `艦艇公開` / `体験` / `演奏会` / `記念行事` / `広報活動` / `地域参加`
- `guessCategory()` / `guessTag()` は `scraper/parsers/utils.js` に集約
- 募集案内所・地域事務所のイベントは `public/data/offices.json` の全国314拠点URLをユニーク化して巡回する。関東は個別URL精度が高い `KANTO_OFFICE_URLS` を優先し、それ以外は `crawlNationwideOffices()` でHTML本文の日付イベントをOCRなしで抽出し、PDF/画像チラシ候補のみOCRへ回す。

### PDF/画像アセットの取得・キャッシュ方針（重複取得しない）

**すでに取得済みの PDF/画像は再取得・再 OCR しないこと。** OCR は Gemini API のクォータを消費するため、同一アセットの重複処理は厳禁。実装は `scraper/lib/assetCache.js` と `downloadFile()` に集約されており、新規パーサーや探索ロジックを追加する際もこのキャッシュ経路を必ず通すこと。

OCRの優先順は、無料ローカルOCR（Tesseract → RapidOCR）を先に試し、次に無料枠の大きいAPI（Groq → OCR.space）、最後に Mistral / Gemini へフォールバックする。RapidOCR は `scraper/requirements-ocr.txt` と `scraper/lib/rapidocr_cli.py` で GitHub Actions に導入済み。OCR.space は `OCR_SPACE_API_KEY` がある場合のみ使う。

- **キャッシュ実体**: `scraper/ocr-cache.json`（`.gitignore` 対象。self-hosted runner 上 + GitHub Actions cache で永続化）。キーはファイル実体の **SHA-256（`content_sha256`）**。
- **ダウンロード段階の重複回避**: `downloadFile(url)` は正規化 URL でキャッシュを引き、OCR 成功済みエントリがあれば `If-None-Match`(ETag) / `If-Modified-Since`(Last-Modified) で**条件付き GET** を発行。`304 Not Modified` ならファイル本体をダウンロードしない。
- **OCR 段階の重複回避**: OCR 関数は実行前に `assetCache.getByHash(hash)` を確認し、`result` が存在すれば**OCR API を呼ばずにキャッシュ結果を返す**。URL が変わっても中身（ハッシュ）が同じ PDF/画像は再 OCR されない。
- **TTL**: 90 日（`assetCache.js` の `TTL_DAYS`）。期限切れエントリは `load()` / `save()` 時に自動破棄。
- 新しくアセットを取得する処理を書く場合は、必ず `downloadFile()` → ハッシュ照合 → `assetCache` 経由とし、生の `fetch` で PDF/画像を毎回取得し直す実装を追加しないこと。

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

## 更新ノートの運用ルール

設定画面に表示される更新ノート（`src/constants/updates.js`）の管理ルール。

### 記載タイミング（自動運用・ユーザビリティに影響する大きめの変更のみ）
- **利用者が体感できる意味のある変更（機能追加・対応範囲の拡大・画面/表示の変更・目に見えるバグ修正）を行ったら、その都度ユーザー確認を取らずに自動で更新ノートへ追記し、`package.json` のバージョンも上げる。**
- **小さな修正・表に出さなくてよい修正はサイト（更新ノート）に記載しなくてよい**（記載しない場合はバージョンも上げない）。
  - 例: 軽微な表記/レイアウト微調整、内部的なクリーニング、影響の小さい不具合の予防的修正など。
  - 裏側（バックエンド）の変更も従来どおり原則記載しない: スクレイパー内部改修、OCRツールの追加・差し替え、パーサーのリファクタ、Cloudflare回避調整、CI設定、デバッグスクリプトなど。
- **記載する場合は簡潔に**。内部寄りの変更を載せるときは「（内部の修正）」のように短く書く（長い説明文は避ける）。
- 判断基準: 「利用者にわざわざ知らせる価値があるか」。価値があるなら簡潔に記載、小さい/裏側だけなら省略（バージョンも据え置き）。

### バージョン番号ルール（各桁＝累積回数のカウンタ）
バージョンは `大きな更新の累計回数 . 中くらいの更新の累計回数 . 軽微な更新の累計回数`。
**標準 semver のような繰り上げはしない**（中くらいが18回なら `X.18.Y` のように桁が10を超えてよい）。

| 規模 | 動かす桁 | 該当する更新ノート `type` | 例 |
|------|----------|---------------------------|----|
| **大きな更新** | 1桁目 +1 | （大規模時のみ・稀） | アプリ全体の刷新・破壊的変更・主要機能の大規模追加 |
| **中くらいの更新** | 2桁目 +1 | `feature` | 新機能・対応範囲の拡大（新しい都道府県/データ源の追加、画面・機能の追加） |
| **軽微な更新** | 3桁目 +1 | `improvement` / `fix` | バグ修正・表記調整・小さなUI改善など |

- 各桁は独立したカウンタ。例: 大3回・中18回・軽4回なら `3.18.4`。
- 上位桁を増やしても下位桁はリセットしない（中を+1しても軽の回数はそのまま）。
- 1回のコミットに複数変更があるときは、各変更を個別エントリにして、その時点までの累積を反映した `version` を各エントリへ付ける（実施順に下位桁から積み上げる）。`package.json` はバッチ適用後の最終値にする。

### 追加手順
1. `src/constants/updates.js` の `UPDATE_NOTES` 配列の**先頭**に追加（新しい順）
2. `package.json` のバージョンを規模に応じて上げる
3. 追加した各エントリの `version` を `package.json` と一致させる
4. ビルド確認 → コミット → push → デプロイ

```js
// src/constants/updates.js の例
{
  date:    'YYYY-MM-DD',
  version: '1.X.Y',
  type:    'feature',  // 'feature' | 'fix' | 'improvement'
  content: '変更内容の説明',
},
```

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
