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
│   │   ├── ConsentGate.jsx     # 規約同意ゲート（未同意ならアプリを表示しない）
│   │   ├── NotFoundScreen.jsx  # 404画面（理由別文言＋直近イベントの提示）
│   │   ├── OfflineNotice.jsx   # オフライン/取得失敗のお知らせポップアップ
│   │   └── Shared.jsx          # 共通コンポーネント
│   ├── constants/
│   │   └── legal.js            # 規約・ポリシーの同意バージョン（改定時の再同意判定）
│   ├── data/
│   │   ├── regionMap.js        # 地域・都道府県マッピング（emblem フィールドあり）
│   │   └── prefectureShapes.js # SVG パス + REGION_LABEL_POSITIONS
│   ├── hooks/
│   │   ├── useEvents.js        # events.json フェッチ + 通知管理 + オフライン保持
│   │   ├── usePushSubscribed.js # 通知をオンにしているかだけを見る（バッジ判定用）
│   │   └── useOnline.js        # オンライン/オフライン状態の購読
│   └── utils/
│       └── appBadge.js         # ホーム画面アイコンの未読バッジ（SW と IndexedDB で共有）
├── scraper/                    # Node.js スクレイパー（Playwright + cheerio）
│   ├── index.js                # エントリポイント・PREF_TASKS の地本ループ（カットオフ対応）
│   ├── lib/
│   │   ├── llmClient.js        # 段1/段3 の LLM 呼び出し（Groq→Gemini）
│   │   └── llmCache.js         # LLM 結果のキャッシュ（SHA-256 / TTL 90日）
│   └── parsers/                # 都道府県別パーサー（51 県分＋utils.js）
│       └── utils.js            # guessCategory / guessTag / isPast など共通関数
├── public/
│   ├── 404.html                # 静的パス用の404ページ（/events/<県>.html 等）
│   ├── data/events.json        # スクレイプ結果（全イベントデータ）
│   ├── data/events-llm-recheck.json # 段3（一次ソース再検査）の自動修正レポート
│   ├── events.html             # 全イベント一覧（SEO向け静的HTML）
│   ├── events/                 # 都道府県別静的ページ（SEO向け・スクレイプ毎に生成）
│   │   └── <pref>.html         # 例: kagawa.html, tokyo.html
│   ├── sitemap.xml             # 全URL一覧（Google Search Console に送信済み）
│   ├── robots.txt              # クローラー制御
│   └── google3d6aa643f6d363c1.html # Google Search Console 所有権確認ファイル
├── scripts/
│   ├── generate-events-html.mjs # events.html / events/<pref>.html / sitemap.xml 生成
│   ├── generate-manifests.mjs   # 配色ごとの manifest-<scheme>.webmanifest 生成
│   └── generate-icons.mjs       # PWA アイコン・ショートカットアイコン生成
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
- 必要シークレット: `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OCR_SPACE_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NTFY_ADMIN_TOPIC`（管理者向け監視通知）, `NTFY_TOPIC`（旧・地域別の ntfy 配信。scrape.yml が使用）
- **deploy.yml のトリガーには `shared/**` と `middleware.js` も含める**。フロントは `shared/*.cjs` を直接 import しているため、ここが漏れると shared だけの修正がサイトに反映されない（2026-08-29 に漏れていたのを修正）

## スクレイパー仕様

- スケジュール: 日本時間 **05:33 / 09:33 / 15:33 開始**（1日3回。scrape.yml の cron `33 20 / 33 0 / 33 6` = UTC）
  - **カットオフ（2026-09-02 導入）**: スロットの **6分前**でスクレイプを打ち切り、
    そこまでに取れた分で公開する。OCR・LLM が長引いて 09:32 や 12:40 に配信されていたのを防ぐ。
    判断は **`shared/scrapeDeadline.cjs`（cron→スロットの対応も含めて唯一の出どころ）**。下記「カットオフ」参照
  - **通知は 08:00 / 12:00 / 18:00(JST) のスロットで送る**。ジョブ内でスロットまで `sleep` してから送信するため、
    スクレイプはスロットより前に終わらせておく必要がある（開始 = スロットの **147分前**）
  - 根拠（2026-08-30 に Actions API で実測）: ジョブ全体 **61.6 / 62.3 / 63.4 分**（準備40秒＋本体約60分＋
    検査・commit・デプロイ・CDN待機 約3分）。**LLM を挟んでも所要はほぼ変わらない**（導入前 62.5 / 62.7 / 63.6 分。
    キャッシュ済みは呼ばず、段3は1実行30件上限のため）。GitHub の起動遅延は実測（直近30回）で
    最小17分・中央値66分・p75 122分。147分前なら **83分の遅延まで定刻どおり**送れる（実測30回中20回＝67%。
    従来の93分前では27%しかカバーできず、通知が 09:32 のような中途半端な時刻に出ていた）
  - **cron を変えたら通知ステップの `TARGET_UTC` 対応表も必ず直す**（古いままだと待機が効かず、
    スクレイプ完了と同時に通知が飛ぶ）。`timeout-minutes` は待機（最大約83分）を含めて 180 分
  - 分を `:33` にしているのは `:00` が GitHub 側で最も遅延するため（混雑回避）
  - 遅延がこれを超えてスロットを過ぎた場合は即時送信し、`::warning::` と実行サマリの「※定刻外」で分かるようにしている
### カットオフ（配信スロットに間に合わせる打ち切り）

**「予定時刻までに終わらなかったら、その時点で終わっているものを公開する」**。
判断は `shared/scrapeDeadline.cjs` に集約（cron→スロットの対応表もここが唯一の出どころ）。

| 決めごと | 値・場所 | 理由 |
|---|---|---|
| 打ち切り時刻 | スロットの `RESERVE_MINUTES`（6分）前 | 打ち切り後に品質チェック→commit→デプロイ→CDN伝播(60秒)が要る（実測約3分）。倍の余裕 |
| 締切を使わない条件 | 使える時間が `MIN_USEFUL_MINUTES`（15分）未満 | 起動が遅すぎる回で打ち切ると「何も更新せず新着ゼロ」を定刻配信するだけになる。**最後まで走らせて遅れて配信**する |
| 手動実行 | 締切なし | 狙うスロットが無い |
| 打ち切りが効く場所 | 地本ループ／案内所巡回／HQ探索／OCR補完／LLM段3 | どれか1つでも抜けるとそこで時間を使い切って間に合わない |

- ⚠️ **取得できなかった地本は前回データを引き継ぐ**（`keysNeedingCarryOver`）。
  失敗も時間切れも扱いは同じ。ここを漏らすとその地本のイベントが**公開データから丸ごと消える**
  （打ち切り機能で一番怖い壊れ方）。実測で 7地本失敗＋43地本見送りでも 208件→208件で不変を確認済み
- ⚠️ **地本の開始位置は実行ごとにずらす**（`rotationOffset`。歩幅17は50と互いに素）。
  固定順のままだと打ち切りが常に後半（九州・沖縄）に当たり、そこだけ永久に更新されない
- 打ち切りが起きた回は `scraper/cutoff-report.json` に残り、scrape.yml が
  実行サマリに出しつつ ntfy で管理者へ通知する（毎回どこかを切っているなら開始時刻の見直しが要る）
- 1地本も取得できなかった場合は **events.json を更新しない**（空データで上書きしない）
- 地本の一覧は `scraper/index.js` の **`PREF_TASKS`**（50件）。
  追加・削除したら `shared/scrapeDeadline.test.cjs` の件数チェックも直す
- ⚠️ **cron を変えたら `shared/scrapeDeadline.cjs` の `SLOTS` も直すこと**。
  テストが scrape.yml を読んでズレを検出する（以前は対応表がワークフロー内に手書きで二重管理だった）

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

## LLM を挟んだ整形・検査（段1〜段3。2026-08-26 導入）

スクレイピング/OCR の途中に LLM を挟み、「資料に書かれていることだけを、規定の JSON で」取り出す。
**LLM は上乗せであって必須依存ではない**。APIキーが無い・全滅した場合も、従来の正規表現パイプラインだけで完動する。

実装: `shared/llmExtract.cjs`（純粋ロジック・テスト付き）/ `scraper/lib/llmClient.js`（API呼び出し）/ `scraper/lib/llmCache.js`（キャッシュ）

### 段1 LLM整形（`structureOcrText`）
ローカルOCR（Tesseract/RapidOCR）の生テキストは行が分断され、正規表現 `parseTextToEvent` では取りこぼしが多い。
先に LLM で規定スキーマへ整理し、駄目なら正規表現へ落とす。**LLM は「足す」だけで「引かない」**:
- LLM が使えない/失敗 → 従来どおり正規表現の結果を使う
- LLM がタイトルを取れなかった → 正規表現の結果を使う（今より悪くしない）
- LLM が日付を取れず正規表現が取れた → 日付だけ補う

### 段2 検査（`decideRecheck`。規則判定のみ・LLMを呼ばない）
全イベントを規定スキーマと突き合わせ、`ok` / `recheck` / `junk` を決める。
**再検査に回すのは「タイトル欄にタイトルでない値が入っている」場合と「開催日が取れていない」場合だけ。**
- `time`/`tag`/`deadline` のような**任意項目の書式ズレは再検査の理由にしない**（整形で直すもの）。
  ここを条件に入れると実測 179 件中 175 件が対象になり、再検査の上限を食い潰す（2026-08-26 に実測して修正）。
- 欠損の表し方は経路により `null`/`undefined`/`''` とばらつくため、`nullify()` で一本化してから判定する。
  空文字を「規定外の値」と誤判定しないこと。
- タイトル長の上限は **45文字**（`scripts/check-event-titles.mjs` の「極端に長い」と揃える）。

### 段3 再検査（一次ソース照合・LLM vision）
段2が `recheck` と判定し、かつ一次ソース（チラシ画像・PDF）を持つイベントだけ、その資料を読み直して抽出し直す。
- 取得は必ず `downloadFile()` 経由（＝assetCache の条件付きGETに乗るので重複DLしない）。304 のときはハッシュでキャッシュを引く
- **差異があれば再抽出を採用する**（一次ソースを直接見た結果なので照合済み扱い）。`verifiedBy: 'llm-recheck'` を付与
- **再抽出が null を返したフィールドは元の値を残さない**（裏付けの無い情報を消す）。
  結果として必須項目（タイトル・開催日）が埋まらなければ**公開しない＝検疫**へ回す
- 1実行あたりの上限は **30件**（`LLM_RECHECK_LIMIT`）。超過分は今回は手を触れず次回へ回す
- 結果は `public/data/events-llm-recheck.json` に残し、scrape.yml が ntfy で管理者へ通知する

### LLM の使い方の決めごと
- **出力は必ず JSON**（Groq: `response_format: json_object` / Gemini: `responseMimeType: application/json`）。
  そのうえで **`normalizeLlmEvent` が規定外の値を捨てる**。モデルが規定を守ることに依存しない
- **資料に無い情報は必ず `null`**。推測で埋めさせない（埋めた値は「一次ソースに無い情報」＝誤情報）
- プロバイダは **Groq 優先 → Gemini フォールバック**（無料枠の大きい方を先に使う）。
  モデル廃止（404）は `OcrModelResolver` が候補の切り替えで追従する
- キャッシュは `scraper/llm-cache.json`（`.gitignore` 対象・Actions cache で永続化）。
  キーは 用途＋プロンプト版＋入力 の SHA-256。**プロンプトを変えたら `PROMPT_VERSION` を上げる**
- 環境変数: `GROQ_LLM_MODEL` / `GEMINI_LLM_MODEL`（任意・モデル固定）、`LLM_RECHECK_LIMIT`（既定30）

## イベントカード記述ルール（正準仕様）

イベントカード（`events.json` の各イベント）の**各フィールドの書式・記述ルールの単一の正準**。スクレイパー・手動入力（運営者ページ）・QAチェックはすべてこのルールに従う。実装は次に集約されており、**新しいパーサー・手動修正も必ずこの経路（モジュール）を通すこと**：
- `shared/titleQuality.cjs` … 全経路共通の整形/不正除外/年ズレ/重複（`cleanEventTitle`/`isJunkOrStubTitle`/`isStaleDatedEvent`/`dedupEvents`/`cleanPlaceText`/`applyVerifiedOverrides`）
- `shared/officeTitle.cjs` … 募集案内所イベント専用の整形/除外（`cleanOfficeTitle`/`officeIsJunk`/`cleanOfficePlace`/`stripTrailingCta`）
- `scraper/parsers/utils.js` … カテゴリ/タグ/曜日の判定（`guessCategory`/`guessTags`/`calcWeekday`）
- `shared/branch.cjs` … 陸海空の種別判定（`BRANCH_DEFS`/`matchesBranch`/`branchesOf`/`normalizeBranches`）

### フィールド一覧（スキーマ）

| フィールド | 必須 | 書式 / 標準値 | ルール |
|---|---|---|---|
| `id` | 自動 | ハッシュ | タイトル等から自動生成。全県横断で一意化（衝突時に接尾辞）。 |
| `pref` | ✓ | 地本キー（例 `tokyo`） | `SUPPORTED_PREFECTURES` のいずれか。 |
| `date` | ✓ | `YYYY-MM-DD` | 開催日（初日）。不正・欠落は除外。 |
| `endDate` | — | `YYYY-MM-DD` | 連日開催の最終日。`date` 以上のときのみ有効。 |
| `title` | ✓ | 下記「タイトル」参照 | イベント名。空・不正は除外。 |
| `place` | — | 会場名のみ | 事務所リスト・時間・住所の混入不可（下記）。 |
| `address` | — | 住所 | 任意。 |
| `time` | — | `HH:MM～HH:MM`（または `HH:MM`／`終日`） | 波ダッシュは `～` に統一。**不明なら空**（推測しない）。 |
| `category` | ✓ | 固定9値（下記） | `guessCategory()` で判定。9値以外は使わない。 |
| `tag` | — | 申込要否・属性（下記） | 主に1つ。 |
| `tags` | — | 属性タグの配列（下記） | **手動入力のみ**。`shared/tags.cjs` の8値だけ。絞り込みチップと対応。 |
| `branch` | — | `['ground'\|'maritime'\|'air']` | 陸海空の種別（下記）。**手動入力のみ保存**。スクレイプ品は持たず表示側で推定。 |
| `ageRequirement` | — | 対象（下記） | 「対象」欄。 |
| `deadline` | — | `M月D日（曜）` | 申込締切（例 `7月10日（金）`）。 |
| `url` | — | URL | 公式ページ/チラシ。 |
| `notes` | — | 文字列 | 備考。 |
| `weekday`/`endWeekday` | 自動 | 曜日漢字 | 日付から `calcWeekday()` で自動。 |
| `source_type` | 自動 | `office_html`/`office_ocr`/`office_notice` 等 | 取得経路。 |
| `imageUrl` | — | URL | チラシ画像。 |
| `status` | 手動のみ | `draft`/`published`/`closed`/`cancelled` | 手動イベント（`manual-…`）のみ。スクレイプ品は持たない。 |
| `weatherLocation` | 自動 | `{latitude,longitude,label,accuracy}` | 天気予報用の座標。`writeOutput` 内で `scraper/lib/geocode.js`（国土地理院API）が付与。`accuracy`: `address`/`venue`/`municipality`/`prefecture`（手動入力は `manual`）。下記「天気予報」参照。 |

### タイトル（title）
**整形（`cleanEventTitle`）**: 以下を除去/修復してから採用する。
- 先頭: 「イベント情報」見出し、`#`/装飾記号、**更新バッジ「更新情報New/新着情報…」**、ページ番号残骸。
- 末尾: 「参加費無料」等の宣伝文句、絵文字、**波ダッシュ `～`**、**助詞断片（「○○の」等の途中切れ）**、空括弧。
- **会場連結**: 「○○！！ [会場名] ～」のように本文の後ろへ会場名が連結 → 会場語があるときのみ切り落とす（年号 `!! 2026` 等は誤爆させない）。
- **複数イベント連結**: 「A説明会in広島の B説明会inふくやまの …」→ 先頭イベントのみ残す（イベント語2回以上＋「の␣」連結時）。
- 案内所名のみのタイトルは「自衛隊説明会（○○）」に補完。

**中国語（簡体字）の扱い**: OCR が日本語の漢字を簡体字として誤読することがある
（実例: 「关山演习場」→ 正しくは「関山演習場」、「门司港」→「門司港」）。
**単純に弾くと正規のイベントごと消える**ため、`toJapaneseKanji` でまず日本語（新字体）へ直し、
それでも残る中国語だけを `hasForeignChinese` で不正とする。`cleanEventTitle` / `cleanPlaceText` /
`normalizeLlmEvent`（LLM出力）のすべてが変換を通る。
⚠️ 判定用の文字リストは**日本語で絶対に使わない字だけ**にすること。
大きな簡体字リストを手で並べて「潜・横・里・谷・条」等を混入させ、正規イベント67件を
誤除外する実装を一度作っている（2026-08-27）。迷ったら足さない。主役は変換表であって除外ではない。

**除外（`isJunkOrStubTitle`＝中身なし/不正）**: 郵便番号・電話・住所混入、申込/リンク案内、様式・受験案内断片、ラベル行（「主催:」等）、OCR文字化け、部隊名のみ（種別なし）、助詞終わり、スタブ「○○地本イベント」、日本語がほぼ無い断片 等。

**年ズレ（`isStaleDatedEvent`）**: タイトル/URL の西暦がイベント年より古い再登録を除外。

**重複（`dedupEvents`）**: 同一地本・同日で、名称一致 or 一方が他方を包含（**8文字以上**）し、場所が両立（どちらか空/一致/包含）する場合のみ統合。**場所が異なる同名イベントは別物として残す**。情報量の多い方を残す。

**募集案内所イベント（`source_type` が `office*`）**: 上記に加え `shared/officeTitle.cjs` で過去実績・制度説明・お知らせ・ナビメニュー塊・カレンダー塊・メール/住所/電話混入を除外し、末尾の誘導文言を除去する。

### 場所（place）
会場名のみ。「A事務所・B事務所 ほか1拠点」等の巡回元事務所リストは**空にする**（誤った場所より空欄が良い）。Markdown表のパイプ残骸を除去。`cleanPlaceText`/`cleanOfficePlace`。

### カテゴリ（category）— 固定9値
`説明会` / `採用イベント` / `一般公開` / `艦艇公開` / `体験` / `演奏会` / `記念行事` / `広報活動` / `地域参加`。`guessCategory()` で判定し、**9値以外は使わない**。判定不能は `広報活動`。

### タグ（tag）
申込要否・属性。**定義と判定は `shared/tags.cjs` に集約**（スクレイパーの `guessTags()` とフロントの絞り込みチップが同じ定義を使う）。値は `入場無料`/`要予約`/`オンライン`/`家族向け`/`学生向け`/`抽選`/`個別`/`OB・OG`。手動入力の申込要否は `要予約`/`予約不要`/`事前申込制`/`入場無料`/`要問合せ`。
⚠️ パターンを `scraper/parsers/utils.js` や `FilterBar.jsx` に直接書かないこと。以前は二重管理で、スクレイパーだけが付ける `個別` に絞り込みチップが無かった（2026-08-29 に一本化）。

**明示タグ（`tags`）と文面推定の関係**（2026-08-30 導入）:
- `tag` は**申込要否1つ**（要予約/予約不要/事前申込制/入場無料/要問合せ）。運営画面のセレクト。
- `tags` は**属性タグの配列**（絞り込みチップと同じ8値）。運営画面のチップで複数選択でき、`normalizeTags` が既知IDだけに正規化する。
- `matchesTag` は **①明示タグ（`tags` ＋ `tag` が属性タグと同値のとき）→ ②タイトル・備考・`tag` の文面推定** の順で判定する。
  スクレイプ品は主タグ1つしか持たないため②を残している。運営が確実に絞り込みへ出したいときは `tags` を使う。
- スクレイパーは `tags` を書かない（`tag` のみ）。手動入力の意思とスクレイプの推定を混ぜないため。

### 種別（branch）— 陸上 / 海上 / 航空
判定は **`shared/branch.cjs` に集約**（フロントの絞り込み・運営テンプレ・管理API で共有）。

- **値**: `ground`（陸上）/ `maritime`（海上）/ `air`（航空）の配列。合同開催があるため複数可。
- **手動入力（運営）が最優先**: `branch` が入っていれば推定しない（人が入れた値を機械が上書きしない）。
  運営画面の「自衛隊の種別（複数選択可）」で入力。未選択なら**フィールド自体を保存しない**。
- **スクレイプ品は `branch` を持たない**。表示時に `title`/`place`/`notes`/`category` から推定する:
  1. `strong`（`陸上自衛隊`・`駐屯地`・`護衛艦`・`航空自衛隊`・`航空祭` 等の明示語）に当たればそれ
  2. どの種別の `strong` も無いときだけ `weak`（`岸壁`・`戦闘機` 等の施設・装備語）で補う
     ※「基地」は海自（舞鶴基地）と空自（入間基地）の両方が使うので単独では決め手にしない
- **判定できないイベントは種別なし**（実測で全179件中145件）。種別で絞ると出てこない。
  **推測で振り分けない**方針（誤った断定より「出ない」を選ぶ）。運営が手動で `branch` を入れれば出る。
- 新種の語を足すときは `shared/branch.cjs` の `BRANCH_DEFS` に追加し、`shared/branch.test.cjs` に
  テストを足す（`npm test`）。**日本語の一般語を拾わないか実データで必ず確認すること**
  （2026-08-26 に中国語ブロックリストで同種の誤爆事故あり）。

### 時間（time）・対象（ageRequirement）・締切（deadline）
- `time`: `HH:MM～HH:MM`（波ダッシュは `～`）。終日開催は `終日`。**不明なら空**（推測で埋めない）。
- `ageRequirement`: 定型 `18歳以上33歳未満`/`高校生以上`/`中学生以上`/`小学生以上`/`15歳以上17歳未満（高等工科学校）`/`一般（どなたでも）`/`ご家族向け` 等（`AGE_OPTIONS`）。自由入力も可。
- `deadline`: `M月D日（曜）` 形式（`toDeadlineStr` と同形式）。

### 必須・検証・寿命
- `date` と `title` は必須（欠落/空は除外）。`endDate` は `date` 以上のときのみ有効。
- 終了後も **7日間は「終了済み」として表示**（`ENDED_KEEP_DAYS`）。お気に入り登録分は常時表示。
- OCR系（`office_ocr` 等）は**一次ソース（チラシ実物）照合が必須**。確定修正は `VERIFIED_OVERRIDES` に登録（events.json 直接修正は OCR キャッシュで再発する）。
- 新種の不正パターンを見つけたら `shared/titleQuality.cjs` にルール追加＋`shared/titleQuality.test.cjs` にテストを足し、`npm test` で検証する。

## 運営方針：データ反映の必須フロー

イベントデータは必ず次の順で処理する。**文字の整形を飛ばしてサイトカードに反映することは禁止。**

```
1. スクレイピング（定期 or 手動）
       ↓
1.5 段1 LLM整形（OCRテキスト） … scraper/lib/llmClient.js
       ↓
2. 文字の整形【必須】 … shared/titleQuality.cjs
   - applyVerifiedOverrides（チラシ照合済み修正）
   - cleanEventTitle / cleanPlaceText（ゴミ除去・補完）
   - isJunkOrStubTitle / isStaleDatedEvent（不正・年ズレ除外）
   - dedupEvents（重複統合）
   ※ writeOutput が自動適用する。手動で events.json を触る場合も
     必ず同じ titleQuality パイプラインを通すこと
       ↓
2.5 段2 検査（規則・無料） → 段3 再検査（一次ソース・LLM）
    タイトル欄にタイトルでない値／開催日が取れていないものだけチラシ実物で読み直す
       ↓
3. 品質チェック … scripts/check-event-titles.mjs（CI でも自動実行）
       ↓
4. サイトカードへ反映（commit → 自動デプロイ）
```

- 過去に「整形なし反映」でイベント名が住所・部隊名のみ・リンク文言になる事故が繰り返し発生している。新しい取得経路・パーサーを追加するときも、必ず writeOutput（＝titleQuality適用後）を通る経路にすること。
- 古いコミットでチェックアウトされた定期実行が旧ルールで出力することがある。スクレイプ後の確認時はデータの生成元コミット（`gh run view <id> --json headSha`）も確認する。

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

### ⚠️ events.json の直接修正は再発する（必ずオーバーライドに登録）
OCRキャッシュ（ocr-cache.json）は誤ったタイトルを保持し続けるため、**events.json を直接修正しても次のスクレイプで同じ誤りが再生成される**（2026-06-12に実際に再発）。チラシ照合で確定した修正は `shared/titleQuality.cjs` の **`VERIFIED_OVERRIDES`** に登録すること（URLの固有部分＋必要なら日付でマッチ → writeOutput が毎回適用）。同じPDF URLを複数イベントが誤共有することがあるため、タイトル書き換えは日付スコープを推奨。

### 防御の仕組み（titleQuality）
- イベント名の整形・不正判定・年ズレ判定・重複統合は **`shared/titleQuality.cjs` に集約**されている（`cleanEventTitle` / `isJunkOrStubTitle` / `isStaleDatedEvent` / `dedupEvents`）
- タイトルは複数経路（HTMLパーサー / OCR / 事務所巡回 / 前回データ維持）で生成されるため、**個別パーサーではなく `writeOutput` の最終フィルタで経路非依存に防御**する設計
- **新種の不正パターンを見つけたら `titleQuality.cjs` に追加し、`shared/titleQuality.test.cjs` にテストケースを足す**（`npm test` で検証）
- 既存 `events.json` の汚染は再スクレイプを待たず、titleQuality を使ったスクリプトで直接クリーンアップ → `node scripts/generate-events-html.mjs` → commit/push で即デプロイできる（deploy.yml が public/ 変更で自動発火）

### 検疫（quarantine）— 新種のゴミを公開前に止める仕組み（2026-07-03 導入）
既知ルール（isJunkOrStubTitle）をすり抜ける**新種のゴミパターンがルール追加まで公開され続けた事故**
（岩手: 艦艇公開ページの表の行「乗艦受付時刻」等が3日間公開）の再発防止。**安全側デフォルト＝疑わしきは公開しない**。

- `isSuspiciousTitle`（titleQuality.cjs）: イベント語（説明会/見学/体験/まつり等）を含まず、かつ
  非イベント兆候（ラベル語終わり・組織名のみ・装備スペック・述語断片・様式行）があるタイトルを「疑わしい」と判定
- `writeOutput`: 疑わしいイベントは events.json に**載せず** `public/data/events-quarantine.json` へ隔離
  （毎回全置換。ルール追加や承認で解消すると次回から自動的に消える）
- `scrape.yml`「検疫レポート」ステップ: 検疫が発生したら ntfy で管理者へタイトル一覧を通知＋Summary に件数
- **検疫されたのが正規イベントだった場合**: `titleQuality.cjs` の **`APPROVED_TITLES`** に部分一致パターンを
  追加すると次回スクレイプから公開される（正式名へ修正する場合は `VERIFIED_OVERRIDES` を使う）
- 誤検疫を最小化するため判定は保守的（イベント語があれば検疫しない）。検知漏れは従来どおり
  isJunkOrStubTitle へのルール追加で対応し、テストを `titleQuality.test.cjs` に足す

## フロントエンド仕様

- **地域マップ**: 8地域（北海道・東北・関東・中部・近畿・中国・四国・九州）
- **都道府県 emblem**: `regionMap.js` の PREFECTURE_INFO と REGIONS 両方に同じ値が必要（全50件ユニーク）
- **テーマ**: CSS 変数 `var(--bg)` / `var(--text)` / `var(--card)` / `var(--border)` でライト/ダーク切替
- **ブランド色（陸/海/空の `primary`・`accent`）の使い分け**（2026-08-29 導入）:
  - **背景として**使うとき（ヘッダー・選択中ボタン・白ピルの上の文字）は従来どおり `theme.primary` / `theme.accent`
  - **文字・アイコンとして**テーマ面（`--bg`/`--card`/`--tag-bg`）の上に置くときは
    **`var(--brand-fg)` / `var(--accent-fg)`** を使う。日数バッジは `daysFgColor()`（`src/utils/date.js`）
  - 変数の値は `App.jsx` が配色とテーマから決めて `documentElement` に流す。
    ダークの値は `shared/brandColors.cjs` の `foregroundOnDark()`＝色相を保ったまま
    明度を上げて AA(4.5) を満たす色（`shared/brandColors.test.cjs` で検証）
  - ⚠️ 濃いブランド色（陸 `#3a4130`・海 `#0b2545`・空 `#2a4a6b`）をダークの面に**文字として直接置かない**。
    コントラストが 1.1〜1.9 しかなく読めない（2026-08-29 に全画面で発生していたのを修正）
- **起動時のテーマ確定（白フラッシュ対策）**: グローバルCSS は `main.jsx` が JS 実行時に注入するため、
  それまで body はライト色のままで、ダーク利用者はコールドロードのたびに白い画面を経由していた。
  `shared/bootTheme.cjs` の `<style>`＋`<script>` を `vite.config.js` の `bootThemeInject` が
  `index.html` / `admin.html` の `<head>` 先頭へ注入し、**初回描画前に**テーマを確定させる
  （CSS が OS 設定、script が `localStorage['jsdf-dark']` の明示指定を担当）。
  ⚠️ **`index.html` に背景色を直接書かないこと**（ライト固定になり同じ事故が再発する）。
  `BOOT_BG` は `globalStyles.js` の `--bg` と一致必須で、`shared/bootTheme.test.cjs` が実ファイルを
  読んで検証している（ズレると起動直後と描画後で色が変わり、別の形でちらつく）。
- **プッシュ通知**: Web Push（`/api/subscribe` に購読を保存 → `/api/notify` で配信）。
  旧 ntfy.sh トピック方式（`NTFY_TOPIC` / NtfyGuideModal）はアプリ側では廃止済みで、
  ntfy は scrape.yml からの管理者・地域別通知にのみ残っている（`src/config.js` 冒頭の注記を参照）

## PWA（ホーム画面アプリ）（2026-09-01 整備）

ブラウザで見たときと、ホーム画面に追加したときで**見た目が変わらない**ようにする。
配色（陸/海/空）は利用者が選べるため、OS 側が使う値も選んだ配色に追従させる。

**`shared/pwaTheme.cjs` が唯一の出どころ**（色・アイコン・ショートカット・manifest 本体）。
`vite.config.js`（既定の `manifest.webmanifest`）と `scripts/generate-manifests.mjs`
（配色ごとの `public/manifest-<scheme>.webmanifest`）が同じ `buildManifest()` を使う。

| OS が見る値 | 効くところ | 反映のしかた |
|---|---|---|
| `<meta name="theme-color">` | ステータスバー／タイトルバー | `shared/bootTheme.cjs` が**初回描画前**に生成。配色変更時は `App.jsx` が更新 |
| manifest の `theme_color` | インストール時のバー色 | 配色ごとの manifest（`<link rel="manifest">` を実行時に差し替え） |
| manifest の `background_color` | 起動時に OS が出すスプラッシュの地色 | 同上。**SplashScreen の暗い地色と揃える** |
| manifest の `icons` | ホーム画面アイコン | 配色ごとに `icon-<scheme>-{192,512}.png` |
| `<link rel="apple-touch-icon">` | iOS のホーム画面アイコン | `bootTheme.cjs` / `App.jsx` が差し替え |

- ⚠️ **`index.html` に `<meta name="theme-color">` を直書きしないこと**。静的に書くと
  「HTML の既定色 → JS が上書き」で起動のたびに色が変わって見える（`bootTheme.cjs` が生成する）
- ⚠️ **`background_color` に明るい色を置かないこと**。アプリ側のスプラッシュはどの配色も暗いため、
  白系だと起動のたびに白い画面を経由する（`#f5f6f8` 固定だった。2026-09-01 修正）
- ⚠️ **manifest に `orientation` を書かないこと**。`portrait` に固定するとアプリ内の
  「表示の向き」設定（縦/横/自由回転）がインストール版だけ効かず、横向きレイアウトを一切使えない
- 全画面利用の宣言は `mobile-web-app-capable`（標準）と `apple-mobile-web-app-capable`（iOS 用の旧名）の
  **両方**を書く。`viewport-fit=cover` ＋ `black-translucent` で内容をステータスバー下まで広げ、
  各画面が `env(safe-area-inset-*)` で余白を取る
- 色・パス・ショートカットを変えたら **`npm run generate-icons && npm run generate-manifests`**
  （`npm run build` に組み込み済み）。`shared/pwaTheme.test.cjs` が
  `src/config.js` の配色・SplashScreen の地色・`App.jsx` の ROUTE_SCREENS・生成済みファイル・
  アイコンの実在を突き合わせ、ズレていれば CI を落とす

### ショートカット（ホーム画面アイコンの長押し）
`SHORTCUTS`（`shared/pwaTheme.cjs`）に定義。`/list`・`/favorites`・`/notifications`・`/settings`。
**URL は `App.jsx` の `ROUTE_SCREENS` に実在するパスであること**（無いと404画面に着地する。テストで検証）。
表示名はアプリ内の画面名と揃える（ランチャーと画面で呼び名が違うと迷う）。iOS は非対応。

### 未読バッジ（アイコン右上の数字）
`src/utils/appBadge.js`（Badging API）。**通知をオンにしている人にだけ出す**。
- アプリを開いている間 … `App.jsx` が「お知らせの未読件数」を書き込む（既読にすると消える）
- アプリを閉じている間 … `src/sw.js` の `push` ハンドラが受信のたびに +1 する
- Service Worker は localStorage を読めないため、件数は **IndexedDB（`jsdf-badge`）で共有**する。
  アプリ側が書くときに IndexedDB も揃えるので、既読にすれば SW 側の数え上げもリセットされる
- ⚠️ `usePushSubscribed` は **true/false/null（判定前）の3値**。購読確認は非同期なので、
  判定前に false 扱いで消すと SW が数えたバッジを起動直後に失う
- 未対応環境（Firefox・iOS16.3以前・非インストール）では何も起きない。例外も投げない
- ⚠️ 端末内の保存項目が増えるため、**プライバシーポリシーの記載と `LEGAL_VERSION` を更新済み**
  （2026-09-01。localStorage だけと書いてあったところに IndexedDB を追記）

## オフライン対応（2026-08-26 導入）

通信できない状態でもイベントを閲覧できる。**「今見えている情報がいつ時点のものか」を必ず画面に出す**のが原則。

- **データの永続化**: `useEvents` が取得成功データを `localStorage['jsdf-events-cache']`（約140KB）へ保存し、
  起動時の初期値にする。SW キャッシュが失効・破棄されても空アプリにならない
- **Service Worker**: `/data/events.json` は NetworkFirst のまま、**フォールバックの寿命を30日**にした。
  以前は `maxAgeSeconds: 300` で、5分を過ぎたキャッシュが破棄されオフラインだと1件も出なかった。
  maxAge は「鮮度の上限」ではなく「ネットワーク失敗時にどこまで古いものを出してよいか」の上限
- **キャッシュ由来の判別**: SW の `markFromCache` プラグインがキャッシュから返す応答に `X-From-Cache: 1` を付ける。
  これが無いと「オフラインなのに取得成功」と誤判定する（NetworkFirst のフォールバックは 200 で返るため）
- **表示**: `OfflineNotice`（ポップアップ）で知らせる（2026-08-29 に常時表示の帯から変更）。
  ブラウザがオフラインなら「現在オフラインです」、通信はできるが取得に失敗したなら「最新の情報を取得できませんでした」＋再試行。
  **画面上下に帯を出し続けない**（狭い画面で一覧の領域を常時奪うため）。閉じたあとは何も残さない。
  - 発火は「サイト表示時（初回取得が決着した時点）」と「通信が切れた時」の2つ。`App.jsx` が判定する。
    ⚠️ `stale` はキャッシュ起動時の初期値が `true` なので、**`checkedAt` が付く（初回取得が決着する）まで判定しない**
    （決着前に見ると、取得に成功する場合でも一瞬ポップアップが出る）。
  - 同じ切断のあいだは出し直さない（`offlineNoticeShown` ref）。オンラインに戻ると自動で閉じ、次に切れたらまた知らせる。
  - 閉じた状態は**保存しない**（端末に新たな保存項目を増やさない＝ポリシーの記載を増やさない）。
    次にサイトを開いたときは、オフラインならまた知らせる。
  - 帯を無くした代わりに、一覧ヘッダーの時刻表示を `stale` のとき「最終取得 …」に切り替える
    （「確認 <今の時刻>」のままだと最新を取れたように読めてしまう）。
- **オフラインで動かない機能**は事前に代替表示へ切り替える（失敗させてから気付かせない）:
  天気カード・Google マップ埋め込み（`useOnline`）・不具合報告の送信・通知の登録/解除
- **復帰**: `online` イベントで自動的に再取得する

⚠️ **Playwright の `context.setOffline(true)` は Service Worker のネットワークまでは遮断しない**（SW は別ターゲット）。
オフラインの検証は**プレビューサーバー自体を停止**して行うこと。

## 404 ページ（2026-08-26 刷新）

| 経路 | 担当 | HTTPステータス |
|---|---|---|
| SPA の不明なURL・掲載終了イベント（`/event/:id`） | `src/components/NotFoundScreen.jsx` | 200（SPA のため）＋ `robots: noindex, follow` を動的付与 |
| 静的パス（`/events/<県>.html`・`/data/*` 等） | `public/404.html` | 404（Vercel が自動で返す） |

- `NotFoundScreen` は理由を出し分ける（`reason='event'`＝掲載終了の可能性 / `'path'`＝不明なURL）
- 行き止まりにしないため、開催が近いイベントを最大4件提示する
- `vercel.json` の rewrite 除外リストに `404\.html` を入れてある（入れないと rewrite に飲まれて index.html が返る）

## 利用規約・プライバシーポリシーの同意（2026-08-26 導入）

**規約・ポリシーを改定したら、各利用者に一度だけ再同意を求める。同意が得られなければアプリを使わせない。**

- 判定: `src/constants/legal.js` の `LEGAL_VERSION` と `localStorage['jsdf-legal-accepted']` を比較
  （記録なし＝初回 / 値が違う＝改定による再同意 / 一致＝不要）
- 表示: `src/components/ConsentGate.jsx`。同意するまで**アプリ本体を描画しない**。運営者ページ（`/admin.html`）は対象外
- 同意しない場合: 確認 → `window.close()` を試み、閉じられない環境では終了画面を出し続ける（実質的に利用不可）。
  誤操作からの復帰用に「同意画面に戻る」だけ残している
  （※ スクリプトが開いたタブでない限り `window.close()` はブラウザに拒否される。終了画面が実質の遮断）

### 改定したときの手順（順番を守ること）
1. `src/constants/privacy.js` / `terms.js` を修正する
2. **`LEGAL_VERSION` を新しい日付に上げる**（上げ忘れると再同意が求められず、古い同意のまま使われる）
3. `LEGAL_REVISED_AT`（表示用）と `LEGAL_CHANGES`（変更点の要約）を更新する
4. 実装との整合を必ず確認する。**「使っていない」と書いたものを使っている状態を作らない**
   （2026-08-26 の監査で、ポリシーが「アクセス解析は使用していません」と書く一方 `src/main.jsx` が
   Vercel Analytics / Speed Insights を注入していた。ほかに位置情報・方位センサー・Google マップ埋め込みが未記載だった）

## 共通化のルール（重複定義を作らない）

同じ値・同じ計算を2か所に書かないこと。過去に「片方だけ直してズレる」事故が起きている。

| 対象 | 唯一の出どころ | 使う側 |
|---|---|---|
| 「終了済み」を残す日数 | `shared/eventStatus.cjs` の `ENDED_KEEP_DAYS`（7日） | `src/hooks/useEvents.js`（表示フィルター）／`scraper/index.js`（writeOutput の削除判定） |
| JST の「今日」(YYYY-MM-DD) | `src/utils/date.js` の `jstTodayStr()` | 画面各所（以前は5ファイルで重複定義＋12か所にインライン展開されていた） |
| 日数バッジの文字色 | `src/utils/date.js` の `daysFgColor()` | 一覧・地域・お気に入り（背景の淡い塗りは `daysColor()` を継続） |
| 陸海空の判定 | `shared/branch.cjs` | フロントの絞り込み／運営テンプレ／管理API |
| タグ（申込要否・属性）の定義と判定 | `shared/tags.cjs` | スクレイパーの付与（`guessTags`）／フロントの絞り込みチップ・件数 |
| タイトル整形・不正判定 | `shared/titleQuality.cjs` / `shared/officeTitle.cjs` | スクレイパー／フロント／スクリプト |
| ブランド色の文字用 | `shared/brandColors.cjs` ＋ CSS 変数 `--brand-fg`/`--accent-fg` | 全画面（上記「テーマ」参照） |
| PWA の色・アイコン・ショートカット | `shared/pwaTheme.cjs` | `vite.config.js`（既定 manifest）／`scripts/generate-manifests.mjs`（配色別）／`scripts/generate-icons.mjs`／`shared/bootTheme.cjs`／`src/App.jsx` |
| 配信スロット・打ち切り期限・開始位置のずらし | `shared/scrapeDeadline.cjs` | `scraper/index.js`（締切・ローテーション・前回データ引き継ぎ）／`.github/workflows/scrape.yml`（通知の待機時刻） |
| 公開URL・許可オリジン | `shared/siteUrl.cjs` | 全体（上記「セキュリティ構成」参照）／`shared/domainNotice.cjs` |
| ドメイン移行のお知らせを出すか | `shared/domainNotice.cjs` | `src/App.jsx`（`src/components/DomainNotice.jsx` を出す判断） |

## 天気予報（イベント詳細）

イベント詳細画面の「開催日時」と「開催場所」の間に、開催日の天気予報カードを表示する。
**ロジックの本体は `shared/weather.cjs` に集約**（純粋関数＋redis/fetch注入の orchestration）し、
スクレイパー・Vercel Function・フロント・テストで共有する（`shared/weather.test.cjs` で検証）。

### weatherLocation スキーマ（events.json 各イベント・任意）
```json
{
  "latitude": 35.681,            // 小数3桁
  "longitude": 139.767,          // 小数3桁
  "label": "東京都千代田区",      // 表示用（都道府県＋市区町村など）
  "accuracy": "address",         // 下表
  "source": "gsi",               // 'gsi' | 'manual'（任意・無くても壊れない）
  "geocodedAt": "2026-06-28T12:00:00+09:00"  // ISO+09:00（任意）
}
```
`source`/`geocodedAt` は後方互換のため**無くても画面が壊れない**こと。手動編集で座標を消す場合は
`weatherLocation: null` ＋ `weatherLocationNeedsUpdate: true`（公開APIでは除去）。

| accuracy | 意味 | 天気カードの挙動 |
|---|---|---|
| `address` | 住所からの座標 | 通常の「開催日の天気予報」 |
| `venue` | 会場名からの座標（都道府県名を前置して検索＝同名会場の衝突回避） | 通常の「開催日の天気予報」 |
| `manual` | 管理画面の手動入力 | 通常の「開催日の天気予報」 |
| `municipality` | 市区町村レベル | 天気は表示するが「開催地域の参考予報」バッジ＋注記 |
| `prefecture` | 都道府県代表地点のみ | **Open-Meteo を呼ばず非表示**（「詳細な位置を特定できないため表示できません」）。将来 `allowPrefecture` 設定で許可可能 |

### ジオコーディング（スクレイプ時 / `scraper/lib/geocode.js`）
- 国土地理院（GSI）住所検索API（無料・キー不要・日本の住所/施設名に強い）。**返却は `[経度,緯度]` の順**。
- `address → venue → municipality → prefecture` の順に試し、最初のヒットを採用。`writeOutput` 内で付与。終了済みは付与しない。
- **キャッシュキーは `pref + 正規化住所 + 正規化会場名`**（`shared/weather.cjs` の `geocodeCacheKey`）。会場名だけだと同名会場・住所変更で誤座標を再利用するため。住所/会場が変われば別キーで再取得。正規化＝NFKC・全半角空白統一・改行/連続空白圧縮・郵便番号(〒)除去。
- 結果は **`scraper/geocode-cache.json`（コミット対象）** に永続化。1実行内は同一GSIクエリをメモ化。
- 完了時に accuracy 別件数＋成功率をログ。前回比で `prefecture` 急増 / `address`・`venue` 大幅減 / `missing` 発生 / 成功率低下 のとき **GitHub Actions 警告（`::warning::`）**（デプロイは止めない）。

### 天気API（`/api/weather.js`）
- 入力 `latitude/longitude/date`。検証＝数値・日本範囲・**実在日付**（`2026-02-30` 等を弾く）・今日(JST)から 0〜16日。
- **日付境界は Asia/Tokyo 基準**（`jstTodayStr`/`daysAhead`。サーバーUTC/実行環境TZに非依存）。
- Open-Meteo daily（`weather_code`/`temperature_2m_max`/`temperature_2m_min`/`precipitation_probability_max`/`wind_speed_10m_max`、timezone `Asia/Tokyo`）を取得し、**対象日が応答に存在するか・各値が数値/許容null かを検証**。対象日が無ければ `422 {error:'forecast_not_available'}`。
  - ⚠️ **Open-Meteo の実地平は「今日＋15日」まで**（`forecast_days` 最大16＝今日含む16日）。検証上は 0〜16日を受理するが、ちょうど **+16日** の日は Open-Meteo にデータが無く `forecast_not_available` になり得る（翌日には +15 になり取得可）。
- **キャッシュ二段＋stale フォールバック**:
  - `weather:{lat3}:{lon3}:{date}` … 通常キャッシュ。TTL: 0-2日=1h / 3-7日=6h / 8-16日=12h。＋CDN `Cache-Control s-maxage`。
  - `weather:last-success:{lat3}:{lon3}:{date}` … 最終正常データ（72h）。取得成功時に併せて保存。
  - Open-Meteo 失敗時は最終正常データを `stale:true` で返す（無ければ `502`）。
- **座標キーは小数3桁（約100m単位）に丸めて共有**：近隣会場の予報はほぼ同一で、API負荷削減を優先するため意図的に同一キャッシュにする。より高精度が必要なら4桁へ。`-0`/浮動小数点表記の揺れは `coord3str`/`roundCoord3` で正規化（共通化）。
- APIキー不要（秘密情報をフロントに出さない）。

### 表示（`src/components/WeatherCard.jsx`）
- 詳細画面でのみ遅延取得（一覧では取得しない）。表示判定は `decideWeatherDisplay`（共有）。
- 全表示で共通注記「天気予報は参考情報です。開催・中止・内容変更については、必ず主催者の公式情報をご確認ください。」を表示。
  - `municipality`: 「開催地の市区町村を基準にした参考予報です。」を追加
  - `stale:true`: 「現在、最新の予報を取得できないため、前回取得した情報を表示しています。」を追加（バッジ「前回の情報」）
- 出典＝天気予報 Open-Meteo／座標検索 国土地理院 をカード内に併記。
- **Service Worker（`src/sw.js`）**: `/api/weather` は補助キャッシュのみ（NetworkFirst・`weather-cache-v1`・maxAge 10分・maxEntries 50）。主キャッシュはサーバー側(Redis+CDN)。長期間古い予報を返さず、障害時のみ短期フォールバック。サーバーの `stale:true` と SW由来の古い応答は別物（前者は本文フラグで判別）。

### 運営画面（/admin.html）の入力欄
イベントの追加・修正フォームは **基本 → 開催日時 → 分類 → 会場 → 詳細・リンク** の順にセクション分けする。
各欄には「何に使われるか・未入力だとどうなるか」を `hint` で添える（運営が判断に迷わないため）。
- **分類**は公開サイトの絞り込みに直結する。イベント種別（9値）・申込要否（1つ）・**タグ（複数選択）**・自衛隊の種別（複数選択）
  はすべて `shared/*.cjs` の定義からUIを生成する。**画面側に選択肢を直書きしないこと**（ズレの再発防止）
- **天気予報用の座標**は任意。空なら会場名・住所から自動取得する。`accuracy` が `prefecture` だと天気を表示しないため、
  その場合に手動で入れられるようにしてある（緯度経度の両方が日本の範囲のときだけ `accuracy:'manual'` で保存）。
  自動収集イベント（override 経路）では座標を上書きしない
- CSV 出力の列は画面の項目と揃える（配列は「・」区切り）

### 管理画面で修正されたイベント
- 場所/住所が変更されたら保存時に `weatherLocation: null` ＋ `weatherLocationNeedsUpdate: true` にして再ジオコーディング待ちにする（`api/admin/events.js`）。
- 緯度経度の手動入力に対応（`weatherLocation` に numeric lat/lon を渡すと `accuracy:'manual'` で保存）。UI（「座標を再取得」ボタン・手動入力欄・現在の座標/精度表示）は別タスク。

## セキュリティ構成（2026-06-13導入）

通常の閲覧は誰でも可能。**書き込み経路のみ**を以下で保護している。新しいAPIを追加する際は必ず同じ防御（`api/_security.js`）を通すこと。

| 経路 | 防御 |
|------|------|
| 静的データ（events.json等） | GitHub push権限 + Vercelトークンのみ。**masterはブランチ保護**（force-push・削除禁止） |
| `/api/subscribe`（購読の登録/解除） | オリジン検証（自サイトのみ。CORS「*」廃止）＋ push endpoint のURL検証（正規プッシュサービスのみ）＋ 保存フィールド限定 ＋ IPレートリミット（20回/10分） |
| `/api/notify`（通知送信） | `NOTIFY_SECRET`（**タイミングセーフ比較**）＋ IPレートリミット（10回/10分） |
| 全ページ | セキュリティヘッダ（nosniff / X-Frame-Options DENY / Referrer-Policy / Permissions-Policy / HSTS）を vercel.json で付与 |
| `/api/report`（バグ報告） | オリジン検証。ntfyトピック名は**サーバー環境変数 `NTFY_BUG_TOPIC` のみ**。固定フォールバック無し＝未設定時は503で安全に失敗 |
| `/api/admin/*`（管理） | サーバー側セッション認証（HttpOnly Cookie）＋ RBAC（deny-by-default）＋ スコープ強制＋ 監査ログ。下記参照 |

- レートリミットは Upstash Redis（既存のKV）の INCR+TTL。Redis障害時はブロックしない（可用性優先）
- **本番URL（ドメイン）は `shared/siteUrl.cjs` が唯一の出どころ**。環境変数 `SITE_URL` を設定すると
  canonical・OGP・sitemap・robots・llms・IndexNow・書き込みAPIの許可オリジンがすべて切り替わる。
  コードにドメインを直書きしないこと（`shared/siteUrl.test.cjs` が直書きを検出して CI を落とす）。
  ⚠ `vercel.json` の `Access-Control-Allow-Origin` だけは静的JSONのため手で直す（テストがズレを検出する）。
  移行の手順・注意点（利用者の localStorage と Web Push 購読はオリジンが変わると失われる等）は
  **`docs/DOMAIN_MIGRATION.md`** を参照
- **現在の公開URL: `https://jsdf-chiiki-events.jp`**（2026-09-03 に `*.vercel.app` から移行）。
  旧ドメインは `LEGACY_ORIGINS` に残してあり、書き込みAPIは当面どちらのオリジンからも通る
- ⚠ **`SITE_URL` は「コードの既定より優先される」ため、シークレットに旧ドメインが残っていると
  静的ページ・sitemap が旧ドメインで生成され、スクレイプの自動コミットで移行が巻き戻る**。
  これを防ぐため **`siteUrl()` は `LEGACY_ORIGINS` の値を公開URLとして採用しない**
  （捨てたドメインを公開URLに指定するのは設定として成立しないため既定へ落とす）。
  `scripts/check-site-url.mjs` が scrape.yml / deploy.yml の冒頭で更新漏れを警告する
  （**ジョブは落とさない**。落とすとスクレイプが止まりデータが更新されない方が害が大きい）。
  ただし scrape.yml の Web Push 送信先はシークレットを直接使うため、更新は結局必要。
  切り戻すときは `SITE_URL` を旧URLに戻すのではなく**移行コミットを revert する**
  （`vercel.json` の CORS と `index.html` の canonical は静的なので環境変数では戻らない）

### 管理者認証・認可（2026-06-28 強化。詳細は SECURITY.md / OPERATIONS.md）
- **総当り対策**: ログインは IP レート制限（10回/10分）＋**アカウント単位の指数バックオフ施錠**（5回失敗で5分→10分→20分→…最大60分。施錠中は資格情報を検証しない）。この施錠を迂回させないため、ヘッダ認証は既定で無効（上記 `LEGACY_HEADER_AUTH`）。認証を伴う管理APIには残らずレート制限を入れること（2026-08-26 に `presence` の抜けを追加）。
- **認証**: ログイン成功で**サーバー側セッション**を発行し HttpOnly/Secure/SameSite=Strict Cookie で保持（`shared/session.cjs`・`api/admin/login.js`・`logout.js`）。セッションは Redis 保存・絶対期限/無操作失効・アカウント無効化で失効。パスワードは **scrypt** 対応（平文は移行期のみ `LEGACY_PLAINTEXT_PASSWORDS=true`）。クライアントはパスワードを保存しない。
- **sessionVersion**: アカウントの版番号をセッションへ刻み、毎リクエスト照合。値を上げると旧セッションは失効。**パスワード変更時は必ず +1**（`sessionStillValid`）。
- **キャッシュ禁止**: 全 `/api/admin/*` は `noStore()` で `Cache-Control: no-store, private`（成功/エラー問わず）。
- **CSRF多層防御**: 状態変更(POST/PUT/PATCH/DELETE)は `requireSameOrigin`＝Origin完全一致＋`Sec-Fetch-Site: same-origin`要求、cross-site/Origin欠落は403。非ブラウザ正当経路は `INTERNAL_API_SECRET`(x-internal-secret)で分離。判定の純粋関数は `shared/session.cjs` の `csrfDecision`。
- **認可（RBAC・deny-by-default）**: `shared/authz.cjs`。ロール `office_editor`/`office_manager`/`pco_admin`/`national_admin`/`auditor`/`system_admin`。権限・スコープは**サーバーの認証済みアカウントからのみ**判定。クライアント送信の `pref`・個人番号・role は信用しない（旧 `x-admin-staff` 方式は廃止＝`ENABLE_DEV_STAFF` で開発時のみ）。
- **IDOR対策**: イベント/オーバーライドの所属地本は**サーバー側で実データから解決**（手動イベントは Redis、スクレイプは events.json）して判定。存在しない対象は拒否。`/api/admin/overrides` の GET/POST/DELETE もスコープ強制。
- **監査ログ（追記専用）**: `writeAudit`（`manual:history`）。操作・ログイン成功/失敗・権限拒否を requestId/操作者(displayId)/地本/事務所/対象/result/変更前後付きで記録。**削除APIは廃止**（history DELETE は405）。
- **新APIを足すときは必ず `requireAuth` → `hasPermission`/`canManageScope` → `writeAudit` の順を通すこと。**

### 過去イベント閲覧（管理・閲覧専用）
- `GET /api/admin/past-events`（`shared/pastEvents.cjs` に純粋ロジック集約）。**過去イベント＝`effectiveDate(endDate||date) < 今日(Asia/Tokyo)`**。
- **監査ログ（`manual:history`）・削除済みイベント・将来/開催中イベントとは区別**する。削除済みは含めない（本体が無いため。削除痕跡は監査履歴で確認）。
- データ源を統合: 手動イベント（Redis `manual:events`）＋スクレイプ（`events.json`）＋override 反映。**ID重複は手動を優先**。
- 認可は `canManageScope`（deny-by-default）。office ロールは自office一致のみ（**スクレイプは office 欄が無いため pco_admin 以上のみ閲覧可**）。pco_admin=自地本/national=全国。**クライアントの pref/office では拡大不可**（サーバーの実データで判定）。
- クエリ: `from/to/status/q/office/pref/limit(既定50・最大100)/offset`。不正日付/limit は 400・新しい順・`no-store`・GET のため状態変更CSRFは適用しない。
- **保存方針（2026-08-26 確定）**: 収集したデータは**運営側に蓄積し、公開サイトは1週間だけ持つ**。
  - 公開（`public/data/events.json`）… 終了後 **7日**（`ENDED_KEEP_DAYS`）で削除。フロントも同じ7日で切る。
  - 運営（`data/events-archive.json`）… **期限を切らずに蓄積**する。`ARCHIVE_RETENTION_DAYS` を
    明示的に設定したときだけ日数で打ち切る（既定 0 = 無期限）。件数上限 `ARCHIVE_MAX`（既定 200000）は暴走防止の安全弁。
  - **アーカイブは `public/` の外に置く**。`public/data/` に置くと静的配信されて誰でも全履歴を
    取得でき、この保存方針が成立しない。運営APIは HTTP ではなく**ファイルシステム**から読む
    （`vercel.json` の `functions["api/admin/past-events.js"].includeFiles: "data/**"` で関数バンドルへ同梱。
    `EVENTS_ARCHIVE_PATH` で配置を差し替え可能）。
  - `data/**` を変更したらデプロイが必要（関数バンドルに載るため）。scrape.yml / deploy.yml のトリガーに追加済み。
  - 手動イベント（Redis）は削除まで残る。
- UI: 運営画面に「現在・今後／下書き／**過去イベント**」タブ（`src/components/PastEventsPanel.jsx`、閲覧専用）。監査履歴は別表示。
- 将来のイベントID移行・恒久アーカイブ設計とは別課題（本機能は現存データの閲覧のみ）。

### データ品質ゲート（CI）
- `shared/dataQuality.cjs` + `scripts/check-data-quality.mjs`。ID重複/構造破損/不正・非実在日付/endDate<date/タイトル欠落/pref-キー不一致/座標範囲/accuracy値/手動-スクレイプID衝突/総数異常減少を**エラー（デプロイ停止）**、長すぎるタイトル・会場欠落・URL形式・OCR疑い等を**警告**として検出。
- deploy.yml / scrape.yml で `npm test` ＋ このチェックが通った場合のみデプロイ。

### 主な環境変数（Vercel / GitHub Secrets）
- 認証: `ADMIN_ACCOUNTS_B64`（base64 JSON配列: `{user,pass,organization|pref,office,role,displayId,enabled,sessionVersion}`）, `ADMIN_SECRET`（旧共通PW・既定無効。`LEGACY_ADMIN_SECRET=true` の時のみ有効。office ロールは `office` 必須＝未設定だと deny-by-default で操作不可）
- セッション: `ADMIN_SESSION_TTL`(既定28800), `ADMIN_SESSION_IDLE`(既定3600), `SESSION_INSECURE`(ローカルHTTP検証のみ true)
- CSRF: `INTERNAL_API_SECRET`（任意。非ブラウザ正当経路が Origin 無しで状態変更する場合のみ）
- 移行フラグ: `LEGACY_PLAINTEXT_PASSWORDS`(既定true→正式運用前 false), **`LEGACY_HEADER_AUTH`(既定false。2026-08-26 に既定を反転)**, `LEGACY_ADMIN_SECRET`(既定false。ADMIN_SECRET経路を使う移行時のみtrue), `ENABLE_DEV_STAFF`(既定false)
  - ヘッダ認証（`x-admin-user`/`x-admin-pass` を毎リクエストに付ける旧方式）を既定で許すと、**ログイン画面のロック（回数制限・指数バックオフ）を通らずに管理APIへ資格情報を投げ続けられ、総当りが実質無制限になる**。管理画面はセッション Cookie のみを使うため通常運用では不要。移行で必要な場合だけ `true` にする。
- 監査: `AUDIT_MAX`(既定5000)
- 既存: `KV_REST_API_URL`/`KV_REST_API_TOKEN`(Upstash), `NOTIFY_SECRET`, `NTFY_BUG_TOPIC`, `NTFY_ADMIN_TOPIC`, `VERCEL_*`, OCR各種, `SITE_URL`

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
3. 反映が遅い場合はキャッシュを考慮して数分待つ（events.json は CDN が `s-maxage=600`＝10分、Service Worker は NetworkFirst で通常は常に取りに行き、失敗時のみ最大30日の保存分を返す）

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
