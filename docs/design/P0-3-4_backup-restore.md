# P0-3 バックアップ作成 / P0-4 検証付き復元 — 詳細設計

> 状態: 設計（未実装）｜依存: P0-1（アカウント保存先）、P0-6（step-up）、共通基盤（読み取り専用モード・スキーマ版数）

## 1. 目的
- 管理者がボタン操作で、**秘密情報を含まない**バックアップを作れるようにする。
- 別環境（DR・移行先）でも、**検証・差分確認・事前スナップショット付き**で復元できるようにする。開発者がいなくても復元できることを目標にする。

## 2. データの所在と、バックアップ対象

| データ | 所在 | バックアップ | 理由 |
|---|---|---|---|
| 手動イベント | Redis `manual:events` | **含める** | 正本は Redis のみ |
| 表示上書き | Redis `manual:overrides` | **含める** | 正本は Redis のみ |
| アカウント | Redis `acct:records`（P0-1 後） | **含める（秘密項目を除去）** | 権限構成の復元に必要 |
| 異動記録 | Redis `handover:*` | 含める | 引継ぎの経緯 |
| 監査ログ | Redis `manual:history` | 既定は含めない（D-8） | 容量が大きく、別操作でエクスポートする |
| スクレイプイベント | `public/data/events.json`（Git） | 含めない（**コミットSHAを記録**） | Git が正本 |
| 過去イベントアーカイブ | `data/events-archive.json`（Git） | 含めない（コミットSHAを記録） | Git が正本 |
| 拠点データ | `public/data/offices.json`（Git） | 含めない（SHA とハッシュを記録） | Git が正本 |
| 利用者の報告 | Redis `report:*` | **含めない** | 個人情報（連絡先）を含み、60日で自動消去する方針のため |
| Push 購読 | Redis `push:subscriptions` | **含めない** | 端末固有の情報。移行先では再購読してもらう |
| セッション・ログイン失敗・レート制限・天気キャッシュ・在席 | Redis | 含めない | 一時データ |

### 絶対に含めないもの（テストで保証する）
`passHash`・`pass`・MFA シークレット・回復コード・設定用トークン・セッション・Cookie・API キー・Redis URL/トークン・GitHub/Vercel トークン・VAPID 秘密鍵・`INTERNAL_API_SECRET`・`NOTIFY_SECRET`・報告の連絡先。

## 3. バックアップ形式

1ファイルの JSON（`jsdf-backup-YYYYMMDD-HHmm.json`）とする。ZIP にしないのは、依存ライブラリを増やさず、どの環境でも中身を目視確認できるようにするため。

```json
{
  "manifest": {
    "format": "jsdf-chiiki-events-backup",
    "formatVersion": 1,
    "schemaVersion": 2,
    "appVersion": "1.37.0",
    "createdAt": "2026-10-01T09:00:00+09:00",
    "createdBy": "OP-NAT-01",
    "source": { "siteUrl": "https://jsdf-chiiki-events.jp", "gitCommit": "<sha>" },
    "external": {
      "events.json":         { "gitCommit": "<sha>", "sha256": "…" },
      "events-archive.json": { "gitCommit": "<sha>", "sha256": "…" },
      "offices.json":        { "gitCommit": "<sha>", "sha256": "…" }
    },
    "sections": {
      "manualEvents": { "count": 42, "sha256": "…" },
      "overrides":    { "count": 7,  "sha256": "…" },
      "accounts":     { "count": 25, "sha256": "…", "redacted": ["passHash", "mfa"] },
      "handovers":    { "count": 3,  "sha256": "…" }
    }
  },
  "sections": {
    "manualEvents": [ … ],
    "overrides":    { "<eventId>": { … } },
    "accounts":     [ { "userId": "…", "user": "…", "role": "…", … } ],
    "handovers":    [ … ]
  }
}
```

- 各セクションの `sha256` は**正規化した JSON**（キーを並べ替え・空白なし）に対して計算する（`shared/backupFormat.cjs`）。
- ファイル全体の改ざん検知ではなく、**破損・取り違えの検知**が目的。改ざん防止が必要な場合は、保管先で署名・暗号化する（§6）。

## 4. P0-3 バックアップ作成

### 4-1. API（`api/admin/backup.js`）
| op | 権限 | step-up | 内容 |
|---|---|---|---|
| `GET op=export` | `backup:export` | 必須 | 上記 JSON を返す（`Content-Disposition: attachment`、no-store） |
| `GET op=audit-export&cursor=` | `audit:read` ＋ `backup:export` | 必須 | 監査ログを 1000 件ずつページ分割して返す（応答サイズ上限 4.5MB への対策） |

- 作成処理は `shared/backupFormat.cjs` の純粋関数 `buildBackup(sources)` に集約し、秘密項目の除去（**許可リスト方式**＝残す項目を列挙する）もここで行う。
- 監査に `backup.export` を記録する（件数・sha256。内容そのものは記録しない）。

### 4-2. GUI（管理画面「システム」タブ）
「バックアップを作成」ボタン → step-up → ダウンロード。画面に保管上の注意（「ファイルにはイベントとアカウントの一覧が含まれます。リポジトリ・共有チャットに置かないでください」）を表示する。

### 4-3. 自動バックアップ（D-6）
- GitHub Actions の定期ジョブ（1日1回）が `x-internal-secret` で `op=export` を呼び出す。サーバーは内部経路専用の権限として扱い、step-up の対象外とする（監査には `actor: system:backup` と記録）。
- 取得したファイルは**公開鍵で暗号化**（`age`。公開鍵はリポジトリ、秘密鍵は保管責任者のみが持つ）してから、Actions のアーティファクト（保持90日）に保存する。**リポジトリには決してコミットしない**（リポジトリは PUBLIC）。
- 失敗時は `NTFY_ADMIN_TOPIC` へ通知する（既存の運用通知と同じ経路）。

## 5. P0-4 検証付き復元

### 5-1. 流れ

```text
1 ファイル選択（ブラウザ内で JSON を読み込む）
2 プレビュー要求 …… POST op=preview（ファイル本体を送信）
   サーバー: 形式・formatVersion・schemaVersion の互換性 → 各セクションの sha256 → 件数
           → 現在のデータとの差分（追加 / 変更 / 削除 の件数と先頭20件の ID・タイトル）
           → preview トークンを発行（ファイルの sha256 ＋ 現データの指紋に結びつけ、TTL 10分）
3 復元範囲の選択 …… セクション単位（手動イベント / 上書き / アカウント / 異動記録）
                     方式: 置換（既定）または 追加のみ（既存IDは変更しない）
4 確認入力 ………… 「復元する」と入力 ＋ step-up
5 実行 ……………… POST op=apply（preview トークン必須）
6 結果 ……………… 復元後の検証結果・事前スナップショットのダウンロード
```

### 5-2. 実行処理（`op=apply`）
1. `backup:restore` 権限・step-up・preview トークンを確認する。トークン発行後に現データが変わっていれば（指紋不一致）409 とし、プレビューからやり直させる。
2. **読み取り専用モードを有効化**する（`system:readonly`、TTL 15分）。復元中の書き込み競合を防ぐ。
3. **事前スナップショット**を作成する（§3 と同じ形式）。`backup:snapshot:<ts>` に TTL 7日で保存し、画面からもダウンロードできるようにする。
4. 選択したセクションを**一時キー**（`manual:events:restore-<id>` など）へ書き込む。
5. 一時キーの件数と sha256 を検証する。不一致なら一時キーを削除して中止する（本番キーは無変更）。
6. `MULTI` 内で `RENAME 一時キー → 本番キー` を実行する（セクション間で原子的に切り替わる）。
7. 復元後の検証: 本番キーを読み直し、件数と sha256 がバックアップと一致するか確認する。
8. 読み取り専用モードを解除し、監査に `backup.restore` を記録する（セクション・方式・件数・sha256・スナップショットID）。

### 5-3. アカウントの復元（特別扱い）
- バックアップにはパスワードハッシュが無いため、**復元されたアカウントはすべて `mustSetPassword:true`・`sessionVersion+1`** になる。設定用URLを一括で発行し、CSV（ID・表示ID・URL）でダウンロードできるようにする（この CSV は秘密情報として扱う）。
- 同じ `userId` のアカウントが既にある場合、既定では**上書きしない**（権限の巻き戻りを防ぐ）。「置換」を選ぶと、ロール・所属・有効状態を置き換えるが `passHash` は維持する。
- 復元を実行している本人のアカウントは変更しない（ロックアウト防止）。env の緊急用アカウントも対象外。

### 5-4. スキーマ版数が異なる場合
- バックアップの `schemaVersion` < 現行: `shared/schemaMigrations.cjs` で前方移行してから差分を出す。
- バックアップの `schemaVersion` > 現行: **拒否**する（新しい形式を古いアプリへ入れない）。

## 6. 保管・取扱いの原則（手順書へ記載）
- バックアップファイルはイベント内容とアカウント一覧（ログインID・所属）を含むため、**秘密情報に準じて扱う**。
- 保管先: 運営者が管理する暗号化ストレージ。リポジトリ・Issue・PR・チャットには置かない。
- **復元訓練**: 四半期に1回、検証環境（別の Vercel プレビュー環境＋別の Upstash）へ復元し、結果を `docs/` の記録表に残す（引継ぎ書 P1-2）。

## 7. テスト
- `backupFormat.test.cjs`: 秘密項目がどこにも含まれないこと（全キーを再帰的に検査）、sha256 が安定していること（キー順に依存しない）、件数、formatVersion/schemaVersion の判定
- `restorePlan.test.cjs`: 差分計算（追加/変更/削除）、「追加のみ」方式、アカウント上書きの既定、実行者本人の除外
- `backupApi.test.cjs`（メモリ Redis）: 権限・step-up・no-store・CSRF、preview トークンの期限切れと指紋不一致で 409、一時キーの検証失敗時に本番キーが変わらないこと、読み取り専用モードが必ず解除されること（失敗時も含む）
- 手動: 別環境への復元訓練を1回実施し、手順書を確定させる

## 8. ロールバック
- 復元の取り消し = **事前スナップショットを同じ手順で復元**する。
- 機能の停止 = 権限 `backup:restore` をロールから外す（コードの差し戻しは不要）。
