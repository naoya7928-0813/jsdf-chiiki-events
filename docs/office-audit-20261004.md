# 募集窓口の全国公式照合（2026-10-04）

**未完了・レビュー用。担当区域等が未確定の窓口が残るため、このPRはマージしない。**

ユーザー指定の「名称・住所・電話・URL・担当区域を確定してから修正」を守り、確定できたエントリのみ offices.json に反映した。未確定の名称修正・追加は保留し、既存の未確定エントリは変更していない。全国照合済みは全項目確定済みという意味ではない。

- 基準：募集窓口 315 件、50地本。
- このドラフト：募集窓口 352 件、50地本。
- 追加 59 件、一覧非掲載の削除 22 件、既存更新 48 件。
- 個別情報確認記録 130 件（反映対象 107 件、保留 23 件）。
- 公式掲載の候補集合は 365 件。愛知の追加拠点など運用形態が不明な候補を含むため、全国確定件数とは扱わない。

## 2026-10-05の本部・徳島修正の取り込み

PR #86で全国50本部と徳島5窓口の現行連絡先をmasterへ反映済み。このドラフトにも同じ修正を取り込み、旧住所・旧電話へ戻らないようにした。現masterの募集窓口は317件で、このドラフトの352件との差分は追加57件・削除22件。上記315件からの59件追加は最初の監査基準からの履歴である。

名称差分候補の23件保留に加えて、既存窓口の詳細な項目照合も継続する。ドラフトでも住所・電話・担当区域のいずれかの空欄が176件残り、IDと不足項目をJSONへ保存した。名称が一覧と一致しているだけでは連絡先の全項目確定を保証しない。

## 取得・採用方法

一覧ページを優先し、差分のある窓口のみ個別ページ・区域図・所員紹介画像・PDFを確認。単一リクエストを原則2秒以上空け、取得済み文書を再利用。403となった中央募集サイトのActions監査は再実行していない。CIは保存されたJSONだけを検査し公式サイトへアクセスしない。

名称の不一致だけから正式な改称・廃止・統合を断定しない。旧データにはAI補完由来の不正確な候補が含まれる。一覧にない窓口の削除理由は「現行公式一覧への非掲載」として記録し、廃止日などは推測しない。

座標は新住所で国土地理院住所検索を実行。住所代表点は建物入口と一致するとは限らないためlatApprox=trueとする。沖縄・愛知の公式埋め込み地図も照合し、中心座標ではなく窓口マーカーを取得したが、これらの未確定窓口は本番データへ反映していない。

## 再確認で判明したこと

- 東京の渋谷募集案内所は現行。五反田はHTMLコメント内、代々木は現行一覧で確認できないため追加しない。東京は19窓口の候補。
- 兵庫の西神戸募集案内所・青野原分駐所は現行。神戸西地域事務所・明石地域事務所へ置き換えない。13件を保持。
- 埼玉は5地域事務所の紹介ページ内に募集案内所・分駐所がある。トップページでも12窓口を列挙しており、子窓口を削除しない。
- 千葉の「成田・旭地域事務所」は共通見出し。成田と旭にそれぞれ住所・電話・担当区域があるため別エントリを保持する。千葉募集案内所は2026-09-01更新画像を優先し、共通フッターの「千葉募集事務所」に置換しない。
- 大阪の3地区隊は一覧の区域見出しで、独立した採用相談窓口としての電話・担当区域を確定できないため別エントリを増やさない。
- 愛知は一覧・トップページでは12事務所。金山個別ページは「名古屋南募集案内所」も掲載し、地図上は野並募集案内所。追加拠点としての運用形態と担当区域を保留する。
- 群馬は一覧と個別ページで区域が食い違う。前橋（9月28日更新）、高崎（10月1日更新）、沼田（9月3日更新）の各ページ上部・連絡先の担当地域を採用し、旧所員紹介や一覧から区域を足さない。
- 八王子の電話は個別ページの042-644-8157を採用（一覧は042-645-8050）。
- 二戸は所員紹介の一部が準備中。掲載済み区域の合算を全域と見なさず、エントリの更新を保留。

## 地本別件数

| 地本 | 基準 | ドラフト | 公式掲載候補 | 確認元 |
|---|---:|---:|---:|---|
| 福井 | 4 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/fukui/contents/6-aboutus/6-aboutus.html) |
| 群馬 | 6 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/gunma/bosyuannai.html) |
| 石川 | 4 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/ishikawa/guide/) |
| 岩手 | 8 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/iwate/iwatechihon/) |
| 鹿児島 | 6 | 9 | 9 | [公式一覧](https://www.mod.go.jp/pco/kagoshima/about/access/) |
| 高知 | 4 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/kochi/access.html) |
| 熊本 | 6 | 11 | 11 | [公式一覧](https://www.mod.go.jp/pco/kumamoto/about/access/) |
| 京都 | 6 | 7 | 7 | [公式一覧](https://www.mod.go.jp/pco/kyoto/jimusho/jieikan/) |
| 新潟 | 7 | 7 | 7 | [公式一覧](https://www.mod.go.jp/pco/niigata/HP/access.html) |
| 岡山 | 4 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/okayama/gide/information.html) |
| 佐賀 | 4 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/saga/about/) |
| 札幌 | 15 | 15 | 15 | [公式一覧](https://www.mod.go.jp/pco/sapporo/contact.html) |
| 静岡 | 10 | 10 | 10 | [公式一覧](https://www.mod.go.jp/pco/sizuoka/office/) |
| 栃木 | 3 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/tochigi/recruit.html) |
| 徳島 | 3 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/tokushima/) |
| 和歌山 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/wakayama/about/) |
| 山形 | 4 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/yamagata/) |
| 山梨 | 3 | 3 | 3 | [公式一覧](https://www.mod.go.jp/pco/yamanashi/honbu.html#shozaichi) |
| 神奈川 | 8 | 12 | 12 | [公式一覧](https://www.mod.go.jp/pco/kanagawa/kouho/chihon/pco.html) |
| 東京 | 12 | 19 | 19 | [公式一覧](https://www.mod.go.jp/pco/tokyo/anamachi/) |
| 埼玉 | 8 | 8 | 12 | [公式一覧](https://www.mod.go.jp/pco/saitama/office/) |
| 千葉 | 8 | 9 | 9 | [公式一覧](https://www.mod.go.jp/pco/chiba/access.html) |
| 茨城 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/ibaraki/boshujimusho.html) |
| 旭川 | 7 | 8 | 8 | [公式一覧](https://www.mod.go.jp/pco/asahikawa/recruit.html) |
| 帯広 | 5 | 5 | 6 | [公式一覧](https://www.mod.go.jp/pco/obihiro/info_contact.html) |
| 函館 | 4 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/hakodate/about/) |
| 青森 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/aomori/boshu/office.html) |
| 秋田 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/akita/asset/about/contact.html) |
| 宮城 | 7 | 7 | 8 | [公式一覧](https://www.mod.go.jp/pco/miyagi/miyagitop/office.html) |
| 福島 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/fukushima/workcontent/workcontent.html?checkparam=jimusho_inf_content) |
| 富山 | 3 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/toyama/content/07-access/07-access.html) |
| 長野 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/nagano/) |
| 岐阜 | 5 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/gifu/office/office.html) |
| 愛知 | 12 | 12 | 13 | [公式一覧](https://www.mod.go.jp/pco/aichi/contact/list.html) |
| 三重 | 5 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/mie/regional/) |
| 滋賀 | 4 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/shiga/about/#sec3) |
| 大阪 | 13 | 15 | 15 | [公式一覧](https://www.mod.go.jp/pco/osaka/about/office/madoguti.html) |
| 兵庫 | 13 | 13 | 13 | [公式一覧](https://www.mod.go.jp/pco/hyogo/about/sosiki.html) |
| 奈良 | 4 | 4 | 4 | [公式一覧](https://www.mod.go.jp/pco/nara/guide/about/) |
| 鳥取 | 2 | 2 | 3 | [公式一覧](https://www.mod.go.jp/pco/tottori/) |
| 島根 | 6 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/shimane/consultation/branch.html) |
| 広島 | 7 | 7 | 7 | [公式一覧](https://www.mod.go.jp/pco/hiroshima/office/) |
| 山口 | 6 | 7 | 7 | [公式一覧](https://www.mod.go.jp/pco/yamaguchi/jimusho.html) |
| 香川 | 2 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/kagawa/pco/access.html) |
| 愛媛 | 4 | 5 | 5 | [公式一覧](https://www.mod.go.jp/pco/ehime/acsess.html) |
| 福岡 | 13 | 12 | 12 | [公式一覧](https://www.mod.go.jp/pco/fukuoka/recruit/contact/) |
| 長崎 | 10 | 10 | 10 | [公式一覧](https://www.mod.go.jp/pco/nagasaki/madoguchi/) |
| 大分 | 5 | 6 | 6 | [公式一覧](https://www.mod.go.jp/pco/oita/06_office.html) |
| 宮崎 | 4 | 4 | 8 | [公式一覧](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 沖縄 | 5 | 5 | 6 | [公式一覧](https://www.mod.go.jp/pco/okinawa/about.html) |

## 保留エントリ

以下は名称等の候補を記録したもの。未確定分を空欄にして本番データへ追加することはしていない。公式ページの非掲載から担当区域を推測せず、旧市町村一覧や学校だけの担当一覧を現在の全担当区域と見なさない。

| 地本 | 現行候補 | 未確定事項 | 公式ページ |
|---|---|---|---|
| 帯広 | 帯広募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/obihiro/info_contact.html) |
| 岩手 | 二戸地域事務所 | 所員紹介の一部が準備中で担当区域が網羅されていない | [確認元](https://www.mod.go.jp/pco/iwate/iwatechihon/) |
| 宮城 | 仙台駅東口募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyagi/miyagitop/office.html) |
| 宮崎 | 宮崎募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 都城地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 延岡出張所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 日向地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 新田原分駐所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 小林地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 宮崎 | 高千穂連絡所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 大阪 | 高槻地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/osaka/about/office/takatsuki.html) |
| 埼玉 | 秩父地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/saitama/office/chichibu-office.html) |
| 埼玉 | 大宮分駐所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/saitama/office/saitama-office.html) |
| 埼玉 | 入間分駐所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/saitama/office/iruma-office.html) |
| 埼玉 | 熊谷分駐所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/saitama/office/kumagaya-office.html) |
| 鳥取 | 鳥取募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/tottori/content/jimusyo/toubusyo.html) |
| 沖縄 | 沖縄募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 沖縄 | 島尻募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 沖縄 | 宮古島出張所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 沖縄 | 石垣出張所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 沖縄 | 名護地域事務所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 沖縄 | 那覇募集案内所 | 担当区域を現在の公式公開資料で確定できない | [確認元](https://www.mod.go.jp/pco/okinawa/about.html) |
| 愛知 | 名古屋南募集案内所 | 金山個別ページに掲載されるが一覧12事務所には無く、地図は野並の名称。運用形態・担当区域を要確認 | [確認元](https://www.mod.go.jp/pco/aichi/contact/kanayama/sho-kanayama.html) |

## 次に必要な確認

- 保留エントリの担当区域は、公表された最新の管轄図・担当一覧、または地本の公式回答が必要。問い合わせ送信は行っていない。
- 大阪の募集相談員表は守口・阿倍野・天王寺・なんばの区域確認に利用したが、茨木・谷九等の旧名称を含むため高槻への区域の引き継ぎを断定しない。
- 埼玉のトップは「どの窓口でも対応」とするが、それを窓口固有の担任区域と同一視しない。HTMLコメント内の所員担当情報は公表情報に数えない。
- 名称・住所等の確認と担当区域の確認は分けて記録している。詳細な確認値・座標取得結果・旧名対応は同名のJSONを参照。取得した一覧・個別ページの索引は `office-audit-20261004-sources.json` に保存している。
- 保留が解消した後、全国の確定件数を再集計し、CI通過後にmasterへマージする。

## 検証

ローカルでは500テスト成功（skip 0）、ビルド成功、スクレイパー構文、窓口整合性、既存イベント品質チェック（エラー0・既存警告108）、本番依存の脆弱性監査（0件）が通過。PR Checkの結果はPRに記載する。保存JSONの整合性チェックは手作業の公式照合完了を保証しない。
