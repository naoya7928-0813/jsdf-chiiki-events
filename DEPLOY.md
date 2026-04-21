# デプロイ手順書

## 前提条件

| ツール | バージョン |
|--------|-----------|
| Node.js | 20 以上 |
| npm | 10 以上 |
| Git | 任意 |
| Vercel CLI（任意） | `npm i -g vercel` |

---

## Step 1 — リポジトリを GitHub に作成・プッシュ

```bash
# プロジェクトディレクトリへ移動
cd jsdf-chiiki-events

# Git 初期化
git init
git add .
git commit -m "initial commit"

# GitHub でリポジトリを作成してから以下を実行
git remote add origin https://github.com/YOUR_USERNAME/jsdf-chiiki-events.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Google Apps Script を準備・デプロイ

### 2-1. GAS プロジェクトを作成

1. [script.google.com](https://script.google.com) にアクセス
2. 「新しいプロジェクト」→ プロジェクト名を `地本イベント` などに設定

### 2-2. doGet を実装

```javascript
function doGet(e) {
  const sheet = SpreadsheetApp.openById('YOUR_SPREADSHEET_ID');
  // スプレッドシートからデータを取得する処理を実装
  // （下記のサンプルはハードコードの例）

  const data = {
    kanagawa: [
      {
        id: "k-01",
        date: "2026-04-25",
        weekday: "土",
        title: "自衛官候補生 募集説明会",
        place: "横浜地域事務所",
        address: "横浜市中区山下町1-2",
        time: "13:30 – 15:30",
        category: "説明会",
        tag: "要予約",
        url: ""
      }
      // ... 続く
    ],
    tokyo: [
      // ... 東京地本のイベント
    ],
    updatedAt: Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm')
  };

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 2-3. ウェブアプリとしてデプロイ

1. GAS エディタ → 「デプロイ」→「新しいデプロイ」
2. 種類：「ウェブアプリ」
3. 次のユーザーとして実行：「自分」
4. アクセスできるユーザー：「全員」
5. 「デプロイ」→ 表示される URL をコピー（Step 4 で使用）

> **URL の形式**:  
> `https://script.google.com/macros/s/AKfycb.../exec`

---

## Step 3 — Vercel にプロジェクトをインポート

### 方法A: Vercel ダッシュボード（推奨）

1. [vercel.com/new](https://vercel.com/new) にアクセス
2. GitHub リポジトリ `jsdf-chiiki-events` を選択
3. Framework Preset: **Vite** が自動検出されます
4. **「Deploy」は押さずに** 次のステップへ（環境変数を先に設定）

### 方法B: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

---

## Step 4 — 環境変数を設定

### Vercel ダッシュボードから設定

1. Vercel プロジェクトページ → **Settings** → **Environment Variables**
2. 以下を追加:

| Key | Value | Environment |
|-----|-------|-------------|
| `GAS_URL` | `https://script.google.com/macros/s/.../exec` | Production, Preview, Development |

3. 「Save」

### ローカル開発時

```bash
cp .env.example .env.local
# .env.local を編集:
# GAS_URL=https://script.google.com/macros/s/.../exec
```

---

## Step 5 — ビルド & デプロイ

### Vercel ダッシュボードから（自動）

環境変数設定後、「Deploy」ボタンを押すだけ。

以降は `git push origin main` するたびに自動デプロイされます。

### 手動デプロイ

```bash
# 依存パッケージをインストール
npm install

# ビルド（アイコン生成 → Vite ビルド の順で実行）
npm run build

# Vercel CLI でデプロイ
vercel --prod
```

---

## Step 6 — PWA をiPhoneのホーム画面に追加

1. iPhone の Safari でデプロイ先 URL を開く
2. 画面下部の「共有」ボタン（□↑）をタップ
3. 「ホーム画面に追加」をタップ
4. 名前を確認して「追加」

これでアプリアイコンがホーム画面に表示され、タップするとフルスクリーンのアプリ風表示になります。

---

## GAS URL の差し替え手順

GAS を再デプロイして URL が変わった場合:

1. Vercel ダッシュボード → **Settings** → **Environment Variables**
2. `GAS_URL` の値を新しい URL に更新
3. Vercel ダッシュボード → **Deployments** → 最新デプロイを「Redeploy」

> コードの変更は**不要**です。環境変数の更新のみで反映されます。

---

## トラブルシューティング

### データが表示されない（サンプルデータが表示される）

- `GAS_URL` が正しく設定されているか確認
- GAS のデプロイ設定で「アクセスできるユーザー：全員」になっているか確認
- Vercel のデプロイログ（`/api/events` のレスポンス）を確認

### ビルドでアイコン生成に失敗する

```bash
# sharp の再インストール
npm rebuild sharp
npm run build
```

### PWA が更新されない

- ブラウザのサービスワーカーをリセット:  
  Safari：設定 → Safari → 詳細 → Webサイトデータを削除  
  Chrome：DevTools → Application → Service Workers → Unregister

### CORS エラーが出る

Vercel 関数 (`/api/events`) を経由しているため通常は発生しません。  
GAS に直接アクセスしている場合は `/api/events` 経由に変更してください。

---

## デプロイ後の確認チェックリスト

- [ ] トップページが表示される
- [ ] 神奈川 / 東京 タブが切り替わる
- [ ] イベントカードをタップして詳細画面が開く
- [ ] 設定画面でカラーテーマが変更できる
- [ ] iPhone Safari で「ホーム画面に追加」できる
- [ ] ホーム画面アイコンからアプリ風表示で起動する
- [ ] 5分待つとデータが自動更新される（更新日時が変わる）
- [ ] オフライン状態でも画面が表示される（Service Worker キャッシュ）
