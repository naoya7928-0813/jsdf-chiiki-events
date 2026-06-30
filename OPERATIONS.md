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
- **制約**: スクレイプ由来は終了後約7日（`ENDED_KEEP_DAYS`）でデータから削除されるため、それ以前の過去は表示されない場合がある。手動入力イベントは削除するまで残る。**完全な永久保存ではない**（恒久アーカイブは今後の課題）。

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

## 4. OCR誤認識の修正
- チラシ実物（url/imageUrl）と照合。確定修正は `shared/titleQuality.cjs` の `VERIFIED_OVERRIDES` に登録（events.json 直接修正は OCR キャッシュで再発）。

## 5. 天気座標の修正
- 管理画面でイベントの場所/住所を修正すると `weatherLocation` は無効化され、次回スクレイプ/処理で再取得。
- 手動で座標を指定する場合は管理APIに `weatherLocation:{latitude,longitude,label}` を渡すと `accuracy:'manual'` で確定。

## 6. 障害対応
- **Redis(Upstash)障害**: レート制限・通知購読・天気キャッシュ・管理操作が影響。閲覧（events.json）は静的配信のため継続。天気はCDN/旧キャッシュ(stale)でしのぐ。復旧後に管理操作を再開。
- **Vercel障害**: 公式の Status を確認。デプロイは復旧後に `gh workflow run deploy.yml`。
- **GitHub Actions障害**: スクレイプ/デプロイが停止。復旧後に手動再実行。データは前回分が表示され続ける。

## 7. バックアップと復元
- **events.json**: Git 履歴が実質バックアップ（コミット毎）。復元は §3-3。
- **管理データ（Redis: manual:events / manual:overrides / manual:history）**: 定期的に管理画面の CSV/JSON 出力で控える。重要データは Upstash 側のバックアップ機能も検討。
- **監査履歴**: 追記専用。長期保全は外部転送を今後整備。

## 8. インシデント発生時（初動）
1. 影響範囲を特定（公開表示 / 管理操作 / データ）。
2. 必要なら一時的に該当機能を停止（例: アカウント `enabled:false`、環境変数で機能停止）。
3. 監査履歴（`/api/admin/history`、auditor 権限）で操作を確認。
4. 原因を記録し、恒久対策（コード/設定）を実施。シークレット漏洩の疑いがあれば §DEPLOY のローテーション手順を実行。
5. 運営者間で情報共有。
