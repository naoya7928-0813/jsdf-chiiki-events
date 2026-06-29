# デプロイ手順（DEPLOY.md）

本プロジェクトは **Vercel**（フロント＋`/api/*` サーバー機能）と **GitHub Actions**（スクレイピング・自動デプロイ）、**Upstash Redis**（管理データ・セッション・キャッシュ・レート制限）で構成されます。
※ 旧構成（Google Apps Script）は廃止済みです。

## アーキテクチャ概要
```
GitHub Actions (scrape.yml, 1日3回)
  └ scraper/index.js → public/data/events.json 生成
       → npm test + データ品質チェック（ゲート）→ commit/push → Vercel デプロイ
deploy.yml (src/public/api 等の push)
  └ npm ci → npm test → データ品質チェック → vercel --prod
Vercel
  ├ 静的: dist/ + /data/events.json
  └ Functions: /api/*（Upstash Redis を利用）
```

## ブランチ / デプロイ
- 単一 `master` ブランチ運用（**ブランチ保護**: force-push・削除禁止）。
- `master` への push（`src/ public/ api/ scripts/ index.html vite.config.js vercel.json package.json`）で `deploy.yml` が発火。
- 手動デプロイ: `gh workflow run deploy.yml`。
- デプロイは **`npm test` ＋ `node scripts/check-data-quality.mjs` が成功した場合のみ**実行。

## Vercel 環境変数
Vercel プロジェクト設定 → Environment Variables（Production / Preview / Development を適切に分離）。

### 必須
| 変数 | 用途 |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis（Vercel-Upstash 連携で自動設定） |
| `ADMIN_ACCOUNTS_B64` | 管理者アカウント（base64 の JSON 配列。下記） |
| `NOTIFY_SECRET` | `/api/notify` 認証（スクレイパーからの通知送信） |
| `NTFY_BUG_TOPIC` | 誤情報報告の ntfy トピック（未設定だと `/api/report` は503） |
| `NTFY_ADMIN_TOPIC` | 運営者向けアラート（GitHub Actions から使用） |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push（`npx web-push generate-vapid-keys` で生成） |

### 任意（OCR・移行・調整）
| 変数 | 用途 |
|---|---|
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `MISTRAL_API_KEY` / `OCR_SPACE_API_KEY` | 多段OCR（無ければローカルOCRのみ） |
| `ADMIN_SESSION_TTL`(既定28800) / `ADMIN_SESSION_IDLE`(既定3600) | セッション絶対期限/無操作失効（秒） |
| `LEGACY_PLAINTEXT_PASSWORDS`(既定true) | 平文パスワード許可（**正式運用前に false**） |
| `LEGACY_HEADER_AUTH`(既定true) | ヘッダ認証の後方互換（**正式運用前に false**） |
| `ENABLE_DEV_STAFF`(既定false) | 旧個人番号(001/002/003)を開発時のみ有効化 |
| `AUDIT_MAX`(既定5000) | 監査ログ保持件数 |
| `SITE_URL` | オーバーライド所属解決の events.json 取得元（既定は本番URL） |
| `SESSION_INSECURE` | ローカルHTTP検証時のみ true（Secure属性を外す） |

### 管理者アカウント（`ADMIN_ACCOUNTS_B64`）
JSON 配列を base64 化して設定。各要素:
```json
{
  "user": "tokyo-shibuya",
  "pass": "scrypt$16384$....$....",
  "organization": "tokyo",
  "office": "shibuya",
  "role": "office_manager",
  "displayId": "OP-0042",
  "enabled": true,
  "sessionVersion": 1
}
```
- `pass` のハッシュ生成: `node -e "console.log(require('./shared/session.cjs').hashPassword('パスワード'))"`
- base64 化: `node -e "console.log(Buffer.from(require('fs').readFileSync('accounts.json','utf8')).toString('base64'))"`
- 反映後はデプロイが必要。`enabled:false` で停止（既存セッションも次回検証で失効）。
- **`sessionVersion`（既定1）**: パスワード変更や権限・地本・事務所の変更で既存セッションを
  即失効させたいときは、この値を **+1** して再デプロイする（古い版のセッションは次の操作で401）。
  **パスワード変更時は必ず `sessionVersion` を増やすこと**（漏洩パスワードでの居座りを防ぐ）。

> GitHub Actions（scrape.yml / deploy.yml）は `ADMIN_SECRET` / `ADMIN_ACCOUNTS_B64` を `vercel -e` で注入します。GitHub Secrets に登録すること。

## GitHub Secrets
`VERCEL_TOKEN`（改行混入に注意・CLIで除去済み）, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `ADMIN_ACCOUNTS_B64`, `ADMIN_SECRET`(任意), `NTFY_BUG_TOPIC`, `NTFY_ADMIN_TOPIC`, OCR各種キー。

## 本番 / 開発の分離
- Vercel の Production と Preview/Development で環境変数を分ける。開発・検証には**本番とは別の** Upstash DB / ntfy トピック / 管理アカウントを使うこと。
- ローカル検証は `vite dev` + 必要に応じて `vercel dev`（Functions 実行）。Cookie の Secure を外すには `SESSION_INSECURE=true`。

## バックアップ・復旧
- **events.json**: Git 履歴が実質バックアップ。復元: `git show <正常コミット>:public/data/events.json > public/data/events.json` → `node scripts/generate-events-html.mjs` → commit/push。
- **管理データ（Redis）**: 管理画面の CSV/JSON 出力で定期取得。Upstash のバックアップ機能も検討。
- **監査履歴**: 追記専用（`manual:history`）。長期保全は外部転送を今後整備。

## シークレットローテーション手順
1. 新しい値を生成（VAPID 再生成、パスワード scrypt 再ハッシュ、トークン再発行）。
2. Vercel 環境変数 / GitHub Secrets を更新。
3. 再デプロイ（`gh workflow run deploy.yml`）。
4. 旧値を失効（ntfy トピック変更、漏洩トークンの無効化、該当アカウント `enabled:false`）。
5. 影響確認（ログイン・通知・報告）。監査履歴に記録が残ることを確認。

## 正式試験運用前チェックリスト
- [ ] 全管理アカウントを scrypt ハッシュ化し `LEGACY_PLAINTEXT_PASSWORDS=false`
- [ ] `LEGACY_HEADER_AUTH=false`（セッション認証のみに）
- [ ] `ENABLE_DEV_STAFF` 未設定（旧個人番号を無効）
- [ ] 本番用 Upstash / ntfy / 管理アカウントを開発用と分離
- [ ] `NTFY_BUG_TOPIC` / VAPID / `NOTIFY_SECRET` を設定
- [ ] master ブランチ保護・PR必須・本番デプロイ承認の検討
- [ ] `npm test` と `node scripts/check-data-quality.mjs` がCIで通る
