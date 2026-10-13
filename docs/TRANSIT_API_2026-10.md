# 交通経路API の比較（2026-10-13 調査）

イベント詳細の「公共交通機関でのアクセス」を作るにあたり、国内の鉄道・バス経路を返す API を公式資料で調べた。
**料金がかかる API は契約・課金を伴うため、承認があるまで呼び出していない。**

## 比較

| 項目 | Google Maps Platform（Routes / Directions） | Google マップ Maps URLs | 駅すぱあと API（ヴァル研究所） | NAVITIME API（ナビタイムジャパン） | 国土数値情報（鉄道データ） |
|---|---|---|---|---|---|
| 種類 | 経路API | 経路検索ページへのリンク | 経路API | 経路API | 駅・路線のオープンデータ |
| 日本の鉄道経路 | **対応表に日本の公共交通の記載なし**。開発者フォーラム・国内記事で transit が ZERO_RESULTS になる報告あり | ○（Google マップ本体で表示） | ○ | ○（トータルナビ） | —（経路は無い） |
| バス | 同上 | ○（Google マップ本体の対応範囲） | プランによる（スタンダードで公共交通データ） | ○ | — |
| 徒歩 | ○（対応表で Walking Directions ⬤） | ○ | — | ○（ドアtoドア） | — |
| 駅検索 | Places API（有料） | — | ○ | ○ | ○（全国約9千駅の位置） |
| 料金 | 従量課金（無料枠あり。SKU別） | **無料・APIキー不要**（公式に「Maps URLs に API キーは不要」） | フリー: 0円（簡易経路探索＝結果は「駅すぱあと for Web」へのリンク）／買い切り: 5,000回 5,500円・1万回 11,000円・2万回 22,000円／スタンダード: 初期費用＋従量（金額は問い合わせ）／90日無料評価版あり | 料金は公開ページに記載なし（問い合わせ）。90日無料お試しあり。RapidAPI 経由の「NAVITIME Route(totalnavi)」も提供 | 無料（CC BY 4.0） |
| 商用・非商用 | 利用規約に従う | Google マップ利用規約 | 契約による（ドメイン単位） | 契約による | 商用可（出典表示が必要） |
| キャッシュ・保存の制限 | Google Maps Platform 規約に制限あり | 該当なし（リンクのみ） | 公開資料で確認できず（要確認） | 公開資料で確認できず（要確認） | 制限なし（加工・再配布可） |
| キーの管理 | サーバー側で保持が原則 | 不要 | クエリの `key`。サーバー側で保持する | 契約時に発行。サーバー側で保持する | 不要 |

## 採用した構成（承認前の既定）

1. **最寄り駅の候補**: 国土数値情報（鉄道データ N02 2025年度版）から全国の駅位置を作り（`scripts/build-stations.mjs` → `public/data/stations.json`）、
   端末内で直線距離の近い順に**複数候補**を出して利用者に選ばせる。距離は「直線距離」と明記する（徒歩経路の距離・時間ではない）。
   会場側も同じデータで候補を出し、運営が「推奨最寄り駅」「入場口の座標」を設定していればそれを優先する。
2. **経路**: Google マップの経路検索ページ（Maps URLs・`travelmode=transit`）へ案内する。
   駅から会場（入場口）までの徒歩経路も同じく `travelmode=walking` で案内する。運賃・所要時間は**表示しない**（推測で作らない）。
3. **経路APIの差し替え口**: `/api/transit` を用意し、サーバー側の環境変数で経路APIを接続できるようにした。
   既定は未接続で `{available:false, reason:'not_configured'}` を返し、画面は 2 の案内に切り替える。
   月間上限（`TRANSIT_MONTHLY_LIMIT`）・タイムアウト（8秒）・IPごとのレート制限を接続前から入れてある。

## 経路APIを接続する場合（要承認）

| 案 | 内容 | 費用の目安 | 作業 |
|---|---|---|---|
| A. 駅すぱあと 買い切り | 経路探索（平均待ち時間探索のみ。時刻表探索なし） | 5,000回 5,500円〜（Amazon で購入） | `/api/transit` にアダプタを追加（応答を `shared/transit.cjs` の `sanitizeRoutes` の形へ変換） |
| B. 駅すぱあと スタンダード | 全機能（時刻表・範囲探索・バス等の公共交通データ） | 初期費用＋従量（要見積） | 同上。90日評価版で検証してから契約 |
| C. NAVITIME API | 公共交通＋徒歩のドアtoドア経路・運賃 | 要見積（90日無料お試しあり） | 同上 |

いずれも **API キーは Vercel の環境変数に置き、ブラウザには出さない**。キャッシュ・保存の可否は契約前に各社へ確認すること。

## 出典

- Google Maps Platform カバレッジ: https://developers.google.com/maps/coverage （日本: Walking Directions ⬤、公共交通は一覧に含まれない旨の注記）
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started （「Maps URLs に Google API キーは不要」）
- 日本で transit が ZERO_RESULTS になる報告: https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267 ・ https://zenn.dev/nnnwa/articles/6974e3799829ca
- 駅すぱあと API プラン: https://api-info.ekispert.com/plan/
- NAVITIME API: https://api-sdk.navitime.co.jp/ ・ RapidAPI: https://rapidapi.com/navitimejapan-navitimejapan/api/navitime-route-totalnavi
- 国土数値情報（鉄道データ）: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html （2020年以降 CC BY 4.0）

※ Google の経路API で日本の公共交通が使えないことは、API キーが無いため**実際の呼び出しでは確認していない**（公式の対応表と公開の報告に基づく）。
