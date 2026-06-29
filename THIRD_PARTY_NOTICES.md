# サードパーティ通知（THIRD_PARTY_NOTICES.md）

本プロジェクトは以下の主なオープンソースソフトウェアを利用しています。各ライブラリの
著作権・ライセンスは各提供元に帰属します。下表は主要な直接依存の概要です（推移的依存を
含む正確な一覧は、デプロイ時に `npm ls --all` や `license-checker` 等で生成してください）。

## フロントエンド / API（ルート package.json）

| パッケージ | 用途 | ライセンス（宣言） |
|---|---|---|
| react / react-dom | UI フレームワーク | MIT |
| vite / @vitejs/plugin-react | ビルド | MIT |
| vite-plugin-pwa / workbox-* | PWA・Service Worker | MIT |
| @upstash/redis | Redis クライアント（セッション・キャッシュ・通知） | MIT |
| web-push | Web Push 送信 | MPL-2.0 |
| openai | OCR/AI 補助クライアント | Apache-2.0 |
| dotenv | 環境変数読込 | BSD-2-Clause |
| sharp | アイコン画像生成（devDependency） | Apache-2.0 |

## スクレイパー（scraper/package.json）

| パッケージ | 用途 | ライセンス（宣言） |
|---|---|---|
| playwright-extra / puppeteer-extra-plugin-stealth | ブラウザ自動操作・回避 | MIT |
| cheerio | HTML 解析 | MIT |
| iconv-lite | 文字コード変換 | MIT |
| pdf-parse | PDF テキスト/画像抽出 | MIT |
| （OCR 各種・onnxruntime 等） | OCR | 各提供元のライセンス |

## 外部サービス / データ
- Open-Meteo（気象データ、CC BY 4.0）
- 国土地理院 住所検索API（座標データ）
- Google Fonts（Noto Sans JP / Noto Serif JP / IBM Plex Mono、SIL Open Font License 1.1）
- ntfy.sh（通知配信）

ライセンス全文は各パッケージの配布物（node_modules 内 LICENSE）および各サービスの
サイトを参照してください。正式提供時は、上記を `license-checker --production --json` 等で
機械生成した最新の一覧に置き換えることを推奨します。
