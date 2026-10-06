# 窓口HTML・OCR巡回の確認（2026-10-06）

## 本番の未取得実績

最新確認run：[37425699829](https://github.com/naoya7928-0813/jsdf-chiiki-events/actions/runs/37425699829)。旧方式で全国154URL・関東34URLの処理が終了したが、個別失敗が残る。全窓口の取得成功を意味しない。

| 窓口・掲載ページ | 未取得・未実施 |
|---|---|
| akita 秋田募集案内所・能代地域事務所・由利本荘地域事務所 ほか3拠点 |   [fetch] エラー: https://www.mod.go.jp/pco/akita/file/R8bousai.pptx → page.goto: Download is starting |
| hakodate 今金地域事務所・八雲地域事務所・江差地域事務所 ほか1拠点 | [DL] 404: https://www.mod.go.jp/pco/hakodate/img/R8.2tourikukaikuusi.pdf |
| hakodate 今金地域事務所・八雲地域事務所・江差地域事務所 ほか1拠点 | [DL] 404: https://www.mod.go.jp/pco/hakodate/img/2026kyariaa.jpg |
| hakodate 今金地域事務所・八雲地域事務所・江差地域事務所 ほか1拠点 | [DL] 404: https://www.mod.go.jp/pco/hakodate/img/R6.9.23hataraknorimono.pdf |
| hakodate 今金地域事務所・八雲地域事務所・江差地域事務所 ほか1拠点 | [DL] 404: https://www.mod.go.jp/pco/hakodate/img/R6.8.3uragakantei.pdf |
| miyagi 仙台募集案内所・名取地域事務所・大河原地域事務所 ほか4拠点 |   [fetch] エラー: https://www.mod.go.jp/pco/miyagi/ → page.content: Unable to retrieve content because the page is navigating and changing the content. |
| nagano 茅野地域事務所 | [DL] 404: https://www.mod.go.jp/pco/nagano/images/boshuu.png |
| oita 別府地域事務所・中津出張所・佐伯地域事務所 ほか2拠点 | [DL] 404: https://www.mod.go.jp/pco/oita/02_recruit/pdf/2si.pdf |
| tokyo 国分寺募集案内所 | [DL] 403: https://www.mod.go.jp/pco/tokyo/kokubunji/img/top_3.JPG |
| tokyo 国分寺募集案内所 | [DL] 403: https://www.mod.go.jp/pco/tokyo/kokubunji/img/top_1.JPG |
| tokyo 江東出張所 | [DL] 403: https://www.mod.go.jp/pco/tokyo/koutou/img/setumeikai.JPEG |
| tokyo 江東出張所 | [DL] 403: https://www.mod.go.jp/pco/tokyo/koutou/img/tensyoku.JPG |
| yamanashi 巨摩募集案内所・甲府募集案内所・大月地域事務所 | [DL] 403: https://www.mod.go.jp/pco/yamanashi/img/recruitment/re_h1_img-min2.PNG |

- 兵庫13窓口は第2・第3便のアクセス省略方針に従い、この便ではHTML・OCRを再実施しない。第1便はHTMLのみのdocument-only巡回。
- Tesseract日本語OCRは利用不可。RapidOCRは利用可能で、OCR機能全体が停止しているわけではない。
- 全体OCR：試行3件・キャッシュ再利用465件。窓口別の成功率は旧ログから確定できない。
- 秋田の相対URL誤解決とPPTX巡回を修正。403は再試行せず記録し、画像/PDFの読取結果がない場合は前回データを維持する。

## 追加窓口の巡回先確認

追加窓口59件（徳島で先行公開済み2件を含む）について、67の公式イベントHTMLを取得して登録した。共通イベント一覧と窓口独自ページを区別し、同一URLをまとめる。
この確認ではHTML取得・抽出を行い、画像/PDFのOCRは行っていない。新設定の本番OCR実績は次回巡回で確認する。登録済みであることを取得・OCR済みと扱わない。

| 地本 | 窓口 | HTML確認 | 新設定の本番OCR |
|---|---|---|---|
| hakodate | 函館地区隊 | 共通イベント一覧取得済み | 実績未確認 |
| hakodate | 函館リクルートセンター（募集案内所） | 共通イベント一覧取得済み | 実績未確認 |
| iwate | 釜石地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| ibaraki | 百里分駐所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tochigi | 宇都宮募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| tochigi | 大田原地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| tokyo | 北地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 新小岩募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 世田谷募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 練馬地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 福生募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 府中分駐所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokyo | 八王子地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kanagawa | 川崎出張所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kanagawa | 溝の口募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kanagawa | 横浜出張所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kanagawa | 上大岡募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| toyama | 富山募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| ishikawa | 金沢募集案内所（鳴和） | 共通イベント一覧取得済み | 実績未確認 |
| fukui | 福井募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| mie | 伊賀地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| shiga | 近江八幡地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| shiga | 高島地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| yamaguchi | 山口募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| yamaguchi | 周南地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| yamaguchi | 柳井地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| ehime | 松山募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kumamoto | 熊本募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| kumamoto | 山鹿地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| kumamoto | 八代出張所 | 共通イベント一覧取得済み | 実績未確認 |
| kumamoto | 人吉地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| kumamoto | 天草駐在員事務所 | 共通イベント一覧取得済み | 実績未確認 |
| kagoshima | 奄美大島駐在員事務所 | 共通イベント一覧取得済み | 実績未確認 |
| kagoshima | 種子島駐在員事務所 | 共通イベント一覧取得済み | 実績未確認 |
| kagoshima | 徳之島駐在員事務所 | 共通イベント一覧取得済み | 実績未確認 |
| oita | 大分募集案内所 | 共通イベント一覧取得済み | 実績未確認 |
| oita | 宇佐地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| asahikawa | 旭川地区隊 | 共通イベント一覧取得済み | 実績未確認 |
| yamagata | 山形募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| yamagata | 東根地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| niigata | 新潟募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| gifu | 岐阜募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| gifu | 美濃加茂地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| gifu | 郡上地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| gifu | 恵那地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kyoto | 京丹後地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kyoto | 亀岡募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kyoto | 河原町募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kyoto | 京都募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| osaka | 天王寺募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| osaka | なんば募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| osaka | 守口出張所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokushima | 三好出張所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| tokushima | 鳴門地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kagawa | 高松募集案内所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kagawa | さぬき地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| kagawa | 善通寺地域事務所 | 独自ページ＋共通一覧取得済み | 実績未確認 |
| chiba | 旭地域事務所 | 共通イベント一覧取得済み | 実績未確認 |
| chiba | 館山分駐所 | 共通イベント一覧取得済み | 実績未確認 |

## 今後の確認方法

定期巡回で `office-crawl-report` artifact とジョブサマリを保存する。HTML取得失敗、時間切れ、OCRエンジンなし、対象資料なし、処理結果なし、未処理候補を区別して記録する。対象資料なしや抽出0件からイベント不在を断定しない。
