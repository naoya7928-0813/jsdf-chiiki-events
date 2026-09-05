# ドメイン移行（vercel.app → jsdf-chiiki-events.jp）

旧: `https://jsdf-chiiki-events.vercel.app`
新: **`https://jsdf-chiiki-events.jp`**（2026-09-03 にコード側を切り替え）

> **現状: コード側は移行済み。残りは Vercel / DNS / Search Console の設定作業。**
> `shared/siteUrl.cjs` の `DEFAULT_SITE_URL` が新ドメインになったので、
> `SITE_URL` を設定しなくても canonical・OGP・sitemap・robots・llms・IndexNow・
> 書き込みAPIの許可オリジンはすべて新ドメインで出力される。

正式なURLは **`www.` なし（apex）** とする。`www.` も使う場合は下記「www を併用する場合」を参照。

---

## A. コード側で済んでいること（このリポジトリ）

| 対象 | 内容 |
|---|---|
| `shared/siteUrl.cjs` | `DEFAULT_SITE_URL` を新ドメインへ。旧ドメインは `LEGACY_ORIGINS` に残置 |
| `vercel.json` | `Access-Control-Allow-Origin` 3か所（`/assets/(.*)` `/icons/(.*)` `/data/events.json`）|
| `index.html` | canonical / og:url / og:image / twitter:image / JSON-LD |
| `public/robots.txt` `public/llms.txt` | 手書きのURL |
| `public/events.html` `public/events/*.html` `public/topics/*.html` `public/guide.html` `public/sitemap.xml` | 再生成済み |
| `.github/workflows/deploy.yml` | ビルドと IndexNow へ `SITE_URL` を渡すよう追加（従来は渡していなかった）|
| `scripts/check-site-url.mjs` | `SITE_URL` に旧ドメインが残っていたら警告する（下記）|

### `SITE_URL` シークレットの更新漏れ対策

`SITE_URL` は**コードの既定より優先される**。何もしなければ、GitHub Secrets に
旧ドメインが残ったままだと次が起きる。

1. `deploy.yml` のビルドが旧ドメインで canonical・OGP を生成する
2. `scrape.yml` が旧ドメインで静的ページ・sitemap を生成し、**それをコミットする**
   → 次のスクレイプ（1日3回）で移行が丸ごと巻き戻る

そこで **`siteUrl()` は `LEGACY_ORIGINS`（＝移行元として捨てたドメイン）を
公開URLとして採用しない**（既定へ落とす）。捨てたドメインを公開URLに指定するのは
設定として成立しないため。これで出力は常に新ドメインになる。

`scripts/check-site-url.mjs` が両ワークフローの冒頭で警告を出すが、
**ジョブは落とさない**（落とすとスクレイプが止まり、データが更新されないほうが害が大きい）。

ただし **`scrape.yml` の Web Push 送信先（`${SITE_URL}/api/notify`）はシークレットを
直接使っている**ため、旧ドメインを閉じると通知が送れなくなる。
結局のところ**シークレットは新ドメインへ更新するか削除すること**
（削除すればコードの既定＝新ドメインが使われる）。

---

## B. 残っている作業（Vercel / DNS / 外部サービス）

### 1. Vercel にドメインを追加

1. Vercel プロジェクト → Settings → Domains → `jsdf-chiiki-events.jp` を追加
2. 表示された DNS レコードを **XServer のDNSレコード設定**に登録する
   - apex（`jsdf-chiiki-events.jp`）… **A レコード** `76.76.21.21`
     （※ Vercel の画面に出た値を必ず優先すること。上記は一般的な値）
   - `www` … **CNAME** `cname.vercel-dns.com`（www も受ける場合）
3. ⚠ **XServer のレンタルサーバー契約があると、ドメイン追加時に
   サーバーのIPを指す A レコードが自動作成されていることがある。**
   残っているとサーバーの初期ページが表示されるので削除する
4. 証明書（Let's Encrypt）が発行され「Valid Configuration」になるまで待つ（通常数分〜数十分）
5. TTL は切替前に **300 秒程度へ下げておく**と戻しやすい

### 2. 環境変数

| 変数 | 設定先 | 値 |
|---|---|---|
| `SITE_URL` | **GitHub Secrets（既存・要更新）** | `https://jsdf-chiiki-events.jp` または削除 |
| `SITE_URL` | Vercel（Production / Preview） | 同上（未設定でも可）|
| `SITE_ORIGINS` | Vercel（任意） | `www` も使うなら `https://www.jsdf-chiiki-events.jp` |

- GitHub Secrets の `SITE_URL` は **scrape.yml が Web Push の送信先**（`${SITE_URL}/api/notify`）
  にも使っている。**Vercel 側で新ドメインが有効になってから**更新すること
  （先に更新すると、まだ証明書が出ていないホストへ通知を打ちにいく）
- 更新したら `gh workflow run deploy.yml` で反映する

### 3. 旧ドメインからのリダイレクト

Vercel の Settings → Domains で `jsdf-chiiki-events.vercel.app` に
**Redirect to `jsdf-chiiki-events.jp`（308 Permanent）** を設定する。

⚠ **下の「4. 利用者データ」の告知が行き渡ってから**にすること。
リダイレクトを入れると旧ドメインのページが開けなくなり、引き継ぎ導線を出す余地がなくなる。

### 4. 利用者データ（最大の注意点）

**オリジンが変わると、ブラウザが持つデータはすべて別物になる。**

| データ | 保存先 | 移行後どうなるか |
|---|---|---|
| お気に入り・申請済み | localStorage | **消える**（新ドメインでは空）|
| テーマ・配色・表示設定・地域 | localStorage | **消える**（既定に戻る）|
| 規約への同意記録 | localStorage | **消える**（同意画面が再度出る）|
| 通知履歴・既読 | localStorage | **消える** |
| 未読バッジの件数 | IndexedDB | **消える**（0 から数え直し）|
| オフライン用のイベントキャッシュ | localStorage / SW | 作り直し（初回はネット必須）|
| **Web Push の購読** | ブラウザ（オリジン単位）| **無効になる。利用者の再登録が必要** |
| Service Worker / PWA | オリジン単位 | 新ドメインで再インストール。旧ドメインの SW は残り続ける |

**採った対応: 告知（更新ノート）**。`src/constants/updates.js` に
「お気に入り・設定・通知は引き継がれない」旨を記載済み。

利用者が増えたら、旧ドメインに「新サイトへ移動（設定を引き継ぐ）」ボタンを置き、
localStorage の設定を URL フラグメントで受け渡す導線を検討する（実装は半日程度）。
その場合は **リダイレクトを入れる前に**用意すること。

### 5. 検索エンジン・外部サービス

- [ ] **Google Search Console**: `jsdf-chiiki-events.jp` のプロパティを追加 → 所有権確認
      （`public/google3d6aa643f6d363c1.html` は新ドメインでも配信されるのでそのまま使える）
- [ ] Search Console の **アドレス変更ツール**で旧→新を申告（308 リダイレクトが前提）
- [ ] 新プロパティで **sitemap.xml を送信**
- [ ] **IndexNow**: キーファイル `public/62746297ec6dab7f4c08cd50c2d2e5b1.txt` はそのまま使える。
      デプロイ後に `node scripts/indexnow.mjs`（deploy.yml が自動実行する）
- [ ] **Vercel Analytics / Speed Insights**: 同一プロジェクトのため設定変更は不要
- [ ] 外部に貼ってある URL（配布資料・QRコード・SNS）を新ドメインへ

### 6. 切替当日の確認項目

新ドメインで:

- [ ] トップ・一覧・詳細・地域・お気に入り・設定・404 が表示される
- [ ] `view-source` で canonical / og:url が**新ドメイン**になっている
- [ ] `/sitemap.xml` `/robots.txt` `/llms.txt` が新ドメインを指している
- [ ] `/events/tokyo.html` など静的ページが開ける
- [ ] 不具合報告の送信ができる（＝オリジン検証が通っている）
- [ ] 運営ページ `/admin.html` にログインでき、イベントの保存ができる
- [ ] プッシュ通知の登録ができる（新規購読）
- [ ] オフライン（プレビューサーバーを止めて確認）でイベントが見える
- [ ] ホーム画面に追加 → アイコン・スプラッシュ・ショートカットが出る

その後 1週間ほど、旧ドメインへのアクセスがリダイレクトされていること・
新ドメインのインデックスが増えていることを確認する。

### 7. 切り戻し

**`SITE_URL` を旧URLに戻す方法は使わない**（`vercel.json` の CORS と `index.html` の
canonical は静的なので環境変数では戻らず、`siteUrl()` も移行元のドメインは採用しない）。
移行コミットを `git revert` して `deploy.yml` を実行する。
DNS を戻す場合は TTL 分の待ちが必要。

### www を併用する場合

`www.jsdf-chiiki-events.jp` も受けるなら、どちらかを正としてもう一方は Vercel の
Domains で 308 リダイレクトに設定する（正でない方に canonical を向けない）。
書き込みAPIから使う場合のみ Vercel の `SITE_ORIGINS` に追加する。

---

## 補足: コード側がどう切り替わるか

| 対象 | 切り替わり方 |
|---|---|
| `index.html` / `admin.html` の canonical・OGP | ビルド時に `vite.config.js` の `siteUrlInject` が置換（`SITE_URL` 未設定なら既定のまま）|
| `events.html` / `events/*.html` / `topics/*.html` / `sitemap.xml` | `scripts/generate-events-html.mjs` が生成 |
| `robots.txt` / `llms.txt` | 同スクリプトが `SITE_URL` と既定が違うときだけ書き換え |
| OGP 画像（`/api/og`） | 実行時に `SITE_URL` を参照 |
| 書き込みAPIの許可オリジン | `shared/siteUrl.cjs` の `allowedOrigins()`（旧ドメインも許可）|
| イベント共有URL・カレンダー(.ics) | 表示中のホストを使うため自動で追従 |
| OGP 注入（`middleware.js`） | リクエストのオリジンを使うため自動で追従 |
