# ドメイン移行手順（vercel.app → 独自ドメイン .jp）

現行: `https://jsdf-chiiki-events.vercel.app`
移行先: **（未定。決まったらここに記入）** `https://＿＿＿＿.jp`

> **現状: 移行は未実施。** コードは現行ドメイン（vercel.app）のまま動いている。
> `SITE_URL` を設定するまで出力は一切変わらない（未設定時のビルド結果が従来と同一であることを確認済み）。

コード側の準備は済んでいる。**アプリのURLは `shared/siteUrl.cjs` が唯一の出どころ**で、
環境変数 `SITE_URL` を設定すれば canonical・OGP・sitemap・robots・llms・IndexNow・
書き込みAPIの許可オリジンがすべて切り替わる。手作業が要るのは下記のうち「手で直す」印の項目だけ。

---

## 0. 事前に決めること

| 項目 | 内容 |
|---|---|
| ドメイン名 | 例 `jsdf-events.jp`。`.jp` は JPRS 指定事業者（お名前.com / Value Domain / Cloudflare 等）で取得 |
| www の扱い | `www.` あり/なしのどちらを正とするか。もう一方は 301 で寄せる |
| 移行日 | アクセスの少ない時間帯（深夜〜早朝）。**スクレイプ実行中（JST 05:33/09:33/15:33 開始の約1時間）は避ける** |

## 1. Vercel にドメインを追加（切替の前日までに）

1. Vercel プロジェクト → Settings → Domains → 新ドメインを追加
2. 表示された DNS レコードを登録（A / CNAME）。TTL は切替前に **300 秒程度へ下げておく**と戻しやすい
3. 証明書（Let's Encrypt）が発行され「Valid Configuration」になるまで待つ
4. この時点では**旧ドメインも生きたまま**。両方で同じ内容が見える状態になる

## 2. 環境変数の設定（Vercel / GitHub）

| 変数 | 設定先 | 値 |
|---|---|---|
| `SITE_URL` | Vercel（Production / Preview） | `https://＿＿＿＿.jp` |
| `SITE_URL` | GitHub Secrets（**既存**。scrape.yml が Web Push の宛先に使っている） | 同上 |
| `SITE_URL` | deploy.yml の `env:` に**追加が必要**（現在は渡していない＝ビルド時は既定ドメインになる） | 同上 |
| `SITE_ORIGINS` | Vercel（任意） | `www` も使うなら `https://www.＿＿＿＿.jp` |

- 旧ドメインは `shared/siteUrl.cjs` の `LEGACY_ORIGINS` に入っており、**設定しなくても書き込みAPIは許可され続ける**
  （移行が落ち着いたらこの配列を空にする）
- ⚠ GitHub Secrets の `SITE_URL` は**既に存在し、scrape.yml が Web Push の送信先**
  （`${SITE_URL}/api/notify`）に使っている。ここを新ドメインへ変えると通知の送信先も同時に変わる。
  Vercel 側で新ドメインが有効になってから変更すること
- ⚠ `deploy.yml` は現在 `SITE_URL` を渡していないため、**追記しないとビルド出力（canonical・OGP・
  sitemap）が旧ドメインのまま**になる。移行時に `env:` へ追加する
- `SITE_URL` を設定したら **deploy.yml を手動実行**して反映する（`gh workflow run deploy.yml`）

## 3. 手で直す（コードから差し込めない箇所）

- [ ] **`vercel.json`** の `Access-Control-Allow-Origin` 3か所を新ドメインへ
      （`/assets/(.*)` `/icons/(.*)` `/data/events.json`）
      → 直し忘れると `npm test` の「vercel.json の CORS 許可オリジンが公開URLと一致している」が落ちる
- [ ] **`shared/siteUrl.cjs`** の `DEFAULT_SITE_URL` を新ドメインへ（`SITE_URL` 未設定でも新ドメインになる）
- [ ] **`docs/*.md`** 内の URL 表記
- [ ] **CLAUDE.md** の「本番URLを変更したら…」の記述

## 4. 旧ドメインからのリダイレクト

Vercel の Settings → Domains で旧ドメイン `jsdf-chiiki-events.vercel.app` に
**Redirect to `＿＿＿＿.jp`（308 Permanent）** を設定する。

⚠ ただし**リダイレクトを有効にする前に**下の「5. 利用者データの引き継ぎ」を検討すること。
リダイレクトを入れると旧ドメインのページが開けなくなり、引き継ぎ導線を出せなくなる。

## 5. 利用者データの引き継ぎ（最大の注意点）

**オリジンが変わると、ブラウザが持つデータはすべて別物になる。**

| データ | 保存先 | 移行後どうなるか |
|---|---|---|
| お気に入り・申請済み | localStorage | **消える**（新ドメインでは空） |
| テーマ・表示設定・地域 | localStorage | **消える**（既定に戻る） |
| 規約への同意記録 | localStorage | **消える**（同意画面が再度出る） |
| 通知履歴・既読 | localStorage | **消える** |
| オフライン用のイベントキャッシュ | localStorage / SW | 作り直し（初回はネット必須） |
| **Web Push の購読** | ブラウザ（オリジン単位） | **無効になる。利用者の再登録が必要** |
| Service Worker / PWA | オリジン単位 | 新ドメインで再インストール。旧ドメインの SW は残り続ける |

対応の選択肢:

1. **何もしない**（利用者に再設定してもらう）— 実装ゼロ。利用者数が少ないうちはこれで十分
2. **引き継ぎ導線を作る** — 旧ドメインに「新サイトへ移動（設定を引き継ぐ）」ボタンを置き、
   localStorage の設定（お気に入り・同意・テーマ等。イベントキャッシュは除く）を
   URL フラグメントへ載せて新ドメインで取り込む。実装は半日程度
3. **告知だけ行う** — 移行の1〜2週間前に、アプリ内のお知らせ（更新ノート）と通知で
   「お気に入りは引き継がれません」と周知する

→ **推奨: 3 を必ず行い、利用者数に応じて 2 を検討する。**

## 6. 検索エンジン・外部サービス

- [ ] **Google Search Console**: 新ドメインのプロパティを追加 → 所有権確認
      （`public/google3d6aa643f6d363c1.html` はそのまま使えるが、新プロパティでの確認が必要）
- [ ] Search Console の **アドレス変更ツール**で旧→新を申告（301/308 リダイレクトが前提）
- [ ] 新プロパティで **sitemap.xml を送信**
- [ ] **IndexNow**: キーファイル `public/<32桁hex>.txt` は新ドメイン直下にも配信されるのでそのまま使える。
      デプロイ後に `node scripts/indexnow.mjs`（`SITE_URL` を設定した状態で）を実行
- [ ] **Vercel Analytics / Speed Insights**: 同一プロジェクトのため設定変更は不要
- [ ] 外部に貼ってある URL（配布資料・QRコード・SNS）を新ドメインへ

## 7. 切替当日の順序

1. `SITE_URL` を設定 → `deploy.yml` を手動実行 → 新ドメインで表示を確認
2. 新ドメインで確認する項目
   - [ ] トップ・一覧・詳細・地域・お気に入り・設定・404 が表示される
   - [ ] `view-source` で canonical / og:url が**新ドメイン**になっている
   - [ ] `/sitemap.xml` `/robots.txt` `/llms.txt` が新ドメインを指している
   - [ ] `/events/tokyo.html` など静的ページが開ける
   - [ ] 不具合報告の送信ができる（＝オリジン検証が通っている）
   - [ ] 運営ページ `/admin.html` にログインでき、イベントの保存ができる
   - [ ] プッシュ通知の登録ができる（新規購読）
   - [ ] オフライン（機内モード）でイベントが見える
3. 旧ドメインに 308 リダイレクトを設定
4. Search Console のアドレス変更を申告
5. 1週間ほど、旧ドメインへのアクセスがリダイレクトされていること・新ドメインの
   インデックスが増えていることを確認

## 8. 切り戻し

`SITE_URL` を旧URLに戻して `deploy.yml` を再実行すれば、出力は元のドメインに戻る。
旧ドメインのリダイレクト設定を外せば元通り（DNS の TTL 分の待ちが必要）。

---

## 補足: コード側がどう切り替わるか

| 対象 | 切り替わり方 |
|---|---|
| `index.html` / `admin.html` の canonical・OGP | ビルド時に `vite.config.js` の `siteUrlInject` が置換 |
| `events.html` / `events/*.html` / `topics/*.html` / `sitemap.xml` | `scripts/generate-events-html.mjs` が `SITE_URL` で生成 |
| `robots.txt` / `llms.txt` | 同スクリプトが `SITE_URL` と違うときだけ書き換え |
| OGP 画像（`/api/og`） | 実行時に `SITE_URL` を参照 |
| 書き込みAPIの許可オリジン | `shared/siteUrl.cjs` の `allowedOrigins()`（旧ドメインも許可） |
| イベント共有URL・カレンダー(.ics) | 表示中のホストを使うため自動で追従 |
| OGP 注入（`middleware.js`） | リクエストのオリジンを使うため自動で追従 |
