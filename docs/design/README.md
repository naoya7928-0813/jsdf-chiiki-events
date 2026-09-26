# P0 詳細設計（正式運用・引継ぎ基盤）

> 基準: master `f39329d`（v1.36.22）・2026-09-23 調査
> 位置付け: **設計のみ（未実装）**。各機能は本設計の承認後に「1機能 = 1 PR」で実装する。
> 上位資料: `CLAUDE_CODE_HANDOFF_jsdf-chiiki-events_2026-09-23.md`（以下「引継ぎ書」）§24

## 1. 文書一覧

| ID | 文書 | 概要 |
|---|---|---|
| P0-1 | [P0-1_account-store.md](P0-1_account-store.md) | アカウント保存先（Redis）＋アカウント管理 API / GUI |
| P0-2 | [P0-2_transfer-wizard.md](P0-2_transfer-wizard.md) | 担当者異動・引継ぎウィザード |
| P0-3/4 | [P0-3-4_backup-restore.md](P0-3-4_backup-restore.md) | バックアップ作成・検証付き復元 |
| P0-5 | [P0-5_migration-wizard.md](P0-5_migration-wizard.md) | システム移行ウィザード |
| P0-6 | [P0-6_mfa-step-up.md](P0-6_mfa-step-up.md) | MFA（TOTP）・重要操作の再認証（step-up） |
| P0-7 | [P0-7_approval-workflow.md](P0-7_approval-workflow.md) | 承認ワークフロー（下書き→承認待ち→公開） |

## 2. 調査で判明した前提（設計に影響するもの）

1. **アカウントの実体は GitHub Secret `ADMIN_ACCOUNTS_B64`**。`deploy.yml` / `scrape.yml` が `vercel --prod -e ADMIN_ACCOUNTS_B64=...` で**デプロイごとに注入**している。Vercel 側の環境変数だけを変えても、次のデプロイ（1日3回のスクレイプ起点を含む）で GitHub Secret の値に戻る。→ P0-1 の移行設計はこの二重管理を解消する必要がある。
2. **リポジトリは PUBLIC**。`data/events-archive.json` は「`public/` 外＝非公開」と説明されているが、GitHub 上で誰でも取得できる。内容は元々公開されていたイベント情報のためリスクは低いが、「公開サイトは約7日保持」という方針は実質的に担保されていない。→ **バックアップ・エクスポートは絶対にリポジトリへ置かない**（P0-3）。アーカイブの扱いは別途判断が必要（§5 決定事項 D-7）。
3. **API 関数は既に 14 本**（`api/*.js` 7 + `api/admin/*.js` 7）。Vercel のプランによっては関数数の上限に近い。→ 新 API は機能ごとに 1 ファイルへ集約し、`op` で分岐する。
4. `loadAccounts()` は**同期**で、`verifyCredentials` / `resolveSession` / 在席 API から呼ばれる。Redis 化で非同期化が必要（呼び出し側の変更範囲は P0-1 §6）。
5. Upstash Redis は REST 経由。`MULTI/EXEC`（`redis.multi()`）と `EVAL`（Lua）が利用可能で、原子的な更新はこれで行う（`WATCH` は前提にしない）。
6. `office_editor` は `event:update` を持つため、**公開中イベントの内容を承認なしで直接書き換えられる**。また `closed` / `cancelled` / `draft` への変更も可能（`published` への遷移のみ制限）。→ P0-7 で扱う。
7. `/api/manual-events` の公開フィルタは `status !== 'draft'`（**拒否リスト方式**）で、新しい status を追加すると未対応のまま公開されてしまう状態だった。あわせて公開応答から `status` を除去していたため、**中止・受付終了にした手動イベントが公開画面で通常表示されていた**。→ いずれも PR #54 で修正済み（許可リスト方式・status を公開）。

## 3. 共通設計方針

### 3-1. 変えないこと（引継ぎ書 §0 の再確認）
- 認可は `shared/authz.cjs` の deny-by-default に集約。クライアント送信の role/pref/office は信用しない。
- 状態変更 API は `requireSameOrigin()`、応答は `noStore()`、監査は `writeAudit()`（追記専用）。
- 純粋ロジックは `shared/*.cjs` に置き `node:test` でテストする。I/O は `api/` 側。
- 秘密情報（パスワード・ハッシュ・セッション・トークン・API キー・TOTP シークレット）は、ログ・監査・バックアップ・応答に出さない。

### 3-2. 追加する権限（`ROLE_PERMISSIONS`）

| 権限 | 付与ロール（既定） | 用途 |
|---|---|---|
| `account:manage` | national_admin（既存） | アカウント作成・変更・停止・リセット |
| `account:manage:pref` | （既定なし・D-1 で決定） | 自地本の office_* アカウントのみ管理 |
| `event:approve` | office_manager / pco_admin / national_admin | 承認待ちの承認・差戻し（P0-7） |
| `backup:export` | national_admin / system_admin | バックアップ作成 |
| `backup:restore` | national_admin | 復元（system_admin 単独では不可・D-5） |
| `system:migrate` | system_admin / national_admin | 移行ウィザード |

### 3-3. 重要操作（step-up 必須）
アカウント作成・ロール/所属変更・national_admin 付与・停止・パスワード/MFA リセット・異動確定・バックアップ作成・復元・移行・読み取り専用モード切替。判定は `shared/stepUp.cjs`（P0-6）に一元化し、各 API は `requireStepUp(req, res, account, 'op名')` を呼ぶだけにする。

### 3-4. 新規 Redis キー（全機能分）

| キー | 型 | 用途 | 機能 |
|---|---|---|---|
| `acct:records` | hash | userId → アカウント JSON | P0-1 |
| `acct:login` | hash | 小文字ログインID → userId（一意制約） | P0-1 |
| `acct:setup:<sha256>` | string+TTL | 初回/再設定トークン（ハッシュで保存） | P0-1 |
| `acct:mfa-pending:<token>` | string+TTL | パスワード通過後の MFA 待ち | P0-6 |
| `handover:<id>` | string | 異動記録（チェックリスト状態） | P0-2 |
| `handover:index` | list | 異動記録 ID | P0-2 |
| `backup:snapshot:<ts>` | string+TTL | 復元前スナップショット | P0-4 |
| `backup:preview:<token>` | string+TTL | 復元プレビューの結合トークン | P0-4 |
| `system:meta` | hash | `schemaVersion` ほか | 共通 |
| `system:readonly` | string | 読み取り専用（メンテ）モード | P0-5 |

`admin:lastseen`・`rl:*` は既存だが引継ぎ書 Appendix B に未記載（同表へ追記予定）。

### 3-5. スキーマ版数
`system:meta.schemaVersion` を導入する（現行 = `1`、アカウント保存先の導入で `2`、承認フローで `3`）。バックアップ・復元・移行はこの値で互換性を判定する。版を上げる変更には、**前方移行関数（`shared/schemaMigrations.cjs`）とそのテスト**を必須とする。

### 3-6. 読み取り専用モード
`system:readonly` が設定されている間、管理 API の状態変更（POST/PATCH/DELETE）は 503 `{error:'maintenance'}` を返す（ログイン・ログアウト・復元 API 本体は除外）。復元・移行中の書き込み競合を防ぐ。判定は `_security.js` の `requireWritable()` に集約する。

## 4. 実装順序（1機能 = 1 PR・各 PR は単独でロールバック可能）

```text
PR-A  共通基盤: system:meta / requireWritable / 権限定義の追加（振る舞い変更なし）
PR-B  P0-1a accountStore（ACCOUNT_STORE=env が既定＝現行と同じ動作）
PR-C  P0-1b アカウント管理 API（hybrid モードでのみ有効）
PR-D  P0-6a TOTP・step-up 基盤（MFA は任意登録・強制なし）
PR-E  P0-1c アカウント管理 GUI（step-up 連携）
PR-F  P0-2  異動ウィザード
（PR-G 公開フィルタの許可リスト化 … PR #54 で対応済み）
PR-H  P0-7 承認ワークフロー（APPROVAL_MODE=off が既定）
PR-I  P0-3  バックアップ作成
PR-J  P0-4  検証付き復元
PR-K  P0-5  移行ウィザード
PR-L  P0-6b MFA の必須化（ロール単位で段階適用）
```

依存関係: B → C → E → F、D → E、B → I → J → K。H（承認フロー）はアカウント系と独立しているため、並行して進められる。

## 5. 決定が必要な事項（運営者の判断待ち）

| # | 事項 | 設計上の既定（推奨） |
|---|---|---|
| D-1 | pco_admin に自地本の office_* アカウント管理を委任するか | 初期は national_admin のみ。運用が固まったら `account:manage:pref` で委任 |
| D-2 | MFA 方式 | TOTP（認証アプリ）。導入先に IdP（SAML/OIDC）指定があれば将来差替え |
| D-3 | 承認を必須にする範囲 | office_editor の公開・公開中イベントの変更のみ承認必須（`APPROVAL_MODE=editor`） |
| D-4 | 自己承認の禁止 | 禁止しない（小規模事務所で承認者が1人の場合に止まるため）。監査で可視化 |
| D-5 | 復元を national_admin 単独で実行してよいか | 可（step-up 必須）。将来は2名承認 |
| D-6 | 自動バックアップの保管先 | GitHub Actions の**暗号化アーティファクト**（公開鍵暗号・保持90日）。リポジトリには置かない |
| D-7 | `data/events-archive.json` が公開リポジトリで読める件 | 内容は公開済み情報のため当面許容し、文書の「非公開」表記を「公開サイトからは配信しない」に改める |
| D-8 | バックアップに監査ログを含めるか | 既定は含めない（別操作でエクスポート）。含める場合も連絡先等の個人情報は除外 |
