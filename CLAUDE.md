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

## スクレイプ後の品質チェック（必須）

スクレイピング実行後（手動・定期問わず）は、**必ずイベント名の全件チェックを行う**こと。

### 手順
1. **機械チェック**: `node scripts/check-event-titles.mjs` を実行（CI でも自動実行され、要確認項目があれば ntfy で管理者に通知される）
2. **全件目視**: `public/data/events.json` の全イベント名を地本ごとに一覧出力し、以下の観点で確認する
   - **住所・案内文の混入**: 「〒」「お問合せ」「申し込みはこちら」「詳細はチラシ参照」等がタイトル化していないか
   - **スタブ**: 「自衛隊○○地本イベント」のような中身のない名前になっていないか
   - **断片・残骸**: 様式の項目（「期及び定員」等）、先頭の記号（#・&・★・NEW日付）、意味不明の文字列になっていないか
   - **年ズレ**: タイトルや URL に過去年（例: 2024）があるのにイベント日付が現在年になっていないか（サイトに残る過去イベント一覧の誤再登録）
   - **重複**: 同一地本・同日に同名イベントが二重登録されていないか（※場所違いの同名イベントは正規。`-off-`/`-office-` の二重巡回に注意）
   - **表記ゆれ**: 同じイベントが微妙に違う名前で複数登録されていないか

### イベントデータを修正する際の必須手順（実物照合）
**イベントの名称・日付・場所を修正・削除する際は、必ず一次ソース（チラシ実物・掲載ページ）と照合してから行うこと。** URLのファイル名やパターンだけを根拠に修正しない（例: ファイル名の年スタンプだけで過去イベントと断定せず、チラシ内の年号「令和X年/20XX」を目視確認する）。OCR経由のイベント（`source_type: office_ocr`、岩手等のPDF系地本）は誤読リスクが特に高い:
1. イベントの `url` / `imageUrl` からチラシを取得（画像はそのまま、PDFは `pdf-parse` v2 の `PDFParse#getScreenshot({first:1})` でPNG化）
2. 画像を目視し、登録データ（タイトル・日付・年号・場所・複数日開催）と突き合わせる
3. 典型的なOCR誤り: 脱字（「てんりゅう」→「てんゆう」）、チラシ最上部の部隊名だけ拾う（「海上自衛隊」のみ等）、名称後半の欠落、ファイル名からの場所誤推定、複数日開催の終了日漏れ

### 防御の仕組み（titleQuality）
- イベント名の整形・不正判定・年ズレ判定・重複統合は **`shared/titleQuality.cjs` に集約**されている（`cleanEventTitle` / `isJunkOrStubTitle` / `isStaleDatedEvent` / `dedupEvents`）
- タイトルは複数経路（HTMLパーサー / OCR / 事務所巡回 / 前回データ維持）で生成されるため、**個別パーサーではなく `writeOutput` の最終フィルタで経路非依存に防御**する設計
- **新種の不正パターンを見つけたら `titleQuality.cjs` に追加し、`shared/titleQuality.test.cjs` にテストケースを足す**（`npm test` で検証）
- 既存 `events.json` の汚染は再スクレイプを待たず、titleQuality を使ったスクリプトで直接クリーンアップ → `node scripts/generate-events-html.mjs` → commit/push で即デプロイできる（deploy.yml が public/ 変更で自動発火）

## フロントエンド仕様

- **地域マップ**: 8地域（北海道・東北・関東・中部・近畿・中国・四国・九州）
- **都道府県 emblem**: `regionMap.js` の PREFECTURE_INFO と REGIONS 両方に同じ値が必要（全50件ユニーク）
- **テーマ**: CSS 変数 `var(--bg)` / `var(--text)` / `var(--card)` / `var(--border)` でライト/ダーク切替
- **プッシュ通知**: ntfy.sh トピック `jsdf-chiiki-events-7928`

## エラー発生時の対処ガイド

エラーの種類ごとの診断・修正手順。**いずれの場合も、データの修正は必ず一次ソース照合（上記必須手順）を踏むこと。**

### 1. アプリが白画面・「表示中に問題が発生しました」が出る
ErrorBoundary（`src/components/ErrorBoundary.jsx`）のフォールバックが出た場合、カード描画エラーが起きている。
1. ブラウザの DevTools コンソールで `[ErrorBoundary]` のスタックトレースを確認
2. 原因は大抵 events.json の想定外データ。`node scripts/check-event-titles.mjs` で形状検証
3. `useEvents.js` の `normalizeEvent` が防げなかったパターンなら、normalizeEvent に防御を追加
4. 再現確認: `npm run build && npx vite preview` → Playwright で `pageerror` / `console.error` を収集して描画確認

### 2. イベントデータの異常（名前・日付・場所の誤り、重複）
1. **切り分け**: `git show <前回コミット>:public/data/events.json` と比較し「前回データ維持」か「毎回生成」かを特定（原因経路が絞れる）
2. **一次ソース照合**: チラシ・掲載ページの実物で正しい値を確認
3. **恒久対策**: `shared/titleQuality.cjs` にパターン追加＋テスト（`npm test`）
4. **既存データ修正**: titleQuality を使うスクリプトで events.json を直接修正 → `node scripts/generate-events-html.mjs` → commit/push（deploy.yml が自動デプロイ）

### 3. スクレイプ失敗・イベント数急減（ntfy アラート）
1. GitHub Actions のログで失敗した地本・ステップを特定（`gh run view <run-id> --log`）
2. 地本サイト側の構造変更ならパーサー修正、Cloudflare 検知なら `withFreshContext`/待機時間を確認
3. **データが消えた場合の復元**: `git show <正常だったコミット>:public/data/events.json > public/data/events.json` → HTML再生成 → commit/push
4. イベントが全て消える事故の典型は「過去日付フィルター」（writeOutput）。日付生成ロジックと今日の日付の関係を確認

### 4. デプロイ失敗・サイトに反映されない
1. `gh run list --workflow=deploy.yml --limit 3` で状態確認。push 後に deploy.yml が発火するのは `src/` `public/` 等の変更時のみ
2. 手動デプロイ: `gh workflow run deploy.yml`
3. 反映が遅い場合は CDN キャッシュ（events.json は NetworkFirst 3分キャッシュ）を考慮して数分待つ

### 5. OCR 関連の不調
- `pdf-parse` は **v2（クラスAPI: `new PDFParse({data})` → `getText()`/`getScreenshot()`）**。v1 の関数形式で呼ぶと常に失敗し OCR API に流れてクォータを浪費する
- OCR クォータ枯渇時は無料ローカル（Tesseract/RapidOCR）のみで動作する設計。`hasAnyOcrEngine()` と各 API キーの設定を確認
- 同一アセットの再OCRは `scraper/ocr-cache.json`（GitHub Actions cache）で防止。キャッシュ破損時は Actions の cache を削除して再実行

### 6. push が rejected になる
スクレイプの自動コミットと競合している。`git pull --rebase origin master` → `git push`（生成データの競合は `-X theirs` で最新を正とする）

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

### 記載タイミングと書き方（規模ごと）
利用者に影響がある更新は、規模に応じて以下のように記載する（ユーザー確認は取らず自動で行い、`package.json` のバージョンも上げる）。

| 規模 | 動かす桁 | 記載 |
|------|----------|------|
| **大型修正** | 1桁目 | **内容を記載**（何がどう変わったか） |
| **中型修正**（feature） | 2桁目 | **内容を記載**（何がどう変わったか） |
| **小型修正**（improvement/fix） | 3桁目 | **内容は省略して簡潔に記載**（例: 「軽微な修正」「表示の調整」など） |

- **利用者に影響しない裏側の変更は記載しない**（バージョンも上げない）: スクレイパー内部改修・OCRツールの追加/差し替え・パーサーのリファクタ・Cloudflare回避調整・CI設定・デバッグスクリプト等、画面・表示・取得情報が変わらないもの。
- 判断基準: まず「利用者に影響するか」。影響しない裏側なら不記載。影響するなら規模に応じて、大/中は内容を記載・小は「軽微な修正」等で簡潔に記載。

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
