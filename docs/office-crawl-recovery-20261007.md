# 窓口巡回の取得修正・再確認（2026-10-07）

全国の項目照合は未完了。確定186件、未確定23候補、既存の情報不足97件（重複あり）。今回、担当区域などの不明情報を推測で埋めたり、窓口一覧の照合完了扱いにはしていない。

## 元の巡回結果

[run 37549392641](https://github.com/naoya7928-0813/jsdf-chiiki-events/actions/runs/37549392641) はHTML412 URL取得・14 URL失敗・未巡回0。ジョブの成功は全資料の取得成功を意味しない。

## 修正内容

- 大阪の3旧探索URLを、公式窓口ページからリンクされる説明会一覧 `recruit/session/menu.html` へ置換。
- 石川の旧演奏会URLを現行 `event29/index.html` へ置換。
- 長崎の3つの壊れた相対リンクを現行の公式URLへ置換。
- 栃木の404となる旧事務所URL3件を、現行の窓口一覧・募集案内・イベント一覧へ切替。
- 旭川の「www.mod.go.jp/…」というスキームなしリンクを絶対URLとして解決。別組織の募集サイトを地本配下の子ページとして誤巡回しない。
- 宮城の既存7窓口にも現行公式イベントHTMLを明示登録。読取中の画面遷移は受信済みHTMLへフォールバックし、追加HTTPは発行しない。
- 高円寺は現在HTTP200。ロード待機ではなくDOM取得を基準にし、読取済みレスポンスを利用。
- 江東の個別 `event.html` は本番で403。巡回の探索先を公式共通カレンダーへ切替。**原ページの復旧や個別詳細の取得成功とは扱わない。** 共通カレンダーの登録内容と前回情報を引き継ぐ既存経路を保つ。
- OCR候補は実行番号と処理上限で開始位置をずらす。先頭2〜3資料だけが永久に選ばれる問題を解消し、既存の条件付きGET・内容ハッシュによるOCRキャッシュを維持する。同一実行中は読取失敗も含めURL単位で結果を共有し、同じ資料への追加取得を抑える。
- 低優先でOCR対象外にした資料を未処理候補へ加算しない。期限・上限による未処理は継続して記録する。
- 毎回の巡回サマリに全国窓口の未確定候補・不足件数を併記する。HTML巡回成功を全国照合完了と誤認しない。

## 低負荷の再確認

12の現行公式HTMLを単一リクエスト・2秒以上の間隔で取得し、全件HTTP200を確認。HTML取得・URL確認であり、OCR成功の証明ではない。

| 対象 | 確認URL |
|---|---|
| 大阪なんば | https://www.mod.go.jp/pco/osaka/about/office/nanba.html |
| 大阪天王寺 | https://www.mod.go.jp/pco/osaka/about/office/tennouji.html |
| 大阪募集種目 | https://www.mod.go.jp/pco/osaka/recruit/index.html |
| 大阪説明会 | https://www.mod.go.jp/pco/osaka/recruit/session/menu.html |
| 宮城イベント | https://www.mod.go.jp/pco/miyagi/miyagitop/event.html |
| 栃木イベント | https://www.mod.go.jp/pco/tochigi/event.html |
| 石川イベント | https://www.mod.go.jp/pco/ishikawa/event29/index.html |
| 長崎募集案内 | https://www.mod.go.jp/pco/nagasaki/jieitai-naritai.html |
| 長崎援護 | https://www.mod.go.jp/pco/nagasaki/recruit/index.html |
| 長崎合同説明会 | https://www.mod.go.jp/pco/nagasaki/recruit/setsumeikai.html |
| 高円寺 | https://www.mod.go.jp/pco/tokyo/kouenji/ |
| 東京共通カレンダー | https://www.mod.go.jp/pco/tokyo/event2/index.html |

ローカル環境には実行可能なChromiumがないため、修正後PlaywrightとOCRの実再確認は専用Actionsで行う。対象は現行URLのみ、OCR上限は全体2資料。イベントデータ更新・デプロイ・利用者通知は行わず、全結果を成果物へ保存する。取得失敗を検出したらジョブも失敗とする。

## 未解決

- 未確定23候補と既存97件の情報不足。公式資料の担当区域が非掲載・一部準備中などで確定できないものは、追加・改称せず保持している。
- 江東個別ページや画像などの403。公式共通カレンダーへ切替えても、原資料の読取成功には数えない。
- OCR候補の全件一括処理。処理上限を維持して各回の巡回で順番に補完し、期限・エンジン不調等による見送りはレポートで確認する。

## CIで確認した依存更新

本番依存のsharpを0.35.5へ更新し、既存の依存上書きも合わせた。@vercel/ogのメジャー更新は行わず、root・scraperの双方で修正版を使用する。本番依存のnpm auditは脆弱性0件。公式情報: https://github.com/advisories/GHSA-wq5f-xc86-pv6w 。
