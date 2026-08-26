# 運用手順書（OPERATIONS.md）

jsdf-chiiki-events（自衛隊地本イベント情報・非公式）の日常運用・障害対応の手引きです。データ修正は必ず一次ソース（チラシ実物・公式ページ）と照合してから行ってください（詳細は [CLAUDE.md](CLAUDE.md)）。

## 1. 日常のイベント運用（管理画面）
- 入口: `https://<本番URL>/admin.html` → ログイン。
- **下書き作成 → 公開**: 一般担当者(`office_editor`)は下書き保存まで。公開は `office_manager` 以上。
- **修正**: スクレイプ由来イベントは「上書き修正」（元データは保持）、手動イベントは本体を編集。
- **中止/締切**: 状態を `cancelled` / `closed` に変更（公開権限が必要）。
- 公開前は「プレビュー」で表示を確認。
- **画面の区別**: 「現在・今後」「下書き」「過去イベント」「監査履歴」は別画面。混同しないこと。

## 1-2. 過去イベントの確認（閲覧専用）
- 管理画面の「**過去イベント**」タブで、終了したイベント（`endDate||date` が今日(JST)より前）を権限範囲内で閲覧できる。
- **監査履歴とは別物**（監査履歴＝操作の記録）。また**削除済みイベントは表示されない**（削除痕跡は監査履歴で確認）。
- 閲覧範囲は役割で決まる: office ロール=自事務所のみ（スクレイプ由来は事務所欄が無いため pco_admin 以上のみ）、pco_admin=自地本、national_admin=全国。
- タイトル/会場・期間・状態で絞り込み、ページ送りで確認（閲覧のみ・編集不可）。
- **保存方針**: 収集したデータは**運営側に蓄積**し、**公開サイトは1週間だけ**保持する。
  - 公開サイト: イベント終了後 7日（`ENDED_KEEP_DAYS`）で `events.json` から削除される。
  - 運営「過去イベント」: `data/events-archive.json` に**期限を切らずに蓄積**される。
    このファイルは `public/` の外にあり、公開サイトからは取得できない（運営APIのみが読む）。
  - 手動入力イベントは削除するまで残る。
  - 古いものを整理したい場合のみ、環境変数 `ARCHIVE_RETENTION_DAYS`（日数）を設定する。既定は無期限。

## 2. アカウント・権限
- アカウントは `ADMIN_ACCOUNTS_B64`（base64 のJSON配列）で管理。各要素:
  `{ "user", "pass", "organization", "office", "role", "displayId", "enabled", "sessionVersion" }`
  - `role`: `office_editor` / `office_manager` / `pco_admin` / `national_admin` / `auditor` / `system_admin`
  - `pass`: scrypt ハッシュ推奨（生成: `node -e "console.log(require('./shared/session.cjs').hashPassword('パスワード'))"`）
  - `displayId`: 通常画面に出す仮名（氏名は入れない）。実利用者との対応表は別管理（監査時のみ参照）。
  - 停止: `"enabled": false` にして再デプロイ（既存セッションも次回検証で失効）。
  - `sessionVersion`（既定1）: 既存セッションを即失効させたいとき +1。
- 反映: `ADMIN_ACCOUNTS_B64` を更新 → デプロイ。
- **パスワード変更時**: 新パスワードを scrypt 化して `pass` を差し替え、**必ず `sessionVersion` を +1**（旧端末のログインを即失効）→ デプロイ。
- **担当者異動**: 旧アカウントを `enabled:false`、新アカウントを追加。対応表を更新。

## 3. スクレイピング失敗・イベント数急減
1. GitHub Actions「スクレイピング & データ更新」のログで失敗地本/ステップを特定（`gh run view <id> --log`）。
2. 地本サイト構造変更ならパーサー修正、Cloudflare 検知なら待機/コンテキストを確認。
3. **データ消失時の復元**: `git show <正常コミット>:public/data/events.json > public/data/events.json` → `node scripts/generate-events-html.mjs` → commit/push。
4. データ品質チェック（`node scripts/check-data-quality.mjs`）がデプロイをブロックした場合はログのエラーを修正。

## 4. OCR が止まったとき（モデル廃止・APIキー失効）

「⚠️ OCR稼働アラート」が届いた、または Actions のサマリで「OCR 稼働」が
`成功0件` になっている場合。総イベント数はキャッシュ済み OCR 結果に支えられて
しばらく下がらないため、総数だけ見ていても気付けない。

1. 実行ログの `[OCRモデル]` 行で、どのモデルが選ばれたかを確認する。
2. `Groq エラー (404)` / `Gemini エラー (404)` が出ていればモデル廃止。
   scraper は候補リストの次のモデルへ自動で切り替えるが、候補が全滅した場合は
   リスト自体の更新が必要（`scraper/index.js` の
   `GROQ_VISION_MODEL_CANDIDATES` / `GEMINI_MODEL_CANDIDATES`）。
3. 緊急時はコードを触らず、GitHub Secrets に `GROQ_OCR_MODEL` /
   `GEMINI_OCR_MODEL` を登録すれば即座に上書きできる。
4. `401/403` ならモデルではなく APIキーの失効を疑う。

過去の実例:

- 2026-07-17 Groq `meta-llama/llama-4-scout-17b-16e-instruct` 廃止
- 2026-08-11 Gemini `gemini-2.0-flash` 廃止

## 5. OCR誤認識の修正
- チラシ実物（url/imageUrl）と照合。確定修正は `shared/titleQuality.cjs` の `VERIFIED_OVERRIDES` に登録（events.json 直接修正は OCR キャッシュで再発）。

## 6. 天気座標の修正
- 管理画面でイベントの場所/住所を修正すると `weatherLocation` は無効化され、次回スクレイプ/処理で再取得。
- 手動で座標を指定する場合は管理APIに `weatherLocation:{latitude,longitude,label}` を渡すと `accuracy:'manual'` で確定。

## 7. 障害対応
- **Redis(Upstash)障害**: レート制限・通知購読・天気キャッシュ・管理操作が影響。閲覧（events.json）は静的配信のため継続。天気はCDN/旧キャッシュ(stale)でしのぐ。復旧後に管理操作を再開。
- **Vercel障害**: 公式の Status を確認。デプロイは復旧後に `gh workflow run deploy.yml`。
- **GitHub Actions障害**: スクレイプ/デプロイが停止。復旧後に手動再実行。データは前回分が表示され続ける。

## 8. バックアップと復元
- **events.json**: Git 履歴が実質バックアップ（コミット毎）。復元は §3-3。
- **管理データ（Redis: manual:events / manual:overrides / manual:history）**: 定期的に管理画面の CSV/JSON 出力で控える。重要データは Upstash 側のバックアップ機能も検討。
- **監査履歴**: 追記専用。長期保全は外部転送を今後整備。

## 9. インシデント発生時（初動）
1. 影響範囲を特定（公開表示 / 管理操作 / データ）。
2. 必要なら一時的に該当機能を停止（例: アカウント `enabled:false`、環境変数で機能停止）。
3. 監査履歴（`/api/admin/history`、auditor 権限）で操作を確認。
4. 原因を記録し、恒久対策（コード/設定）を実施。シークレット漏洩の疑いがあれば §DEPLOY のローテーション手順を実行。
5. 運営者間で情報共有。
