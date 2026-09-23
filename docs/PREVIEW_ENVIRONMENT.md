# 検証環境（Preview）の準備と使い方

本番と**別の Redis・別のアカウント・別のシークレット**で動く検証環境を用意し、基盤変更（アカウント管理・組織マスタ・承認フロー等）を本番へ出す前に、実際のブラウザで各ロールの操作を確認する。

> ⚠️ **最重要**: Vercel と Upstash の連携は、既定で Production と Preview に**同じ** Redis（`KV_REST_API_URL` / `KV_REST_API_TOKEN`）を設定する。そのまま Preview を使うと**本番の手動イベント・監査ログ・セッションを書き換えてしまう**。
> 安全装置として、Preview 環境では `PREVIEW_DATA_ISOLATED=true` が設定されるまで、管理 API の書き込み（ログインを含む）を 503 `preview_not_isolated` で止める（`api/_security.js` の `previewWriteBlocked`）。**Redis を分けてから**この値を設定すること。

## 1. 初回の準備（運営者の作業）

秘密値（トークン・パスワード・ハッシュ）は、Vercel と GitHub の画面にだけ入力する。チャット・Issue・PR・この文書には書かない。

1. **Upstash に検証用の Redis を作る**（本番とは別のデータベース）。
   作成後に表示される REST URL と REST TOKEN を控える。
2. **Vercel → Project → Settings → Environment Variables** で、次を **Preview だけ**に設定する（Production にはチェックを入れない）。

   | 変数 | 値 |
   |---|---|
   | `KV_REST_API_URL` | 手順1の検証用 Redis の REST URL（本番と違うこと） |
   | `KV_REST_API_TOKEN` | 手順1の検証用 Redis の REST TOKEN |
   | `ADMIN_ACCOUNTS_B64` | **検証用のテストアカウントだけ**（6ロール分。手順は `docs/ADMIN_ACCOUNT_SETUP.md`。本番のアカウント・パスワードを流用しない） |
   | `INTERNAL_API_SECRET` / `NOTIFY_SECRET` | 本番と**別の**値（使わない場合は未設定でよい） |
   | `LEGACY_PLAINTEXT_PASSWORDS` / `LEGACY_HEADER_AUTH` / `LEGACY_ADMIN_SECRET` | `false` |
   | `PREVIEW_DATA_ISOLATED` | `true`（**上の2つの KV を本番と分けたことを確認してから**） |

   既に Upstash 連携で `KV_REST_API_URL` が「Production, Preview」両方に付いている場合は、Preview 用に上書きする値を追加する（本番側は変更しない）。
3. VAPID（Web Push）・OCR・LLM のキーは検証環境に不要（未設定なら該当機能が停止するだけ）。

### テストアカウント（推奨構成）

| ロール | 所属 | 用途 |
|---|---|---|
| office_editor | tokyo / 事務所A | 下書き作成・公開不可・他事務所拒否の確認 |
| office_manager | tokyo / 事務所A | 承認・公開・受付終了・中止・削除 |
| office_manager | tokyo / 事務所B | 他事務所の拒否確認用 |
| pco_admin | tokyo | 自地本の管理・他地本拒否 |
| pco_admin | kanagawa | 他地本の拒否確認用 |
| national_admin | * | 全国・アカウント管理・バックアップ |
| auditor | * | 監査閲覧のみ・変更不可 |
| system_admin | * | システム管理・イベント公開権限が無いこと |

## 2. デプロイ

次のどちらかで実行する（本番には影響しない）。

- GitHub → Actions → **「Preview デプロイ（検証環境）」** → Run workflow → 対象ブランチを選ぶ
- 検証したいブランチを `preview/<名前>` として push する（master へマージする前の PR でも使える）
  ```bash
  git push origin HEAD:preview/<名前>
  ```

テスト・ビルド・データ品質・依存監査を通ったものだけがデプロイされ、URL はジョブサマリに出る。

`.github/workflows/preview.yml` は本番の `ADMIN_ACCOUNTS_B64` を**渡さない**。Preview は Vercel の Preview 用環境変数だけで動く。

## 3. 動作確認

1. `https://<preview URL>/admin.html` でテストアカウントにログインできること。
   503 `preview_not_isolated` になる場合は、手順1-2 の `PREVIEW_DATA_ISOLATED` が未設定（または Redis が未分離）。
2. 各ロールの確認項目は `docs/RELEASE_RUNBOOK.md` の「Preview 検証」に従う。
3. 公開画面（Preview URL のトップ）は、本番と同じ `events.json`（Git 上のもの）と、検証用 Redis の手動イベントを表示する。

## 4. 片付け

- Preview デプロイは Vercel の Deployments から削除できる（本番には影響しない）。
- 検証用 Redis のデータは、検証が終わったら Upstash の画面で削除してよい（本番とは別のデータベース）。
