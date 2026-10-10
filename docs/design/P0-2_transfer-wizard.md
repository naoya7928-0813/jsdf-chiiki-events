# P0-2 担当者異動・引継ぎウィザード — 詳細設計

> 状態: 設計（未実装）｜依存: P0-1（アカウント API）、P0-6（step-up）

## 1. 目的
人事異動・担当交代を「アカウント編集」の組み合わせではなく**1つの業務手続き**として画面で完結させ、旧担当の権限の残存（無効化忘れ）と引継ぎ漏れを防ぐ。

## 2. 前提（調査結果）
- イベントの権限は**事務所（office）単位**で判定され、個人には紐づかない（`createdBy` / `updatedBy` は表示用の仮名IDのみ）。→ **異動でイベントデータを付け替える必要はない**。異動で扱うのはアカウントと権限だけ。
- 監査ログは `accountId`（= `userId`）で個人を追跡する。→ 旧アカウントは削除せず**停止**する（P0-1 §4-1）。

## 3. 対象とするパターン

| パターン | 旧担当 | 新担当 |
|---|---|---|
| A. 交代（転出＋着任） | 停止 | 新規作成 |
| B. 転出のみ（後任未定） | 停止 | – （同じ事務所の残り人数を警告） |
| C. 着任のみ | – | 新規作成 |
| D. 所内異動（同一人物の所属・ロール変更） | 所属/ロール変更（`sessionVersion+1`） | – |

兼務・一時代理は対象外（将来、期限付き権限として別設計）。

## 4. 画面フロー（管理画面「アカウント」タブ →「異動・引継ぎ」）

```text
STEP 1 パターン選択（A/B/C/D）
STEP 2 旧担当の選択 …… スコープ内の有効アカウントから選ぶ（表示ID・事務所・最終ログイン）
STEP 3 新担当の情報 …… ログインID・表示ID・ロール・所属（旧担当の所属・ロールを初期値として表示）
STEP 4 確認 ……………… 変更内容の一覧と影響
                         ・旧担当の既存ログインは即時に切れる
                         ・その事務所で公開権限を持つ人数（0人になる場合は警告）
                         ・その事務所の下書き件数・承認待ち件数（P0-7）
STEP 5 再認証（step-up）
STEP 6 実行 ……………… サーバー側で一括処理（§5）
STEP 7 結果 ……………… 新担当の設定用URL（1回だけ表示）＋ 引継ぎチェックリスト
```

途中で画面を閉じた場合、STEP 6 より前であれば何も変更されない（下書きは端末内のみに保持）。

## 5. サーバー処理（`api/admin/accounts.js` `op:'transfer'`）

入力: `{ pattern, fromUserId?, fromRev?, to?: {user, displayId, label, role, organization, office}, reason, effectiveNote }`

1. 権限・スコープ・step-up を確認する（旧担当・新担当の両方がスコープ内であること）。
2. `accountPolicy` で検証する（national_admin 2名未満の禁止、自分自身の停止禁止など）。
3. **Lua スクリプトで原子的に**実行する:
   - 旧担当の `rev` を照合 → `enabled:false`・`disabledReason:'transfer'`・`sessionVersion+1`
   - 新担当のログインID一意制約を確認 → 作成（`mustSetPassword:true`）
   - 異動記録 `handover:<id>` を作成し、`handover:index` に追加する
4. 設定用トークンを発行する（P0-1 §5）。
5. 監査に `account.transfer` を記録する（`before`: 旧担当、`after`: 新担当、`note`: 理由）。

どこかで失敗した場合は何も書き込まない（Lua スクリプト内で判定してから書き込む）。

## 6. 異動記録（`handover:<id>`）

```json
{
  "id": "ho_20261001_x7k2",
  "pattern": "A",
  "organization": "tokyo", "office": "shibuya",
  "from": { "userId": "u_…", "displayId": "OP-SBY-01" },
  "to":   { "userId": "u_…", "displayId": "OP-SBY-02" },
  "reason": "定期異動",
  "createdAt": "…", "createdBy": "OP-NAT-01",
  "checklist": [
    { "key": "setup_link_delivered", "label": "新担当へ設定用URLを渡した", "doneAt": null, "doneBy": null },
    { "key": "new_login_confirmed",  "label": "新担当が初回ログインした（自動判定）", "doneAt": null, "auto": true },
    { "key": "drafts_reviewed",      "label": "旧担当の下書き・承認待ちを確認した", "doneAt": null, "doneBy": null },
    { "key": "manual_handed",        "label": "操作マニュアルを渡した", "doneAt": null, "doneBy": null }
  ],
  "closedAt": null
}
```

- `new_login_confirmed` は、新担当が初めてログインした時点でサーバーが自動的に記録する。
- チェックリストの更新（`op:'handover-check'`）も監査に記録する。すべて完了すると `closedAt` が付く。
- 未完了の異動記録は、管理画面の「アカウント」タブにバッジで表示する。

## 7. 権限
- 実行: `account:manage`（D-1 で委任した場合は `account:manage:pref` の範囲内）。
- 閲覧: `account:read`（スコープ内）。

## 8. テスト
- `transfer.test.cjs`（メモリ Redis）: A〜D の各パターン、旧担当 `rev` 不一致で全体が失敗すること、ログインID重複で全体が失敗すること、旧担当のセッションが即時に無効になること、公開権限者が0人になる場合の警告
- `accountPolicy` の既存テストに異動ケースを追加する
- 手動: 旧担当の端末で操作 → 401 になること、新担当の設定用URL → ログイン → チェックリストの自動項目が完了すること

## 9. ロールバック
異動の取り消しは「旧担当の再有効化（`op:enable`）＋新担当の停止」で行う（どちらも監査に記録される）。機能自体は `op:'transfer'` を無効化するだけで止められ、P0-1 の個別操作は影響を受けない。
