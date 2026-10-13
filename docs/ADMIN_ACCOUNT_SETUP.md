# 管理アカウント（ユーザー名・パスワード）の作成・変更手順

> 運営画面にログインするためのアカウントを、**作成・変更・停止**する手順です。
> 試験運用の担当者向けに、なるべく専門用語を避けて説明します。
>
> ⚠️ **本書のサンプルは「試験用」です。** 実際に使うユーザー名・パスワードは必ずご自身で決めて
> 設定してください。パスワードそのものは、この資料や公開される場所には残さないでください。

---

## A. 都道府県（地本）別の運営画面（2026-10-13 追加）

各地本の担当者は、自分の地本の運営画面を開いてログインします。中身は共通の運営画面（`/admin.html`）と同じで、
**操作できる範囲はアカウントの担当（`organization`）で決まります**（URL を変えても他の地本は操作できません）。

- 担当と違う地本の画面でログインすると、画面上部に「この画面は○○地本用です」と案内し、担当の地本の画面へのリンクを出します
- 全国担当（`organization: "*"`）は、どの地本の画面でも使えます（その地本が新規登録の初期選択になります）
- 従来の `/admin.html` も引き続き使えます（地本を指定しない共通の入口）

| 地本 | 運営画面のURL | 推奨ユーザー名（地本管理者） |
|---|---|---|
| 札幌地本 | `https://jsdf-chiiki-events.jp/admin/sapporo` | `sapporo-admin` |
| 旭川地本 | `https://jsdf-chiiki-events.jp/admin/asahikawa` | `asahikawa-admin` |
| 帯広地本 | `https://jsdf-chiiki-events.jp/admin/obihiro` | `obihiro-admin` |
| 函館地本 | `https://jsdf-chiiki-events.jp/admin/hakodate` | `hakodate-admin` |
| 青森地本 | `https://jsdf-chiiki-events.jp/admin/aomori` | `aomori-admin` |
| 岩手地本 | `https://jsdf-chiiki-events.jp/admin/iwate` | `iwate-admin` |
| 宮城地本 | `https://jsdf-chiiki-events.jp/admin/miyagi` | `miyagi-admin` |
| 秋田地本 | `https://jsdf-chiiki-events.jp/admin/akita` | `akita-admin` |
| 山形地本 | `https://jsdf-chiiki-events.jp/admin/yamagata` | `yamagata-admin` |
| 福島地本 | `https://jsdf-chiiki-events.jp/admin/fukushima` | `fukushima-admin` |
| 茨城地本 | `https://jsdf-chiiki-events.jp/admin/ibaraki` | `ibaraki-admin` |
| 栃木地本 | `https://jsdf-chiiki-events.jp/admin/tochigi` | `tochigi-admin` |
| 群馬地本 | `https://jsdf-chiiki-events.jp/admin/gunma` | `gunma-admin` |
| 埼玉地本 | `https://jsdf-chiiki-events.jp/admin/saitama` | `saitama-admin` |
| 千葉地本 | `https://jsdf-chiiki-events.jp/admin/chiba` | `chiba-admin` |
| 東京地本 | `https://jsdf-chiiki-events.jp/admin/tokyo` | `tokyo-admin` |
| 神奈川地本 | `https://jsdf-chiiki-events.jp/admin/kanagawa` | `kanagawa-admin` |
| 新潟地本 | `https://jsdf-chiiki-events.jp/admin/niigata` | `niigata-admin` |
| 富山地本 | `https://jsdf-chiiki-events.jp/admin/toyama` | `toyama-admin` |
| 石川地本 | `https://jsdf-chiiki-events.jp/admin/ishikawa` | `ishikawa-admin` |
| 福井地本 | `https://jsdf-chiiki-events.jp/admin/fukui` | `fukui-admin` |
| 山梨地本 | `https://jsdf-chiiki-events.jp/admin/yamanashi` | `yamanashi-admin` |
| 長野地本 | `https://jsdf-chiiki-events.jp/admin/nagano` | `nagano-admin` |
| 岐阜地本 | `https://jsdf-chiiki-events.jp/admin/gifu` | `gifu-admin` |
| 静岡地本 | `https://jsdf-chiiki-events.jp/admin/shizuoka` | `shizuoka-admin` |
| 愛知地本 | `https://jsdf-chiiki-events.jp/admin/aichi` | `aichi-admin` |
| 三重地本 | `https://jsdf-chiiki-events.jp/admin/mie` | `mie-admin` |
| 滋賀地本 | `https://jsdf-chiiki-events.jp/admin/shiga` | `shiga-admin` |
| 京都地本 | `https://jsdf-chiiki-events.jp/admin/kyoto` | `kyoto-admin` |
| 大阪地本 | `https://jsdf-chiiki-events.jp/admin/osaka` | `osaka-admin` |
| 兵庫地本 | `https://jsdf-chiiki-events.jp/admin/hyogo` | `hyogo-admin` |
| 奈良地本 | `https://jsdf-chiiki-events.jp/admin/nara` | `nara-admin` |
| 和歌山地本 | `https://jsdf-chiiki-events.jp/admin/wakayama` | `wakayama-admin` |
| 鳥取地本 | `https://jsdf-chiiki-events.jp/admin/tottori` | `tottori-admin` |
| 島根地本 | `https://jsdf-chiiki-events.jp/admin/shimane` | `shimane-admin` |
| 岡山地本 | `https://jsdf-chiiki-events.jp/admin/okayama` | `okayama-admin` |
| 広島地本 | `https://jsdf-chiiki-events.jp/admin/hiroshima` | `hiroshima-admin` |
| 山口地本 | `https://jsdf-chiiki-events.jp/admin/yamaguchi` | `yamaguchi-admin` |
| 徳島地本 | `https://jsdf-chiiki-events.jp/admin/tokushima` | `tokushima-admin` |
| 香川地本 | `https://jsdf-chiiki-events.jp/admin/kagawa` | `kagawa-admin` |
| 愛媛地本 | `https://jsdf-chiiki-events.jp/admin/ehime` | `ehime-admin` |
| 高知地本 | `https://jsdf-chiiki-events.jp/admin/kochi` | `kochi-admin` |
| 福岡地本 | `https://jsdf-chiiki-events.jp/admin/fukuoka` | `fukuoka-admin` |
| 佐賀地本 | `https://jsdf-chiiki-events.jp/admin/saga` | `saga-admin` |
| 長崎地本 | `https://jsdf-chiiki-events.jp/admin/nagasaki` | `nagasaki-admin` |
| 熊本地本 | `https://jsdf-chiiki-events.jp/admin/kumamoto` | `kumamoto-admin` |
| 大分地本 | `https://jsdf-chiiki-events.jp/admin/oita` | `oita-admin` |
| 宮崎地本 | `https://jsdf-chiiki-events.jp/admin/miyazaki` | `miyazaki-admin` |
| 鹿児島地本 | `https://jsdf-chiiki-events.jp/admin/kagoshima` | `kagoshima-admin` |
| 沖縄地本 | `https://jsdf-chiiki-events.jp/admin/okinawa` | `okinawa-admin` |

> ユーザー名は推奨例です（下記 B の `init` で作られる名前）。変えても構いません。

---

## B. 補助ツールでまとめて作る（推奨）

手作業（下記 2〜3）の代わりに、`scripts/admin-accounts.mjs` で作成・変更・停止ができます。
**パスワードは自動生成**し、ハッシュ化した値だけをアカウントのファイルに書きます。

```bash
# 1. 全50地本の地本管理者（pco_admin）を作る
node scripts/admin-accounts.mjs init
#    → admin-accounts.local.json（アカウント。ハッシュ化済み）
#    → admin-accounts-passwords.local.csv（初期パスワードの一覧）

# 2. 事務所の担当者を足す（例: 東京地本 渋谷の事務所責任者）
node scripts/admin-accounts.mjs add --user shibuya-mgr --org tokyo --office shibuya --role office_manager --display OP-SBY-01

# 3. 中身を確かめる（パスワード・ハッシュは表示しない）
node scripts/admin-accounts.mjs list
node scripts/admin-accounts.mjs check

# 4. Vercel に入れる値（ADMIN_ACCOUNTS_B64）を出す → 下記 4 の手順で設定・再デプロイ
node scripts/admin-accounts.mjs encode

# パスワードの再発行（旧ログインはすぐ無効）／停止／再開
node scripts/admin-accounts.mjs passwd --user tokyo-admin
node scripts/admin-accounts.mjs disable --user tokyo-admin
node scripts/admin-accounts.mjs enable --user tokyo-admin
```

- `*.local.json`・`*.local.csv` は **.gitignore 済み**（コミットされません）。それでも**共有フォルダ・チャット・メールに置かない**でください
- 初期パスワードの一覧（`…-passwords.local.csv`）は、各地本へ**安全な方法で渡し終えたら削除**してください
- 変更のたびに `encode` → Vercel の `ADMIN_ACCOUNTS_B64` を更新 → 再デプロイ、で反映されます（下記 4）
- 推奨の構成: 各地本に地本管理者（`pco_admin`）を1人以上。事務所ごとに担当者を置く場合は `office_manager`／`office_editor` を足す（`--office` 必須）
- 地本の初回ログイン後は、各地本の担当者が自分でパスワードを変える運用にする場合も、変更は管理者が `passwd` で行います（画面からのパスワード変更機能はありません）

---

## 0. 用語と前提（かんたん説明）
- **アカウント**: ログインに使う「ユーザー名」と「パスワード」、および「どこまで操作できるか（役割・担当範囲）」の組。
- アカウントは **1つの設定値**（`ADMIN_ACCOUNTS_B64`）にまとめて、ホスティング（Vercel）の「環境変数」に登録します。
- パスワードは**そのままでは保存せず**、計算した「ハッシュ」という形で保存します（漏れても元のパスワードが分かりにくいため）。
- 設定を変えたら**反映（再デプロイ）**が必要です。
- 作業には、リポジトリを手元に用意し、`node`（Node.js）が使える環境が必要です。

---

## 1. アカウント1件の中身
1つのアカウントは次の項目で表します（JSON という形式）。

| 項目 | 意味 | 例 |
|---|---|---|
| `user` | ログイン用ユーザー名 | `shibuya-pilot` |
| `pass` | パスワード（**ハッシュ化した文字列**。下記2で作る） | `scrypt$...` |
| `organization` | 担当する地本 | `tokyo` |
| `office` | 担当する事務所（事務所担当の場合は必須） | `shibuya` |
| `role` | 役割（できることの範囲。下表） | `office_manager` |
| `displayId` | 画面に出す表示用ID（**氏名は入れない**） | `OP-SBY-01` |
| `enabled` | 有効/無効（`false` で停止） | `true` |
| `sessionVersion` | ログインの世代番号（パスワード変更時に+1する） | `1` |

### 役割（role）でできること
| role | できること |
|---|---|
| `office_editor` | 自分の事務所のイベントを**下書き作成・編集**（公開・削除は不可） |
| `office_manager` | 自分の事務所のイベントを**追加・編集・削除・公開・上書き** |
| `pco_admin` | **自分の地本全体**を管理（＋監査履歴の閲覧） |
| `national_admin` | **全国**を管理 |
| `auditor` | 監査履歴の閲覧のみ |
| `system_admin` | システム設定の管理（イベント承認は原則しない） |

> 事務所担当（`office_editor`/`office_manager`）は **`office` を必ず設定**してください。未設定だと、安全のため何も操作できません（過去イベントの閲覧も含む）。

---

## 2. パスワードを「ハッシュ」に変換する
リポジトリのフォルダで、次のコマンドを実行します（`ここにパスワード` を実際のパスワードに置き換え）。

```bash
node -e "console.log(require('./shared/session.cjs').hashPassword('ここにパスワード'))"
```

`scrypt$...` で始まる長い文字列が出ます。これを `pass` に貼り付けます。
（実行のたびに値は変わりますが、どれも同じパスワードで検証できます。）

---

## 3. アカウントの作り方（記入例）

> ⚠️ **この例は説明・試験専用です。本番では使用しないでください。**
> `user` と `pass` は**プレースホルダ**（穴埋め用の目印）であり、そのままでは**ログインできません**。
> 次の方針を守ってください。
> - 記載のユーザー名・パスワードは**説明用の例**であり、**本番環境では使用しない**。
> - 本番では**新しいユーザー名とパスワード**を作成する。
> - 試験用アカウントは**本番移行前に無効化または削除**する。
> - 試験用パスワードを**本番へ使い回さない**。
> - **平文パスワードをリポジトリ・資料・チャットへ保存しない**。
> - 本番の `pass` には**新規生成した scrypt ハッシュ**（手順2）を設定する。

### 3-1. アカウント定義（JSON）
`accounts.json` というファイルを作り、次のように書きます（事務所責任者1名の例）。
`<...>` の部分は、ご自身で決めた値・手順2で生成したハッシュに置き換えてください。

```json
[
  {
    "user": "<試験用ユーザー名>",
    "pass": "<手順2で生成したscryptハッシュ>",
    "organization": "tokyo",
    "office": "shibuya",
    "role": "office_manager",
    "displayId": "OP-SBY-01",
    "enabled": true,
    "sessionVersion": 1
  }
]
```

> `user`・`pass` は**そのままではログインできない目印**です。`pass` には手順2で作った `scrypt$...` を貼り付けます（**平文パスワードは書かない**）。
> 複数人で使う場合は、`{ ... }` を増やして並べます（事務所担当を増やす、地本管理者 `pco_admin` を1人置く、など）。

### 3-2. 1つの設定値に変換（base64）
`accounts.json` を、環境変数に入れる形（base64）へ変換します。

```bash
node -e "console.log(Buffer.from(require('fs').readFileSync('accounts.json','utf8')).toString('base64'))"
```

出てきた長い文字列が `ADMIN_ACCOUNTS_B64` に設定する値です。
**`accounts.json` と base64 文字列は秘密情報です。** 共有リポジトリや公開資料には保存しないでください。

---

## 4. ホスティング（Vercel）へ設定して反映
1. Vercel のプロジェクト → **Settings → Environment Variables**。
2. `ADMIN_ACCOUNTS_B64` を追加（または更新）し、手順3-2の値を貼り付け（Production 環境）。
3. 保存後、**再デプロイ**して反映（GitHub の Actions「フロントエンド デプロイ」を実行、または対象を更新して push）。
4. 反映後、各地本の運営画面（上記 A の URL。共通の `/admin.html` でも可）でログインを確認。

> 設定値（実際のユーザー名・パスワード・base64）は、画面共有・チャット・スクリーンショットに残さないようご注意ください。

---

## 5. パスワードを変更する
1. 手順2で**新しいパスワードのハッシュ**を作る。
2. `accounts.json` の該当アカウントの `pass` を新しいハッシュへ差し替える。
3. **`sessionVersion` を 1 増やす**（例: `1` → `2`）。← これで、古い端末のログインがすぐ使えなくなります。
4. 手順3-2・4 で base64 化 → Vercel 更新 → 再デプロイ。

---

## 6. ユーザー名の変更 / アカウント追加 / 停止
- **ユーザー名変更**: `user` を書き換え（必要なら `displayId` も）。手順3-2・4で反映。
- **追加**: 配列に `{ ... }` を1件足す。手順3-2・4で反映。
- **停止（無効化）**: 該当アカウントの `enabled` を `false` にして反映。→ ログインできなくなり、既存のログインも無効になります。

---

## 7. ログイン確認
- `https://（本番URL）/admin/<地本>`（例: `/admin/tokyo`）または `/admin.html` を開く。
- ユーザー名・パスワードでログイン。
- ログイン後、画面の「操作者・役割・権限」表示が想定どおりか確認。
- 担当範囲外（他事務所・他地本）が見えない・操作できないことを確認。
- 確認後はログアウト。

---

## 8. 注意事項（試験運用・安全のために）
- 本書の記入例は**説明・試験専用であり、本番利用は禁止**です。本番では**新しいユーザー名とパスワード**を作成してください。
- **試験用アカウントは本番移行前に無効化（`enabled:false`）または削除**してください。
- 本番の `pass` には**新規生成した scrypt ハッシュ**（手順2）を設定し、**試験用パスワードを本番へ使い回さない**でください。
- **平文パスワードをリポジトリ・資料・チャットへ保存しない**でください。
- パスワードは**使い回さない**。普段使っている個人のパスワードは使わない。
- パスワード・base64・`accounts.json` を**メール／チャット／公開資料に残さない**。受け渡しは口頭やパスワード管理ツール等、安全な方法で。
- 旧式の共通パスワード（`ADMIN_SECRET`）は**使わない**（既定で無効）。アカウント方式（本書）を使ってください。
- パスワードが漏れた疑いがあるときは、手順5で変更し `sessionVersion` を上げてください。
- これらの設定・変更は、**正規の運営担当者ご自身**が行ってください（開発者は手順の支援のみ。実際のパスワードは開発者へ共有しないでください）。

> 関連資料: 詳細な運用は [OPERATIONS.md](../OPERATIONS.md)、環境変数・反映手順は [DEPLOY.md](../DEPLOY.md)、安全設計は [SECURITY.md](../SECURITY.md) を参照。
