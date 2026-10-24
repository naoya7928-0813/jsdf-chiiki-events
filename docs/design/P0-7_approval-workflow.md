# P0-7 承認ワークフロー — 詳細設計

> 状態: 設計（未実装）｜依存: 公開フィルタの許可リスト化（PR #54 で対応済み）｜方針の最終決定: D-3, D-4

## 1. 目的
「担当者が作成 → 責任者が確認 → 公開」を画面上の手続きとして明確にし、**誰が申請し、誰が承認したか**を記録する。承認されていない内容が利用者に表示されない状態を、仕組みとして保証する。

## 2. 現状の課題（調査結果）
1. `office_editor` は公開できないが、**公開中イベントの内容は承認なしで直接変更できる**（`event:update` のみで PATCH が通る）。変更は即座に公開画面へ反映される。
2. `office_editor` は公開中イベントを `closed` / `cancelled` / `draft` に変更できる（`published` への遷移のみ制限されている）。
3. 「承認待ち」という状態が無く、責任者は下書き一覧から公開すべきものを自分で探す必要がある。
4. 公開 API の判定が拒否リスト（`!== 'draft'`）だったため、新しい状態を追加すると公開されてしまう。→ **PR #54 で許可リスト（published / closed / cancelled）に変更済み**。本機能の前提条件は満たされている。

## 3. 状態と遷移

```text
            submit                 approve
  draft ───────────▶ pending_review ─────────▶ published ──▶ closed / cancelled
    ▲                   │   │                     │
    │   reject(理由必須) │   │ withdraw（申請者）   │ 変更の申請（§4）
    └───────────────────┘   └──▶ draft            ▼
                                             published ＋ pendingChange
```

| 遷移 | 実行できる人 | 条件 |
|---|---|---|
| draft → pending_review（申請） | `event:update` ＋スコープ | 必須項目が揃っている |
| pending_review → published（承認） | `event:approve` ＋スコープ | D-4 で自己承認を禁止した場合は申請者本人不可 |
| pending_review → draft（差戻し） | `event:approve` ＋スコープ | **理由必須**（500文字以内） |
| pending_review → draft（取下げ） | 申請者本人、または `event:approve` | – |
| draft → published（直接公開） | `event:publish` | `APPROVAL_MODE` による（§5） |
| published → closed / cancelled | §5 の表による | 中止・受付終了は利用者の安全に関わるため、迅速さを優先できるようにする |

`pending_review` は `shared/eventStatus.cjs` の `STATUS_VALUES` に追加するが、公開 API の許可リストには**追加しない**。

## 4. 公開中イベントの変更（変更申請）
`event:publish` を持たないアカウントが公開中イベントを編集した場合、**本体は変更せず**、変更案を `pendingChange` として保存する。

```json
{
  "id": "manual-tokyo-20261010-ab12cd",
  "status": "published",
  "title": "（公開中の現在のタイトル）",
  "pendingChange": {
    "patch": { "time": "10:00～16:00", "notes": "雨天中止" },
    "submittedBy": "OP-SBY-03",
    "submittedAt": "…",
    "baseUpdatedAt": "…"
  }
}
```

- 承認: `patch` を本体へ適用し（既存の PATCH 検証ロジックを再利用）、`pendingChange` を削除する。
- 申請後に本体が変更されていた場合（`baseUpdatedAt` が不一致）は、承認画面で「申請後に内容が変わっています」と表示し、差分を見せたうえで承認させる。
- 差戻し・取下げ: `pendingChange` を削除する（本体は変更されない）。
- 公開 API は `pendingChange` を除去して返す（未承認の内容を出さない）。

スクレイプイベントへの表示上書き（`/api/admin/overrides`）は、現在も `event:override`（office_manager 以上）が必要で、office_editor は実行できない。そのため本設計の対象外とする。

## 5. 運用モード（環境変数 `APPROVAL_MODE`）

| モード | 内容 | 用途 |
|---|---|---|
| `off`（既定） | 現行と同じ動作。申請・承認の機能は使えるが、強制はしない | 導入時。既存の運用を壊さない |
| `editor`（推奨・D-3） | `event:publish` を持たない人の公開・公開中イベントの変更は、必ず申請を経由する | 通常運用 |
| `all` | 全員が申請を経由する（national_admin の緊急時の直接操作を除く） | 厳格な運用が求められる場合 |

中止（cancelled）の扱い: `editor` モードでも、office_editor は**中止の申請と同時に「緊急」フラグ**を付けられる。緊急の申請は管理画面の最上部に赤で表示し、Web Push で責任者へ通知する（P1）。中止を承認なしで即時に反映するかどうかは、運用で決める（既定は承認必須）。

## 6. 記録する項目（イベント本体の `review`）

```json
"review": {
  "submittedBy": "OP-SBY-03", "submittedAt": "…",
  "approvedBy": "OP-SBY-01",  "approvedAt": "…",
  "rejectedBy": null, "rejectedAt": null, "rejectReason": null,
  "history": [ { "action": "submit|approve|reject|withdraw", "by": "…", "at": "…", "note": "…" } ]
}
```

- `history` は直近20件まで保持する（すべての履歴は監査ログにある）。
- 公開 API は `review` を除去する（担当者の仮名IDを公開しない方針を維持する）。
- 監査: `event.submit|approve|reject|withdraw|change.submit|change.approve|change.reject`。`before` / `after` を記録する。

## 7. API（`api/admin/events.js` に追加。関数数を増やさない）

| 操作 | リクエスト |
|---|---|
| 申請 | `PATCH {id, action:'submit', note?}` |
| 承認 | `PATCH {id, action:'approve'}` |
| 差戻し | `PATCH {id, action:'reject', reason}` |
| 取下げ | `PATCH {id, action:'withdraw'}` |
| 変更の申請 | 通常の `PATCH {id, patch}`（権限とモードからサーバーが申請扱いにするかを判定する） |
| 承認待ち一覧 | `GET ?view=pending`（スコープ内。`pending_review` と `pendingChange` を持つもの） |

遷移の可否は**純粋関数** `shared/approval.cjs` の `decideTransition({account, event, action, mode, canPublish, canApprove})` に集約し、API と画面（ボタンの表示判定）の両方で使う。

## 8. 画面
- タブを追加: 「承認待ち（件数）」。`event:approve` を持つ人に表示する。
- 一覧の各行: 申請者・申請日時・種別（新規公開／変更／中止）・緊急フラグ。
- 詳細: 新規は公開時の見た目のプレビュー、変更は**変更前後の差分**を表示する。
- 申請者側: 下書き・公開中イベントに「承認を申請」ボタンを表示し、状態バッジ（承認待ち／差戻し・理由）を出す。
- 現在の「公開」ボタンは、`decideTransition` の結果に応じて「公開」「承認を申請」を出し分ける（権限の無いボタンを出さない）。

## 9. データ移行
- 既存イベントは `draft` / `published` / `closed` / `cancelled` のいずれかであり、変換は不要。
- `schemaVersion` を 3 に上げる。前方移行関数は「何もしない」（新項目は任意項目のため）。
- バックアップ形式（P0-3）の `manualEvents` に `review` / `pendingChange` が含まれることを明記する。

## 10. テスト
- `approval.test.cjs`: 全ロール × 全状態 × 全操作 × 3モードの遷移表を網羅する（表駆動テスト）。自己承認の禁止（D-4 の設定時）、差戻し理由の必須、スコープ外の拒否
- `adminEventsApi.test.cjs` に追加: office_editor が `editor` モードで公開中イベントを編集すると本体が変わらず `pendingChange` になること、承認で反映されること、公開 API に `pending_review`・`pendingChange`・`review` が出ないこと
- 既存テスト: `APPROVAL_MODE=off` で現行の挙動がすべて維持されること
- 手動: 申請 → 承認 → 公開画面への反映、差戻し → 理由の表示、中止の緊急申請

## 11. ロールバック
- `APPROVAL_MODE=off` に戻すと強制が外れる（データはそのまま残り、申請中のものは画面から処理できる）。
- コードを差し戻す場合は、先に `pending_review` のイベントをすべて `draft` へ戻す（管理画面に一括操作を用意する）。公開 API は許可リスト方式のため、差し戻し後も `pending_review` が公開されることはない。
