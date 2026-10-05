# 地本・徳島募集窓口の連絡先再照合（2026-10-05）

全国50地本の本部所在地・電話・名称・公式URLと、徳島の5募集窓口を確認して修正した。全国募集窓口の詳細照合は完了していない。

各地本の現行掲載を最優先し、陸上自衛隊の[地本一覧](https://www.mod.go.jp/gsdf/station/pco/)を補助に使用した。中央一覧は岩手・山形・福島・山梨・高知などの旧住所、三重等の旧電話が残るため、一覧の一括転載はしていない。

徳島の阿南・吉野川・徳島募集案内所は共通ヘッダー/フッターにある本部連絡先を誤採用していた。本文の「事務所のご案内」を使用し、未登録の三好・鳴門を追加した。

イベント詳細の `src/config.js` と近隣窓口の `offices.json` は同じ電話番号に統一し、50地本の一致を回帰テストで確認する。電話は代表番号または公式掲載の募集課番号。国土地理院の住所検索による座標は代表点であり、建物入口と同じとは限らないため `latApprox=true` として保持する。長野は検索に大字名を補足し、市代表点を採用しない。

## 確認済み情報

| 名称 | 住所 | 電話 | 確認元 |
|---|---|---|---|
| 自衛隊札幌地方協力本部 | 北海道札幌市中央区北4条西15丁目1 | 011-631-5472 | [公式](https://www.mod.go.jp/pco/sapporo/contact.html) |
| 自衛隊函館地方協力本部 | 北海道函館市広野町6-25 | 0138-53-6241 | [公式](https://www.mod.go.jp/pco/hakodate/about/) |
| 自衛隊旭川地方協力本部 | 北海道旭川市春光町国有無番地 | 0166-51-6060 | [公式](https://www.mod.go.jp/pco/asahikawa/recruit.html) |
| 自衛隊帯広地方協力本部 | 北海道帯広市西14条南14丁目4 | 0155-23-5882 | [公式](https://www.mod.go.jp/pco/obihiro/info_contact.html) |
| 自衛隊青森地方協力本部 | 青森県青森市長島1丁目3-5 青森第2地方合同庁舎2F | 017-776-1594 | [公式](https://www.mod.go.jp/pco/aomori/boshu/office.html) |
| 自衛隊岩手地方協力本部 | 岩手県盛岡市内丸7-25 盛岡合同庁舎2階 | 019-623-3236 | [公式](https://www.mod.go.jp/pco/iwate/iwatechihon/) |
| 自衛隊宮城地方協力本部 | 宮城県仙台市宮城野区五輪1丁目3-15 仙台第3合同庁舎1F | 022-295-2612 | [公式](https://www.mod.go.jp/pco/miyagi/miyagitop/office.html) |
| 自衛隊秋田地方協力本部 | 秋田県秋田市山王4丁目3-34 | 018-823-5404 | [公式](https://www.mod.go.jp/pco/akita/asset/about/contact.html) |
| 自衛隊山形地方協力本部 | 山形県山形市緑町1-5-48 山形地方合同庁舎 | 023-622-0712 | [公式](https://www.mod.go.jp/pco/yamagata/) |
| 自衛隊福島地方協力本部 | 福島県福島市花園町5-46 福島第二地方合同庁舎2階 | 024-531-2351 | [公式](https://www.mod.go.jp/pco/fukushima/workcontent/workcontent.html?checkparam=jimusho_inf_content) |
| 自衛隊茨城地方協力本部 | 茨城県水戸市北見町1-11 水戸地方合同庁舎 | 029-231-3315 | [公式](https://www.mod.go.jp/pco/ibaraki/boshujimusho.html) |
| 自衛隊栃木地方協力本部 | 栃木県宇都宮市桜5-1-13 宇都宮地方合同庁舎2階 | 028-634-3385 | [公式](https://www.mod.go.jp/pco/tochigi/tochigichihon.html) |
| 自衛隊群馬地方協力本部 | 群馬県前橋市南町3丁目64-12 | 027-221-4471 | [公式](https://www.mod.go.jp/pco/gunma/bosyuannai.html) |
| 自衛隊埼玉地方協力本部 | 埼玉県さいたま市浦和区常盤4丁目11-15 浦和合同庁舎3F | 048-831-6043 | [公式](https://www.mod.go.jp/pco/saitama/office/) |
| 自衛隊千葉地方協力本部 | 千葉県千葉市稲毛区轟町1丁目1-17 | 043-251-7151 | [公式](https://www.mod.go.jp/pco/chiba/access.html) |
| 自衛隊東京地方協力本部 | 東京都新宿区市谷本村町10番1号 | 03-3269-3513 | [公式](https://www.mod.go.jp/pco/tokyo/anamachi/) |
| 自衛隊神奈川地方協力本部 | 神奈川県横浜市中区山下町253-2 | 045-662-9429 | [公式](https://www.mod.go.jp/pco/kanagawa/mado/mado.html) |
| 自衛隊新潟地方協力本部 | 新潟県新潟市中央区美咲町1-1-1 美咲合同庁舎1号館7階 | 025-285-0515 | [公式](https://www.mod.go.jp/pco/niigata/HP/access.html) |
| 自衛隊山梨地方協力本部 | 山梨県甲府市丸の内1-1-18 甲府合同庁舎 | 055-253-1591 | [公式](https://www.mod.go.jp/pco/yamanashi/honbu.html#shozaichi) |
| 自衛隊長野地方協力本部 | 長野県長野市旭町1108 長野第2合同庁舎1F | 026-233-2108 | [公式](https://www.mod.go.jp/pco/nagano/) |
| 自衛隊静岡地方協力本部 | 静岡県静岡市葵区柚木366 | 054-261-3151 | [公式](https://www.mod.go.jp/pco/sizuoka/office/honbu.html) |
| 自衛隊富山地方協力本部 | 富山県富山市牛島新町6-24 | 076-441-3271 | [公式](https://www.mod.go.jp/pco/toyama/content/07-access/07-access.html) |
| 自衛隊石川地方協力本部 | 石川県金沢市新神田4丁目3-10 金沢新神田合同庁舎3F | 076-291-6214 | [公式](https://www.mod.go.jp/pco/ishikawa/guide/) |
| 自衛隊福井地方協力本部 | 福井県福井市春山1丁目1-54 福井春山合同庁舎10F | 0776-23-1910 | [公式](https://www.mod.go.jp/pco/fukui/contents/6-aboutus/6-aboutus.html) |
| 自衛隊岐阜地方協力本部 | 岐阜県岐阜市長良福光2675-3 | 058-232-3127 | [公式](https://www.mod.go.jp/pco/gifu/office/office.html) |
| 自衛隊愛知地方協力本部 | 愛知県名古屋市中川区松重町3-41 | 052-331-6266 | [公式](https://www.mod.go.jp/pco/aichi/contact/list.html) |
| 自衛隊三重地方協力本部 | 三重県津市桜橋1丁目91 | 059-225-0531 | [公式](https://www.mod.go.jp/pco/mie/regional/) |
| 自衛隊滋賀地方協力本部 | 滋賀県大津市京町3-1-1大津びわ湖合同庁舎5F | 077-524-6446 | [公式](https://www.mod.go.jp/pco/shiga/about/#sec3) |
| 自衛隊京都地方協力本部 | 京都府京都市中京区西ノ京笠殿町38 | 075-803-0820 | [公式](https://www.mod.go.jp/pco/kyoto/jimusho/jieikan/) |
| 自衛隊大阪地方協力本部 | 大阪府大阪市中央区大手前4-1-67 大阪合同庁舎第2号館3F | 06-6942-0541 | [公式](https://www.mod.go.jp/pco/osaka/about/office/madoguti.html) |
| 自衛隊兵庫地方協力本部 | 兵庫県神戸市中央区脇浜海岸通1-4-3 神戸防災合同庁舎4F | 078-261-9777 | [公式](https://www.mod.go.jp/pco/hyogo/about/sosiki.html) |
| 自衛隊奈良地方協力本部 | 奈良県奈良市高畑町552 奈良第2地方合同庁舎1F | 0742-23-7001 | [公式](https://www.mod.go.jp/pco/nara/guide/about/) |
| 自衛隊和歌山地方協力本部 | 和歌山県和歌山市築港1丁目14-6 | 073-422-5116 | [公式](https://www.mod.go.jp/pco/wakayama/about/) |
| 自衛隊鳥取地方協力本部 | 鳥取県鳥取市富安2-89-4 鳥取第1地方合同庁舎6F | 0857-23-2251 | [公式](https://www.mod.go.jp/pco/tottori/) |
| 自衛隊島根地方協力本部 | 島根県松江市向島町134-10 松江地方合同庁舎4F | 0852-21-0015 | [公式](https://www.mod.go.jp/pco/shimane/consultation/branch.html) |
| 自衛隊岡山地方協力本部 | 岡山県岡山市北区下石井1-4-1 岡山第2合同庁舎2F | 086-226-0361 | [公式](https://www.mod.go.jp/pco/okayama/gide/information.html) |
| 自衛隊広島地方協力本部 | 広島県広島市中区上八丁堀6-30 広島合同庁舎4号館6F | 082-221-2957 | [公式](https://www.mod.go.jp/pco/hiroshima/office/) |
| 自衛隊山口地方協力本部 | 山口県山口市八幡馬場814 | 083-922-2325 | [公式](https://www.mod.go.jp/pco/yamaguchi/jimusho.html) |
| 自衛隊徳島地方協力本部 | 徳島県徳島市万代町3-5 徳島第2地方合同庁舎5階 | 088-623-2220 | [公式](https://www.mod.go.jp/pco/tokushima/) |
| 自衛隊香川地方協力本部 | 香川県高松市サンポート3-33 高松サンポート合同庁舎南館2階 | 087-823-9206 | [公式](https://www.mod.go.jp/pco/kagawa/pco/access.html) |
| 自衛隊愛媛地方協力本部 | 愛媛県松山市三番町8丁目352-1 | 089-941-8381 | [公式](https://www.mod.go.jp/pco/ehime/acsess.html) |
| 自衛隊高知地方協力本部 | 高知県高知市栄田町2-2-10 高知よさこい咲都合同庁舎8階 | 088-822-6128 | [公式](https://www.mod.go.jp/pco/kochi/access.html) |
| 自衛隊福岡地方協力本部 | 福岡県福岡市博多区竹丘町1丁目12番 | 092-584-1881 | [公式](https://www.mod.go.jp/pco/fukuoka/recruit/contact/) |
| 自衛隊佐賀地方協力本部 | 佐賀県佐賀市与賀町2-18 | 0952-24-2291 | [公式](https://www.mod.go.jp/pco/saga/about/) |
| 自衛隊長崎地方協力本部 | 長崎県長崎市出島町2-25 防衛省合同庁舎2F | 095-826-8844 | [公式](https://www.mod.go.jp/pco/nagasaki/madoguchi/) |
| 自衛隊大分地方協力本部 | 大分県大分市新川町2丁目1番36 大分合同庁舎5F | 097-536-6271 | [公式](https://www.mod.go.jp/pco/oita/06_office.html) |
| 自衛隊熊本地方協力本部 | 熊本県熊本市西区春日2丁目10番1号 熊本地方合同庁舎B棟3F | 096-297-2050 | [公式](https://www.mod.go.jp/pco/kumamoto/about/access/) |
| 自衛隊宮崎地方協力本部 | 宮崎県宮崎市東大淀2丁目1-39 | 0985-53-2643 | [公式](https://www.mod.go.jp/pco/miyazaki/office.html) |
| 自衛隊鹿児島地方協力本部 | 鹿児島県鹿児島市東郡元町4番1号 鹿児島第2地方合同庁舎1F | 099-253-8920 | [公式](https://www.mod.go.jp/pco/kagoshima/about/access/) |
| 自衛隊沖縄地方協力本部 | 沖縄県那覇市樋川1丁目15番15 那覇第一地方合同庁舎西棟7F・8F | 098-855-0751 | [公式](https://www.mod.go.jp/pco/okinawa/about.html) |
| 阿南地域事務所 | 徳島県阿南市富岡町内町164-1 内町会館1階 | 0884-22-6981 | [公式](https://www.mod.go.jp/pco/tokushima/anan.html) |
| 吉野川地域事務所 | 徳島県吉野川市鴨島町鴨島229-4 まるやビル | 0883-24-7008 | [公式](https://www.mod.go.jp/pco/tokushima/kamo.html) |
| 徳島募集案内所 | 徳島県徳島市北矢三町1-1-11 | 088-631-9581 | [公式](https://www.mod.go.jp/pco/tokushima/tokushima.html) |
| 三好出張所 | 徳島県三好市池田町マチ2178-20 | 0883-72-0489 | [公式](https://www.mod.go.jp/pco/tokushima/miyosi.html) |
| 鳴門地域事務所 | 徳島県鳴門市撫養町立岩字七枚57 | 088-685-5306 | [公式](https://www.mod.go.jp/pco/tokushima/naruto.html) |

## 全国募集窓口の残る確認事項

この修正の募集窓口は317件（50地本）。住所・電話・担当区域のいずれかが空欄の既存窓口は236件ある。空欄は自動的に誤情報を意味しないが、全項目確認済みとは扱わない。対象IDと不足項目はJSONへ記録した。

前回PR #85の「23件保留」は名称差分候補のうち担当区域等が確定しなかった件数であり、全国の未確認・欠落情報の総数ではない。名称一致だけでは連絡先の正確性が保証されない。

全国名称監査は[ドラフトPR #85](https://github.com/naoya7928-0813/jsdf-chiiki-events/pull/85)で継続する。今回の確定情報を後続PRで古い値に戻さない。

## 検証

ローカル506テスト成功（skip 0）、実HTML回帰テスト、ビルド、既存データ品質チェック（エラー0）、本番依存の脆弱性監査（0件）が通過。調達文書を探索・公開・持ち越し・アーカイブ・構造化データから除外する回帰テストを追加。CIでscraper依存導入後にも調達除外テストを実行する。
