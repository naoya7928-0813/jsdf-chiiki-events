# P0-1 アカウント保存先・アカウント管理 API / GUI — 詳細設計

> 状態: 設計（未実装）｜依存: 共通基盤 PR-A｜関連: P0-2, P0-6, P0-3

## 1. 目的
コードや環境変数を触らずに、管理画面からアカウントの**発行・停止・権限変更・所属変更・パスワード再設定**ができ、**すぐに反映**されるようにする。

## 2. 現状と課題
- アカウントは GitHub Secret `ADMIN_ACCOUNTS_B64` に保存され、デプロイのたびに Vercel へ注入される（README §2-1）。変更には「JSON 作成 → scrypt 化 → base64 化 → Secret 更新 → 再デプロイ」が必要で、技術者でないと扱えない。
- `loadAccounts()` は同期関数で、リクエストのたびに環境変数を読み直している。

## 3. 設計概要

```text
                 ┌────────────── accountStore（api/_accountStore.js） ──────────────┐
 verifyCredentials│  mode=env    : 環境変数のみ（現行と同じ）                          │
 resolveSession  ─┤  mode=hybrid : Redis（管理対象）＋ 環境変数（緊急用・GUI で変更不可）│
 presence         │  mode=redis  : Redis のみ（環境変数は緊急用アカウントのみ許可）     │
                 └──────────────────────────────────────────────────────────────┘
```

- 切替は環境変数 `ACCOUNT_STORE`（`env` 既定 / `hybrid` / `redis`）。**既定は現行と同じ動作**で、PR をマージしても何も変わらない。
- 環境変数側のアカウントは**緊急用（break-glass）**として残す。Redis 障害時や誤操作で全員がロックアウトされた場合の復旧経路になる。

### 3-1. 解決順序（hybrid）
1. Redis `acct:records` の有効アカウント
2. `ADMIN_ACCOUNTS_B64` のアカウント（`source:'env'` を付与。GUI からは閲覧のみ・変更不可）
3. ログインIDが両方に存在する場合は **env を優先**し、監査に `account.conflict` を記録する（緊急用経路を奪われないため）。GUI では作成時に env 側と重複するIDを拒否する。

## 4. データモデル

### 4-1. アカウントレコード（`acct:records` の値）

```json
{
  "userId": "u_7fk2m9q4",
  "user": "sby-manager-01",
  "passHash": "scrypt$16384$<salt>$<hash>",
  "organization": "tokyo",
  "office": "shibuya",
  "role": "office_manager",
  "displayId": "OP-SBY-01",
  "label": "渋谷 所長",
  "enabled": true,
  "sessionVersion": 3,
  "mustSetPassword": false,
  "passwordChangedAt": "2026-10-01T09:00:00+09:00",
  "mfa": null,
  "createdAt": "…", "createdBy": "OP-NAT-01",
  "updatedAt": "…", "updatedBy": "OP-NAT-01",
  "disabledAt": null, "disabledBy": null, "disabledReason": null,
  "rev": 7,
  "source": "redis"
}
```

| 項目 | 規則 |
|---|---|
| `userId` | サーバー生成（`u_` + 8文字の base32）・**変更不可**。監査ログの `accountId` と対応する |
| `user` | ログインID。3〜32文字 `[a-z0-9._-]`。小文字で一意（`acct:login` で担保） |
| `passHash` | scrypt 形式のみ。**平文は保存しない**。API 応答・監査・バックアップには出さない |
| `role` / `organization` / `office` | `authz.normalizeAccount` と同じ検証。office_* ロールは `office` 必須 |
| `sessionVersion` | パスワード変更・停止・ロール/所属変更・MFA リセットで +1（既存セッションを即時失効） |
| `rev` | 楽観ロック用。更新のたびに +1。クライアントは読んだ `rev` を送り、不一致なら 409 |
| 削除 | **物理削除しない**。`enabled:false` ＋ `disabledAt`（監査ログとの対応を保つため） |

### 4-2. 正規化
`authz.normalizeAccount` を拡張し、`passHash`（新）と `pass`（旧）の両方を受け付ける。権限判定は従来どおり `authz` に集約し、保存先の違いを判定ロジックに持ち込まない。

## 5. パスワードの発行と再設定（管理者は平文を扱わない）

1. 管理者がアカウントを作成（またはパスワード再設定）すると、サーバーが**ワンタイムの設定トークン**（32バイト乱数）を生成する。
2. Redis には `acct:setup:<sha256(token)>` として**ハッシュのみ**を保存（TTL 72時間・1回限り）。値は `{userId, purpose:'initial'|'reset', issuedBy}`。
3. 管理者の画面に**設定用URLを1回だけ**表示する（`/admin.html#setup=<token>`）。管理者はこれを本人へ安全な方法で渡す。URL はクエリではなくフラグメント（`#`）に置き、サーバーログや Referer に残さない。
4. 本人がURLを開いてパスワードを設定 → `POST /api/admin/accounts {op:'setup', token, password}`。
   - パスワード規則（`shared/passwordPolicy.cjs`）: 12文字以上、ログインIDを含まない、よく使われる弱いパスワードの一覧に含まれない。
   - 成功時: `passHash` を更新、`mustSetPassword:false`、`sessionVersion+1`、トークン削除、監査に `account.password.set` を記録。
5. 再設定（リセット）時は、発行した時点で `mustSetPassword:true`・`sessionVersion+1` とし、旧パスワードは即時無効にする。

> 代替案として「管理者が仮パスワードを決めて初回変更を強制する」方式もあるが、管理者が平文パスワードを知ってしまうため採用しない。

## 6. accountStore の実装方針

```js
// api/_accountStore.js（I/O）
export async function listAccounts()            // 全件（passHash を含む。サーバー内部専用）
export async function getAccount(userId)       // 1件（セッション検証用・キャッシュしない）
export async function findByLogin(user)        // ログイン用
export async function createAccount(rec, actor)            // Lua で login 一意制約＋作成を原子的に
export async function updateAccount(userId, rev, patch, actor) // Lua で rev の比較と更新を原子的に
```

- **セッション検証（`resolveSession`）は毎回 `getAccount(userId)` を1回呼ぶ**（HGET 1回）。停止・権限変更を即時に反映するため、キャッシュしない。
- 一覧（在席・管理画面）は関数インスタンス内で 10 秒キャッシュしてよい（表示用途のみ）。
- 呼び出し側の非同期化: `verifyCredentials` → `async`。影響範囲は `login.js`・`resolveAccount`（旧ヘッダ経路）・`presence.js`・`adminAuth.test.cjs`。
- Redis 障害時の扱い: **ログインは拒否**（安全側）。ただし env の緊急用アカウントは Redis なしでも認証できる。セッション検証も Redis 必須のため、障害中は緊急用アカウントでもログイン不可となる（現行と同じ）。

## 7. API（`api/admin/accounts.js` の1ファイルに集約）

| メソッド / op | 権限 | step-up | 内容 |
|---|---|---|---|
| `GET` | `account:read` | – | 一覧（スコープ内のみ。`passHash`・`mfa.secret` は返さない。`source` を返す） |
| `POST op:create` | `account:manage` | 必須 | 作成し、設定用URLを1回だけ返す |
| `POST op:update` | `account:manage` | ロール/所属変更時は必須 | `label` / `displayId` / `role` / `organization` / `office` の変更（`rev` 必須） |
| `POST op:disable` / `op:enable` | `account:manage` | 必須 | 停止・再開（停止時は理由必須） |
| `POST op:reset-password` | `account:manage` | 必須 | 再設定用URLを発行 |
| `POST op:reset-mfa` | `account:manage` | 必須 | MFA を解除（P0-6） |
| `POST op:setup` | トークン | – | 本人によるパスワード設定（未ログインで呼べる。IP レート制限 5回/10分） |
| `POST op:change-password` | 本人 | 現パスワード必須 | 本人によるパスワード変更 |
| `POST op:import-env` | `account:manage` | 必須 | env のアカウントを Redis へ取り込む（§9） |

すべての状態変更は `requireSameOrigin` → `requireWritable` → `requireAuth` → 権限 → スコープ → step-up → 検証 → 保存 → 監査、の順で処理する。

### 7-1. 付与の制約（`shared/accountPolicy.cjs`・純粋関数）
- **自分より強い権限は付与できない**。national_admin / system_admin / auditor を作成・付与できるのは national_admin のみ。
- `account:manage:pref`（D-1 で委任した場合）: 対象と付与先が自地本かつ `office_editor` / `office_manager` の場合のみ。
- **自分自身の停止・降格はできない**。
- **有効な national_admin が 2 名未満になる操作は拒否する**（env の緊急用アカウントは数に含めない）。
- 所属変更は「組織（pref）」と「office」の組み合わせを `public/data/offices.json` で検証する。

### 7-2. 監査
`account.create|update|disable|enable|password.reset|password.set|password.change|mfa.reset|import|conflict` を記録する。`before` / `after` は `passHash`・`mfa` を除いたうえで、変更された項目のみを記録する。

## 8. GUI（管理画面「アカウント」タブ）
- 表示条件: `account:read`。操作ボタンは `account:manage` を持つ場合のみ表示する（最終判定はサーバー側）。
- 一覧: 表示ID・名称・ロール・地本/事務所・状態（有効/停止/設定待ち）・最終ログイン（在席情報を流用）・出どころ（`env` は鍵アイコン付きで変更不可）。
- 作成フォーム: ロール選択に応じて office 欄を必須化し、office は地本で絞った候補から選ぶ（自由入力にしない）。
- 設定用URLの表示画面: 「この画面を閉じると二度と表示できません」と明示し、コピーボタンを置く。スクリーンショットや共有チャットへの貼り付けを避けるよう注意書きを出す。
- 危険操作（停止・ロール変更）は確認ダイアログを出し、影響（「既存のログインはすぐに切れます」）を明示する。

## 9. 移行手順（env → Redis）

1. PR-B/C をデプロイ（`ACCOUNT_STORE=env` のまま＝変化なし）。
2. `ACCOUNT_STORE=hybrid` に切り替える。
3. national_admin が GUI の「環境変数から取り込み」を実行する。
   - `userId`・`sessionVersion`・`passHash` を保持してコピーする → **既存のログインは切れない**。
   - 平文パスワードのアカウントは取り込むが `mustSetPassword:true` とし、設定用URLを発行する（平文は Redis に保存しない）。
   - 取り込んだアカウントは env 側と重複するため、この時点では env が優先される（§3-1）。
4. `ADMIN_ACCOUNTS_B64`（GitHub Secret）を**緊急用 national_admin 1件のみ**に縮小する。この更新は運営者が Secret を直接操作する（最後の1回）。
5. 1〜2週間運用して問題がなければ `ACCOUNT_STORE=redis` にする。
6. 緊急用アカウントの資格情報は封緘し、保管責任者を `docs/HANDOVER_PACKAGE_CHECKLIST.md` に記載する。

## 10. ロールバック
- `ACCOUNT_STORE=env` に戻すだけで旧方式に戻る（Redis のデータは残るため、再切替も可能）。
- ただし Redis でのみ作成・変更したアカウントは、env に戻すと使えなくなる。GUI に「env へ戻す場合に反映が必要なアカウント」一覧を表示し、JSON（`passHash` を含まない）で出力できるようにする。

## 11. テスト
- `accountPolicy.test.cjs`: 権限付与の制約（強い権限の付与不可、自己停止不可、national 2名未満の拒否、pref 委任の範囲）
- `passwordPolicy.test.cjs`: 長さ・ID包含・弱いパスワード一覧
- `accountStore.test.cjs`（メモリ Redis）: 作成時の一意制約、`rev` 不一致で 409、`sessionVersion` が上がる条件、hybrid の解決順序、env 優先時の衝突監査
- `accountsApi.test.cjs`: 未認証 401、権限なし 403、step-up なし 401(`step_up_required`)、応答に `passHash` が含まれないこと、no-store、CSRF 拒否
- 既存の `adminAuth.test.cjs` / `authz.test.cjs` / `session.test.cjs` が非同期化後も通ること
- 手動: 停止した瞬間に対象者の次の操作が 401 になること（引継ぎ書 §27 の追加項目）

## 12. セキュリティ上の考慮
- Redis の漏洩はパスワードハッシュの漏洩を意味する（オフライン総当りの対象になる）。scrypt N=16384 を維持し、パスワード規則で下限を上げる。将来 N を上げる場合は、ログイン成功時に再ハッシュする。
- 設定用トークンは平文で保存しない。1回限り・72時間。利用・失効を監査に記録する。
- ログイン失敗時の応答・所要時間から、アカウントの有無が分からないようにする（存在しない ID でもダミーの scrypt を1回実行する）。
