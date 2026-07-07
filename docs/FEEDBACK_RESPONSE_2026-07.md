# 外部フィードバックレポート対応状況（2026-07）

対象レポート: 「地本イベントナビ（非公式）レビューレポート」（レビュー日 2026-07-03 / v1.17.34 時点）
対応期間: 2026-07-06〜07-07 / 対応後バージョン: **v1.24.44**

外部レビューで挙がった項目を優先順位順にバッチ（A〜E）で実装した記録。
「対応不可（利用者操作が必要）」の項目は末尾にまとめる。

---

## 実装済み（コード対応が完了）

### A. パフォーマンス（PR #24）
- **§1-2② ハッシュ付きアセットの長期キャッシュ**: `vercel.json` に `/assets` immutable 1年、`/icons` 1日、`/data/events.json` は `s-maxage=600, stale-while-revalidate`。
- **§1-2③ バンドル分割**: `React.lazy`＋`Suspense` で画面分割、`manualChunks` で vendor 分離。
- **§1-2③ フォントのセルフホスト**: `@fontsource-variable/noto-sans-jp` ほかへ移行し `fonts.googleapis.com` を CSP から除去。
- **§1-2⑤ CSP `script-src 'unsafe-inline'` 除去**。
- **§3-3 計測導入（コード側）**: `@vercel/analytics` + `@vercel/speed-insights` を組み込み（※ダッシュボードでの有効化は利用者操作、末尾参照）。

### B. データ正規化・通知（PR #25）
- **§1-2⑥ 会場名/住所の分離**: `shared/titleQuality.cjs` の `splitPlaceAddress`。都道府県名・市区町村＋番地で `place`/`address` を分離。全経路（スクレイプ／手動／クリーニング／フロント正規化）で共有。
- **§1-2⑦ Web Push を「本物」に**: 新着通知をサイト反映後に送るタイミングへ変更（scrape.yml でデプロイ反映後に `/api/notify`）。

### C. UX（PR #26）
- **§2-2-1 スプラッシュ初回のみ**: `sessionStorage` でセッション初回だけ表示。
- **§2-2-3 「今週末」フィルタ**: 期間フィルタに追加（直近土日）。`weekendRange()` を共有。
- **§2-2-4 0件地本の近隣案内**: `regionMap.js` の隣接マップ `NEIGHBORS`。0件時に近隣地本の開催件数をチップ表示・ワンタップ移動。
- **§2-2-7 締切カウントダウンを一覧にも**: 一覧カードの締切バッジ窓を7日へ拡張し残日数で色分け。
- **§4-2⑥ フィルタ既定収納＋免責バナー畳み**: 絞り込みは既定収納（適用中のみチップ表示）、免責バナーは初回のみ全文・以降1行（localStorage 既読フラグ）。

### D. デザイン統一（PR #27）
- **§4-2① 絵文字→線画アイコン**: `Icons.jsx` に `warn/shield/radar/lock/tag` を追加し、モーダル・404・免責/エラー・カレンダーボタン・状態ラベル等の絵文字を線画へ置換。
- **§4-2⑦ 天気アイコン線画化**: WMO コード→カテゴリ→線画 `WeatherGlyph`。
- **§4-2⑤ 角丸2段階ルール**: `--radius-container` / `--radius-element` / `--radius-tag` を定義、カテゴリバッジを角ばったタグ型へ。
- **§4-2② tabular-nums / §4-2③ 端フェード / §4-2④ ダーク選択状態**: A/前段で対応済み。
- ※ 共有テキスト・ntfy 通知本文の絵文字は送信先アプリの表示要素のため据え置き。

### E. 共有・SEO・PC対応（PR #28, 修正 #29）
- **§2-2-6 カテゴリ横断静的ページ**: `public/topics/<slug>.html` を9種目分生成（体験・艦艇公開・一般公開ほか）。JSON-LD・canonical・OGP・相互リンク付き。`events.html` から内部リンク、`sitemap.xml` 登録、`vercel.json` rewrite 除外に `topics` 追加。
- **§1-2④＋§3-4 個別URL＋動的OGP**:
  - `middleware.js`（Edge Middleware）が `/event/:id` で `events.json` を引き、`og:title/description/image` と `twitter:card=summary_large_image` を注入。失敗時は素通しでページを壊さない。
  - `api/og.js`（@vercel/og・Edge）が **イベント名＋開催日＋会場入りのシェア画像（1200×630）** を生成。日本語は Google Fonts サブセットを実行時取得、失敗時は静的アイコンへ 302。
  - （※ 個別URL `/event/:id`・戻る・404 は既対応。）
- **§2-2-8 デスクトップ2ペイン**: 幅1000px以上かつ一覧表示時に左=一覧／右=詳細。選択カード強調、URL・タイトル同期。

### 既に対応済みだった項目（本レビュー以前）
- §1-2① 地図表示不具合（修正済 PR #19）、§1-2④ 個別URL・戻る・404、§2-2-2 カレンダー登録ボタン、§3-2 件数急減セーフティ（dataQuality ゲート）。

---

## 本番確認結果（2026-07-07）
- topics 9ページ・sitemap（53URL）… 200
- `/api/og?...` … `image/png`（約116KB）を返却
- `/event/:id` … per-event `og:title` / `og:image`(=/api/og) / `twitter:card=summary_large_image` の注入を確認
- 主要ページ・API … 200 / CSP ヘッダ付与を確認

---

## 対応不可（利用者の操作が必要な項目）

コードでは完結できず、**運営者（利用者）が Vercel ダッシュボード等で操作**する必要があるもの。

1. **§3-3 Vercel Analytics / Speed Insights の有効化**
   コード側（`@vercel/analytics` / `@vercel/speed-insights`）は導入済み。実データ収集には
   **Vercel ダッシュボード → プロジェクト → Analytics / Speed Insights を「Enable」** にする操作が必要。

2. **§3-5 独自ドメイン**
   ドメインの購入と接続は運営者操作。**Vercel → Settings → Domains** で購入/接続すると SSL 自動・
   `vercel.app` から 301 で SEO 評価も引き継ぎ。接続後は `api/_security.js` の `ALLOWED_ORIGINS`、
   `middleware.js`/`api/og.js`/HTML 生成の `SITE_URL`、各種 canonical/OGP の絶対URLを新ドメインへ更新すること。

3. **§3-6 Hobby プランの商用利用制限（情報）**
   将来の広告掲載・収益化時は Pro プラン（月20ドル）への切り替えが必要。現状の規模では帯域は余裕。

### 補足・今後の検討余地
- 動的OGP画像は日本語グリフを実行時にサブセット取得している。表示崩れや遅延が見られた場合は
  フォント取得のキャッシュ/固定サブセット化を検討する（失敗時は静的画像へフォールバック済み）。
- デスクトップ2ペインは一覧画面のみ。地域/お気に入り/通知からの詳細は従来通り単一ペイン。
