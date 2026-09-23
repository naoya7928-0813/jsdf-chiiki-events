# セキュリティ方針（SECURITY.md）

本書は jsdf-chiiki-events（自衛隊地本イベント情報・非公式）のセキュリティ方針と、正式試験運用に向けた現状・制約をまとめたものです。完全・侵入不可能を主張するものではなく、リスク低減のための設計と運用手順を示します。

## 対象範囲
- 公開サイト（閲覧）は認証不要。**書き込み・管理操作のみ**を保護対象とする。
- 保護実装は `api/_security.js`（認証・セッション・レート制限・監査）と `shared/authz.cjs`（権限）に集約。新APIは必ずこれを通すこと。

## 認証（Authentication）
- 管理者はアカウント（ユーザー名＋パスワード）でログイン。成功時に**サーバー側セッション**を発行し、**HttpOnly / Secure / SameSite=Strict / Path=/ / 有効期限付き Cookie** で保持する（`shared/session.cjs`、`api/admin/login.js`）。
- セッションは Upstash Redis に保存。**絶対有効期間**（`ADMIN_SESSION_TTL`、既定8h）と**無操作失効**（`ADMIN_SESSION_IDLE`、既定60分）を持つ。ログアウト（`/api/admin/logout`）・アカウント無効化で即時失効。
- **`sessionVersion`**: アカウントに版番号を持たせ、ログイン時にセッションへ刻む。値を上げると古い版のセッションは次の操作で失効する。**パスワード変更時は必ず +1**（漏洩パスワードでの居座りを防ぐ。運用は OPERATIONS.md / DEPLOY.md）。
- 管理APIの応答は **`Cache-Control: no-store, private`**（成功/エラー問わず）でキャッシュ禁止。
- 状態変更APIは **CSRF多層防御**（Origin完全一致＋`Sec-Fetch-Site: same-origin`＋SameSite=Strict。Origin欠落のブラウザ書込みは403、正当な非ブラウザ経路は `INTERNAL_API_SECRET` で分離）。
- パスワードは **scrypt**（`scrypt$N$salt$hash`）で保存可能。平文は移行期のみ `LEGACY_PLAINTEXT_PASSWORDS=true` で許容。
- 旧共通管理者 `ADMIN_SECRET`（任意ユーザー名＋共通PWで national_admin）は **既定で無効**。移行時に `LEGACY_ADMIN_SECRET=true` を明示した場合のみ有効。正式運用では `ADMIN_SECRET` を削除する。
- 事務所(office)ロールは **deny-by-default**：account/target 双方の office が一致する場合のみ操作可。office 未設定イベントは pco_admin 以上のみ（pco_admin が office を割当）。
- クライアントはパスワードを localStorage に保存しない（非機密のアカウント情報のみ）。

## 認可（Authorization）— RBAC・deny-by-default
- ロール: `office_editor`（自事務所の下書き作成・編集）/ `office_manager`（自事務所の追加・編集・削除・公開・上書き）/ `pco_admin`（自地本全体＋監査閲覧）/ `national_admin`（全国）/ `auditor`（監査閲覧のみ）/ `system_admin`（設定管理）。
- 権限・スコープはすべて**サーバー側の認証済みアカウント**から解決。クライアント送信の `pref`・個人番号・role は権限判定に使わない。
- イベント／オーバーライドの所属地本は**サーバー側で実データから解決**して判定（IDOR 対策）。存在しない対象は拒否。
- **過去イベント閲覧**（`GET /api/admin/past-events`）も同じ `canManageScope` で範囲を限定（閲覧専用・`no-store`）。office ロールは自office一致のみ（スクレイプは office 欄が無いため pco_admin 以上のみ）、pco=自地本、national=全国。監査ログ閲覧権限とは別（過去イベント≠監査ログ）。

## 重要操作の再認証（step-up）
- バックアップ作成・監査ログ出力などの重要操作は、**直前のパスワード再入力**（`POST /api/admin/login {op:'step-up'}`）から一定時間（`STEP_UP_TTL_SEC`、既定5分）だけ実行できる。判定は `shared/stepUp.cjs`、記録はサーバー側セッションの `stepUpAt`。
- 再入力の失敗はログインと同じ失敗回数・ロックに合算する（総当りの抜け道にしない）。成功・失敗・拒否は監査ログに残る。
- セッション Cookie 認証が前提（旧ヘッダ認証では重要操作は常に拒否）。将来の MFA も同じ判定に載せる。

## バックアップ
- 「システム」タブ（`backup:export`＝national_admin / system_admin）から、手動イベント・上書き・アカウント・監査ログを1ファイルで出力する（`api/admin/system.js`、形式は `shared/backupFormat.cjs`）。
- **パスワード・ハッシュ・MFA・セッション・トークン・鍵・利用者の連絡先は含めない**（許可リスト方式＋全体の再帰検査で、混入時は作成を止める）。
- 検証は `node scripts/verify-backup.mjs <ファイル>`（件数・schemaVersion・checksum・作成日時・秘密項目の不在）。保管先は運営管理の暗号化ストレージ（リポジトリは公開のため置かない）。

## 検証環境（Preview）の分離
- Preview 環境は、本番と別の Redis を設定し `PREVIEW_DATA_ISOLATED=true` を Preview だけに設定するまで、管理 API・報告・購読の書き込みを 503 で止める（`previewWriteBlocked`）。Vercel-Upstash 連携は既定で本番と同じ KV を Preview にも設定するため。手順は `docs/PREVIEW_ENVIRONMENT.md`。
- Preview デプロイ（`.github/workflows/preview.yml`）は本番の `ADMIN_ACCOUNTS_B64` を渡さない。

## 監査ログ（追記専用）
- 管理操作・ログイン成功/失敗・権限拒否を `manual:history` に追記（`writeAudit`）。記録項目: 日時・requestId・操作者(仮名 displayId)・accountId・地本・事務所・action・対象ID・result・変更前後。
- **削除APIは廃止**（`/api/admin/history` の DELETE は 405）。改ざん防止のため追記専用。

## シークレット管理
- すべてのシークレットは Vercel 環境変数 / GitHub Secrets で管理し、リポジトリ・バンドルに含めない。
- 運営者向け ntfy トピック（`NTFY_ADMIN_TOPIC`、GitHub Actions のみ）は Secrets のみで管理。利用者の報告は ntfy 等の外部へ送らない（Redis＋管理画面）。
- ローテーション手順は [DEPLOY.md](DEPLOY.md) を参照。

## 多層防御
- セキュリティヘッダ（CSP / X-Frame-Options DENY / nosniff / Referrer-Policy / HSTS / Permissions-Policy）を `vercel.json` で付与。
- オリジン検証（自サイト以外のブラウザ書き込みを拒否）。
- IPレートリミット（Upstash Redis。障害時は可用性優先で通す）。
- master ブランチ保護は **force push・ブランチ削除の禁止のみ**（2026-09-23 確認）。PR 必須・必須チェック・本番承認は未設定（下記「既知の制約」）。デプロイ前に `npm test` ＋ データ品質チェックをゲート。

## 脆弱性の報告
- セキュリティ上の問題は、公開 Issue ではなく運営者へ非公開で連絡してください（連絡先は運営者間で共有）。報告には再現手順・影響範囲を含めてください。

## 既知の制約 / 正式導入前に必要な追加対策
- 管理画面の URL は秘密ではない（URL の秘匿を安全性の根拠にしない）。
- パスワードの scrypt 化は任意（移行期は平文許容）。**正式運用前に全アカウントをハッシュ化し `LEGACY_PLAINTEXT_PASSWORDS=false` にすること**（平文で認証が通るとサーバーログに警告が出る）。
- `LEGACY_HEADER_AUTH` は **2026-08-26 に既定を false（拒否）へ反転**した。ヘッダ認証を許すとログイン施錠を迂回して総当りできるため、移行で必要な場合のみ明示的に `true` にする。
- 監査ログは Redis リスト（上限 `AUDIT_MAX`）。長期保全のため**外部ログ保管への転送**は今後の課題。
- 重要操作の再認証（step-up）はパスワード再入力で実装済み（MFA は未実装）。アカウント管理UI・承認フローのUI・バックアップからの復元は未実装。
- 依存監査（npm audit / Dependabot / CodeQL / Secret scanning / SBOM）・アクションSHA固定・PR必須・本番承認環境は段階導入を推奨。
