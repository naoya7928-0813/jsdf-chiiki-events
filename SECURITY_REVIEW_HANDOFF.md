# セキュリティレビュー引き継ぎ資料（SECURITY_REVIEW_HANDOFF.md）

第三者が `security/trial-ops-hardening` ブランチの実装を検証するための資料です。
**秘密情報（パスワード・ハッシュ・Cookie値・トークン・APIキー・Redis URL・ntfyトピック名・個人情報）は記載していません。** 環境変数は変数名と既定動作のみ記載します。

---

## 1. 対象バージョン

```text
リポジトリ:           naoya7928-0813/jsdf-chiiki-events
対象ブランチ:         security/trial-ops-hardening
比較元ブランチ:       master
対象コミットSHA:      fafc293418aab9a4744fafd62b813f1cce87acbd
比較元コミットSHA:    29495c579c15437e5343b225d5d6d545ced8a219
作業ツリーの未コミット変更: なし（git status --short が空）
作成日時:             2026-06-28 (JST)
Node.jsバージョン:    v24.15.0
npmバージョン:        11.12.1
```

コマンド結果の要約:
- `git status --short`: 出力なし（クリーン）
- `git log -1 --oneline`: `fafc293 feat(security): 正式試験運用に向けた認証・認可・監査・データ品質の強化（優先度A）`
- `git diff --stat master...HEAD`: 31ファイル変更、+1395 / -442 行
- `git diff --check master...HEAD`: **エラーなし（CHECK_CLEAN）** — 行末空白・コンフリクトマーカーなし
- `node --version` / `npm --version`: 上記のとおり

---

## 2. 変更ファイル一覧

| ファイル | 区分 | 目的 | セキュリティ影響 | 互換性影響 |
|---|---|---|---|---|
| `shared/authz.cjs` | 新規 | RBAC（ロール/権限/スコープ・純粋関数） | 高（認可の中核） | 後方互換: role未指定はprefから導出 |
| `shared/session.cjs` | 新規 | scryptパスワード・Cookie・トークン（純粋） | 高 | なし |
| `shared/dataQuality.cjs` | 新規 | events.json検証＋ID一意化 | 中（データ完全性） | なし |
| `scripts/check-data-quality.mjs` | 新規 | CIデータ品質ゲート | 中 | なし |
| `api/admin/logout.js` | 新規 | セッション失効 | 中 | 追加API |
| `api/_security.js` | 変更 | 認証/セッション/RBAC/監査の統合 | 高 | `requireAccount`等は維持＋新API追加 |
| `api/admin/login.js` | 変更 | セッション発行＋ログイン監査 | 高 | レスポンスに`account`追加（`pref/label`は維持） |
| `api/admin/events.js` | 変更 | 権限/スコープ/監査に置換（staff廃止） | 高 | 認可強化（旧staff方式は無効化） |
| `api/admin/overrides.js` | 変更 | IDOR修正・スコープ強制・監査 | 高 | 認可強化（DELETE厳格化） |
| `api/admin/history.js` | 変更 | 追記専用化（削除API廃止）・権限 | 高 | DELETEは405に変更 |
| `api/report.js` | 変更 | ntfy固定フォールバック廃止（未設定で503） | 中 | 環境変数必須化 |
| `api/manual-events.js` | 変更 | 内部フラグ`weatherLocationNeedsUpdate`を非公開化 | 低 | なし |
| `src/components/AdminScreen.jsx` | 変更 | Cookieセッション化（PW非保存）・staff UI撤去 | 高 | localStorageキー変更（再ログイン要） |
| `src/App.jsx` | 変更 | adminAuthed判定キーを更新 | 低 | なし |
| `src/constants/privacy.js` | 変更 | 実装に整合（送信情報・外部サービス明記） | 中（法的整合） | 表示文言変更 |
| `.github/workflows/deploy.yml` | 変更 | `npm test`＋データ品質をデプロイ前ゲート | 中 | デプロイ条件追加 |
| `.github/workflows/scrape.yml` | 変更 | データ品質ゲート追加 | 中 | デプロイ条件追加 |
| `scraper/index.js` | 変更 | ID一意化を`writeOutput`に組込み | 中 | 出力IDが一意化される |
| `public/data/events.json` | 変更（自動生成データ） | **ID衝突2件を一意化**（iwate）。件数236は不変 | 低 | 当該2件のIDが`...-2`に |
| `package.json` | 変更 | version 1.17.33 | なし | なし |
| `src/constants/updates.js` | 変更 | 更新ノート追記 | なし | なし |
| `CLAUDE.md`/`README.md`/`DEPLOY.md` | 変更 | 文書更新（DEPLOYは旧GAS記述を一掃） | なし | なし |
| `SECURITY.md`/`OPERATIONS.md`/`DATA_SOURCES.md`/`THIRD_PARTY_NOTICES.md`/`LICENSE` | 新規 | 運用・出典・ライセンス文書 | なし | なし |
| `shared/*.test.cjs`（authz/session/dataQuality） | 新規 | テスト+34件 | なし | なし |

---

## 3. 認証フロー

`api/admin/login.js` → `api/_security.js`（`verifyCredentials` / `startSession` / `authenticate` / `resolveSession` / `endSession`） → `shared/session.cjs` を使用。

| 処理 | ファイル | 関数 | 成功時 | 失敗時 |
|---|---|---|---|---|
| ログイン要求受付 | `api/admin/login.js` | `handler` | 処理継続 | 非POST=405、未設定=503、レート超過=429 |
| パスワード照合 | `api/_security.js`→`shared/session.cjs` | `verifyCredentials`→`verifyPassword` | アカウント返却 | 監査`auth.login/failure`記録→401 |
| アカウント有効性 | `shared/authz.cjs` | `normalizeAccount`(`enabled`) | enabled以外は照合対象外 | `enabled:false`は照合スキップ→401 |
| セッション生成 | `api/_security.js` | `startSession`→`session.newToken` | トークン生成 | — |
| Redis保存 | `api/_security.js` | `startSession`（`redis.set ex=ABS_TTL`） | 保存 | 失敗時`false`→503（Cookie発行せず） |
| Cookie発行 | `shared/session.cjs` | `serializeSessionCookie` | Set-Cookie付与 | — |
| ログイン監査 | `api/_security.js` | `writeAudit` | `auth.login/success`記録 | （ベストエフォート） |
| 管理APIでCookie検証 | `api/_security.js` | `requireAuth`→`authenticate`→`resolveSession` | account返却 | 401（無効/失効） |
| 無操作・絶対期限確認 | `api/_security.js` | `resolveSession` | `lastSeen`更新・TTL延長 | 期限超過でRedisからdelしてnullΞ401 |
| アカウント再解決 | `api/_security.js` | `resolveSession`（`loadAccounts().find`） | 最新role/office/enabled反映 | 無効/不在ならdel→401 |
| ログアウト | `api/admin/logout.js`→`api/_security.js` | `endSession` | Redis del＋失効Cookie＋`auth.logout`監査 | — |

補足: `authenticate` は **セッション優先**、無ければ `LEGACY_HEADER_AUTH` 有効時のみ旧ヘッダ認証へフォールバック。

---

## 4. Cookie設定

| 属性 | 値・条件 | 本番 | 開発 |
|---|---|---|---|
| HttpOnly | 常に付与 | ✓ | ✓ |
| Secure | `SESSION_INSECURE!=='true'` のとき付与 | ✓ | `SESSION_INSECURE=true`で外す |
| SameSite | `Strict`（既定） | Strict | Strict |
| Path | `/` | ✓ | ✓ |
| Max-Age | `ADMIN_SESSION_TTL`（既定28800=8h）。失効時は0 | 8h | 8h |

- **Cookie名**: `jsdf_admin_session`（値は記載しない）。
- **トークン生成**: `crypto.randomBytes(32).toString('base64url')`（`shared/session.cjs` `newToken`）。
- **RedisキーにセッションIDを使用**: キーは `admin:session:<token>`。**トークンを平文のままキーに使用**（ハッシュ化はしていない）。トークン自体が高エントロピーの秘密で、保存先のUpstashはアクセス制限済み。値（JSON）は `userId / user / createdAt / lastSeen` のみ（パスワード・権限は保存せず、毎回 config から再解決）。
- **ログ出力**: Cookie値・トークンをログに出す箇所は無し（監査ログにも含めない。§11参照）。

---

## 5. 環境変数と既定値

| 環境変数 | 用途 | 未設定時の動作 | 本番推奨値 | 必須/任意 |
|---|---|---|---|---|
| `ADMIN_ACCOUNTS_B64` | 管理アカウント定義(base64 JSON) | 管理機能は実質無効（`ADMIN_SECRET`も無ければ503） | 設定（scryptハッシュ推奨） | 必須 |
| `ADMIN_SECRET` | 後方互換の単一PW（national扱い） | 無効 | 不使用推奨 | 任意 |
| `LEGACY_HEADER_AUTH` | 旧ヘッダ認証の許可 | **有効（既定ON）** | `false` | 任意 |
| `LEGACY_PLAINTEXT_PASSWORDS` | 平文PW照合の許可 | **有効（既定ON）** | `false` | 任意 |
| `ENABLE_DEV_STAFF` | 旧個人番号(001等) | **無効（既定OFF）** | 未設定 | 任意 |
| `SESSION_INSECURE` | Cookie Secure を外す | 無効（=Secure付与） | 未設定 | 任意 |
| `ADMIN_SESSION_TTL` | セッション絶対期限(秒) | 28800(8h) | 28800前後 | 任意 |
| `ADMIN_SESSION_IDLE` | 無操作失効(秒) | 3600(60分) | 3600前後 | 任意 |
| `AUDIT_MAX` | 監査ログ保持件数 | 5000 | 5000以上 | 任意 |
| `NTFY_BUG_TOPIC` | 誤情報報告の通知先 | **503で失敗（固定先なし）** | 設定 | 報告機能で必須 |
| `NOTIFY_SECRET` | `/api/notify`認証 | 通知送信不可 | 設定 | 通知で必須 |
| `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` | Web Push | Push不可 | 設定 | Pushで必須 |
| `KV_REST_API_URL`/`KV_REST_API_TOKEN` | Upstash Redis | セッション/管理/レート制限/天気キャッシュ不可 | 設定 | 必須 |
| `SITE_URL` | override所属解決のevents.json取得元 | 本番URLへフォールバック | 設定 | 任意 |

**重要（既定値の明確化）**:
- レガシーヘッダ認証 `LEGACY_HEADER_AUTH`: **未設定で有効**（`!=='false'`）。
- 平文パスワード `LEGACY_PLAINTEXT_PASSWORDS`: **未設定で有効**。
- 開発用個人番号 `ENABLE_DEV_STAFF`: **未設定で無効**（`==='true'`のときのみ有効）。

> 移行期の利便性のため2つのレガシーフラグは既定ONです。**正式運用前に明示的に`false`にすること**（§17/§18）。

---

## 6. RBAC権限表

`shared/authz.cjs` の `ROLE_PERMISSIONS` / `canManageScope` / `canPublish` に基づく（コードで動作確認済み）。

| 操作 | office_editor | office_manager | pco_admin | national_admin | auditor | system_admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| イベント作成 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| イベント編集 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| イベント削除 | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| イベント公開 | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| オーバーライド作成 | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| オーバーライド削除 | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 監査ログ閲覧 | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| 監査ログ削除 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗（API自体廃止） |
| システム設定 | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

**スコープ条件**（`canManageScope`）:
- `national_admin`（または organization `*`）: 全国（全地本・全事務所）。
- `pco_admin`: 自地本(organization)のみ。事務所制限なし（地本全体）。
- `office_editor`/`office_manager`: 自地本かつ、対象に `office` がある場合は自事務所のみ。
- `auditor`/`system_admin`: イベント権限なし（監査/設定のみ）。
- 非全国アカウントは対象に `pref` が無いと**拒否**（deny-by-default）。

---

## 7. 管理API認可表

| Method | Endpoint | 必要権限 | スコープ判定 | 所属情報の取得元 | 未認証 | 権限不足 |
|---|---|---|---|---|---|---|
| POST | `/api/admin/login` | 不要（資格情報照合） | — | — | 401（資格不正） | — |
| POST | `/api/admin/logout` | 不要（任意） | — | — | 200（無害） | — |
| GET | `/api/admin/events` | 認証のみ | `canManageScope(pref,office)`でフィルタ | 各イベントの`pref/office`（サーバー保存値） | 401 | スコープ外は結果から除外 |
| POST | `/api/admin/events` | `event:create`（公開時`canPublish`） | `pref`は`account.organization`に強制、`office`は`account.office`を刻む | アカウント | 401 | 403 |
| PATCH | `/api/admin/events` | `event:update`（公開遷移時`canPublish`） | `canManageScope`（保存値の`pref/office`） | Redis保存のイベント | 401 | 403 |
| DELETE | `/api/admin/events` | `event:delete` | `canManageScope`（保存値） | Redis保存のイベント | 401 | 403 |
| GET | `/api/admin/overrides` | `event:override` | 記録の`_pref`（無ければ実解決）でフィルタ | Redis(`manual:events`)→events.json | 401 | 403 |
| POST | `/api/admin/overrides` | `event:override` | `canManageScope(ownerPref)` | **サーバー側で実解決**（下記） | 401 | 403／所属外403／不在404 |
| DELETE | `/api/admin/overrides` | `event:override` | `canManageScope`（記録`_pref`→実解決） | 既存override→実解決 | 401 | 403／不在404 |
| GET | `/api/admin/history` | `audit:read` | `canManageScope(organization)`でフィルタ | 監査エントリの`organization` | 401 | 403 |
| DELETE | `/api/admin/history` | — | — | — | — | **405（廃止）** |

- **クライアント`pref`を信用しない**: events は保存値、overrides は **`resolveEventPref(req,id)`** が `Redis manual:events`（手動）→ `events.json`（スクレイプ）の順で実所属を解決して判定。POST本文の`pref`は権限判定に使わない（記録にも`_pref`=実解決値を保存）。
- **存在しないイベントID**: overrides POST は実解決で見つからなければ **404**（保存しない）。DELETE は既存override無しで404。
- **override GET の範囲外**: 各レコードの`_pref`（旧データは実解決）で `canManageScope` を満たすものだけ返す（担当外は返さない）。
- **override DELETE の所属再確認**: 既存レコードの`_pref`（無ければ実解決）で再度`canManageScope`を確認してから削除。

---

## 8. アカウント無効化・権限変更

採用方式: **毎リクエストでアカウント状態を再取得**（`resolveSession` が `loadAccounts().find(userId)` で設定から再解決）。セッションには権限を保存せず、`userId` のみ保持。

| 項目 | 保証 | 仕組み |
|---|---|---|
| アカウント無効化後に既存セッション無効 | ✓ | `resolveSession` が `enabled:false`/不在を検出→Redis del→401 |
| ロール変更後に旧権限を使えない | ✓ | 権限は毎回再解決した `account.role/permissions` から判定 |
| 地本・事務所変更後に旧スコープを使えない | ✓ | `organization/office` も毎回再解決 |
| パスワード変更後に既存セッション失効 | **△ 自動失効しない** | セッションはトークン基準で、パスワードに紐付かない（`sessionVersion`なし） |

**残存リスク**: パスワード変更だけでは既存セッションは絶対期限（既定8h）まで残存。即時失効が必要な場合の運用は「該当アカウントを一旦 `enabled:false` にして再デプロイ→次リクエストで全セッション失効→再有効化」。恒久対応として `sessionVersion`（アカウントにバージョンを持たせ、セッションへ刻んで照合）を§18 Highに記載。

---

## 9. CSRF・Origin対策

| 対策 | 実装有無 | 対象処理 | ファイル/関数 |
|---|---|---|---|
| Origin完全一致 | ✓（許可リスト一致） | 全admin/書込API | `api/_security.js` `checkOrigin`（`ALLOWED_ORIGINS`） |
| Origin欠落時の拒否 | ✗（**欠落は許可**） | 同上 | `checkOrigin`は`origin`が存在し不一致のときのみ403 |
| Sec-Fetch-Site確認 | ✗ | — | 未実装 |
| SameSite Cookie | ✓（`Strict`） | セッションCookie | `shared/session.cjs` |
| CSRFトークン | ✗ | — | 未実装（SameSite=Strictで代替） |

**`POST/PATCH/DELETE` で Origin ヘッダが無い場合の実動作**: `checkOrigin` は `true`（通過）を返す。これは同一オリジンSW・curl 等を許容する設計。ブラウザ由来のクロスサイト改ざんは **SameSite=Strict Cookie** により Cookie が送られず実質遮断される。ただし多層防御としては不十分なため、§18 に「状態変更APIで Origin 必須化 or `Sec-Fetch-Site: same-origin` 確認」を改善候補として記載。

---

## 10. キャッシュ対策

Service Worker（`src/sw.js`）の `registerRoute` は **`/data/events.json` / `/api/manual-events` / `/api/weather` / Google Fonts** のみ。**`/api/admin/*` に一致するルートは存在しない** → SW はこれらをキャッシュせず常にネットワーク取得（NetworkOnly 相当）。

| URL | SWキャッシュ | レスポンス`Cache-Control` |
|---|---|---|
| `/api/admin/login` | ✗ | **未設定（no-store なし）** |
| `/api/admin/logout` | ✗ | 未設定 |
| `/api/admin/events` | ✗ | 未設定 |
| `/api/admin/history` | ✗ | 未設定 |
| `/api/admin/overrides` | ✗ | 未設定 |

- **ログアウト後のオフライン表示**: SWが管理APIをキャッシュしないため、管理データがオフライン再表示される経路は無い。クライアントは localStorage に**非機密のアカウント情報のみ**保持（§4。一覧データ`list`はメモリ上、リロードで消える）。
- **別アカウントへ前データ表示**: 管理APIはキャッシュされず、ログイン毎にサーバーから再取得するため、別アカウントに前データが出る経路は確認されず。
- **未実装（修正候補）**: 管理APIに **`Cache-Control: no-store`（必要なら`Pragma: no-cache`）が未設定**。CDN/中間キャッシュ・将来のSW変更に対する多層防御として付与すべき（§18 High）。

---

## 11. 監査ログ

スキーマ（`api/_security.js` `writeAudit`。実データではなく構造例）:
```json
{
  "at": "2026-06-28T12:00:00.000Z",
  "requestId": "<uuid>",
  "actorId": "<displayId（仮名）>",
  "accountId": "<userId（内部ID）>",
  "organization": "tokyo",
  "office": "shibuya",
  "action": "event.update",
  "targetId": "<event id>",
  "result": "success",
  "note": "内容を編集",
  "before": { "...": "変更前" },
  "after": { "...": "変更後" },
  "user": "<displayId>", "pref": "tokyo", "title": "<タイトル>", "id": "<event id>"
}
```
（末尾の`user/pref/title/id`は既存UI互換フィールド）

| 操作 | 記録有無 | result | before/after | actor | requestId |
|---|---|---|---|---|---|
| ログイン成功 | ✓ | success | — | ✓ | ✓ |
| ログイン失敗 | ✓ | failure | — | （account無し・noteにuser断片） | ✓ |
| 権限拒否 | ✓ | denied | — | ✓ | ✓ |
| イベント作成 | ✓ | success | after | ✓ | ✓ |
| イベント編集 | ✓ | success | before/after | ✓ | ✓ |
| イベント削除 | ✓ | success | before | ✓ | ✓ |
| 公開状態変更 | ✓（event.update） | success | before/after | ✓ | ✓ |
| オーバーライド作成 | ✓ | success | before/after | ✓ | ✓ |
| オーバーライド削除 | ✓ | success | before | ✓ | ✓ |
| アカウント無効化 | ✗（設定変更＝再デプロイで実施、API操作でないため未記録） | — | — | — | — |

- **通常運営者が削除できない / APIから削除不可 / UIから削除消滅**: ✓（history DELETE=405、`AdminScreen`の削除/全消去ボタン・関数を撤去）。
- **パスワード・Cookie・トークンは記録しない**: ✓（`writeAudit`は上記項目のみ）。
- **保存件数上限**: `AUDIT_MAX`（既定5000）。`lpush`+`ltrim(0, MAX-1)` で**上限超過は古いものから削除**（循環）。
- **保存期間**: 期間ベースの保持は未実装（件数上限のみ）。
- **外部転送**: 未実装（§18）。

> 注意: アカウントの無効化・権限変更は `ADMIN_ACCOUNTS_B64`（設定/再デプロイ）で行うため、操作API経由でなく**監査ログに残らない**。§18にアカウント管理API＋監査を課題として記載。

---

## 12. データ品質ゲート

`shared/dataQuality.cjs` `validateEventsData` / `scripts/check-data-quality.mjs`。テストは `shared/dataQuality.test.cjs`。

### エラーで停止（exit 1）
| チェック | 実装箇所 | エラーメッセージ（要旨） | テスト |
|---|---|---|---|
| ID重複（全県横断） | dataQuality.cjs | `id 重複: "<id>"` | ✓ |
| 構造破損（配列でない/非オブジェクト） | dataQuality.cjs | `配列ではありません`/`構造が不正` | ✓ |
| 不明な地本キー | dataQuality.cjs | `不明な地本キー` | ✓ |
| 日付形式不正 | dataQuality.cjs | `date の形式が不正` | ✓ |
| 存在しない日付 | dataQuality.cjs(`isRealDate`) | `実在しない日付` | ✓ |
| endDate < date | dataQuality.cjs | `endDate(..) < date(..)` | ✓ |
| タイトル空 | dataQuality.cjs | `タイトルが空` | ✓ |
| pref とキー不一致 | dataQuality.cjs | `pref(..) が格納キー(..)と不一致` | ✓ |
| 座標範囲外 | dataQuality.cjs | `weatherLocation の座標が範囲外` | ✓ |
| accuracy 不正値 | dataQuality.cjs | `accuracy が不正` | ✓ |
| 手動ID混入/衝突 | dataQuality.cjs | `手動イベントID が混入`/`ID衝突` | ✓ |
| イベント総数の異常減少 | dataQuality.cjs(`prevTotal`) | `総数が異常に減少` | ✓ |

### 警告のみ（exit 0）
| チェック | 実装箇所 | 警告条件 |
|---|---|---|
| OCR断片/住所/様式の疑い | dataQuality.cjs(`isJunkOrStubTitle`) | タイトルがjunk判定 |
| タイトル極端に長い | dataQuality.cjs | 80字超 |
| 会場情報欠落 | dataQuality.cjs | `place`空 |
| URL形式不正 | dataQuality.cjs | `http(s)`以外（例 `tel:`） |

実データ実行: 総数236・エラー0・警告122（多くは会場欠落・一部`tel:`URL）。

---

## 13. イベントIDの安定性

**結論: 現行の `uniquifyIds` は入力順序に対して不安定。** 衝突IDの2件目以降に**反復順で**`-2`を付けるため、順序が変わると別イベントに同じ接尾辞が付く。

実測（`shared/dataQuality.cjs` 直接実行）:
```text
入力順 [A,B]: A=x,   B=x-2
入力順 [B,A]: A=x-2, B=x
→ 同一イベントAのIDが順序により x / x-2 に変化（不一致）
```

影響（順序が揺れた場合の残課題）:
- **お気に入り**: localStorage はID基準 → 別イベントに★が移る可能性。
- **新規イベント通知**: 前回ID集合との差分検出 → ID変化で誤通知。
- **オーバーライド**: Redisキー=ID → 別イベントへ適用される可能性。
- **変更履歴/監査**: `targetId`の指す対象がズレる。
- **詳細URL/共有**: IDを含む参照が別物を指す。

**緩和**: スクレイプ出力（pref配列）の順序は安定しているため通常は同じ結果になるが、**保証ではない**。

**提案（安定ハッシュ）**: 衝突時は反復順ではなく、`pref + date + 正規化タイトル + place(+endDate/公式URL)` の SHA-256 短縮を接尾辞に使う（例 `${id}-${sha.slice(0,4)}`）。これにより入力順序に依存せず、同一イベントに常に同一IDが付く。さらに将来的には ID 生成自体を上記の安定キーに統一することを推奨（§18 High）。

---

## 14. ntfy・外部サービス

- **固定ntfyトピックの残存**: 無し（`api/report.js` の `DEFAULT_TOPIC` を削除）。
- **未設定時の安全失敗**: `NTFY_BUG_TOPIC` 未設定で `/api/report` は **503**（旧トピックへ漏らさない）。
- **トピック名をログに出さない**: ✓（コード上トピックを出力しない）。
- **管理通知と一般通知の分離**: 運営者向け=`NTFY_ADMIN_TOPIC`（GitHub Actions）、誤情報報告=`NTFY_BUG_TOPIC`（Vercel関数）。いずれも環境変数のみ。
- **過去に公開実績のあるトピックのローテーション**: 旧 `report.js` には公開済みの既定トピックが存在した。**新トピックへのローテーションが必要**（§18／DEPLOY.md ローテーション手順）。

| サービス | 用途 | 送信データ | 認証方式 | 障害時動作 |
|---|---|---|---|---|
| Vercel | ホスティング/関数 | リクエスト全般 | プラットフォーム | サイト停止（公開静的は一部継続） |
| Upstash Redis | セッション/管理データ/天気キャッシュ/レート制限 | セッション・イベント・座標キャッシュ | REST APIトークン(env) | 認証/管理/通知購読/レート制限が機能低下。閲覧(events.json)は継続、天気はstale/CDN |
| ntfy | 報告/運営通知 | 報告テキスト・運営アラート | トピック名(env) | 報告失敗(502/503)・通知欠落（本処理は継続） |
| Open-Meteo | 天気予報 | 緯度経度(3桁)・日付 | 不要 | stale/エラー表示（§天気） |
| 国土地理院 | ジオコーディング | 住所/会場名 | 不要 | 当該会場の座標未取得（カードは座標なし表示） |
| OCR各サービス | チラシOCR | 画像/PDF | 各APIキー(env) | ローカルOCRへフォールバック |

---

## 15. テスト結果

```text
npm test:
- 成功
- 88 件 pass / 0 fail
- 実行日時: 2026-06-28 (JST)

npm run build:
- 成功
- 警告: チャンクサイズ>500kB（既存の既知警告。本変更起因ではない）

data quality (node scripts/check-data-quality.mjs):
- 成功（exit 0）
- エラー 0 件
- 警告 122 件（会場欠落・一部 tel: URL 等）

npm audit --omit=dev:
- 実行済み
- found 0 vulnerabilities（critical 0 / high 0 / moderate 0 / low 0）
```

---

## 16. 否定系の手動・統合確認

根拠種別: **UT**=ユニットテスト、**SMOKE**=本ブランチのモジュールを Node で実行した結果、**CODE**=コードレビュー（Redis必須のためステージング実機推奨）。

| 試験 | 期待値 | 結果 | 根拠 |
|---|---|---|---|
| 未認証で管理API | 401 | OK | CODE（`requireAuth`が401。`authenticate`がnull） |
| 権限不足 | 403 | OK | SMOKE（`hasPermission`で各APIが403分岐）／UT |
| 他事務所イベント更新 | 拒否 | OK | SMOKE（`canManageScope`他office=false）/UT |
| 他地本イベント更新 | 拒否 | OK | SMOKE（他pref=false）/UT |
| 他地本override GET | 非表示 | OK | CODE（`_pref`で`canManageScope`フィルタ） |
| 他地本override POST | 拒否 | OK | CODE（`resolveEventPref`実解決→`canManageScope`） |
| 他地本override DELETE | 拒否 | OK | CODE（記録`_pref`再確認） |
| 存在しないイベントID(override) | 拒否 | OK(404) | CODE（`resolveEventPref`がnull→404） |
| roleをリクエストで改ざん | 権限不変 | OK | SMOKE（target.role無視＝true確認）/UT |
| prefをリクエストで改ざん | 権限不変 | OK | CODE（events:organizationへ強制、override:実解決） |
| ログアウト後のCookie再利用 | 拒否 | 要実機 | CODE（`endSession`がRedis del→`resolveSession`でnull）※Redis実機未検証 |
| アカウント無効化後の既存Cookie | 拒否 | 要実機 | CODE（`resolveSession`が`enabled:false`でdel→401）※Redis実機未検証 |
| Originなしの書込み | 拒否 or 理由明記 | **通過（理由明記）** | CODE（`checkOrigin`欠落許容。SameSite=Strictで緩和。§9/§18） |
| Service Worker経由の管理API | キャッシュしない | OK | CODE（`sw.js`に`/api/admin`ルート無し） |

> パスワード照合（scrypt/誤PW）・Cookie属性・スコープ・無効化・role改ざんは SMOKE で実行確認済み。Redis を要するセッション往復（ログアウト/無効化）は **ステージングでの実機確認を推奨**。

---

## 17. 本番投入判定

```text
公開サイト:
- GO

ステージング管理画面:
- GO（実機でセッション往復・否定系を確認のうえ）

本番管理画面:
- CONDITIONAL GO

担当官へのアカウント配布:
- CONDITIONAL GO
```

**本番管理画面 / アカウント配布 の阻害要因（最大5件）**:
1. レガシー既定ON（`LEGACY_HEADER_AUTH` / `LEGACY_PLAINTEXT_PASSWORDS`）を `false` 化していない。
2. 全アカウントのscryptハッシュ化が未完（平文運用の可能性）。
3. 管理APIに `Cache-Control: no-store` 未設定（多層防御不足）。
4. イベントIDの順序不安定（お気に入り/通知/override 取り違えリスク）。
5. パスワード変更時の即時セッション失効が無い（運用回避策はあるが恒久対策未実装）。

---

## 18. 残課題

| 優先度 | 課題 | 本番阻害 | 推奨対応 | 対象ファイル |
|---|---|---:|---|---|
| Critical | （なし） | — | — | — |
| High | レガシー認証の既定値（ヘッダ/平文がON） | 是 | 移行完了後 `LEGACY_HEADER_AUTH=false`/`LEGACY_PLAINTEXT_PASSWORDS=false` | env / DEPLOY.md |
| High | 平文パスワード移行 | 是 | 全アカウントを`hashPassword`でscrypt化 | `ADMIN_ACCOUNTS_B64` / shared/session.cjs |
| High | 管理APIの`Cache-Control: no-store`未設定 | 是 | 各admin応答に`no-store`付与（+`Pragma`） | api/admin/*.js（or _security共通化） |
| High | CSRF/Origin（欠落許容・トークン無し） | 条件付 | 状態変更で Origin必須化 or `Sec-Fetch-Site`確認 | api/_security.js `checkOrigin` |
| High | イベントIDの順序安定性 | 是 | 安定ハッシュ接尾辞（§13）/ID生成統一 | shared/dataQuality.cjs `uniquifyIds`, scraper |
| Medium | アカウント無効化時の既存セッション（PW変更で失効しない） | 条件付 | `sessionVersion`照合、またはアカウント単位セッション一括失効 | api/_security.js |
| Medium | 監査ログの保存上限（件数のみ・期間/外部転送なし） | 否 | 期間保持＋外部ログ転送（追記専用ストア） | api/_security.js `writeAudit` |
| Medium | ntfyトピックのローテーション（過去公開実績） | 条件付 | 新トピックへローテーション | env / DEPLOY.md |
| Medium | 承認フロー（pending_approval等） | 否 | データ構造＋最小API＋UI | api/admin/events.js, AdminScreen |
| Medium | 手動イベントの再ジオコーディング（needsUpdate未処理） | 否 | 専用処理 or 保存時サーバー側ジオコーディング | api/admin/events.js, scraper/lib/geocode.js |
| Low | CIセキュリティ強化 | 否 | Dependabot/CodeQL/Secret scanning/SBOM/アクションSHA固定/PR必須/本番承認環境 | .github/ |
| Low | アカウント管理API＋その監査 | 否 | 無効化/権限変更を操作API化し監査記録 | 新規API |

---

## 19. 最終要約（非専門者向け）

今回の改修では、管理画面（自衛隊地本の担当者が使う画面）の安全性を大きく高めました。これまでは「自由入力の個人番号」で操作権限が決まり、ログイン情報（パスワード）が端末に保存され、毎回送られていました。これを、**サーバー側で役割（権限）を判定する仕組み**に変え、ログインは**サーバーのセッションと安全なCookie**で管理し、**パスワードは端末に保存しない**ようにしました。担当地本・事務所を越えた操作は拒否され、他人のイベントを書き換える不具合（権限の抜け穴）も塞ぎました。**誰が何をしたかの記録（監査ログ）は消せない追記専用**にし、**公開前にデータの不備（ID重複・日付異常など）を自動検査して、問題があれば配信を止める**ようにしました。プライバシーポリシーも実際の動作に合わせて正直に書き直しました。

一方で、正式運用までに人手で行う設定が残っています。**移行用に一時的にONになっている旧方式（ヘッダ認証・平文パスワード）をOFFにし、全パスワードを暗号化**してください。また、**管理画面の応答をキャッシュさせない設定**、**イベントIDの付け方を順序に左右されない方式へ改善**、**パスワード変更時に古いログインを即無効化する仕組み**は、本番の担当者配布前に対応すべき項目です。

現時点では、**公開サイト（閲覧）はそのまま利用可能**、**管理画面はステージング（試験環境）での確認に進める段階**です。本番での担当者配布は、上記の設定切り替えと実機での最終確認を済ませてから（条件付きGO）が推奨です。
