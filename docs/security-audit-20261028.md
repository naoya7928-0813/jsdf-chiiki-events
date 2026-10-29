# セキュリティ点検（2026-10-28）

**結論: 修正できるものは修正済み。重大度「高」以上の未対応はゼロ。** 残りは「確認して受け入れたリスク（期限付き）」2件と、運営者の設定確認2件。

- 機械で扱える一覧: [`docs/security-audit-20261028.json`](security-audit-20261028.json)（項目ID・状態・対象ファイル・確認方法）
- 受け入れたリスクの台帳: [`security/audit-allowlist.json`](../security/audit-allowlist.json)（CI がこれと突き合わせる）
- 再点検の手順: [`SECURITY.md`](../SECURITY.md) の「依存パッケージの脆弱性監査」
- 基準コミット: `264ece2`（master）／作業ブランチ: `security/dependency-audit-2026-10`

> **PHP の脆弱性について**: このリポジトリに PHP のファイル（`*.php`・`composer.json`）は無く、Node.js（React＋Vercel Functions）で動いているため該当しない。

## 1. 依存パッケージの件数（npm audit）

| 対象 | 点検前 | 点検後 | 残り |
|---|---|---|---|
| サイト本体（`package-lock.json`） | 18件（高9・中5・低4） | 6件（中2・低4） | satori・deepmerge（下表 04・05） |
| スクレイパー（`scraper/package-lock.json`） | 6件（**最重要1**・高2・低3） | 3件（低3） | deepmerge（05） |
| OCR（`scraper/requirements-ocr.txt`） | 0件 | 0件 | pip-audit で確認 |

件数は npm audit の「影響を受けるパッケージ数」で、巻き込まれただけの親パッケージも数えている（実際の指摘は satori と deepmerge の2種類）。

## 2. 指摘と対応の一覧

状態の意味: **修正済み**＝コードで直した／**緩和・受け入れ**＝回避策を入れたうえで期限付きで受け入れ／**受け入れ**＝実害が無いことを確認して期限付きで受け入れ／**運営者対応**＝リポジトリの外（Vercel・GitHub の設定）／**未対応**＝提案のみ

| ID | 重大度 | 対象 | 内容 | 状態 |
|---|---|---|---|---|
| 01 | 高 | サイト本体の依存 | vite・postcss・serialize-javascript ほかの既知の脆弱性 | 修正済み |
| 02 | **最重要** | `node-tesseract-ocr` | OSコマンドインジェクション（修正版なし） | 修正済み（削除して直接呼び出しに） |
| 03 | 高 | スクレイパーの依存 | undici（TLS 証明書検証の回避ほか） | 修正済み |
| 04 | 中 | satori（`/api/og`） | SVG のエスケープ漏れ。URL の文字列をそのまま描画していたため該当 | 緩和・受け入れ（〜2027-01-31） |
| 05 | 低 | deepmerge | プロトタイプ汚染（修正版なし） | 受け入れ（〜2027-01-31） |
| 06 | 中 | `pr-check.yml` | 依存監査が修正版の無い指摘で**常に失敗**し、ゲートになっていなかった | 修正済み |
| 07 | 低 | CI | PR が無い期間の新しい脆弱性に気付けない | 修正済み（週1回の定期監査） |
| 08 | 低 | `deploy.yml` | GITHUB_TOKEN の権限指定なし | 修正済み（読み取りのみ） |
| 09 | 低 | `/api/weather` | 回数制限なし（キャッシュを素通りして外部APIを呼ばせ続けられる） | 修正済み（60回/10分/IP） |
| 10 | 低 | `/api/subscribe` | `expirationTime` を型を確かめずに保存 | 修正済み |
| 11 | 低 | RapidOCR のモデル | 新しく取得したモデルのハッシュを照合していない | 修正済み（`--check` で照合） |
| 12 | 中 | Vercel 環境変数 | `LEGACY_PLAINTEXT_PASSWORDS` の既定が true（平文パスワードを許す） | 修正済み（2026-10-29 に false を設定） |
| 13 | 情報 | `/api/og` | 回数制限なし（Edge 関数） | **運営者対応**（Firewall 画面を一度開くとルールを追加できる） |
| 14 | 情報 | `/api/subscribe` | Origin の無い要求も受け付ける | 受け入れ（設計どおり） |
| 15 | 情報 | git 履歴 | 秘密情報の検索は直近61コミットのみ | **運営者対応**（Secret scanning） |
| 16 | 情報 | OCR の説明文 | モデルは wheel に同梱されており、通常はダウンロードしない | 修正済み（記述を訂正） |
| 17 | 低 | `/api/notify` | 古い不正な購読（endpoint が `test`）が残り、通知のたびに失敗 | 修正済み（送信前に判定して削除） |
| 18 | 情報 | Vercel 環境変数 | 使われていない `VITE_NTFY_TOPIC` | 修正済み（運営者が削除） |
| 19 | 情報 | GitHub Actions | `upload-artifact@v4` が Node.js 20 で動き非推奨の警告 | 修正済み（v6 へ更新） |

## 3. 主な項目の詳細

### 02 node-tesseract-ocr（最重要）
- **何が問題か**: コマンド文字列を組み立ててシェルで実行する作りで、引数に細工した値を渡されると任意のコマンドが動く（[GHSA-8j44-735h-w4w2](https://github.com/advisories/GHSA-8j44-735h-w4w2)）。修正版は出ない。
- **実害**: このリポジトリは画像バッファと固定の設定だけを渡していたため、悪用の経路は無かった。
- **対応**: パッケージを外し、`tesseract` を `spawn` で直接呼ぶ（引数は配列・画像は標準入力・シェルを通さない）。`scraper/index.js` の `tesseractRecognize`。
- **確認**: 偽の `tesseract` で引数・標準入力・結果を確認済み。**本物での動作は次回スクレイプのログ「[OCRエンジン] Tesseract: 利用可能」で確認すること。**

### 04 satori（OGP 画像）
- **何が問題か**: satori（0.33.5 未満）は文字列を SVG に書き出すときのエスケープが漏れる（[GHSA-wx4j-mvgx-mqwp](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp)）。`/api/og` は URL のクエリ（`title` など）を誰でも指定でき、それをそのまま描画していた。
- **なぜ更新しないか**: 修正版を含む `@vercel/og` 1.0.3 は、Vercel Edge 用のビルドがパッケージに入っていない `hb.wasm` を読みに行って描画できない（Edge と同じ条件を Node で再現して確認）。現行の 0.11.1 は satori を内部に同梱しているため、`overrides` で版を指定しても中身は変わらない。
- **対応**: 公式の回避策「攻撃者が決められる文字列を satori に渡さない」を実施。`shared/ogText.cjs` の `ogSafeText` が `< > & " '` を全角に置き換え、制御文字を取り除く。`api/og.js` の全クエリが通ることをテストが検査する。出力は PNG（resvg で画像化）なので SVG はブラウザへ届かない。
- **解消の条件**: `@vercel/og` の Edge ビルドが直った版で描画を確認できたら更新し、`security/audit-allowlist.json` の項目を消す。

### 06・07 依存監査の CI
- 以前の `npm audit --omit=dev` は satori の指摘だけで毎回失敗し、すべての PR が赤になっていた。重大度で足切りすると新しい指摘を見落とす。
- `node scripts/audit-deps.mjs` に置き換えた。サイト本体とスクレイパーの**全依存**（ビルドはシークレットのある CI で動くため開発用も含む）を監査し、`security/audit-allowlist.json` と突き合わせる。

| 状態 | CI の扱い |
|---|---|
| 一覧に無い指摘 | 失敗（直すか、確認して一覧に足す） |
| 一覧にあるが期限切れ | 失敗（受け入れたまま放置しない） |
| 一覧の書き漏れ（理由・対策・期限・確認日） | 失敗 |
| 一覧にあるが今は出ない | 警告（一覧から消してよい） |

- 判定は `shared/depAudit.cjs`（テスト `shared/depAudit.test.cjs`）。受け入れ期限は確認日から**最長6か月**（テストで検査）。
- `.github/workflows/security-audit.yml` が毎週水曜 10:41（JST）に同じ監査を実行し、失敗時は `NTFY_ADMIN_TOPIC` へ通知する。

### 11 RapidOCR のモデル
- rapidocr 3.10.0 は、新しくダウンロードしたモデルのハッシュを照合しない（照合は次回起動時に既存ファイルを使うかの判定だけ）。Actions cache から復元したファイルも同じ扱い。
- `rapidocr_cli.py --check` が、モデル置き場の全 `.onnx` を `default_models.yaml` の SHA256 と照合する。不一致・未知のファイルは削除して失敗にし、その回は RapidOCR を使わない（Tesseract 等へ回る）。理由はスクレイプのログに出る。

### 17・18 Vercel の確認で見つかったこと（同日）
- Vercel の実行時エラーに `[notify] sendNotification error undefined test` が6月から出続けていた。購読先の検査（`isValidPushEndpoint`）を入れる前に保存された不正な購読が残っていたため。`api/_push.js` の `usableSubscription` を送信前に通し、使えない購読は送らずに削除する。
- `LEGACY_PLAINTEXT_PASSWORDS` は Vercel にもデプロイ時の値にも無く、既定（平文を許す）のまま。運営アカウント（`ADMIN_ACCOUNTS_B64`）は GitHub Secrets から `deploy.yml`・`scrape.yml` が `-e` で渡している。`scripts/admin-accounts.mjs encode` で作った値なら必ずハッシュ化済みなので、そのうえで Vercel に `LEGACY_PLAINTEXT_PASSWORDS=false` を足す。
- 使われていない `VITE_NTFY_TOPIC` は運営者が削除した。

## 4. 運営者にお願いする作業

| ID | 作業 | 場所 |
|---|---|---|
| 15 | Secret scanning と Push protection を有効化（全履歴が検査される） | GitHub → Settings → Code security |
| 13 | Firewall 画面を一度開いて設定を作る（その後「`/api/og` は同じIPから1分100回まで」のルールを追加。API からも追加できるようになる） | Vercel → プロジェクト → Firewall |
| — | GitHub Secrets に残っている場合は、使っていない `ADMIN_SECRET`（旧共通パスワード）を削除 | GitHub → Settings → Secrets and variables → Actions |

済み: 12（2026-10-29 に `LEGACY_PLAINTEXT_PASSWORDS=false` を設定）／OCR の動作確認（2026-10-28 のスクレイプで Tesseract・RapidOCR とも「利用可能」）

## 5. 問題なしと確認した項目

- **運営API**: すべての入口で「認証 → 権限・担当範囲 → 操作記録」の順。セッション Cookie は HttpOnly／Secure／SameSite=Strict、応答は `no-store`。
- **なりすまし操作（CSRF）**: 状態を変える要求は Origin の完全一致＋`Sec-Fetch-Site: same-origin` を要求。
- **他人のデータの操作（IDOR）**: イベントの所属はサーバー側で実データから解決（`api/_eventScope.js`）。
- **総当たり**: IP の回数制限＋アカウント単位の段階的ロック。ヘッダ認証・`ADMIN_SECRET` は既定で無効。
- **XSS**: 静的ページ・OGP 注入の `esc()`、JSON-LD の `<` の無害化、統計出力のエスケープ、リンクの `safeUrl`（http(s) 以外を捨てる）、運営入力の URL 検査。CSP は `script-src 'self'`。
- **GitHub Actions**: 外部から細工できる値を `run:` に直接埋め込んでいない（入力は `env:` 経由）。`pull_request_target` は使っていない。
- **秘密情報**: 追跡ファイルに API キー・トークン・秘密鍵は無い。`.env` 類は追跡されていない（`.env.example` のみ）。

## 6. 再点検の手順

```bash
npm ci && npm test                     # 単体テスト（ogText・depAudit を含む）
node scripts/audit-deps.mjs            # 依存監査（サイト本体＋スクレイパー）。--json で機械向け出力
pip install pip-audit && pip-audit -r scraper/requirements-ocr.txt   # OCR の Python 依存
```

新しい指摘が出たら、まず `npm audit fix`（互換性を壊さない範囲）で直す。直せない場合だけ影響を確かめ、`security/audit-allowlist.json` に理由・対策・期限を書いて受け入れる。
