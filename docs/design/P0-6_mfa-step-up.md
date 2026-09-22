# P0-6 MFA（TOTP）・重要操作の再認証（step-up） — 詳細設計

> 状態: 設計（未実装）｜依存: P0-1（アカウントレコードに `mfa` 項目を持たせる）｜方式の最終決定: D-2

## 1. 目的
- パスワードの漏洩だけで管理画面を乗っ取られないようにする（MFA）。
- ログイン済みの端末が放置・盗用されても、重要操作（アカウント・バックアップ・復元・移行）はすぐには実行できないようにする（step-up）。

## 2. 方式の選定

| 方式 | 採否 | 理由 |
|---|---|---|
| **TOTP（認証アプリ）** | **採用（初期）** | 追加の外部サービス・費用が不要。Node 標準の `crypto` だけで実装でき、依存ライブラリが増えない |
| WebAuthn / パスキー | 将来 | フィッシング耐性は最も高いが、共用端末・業務端末の制約を確認してから |
| SMS / メール | 不採用 | 外部送信サービスが必要になり、個人の連絡先を保存することになる |
| 組織の IdP（SAML/OIDC） | 導入先の指定次第 | 指定があれば、ログイン自体を IdP に置き換える（別設計） |

## 3. TOTP の仕様（`shared/totp.cjs`・純粋関数）
- RFC 6238 / HMAC-SHA1 / 6桁 / 30秒。許容幅は前後1ステップ。
- シークレット: 20バイト乱数・base32。登録用の `otpauth://` URI を生成する（QR 表示はブラウザ側で行い、サーバーは画像を生成しない）。
- **再利用の防止**: アカウントごとに最後に受理したステップ番号を保存し、それ以下のコードは拒否する。
- 回復コード: 10個（各10文字）。**ハッシュ（sha256）で保存**し、1回使うと無効になる。
- テストには RFC 6238 付録の公式テストベクタを使う。

### 3-1. 保存（アカウントレコードの `mfa` 項目）

```json
"mfa": {
  "type": "totp",
  "secretEnc": "v1:<iv>:<ciphertext>:<tag>",
  "enrolledAt": "…",
  "lastStep": 58823456,
  "recoveryHashes": ["…", "…"]
}
```

- シークレットは環境変数 `MFA_ENC_KEY`（32バイト）を鍵として **AES-256-GCM で暗号化**して保存する。Redis だけが漏洩しても TOTP は生成できない。
- 鍵の入れ替えに備え、`v1:` のように鍵の版を前置する。旧版の鍵は `MFA_ENC_KEY_PREV` で一定期間読めるようにする。

## 4. ログインの流れ

```text
POST /api/admin/login {user, pass}
 ├─ MFA 未登録 → 従来どおりセッション発行（必須ロールなら「MFA 登録が必要」フラグ付き）
 └─ MFA 登録済み → 200 {mfaRequired:true, pendingToken}
                     pendingToken: acct:mfa-pending:<sha256> に {userId, sv} を TTL 5分で保存
POST /api/admin/login {op:'mfa', pendingToken, code}
 ├─ 成功 → セッション発行（session に mfaAt を記録）・pending 削除
 └─ 失敗 → 既存のアカウントロック（失敗回数・指数バックオフ）に合算する
```

- パスワード段階とコード段階で失敗回数を共有し、コードの総当りを防ぐ。
- pendingToken はパスワード検証を通過した証明にすぎず、それだけでは管理 API を呼べない。

### 4-1. 必須化（PR-L）
- 環境変数 `MFA_REQUIRED_ROLES`（例: `national_admin,system_admin,pco_admin`）。既定は空（任意登録）。
- 必須ロールで未登録の場合、ログイン後は「MFA 登録画面」以外の管理 API を 403 `{error:'mfa_enrollment_required'}` とする。
- 段階適用: national_admin → system_admin/pco_admin → 全ロール。各段階の前に、未登録者の一覧を管理画面で確認できるようにする。

## 5. step-up（重要操作の再認証）

### 5-1. 判定（`shared/stepUp.cjs`）
```js
stepUpDecision({ session, account, op, now }) → { ok } | { ok:false, reason:'step_up_required' }
```
- セッションの `stepUpAt` が **5分以内**（`STEP_UP_TTL_SEC`）であれば通す。
- 対象操作の一覧は `STEP_UP_OPS` に定義する（README §3-3）。
- MFA 登録済みのアカウントは、step-up にもコードを要求する。未登録のアカウントはパスワードのみ（必須化の後は未登録者は存在しない）。

### 5-2. API（`api/admin/login.js` に `op:'step-up'` を追加。関数数を増やさない）
`POST {op:'step-up', pass, code?}` → 検証に成功したらセッションの `stepUpAt` を更新する。失敗はログインロックと合算し、監査に `auth.stepup` を記録する。

### 5-3. 画面の動き
重要操作の API が 401 `step_up_required` を返したら、共通のダイアログ（パスワード＋コード）を表示し、成功後に元の操作を自動で再送する。`adminFetch` に共通処理として組み込み、各画面で個別に実装しない。

## 6. 本人による MFA 登録・解除
- 登録: `POST /api/admin/accounts {op:'mfa-enroll-start'}` → シークレット（登録完了までは pending として TTL 10分で保持）と URI を返す → `op:'mfa-enroll-verify', code` で確定し、回復コードを**1回だけ**表示する。
- 本人による解除は不可とする（必須化の抜け道になるため）。管理者による解除（`op:'reset-mfa'`）は step-up 必須で、`sessionVersion+1` によって既存のログインも切る。
- 端末紛失時: 回復コードでログイン → 再登録。回復コードも紛失した場合は、管理者に解除を依頼する（本人確認は運用手順で行う）。

## 7. 監査
`auth.mfa.challenge|success|failure`、`auth.stepup.success|failure`、`account.mfa.enroll|reset`、`auth.recovery.used`。コード・シークレット・回復コードは記録しない。

## 8. テスト
- `totp.test.cjs`: RFC 6238 のテストベクタ、前後1ステップの許容、再利用の拒否、base32 の往復変換
- `mfaCrypto.test.cjs`: 暗号化の往復、改ざん検知（タグ不一致で失敗）、旧鍵での復号
- `stepUp.test.cjs`: 有効期限の境界、対象外の操作は不要、MFA 登録の有無による要求の違い
- `loginMfa.test.cjs`（メモリ Redis）: pendingToken の期限切れ・再利用不可、コードの失敗がロックに合算されること、pendingToken だけでは管理 API に 401 になること
- 手動: 実際の認証アプリ（Google Authenticator / Microsoft Authenticator 等）で登録・ログインを確認する

## 9. ロールバック
- MFA の必須化は `MFA_REQUIRED_ROLES` を空にすれば解除できる。
- MFA 自体に障害が起きた場合（鍵の紛失など）は、緊急用 env アカウント（MFA 対象外として明示）でログインし、管理者による一括解除（`op:'reset-mfa'`）を行う。この手順を手順書に記載する。
- `MFA_ENC_KEY` を紛失するとシークレットを復号できなくなるため、この鍵はバックアップ対象外とし、保管責任者が別途保管する（引継ぎチェックリストに追加）。
