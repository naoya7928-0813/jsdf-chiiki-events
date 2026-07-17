'use strict';

/**
 * イベント名の品質管理モジュール（スクレイパー/チェックスクリプト共通）
 *
 * ★ カード記述ルールの正準は CLAUDE.md「イベントカード記述ルール（正準仕様）」。
 *    このモジュールはそのうち「タイトル整形・不正除外・年ズレ・重複・場所整形」を実装する。
 *
 * タイトルは複数経路で生成される（HTMLパーサー直接抽出 / OCR /
 * 事務所巡回 / 前回データ維持）ため、個別経路ではなく
 * 最終出力(writeOutput)とQAスクリプトの両方からこのモジュールを使い、
 * 経路に依存しない防御とする。新種の不正パターンはここに追加すること
 * （追加時は CLAUDE.md の該当節とテスト titleQuality.test.cjs も更新する）。
 */

/** 全角英数字を半角に変換する（年判定・重複判定の正規化用） */
function toHalfAlnum(s) {
  return String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

/**
 * イベント名の前後に付くゴミを整形する（除外ではなく修復）。
 * 例: 「# 海上自衛隊」「&自衛隊…」「NEW6/14&7/11 自衛隊…」「1オンライン説明会」
 */
function cleanEventTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).replace(/\s+/g, ' ').trim();
  // 画像キャプション「（クリックで拡大します。）」の混入（前後どこでも。新潟等）
  t = t.replace(/[（(]?クリックで拡大します。?[）)]?/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^イベント情報\s*/, '');           // 見出し「イベント情報」の巻き込み
  // 先頭の孤立した閉じ括弧断片「艦艇広報】 ○○」「見学】○○」（開き括弧が欠落した見出しタグ残骸）
  t = t.replace(/^[^【】]{1,6}】\s*/, '');
  // 先頭の波ダッシュ断片「～ YAMACHI BASE」（本文の途中から切れたもの）
  t = t.replace(/^[~〜～\s]+/, '');
  // 先頭のバッジ語の連なり「イベント事前予約制無 料 ○○説明会」（開催条件バッジがタイトルに巻き込まれたもの）
  t = t.replace(/^(?:(?:イベント|事前予約制|予約制|予約不要|入場無料|参加無料|無\s*料)\s*){2,}/, '');
  // 「更新情報New」「新着情報」等の更新バッジ接頭辞（office_html がトピック一覧の
  // 見出しごと拾ったもの。例:「更新情報new 公務員合同説明会…」）
  t = t.replace(/^(?:更新情報|新着情報|最新情報|更新|お知らせ)\s*(?:new|ＮＥＷ|新着)?[\s!！:：・]*/i, '');
  t = t.replace(/^[#＃]+\s*/, '');                 // Markdown見出し残骸
  t = t.replace(/^[★☆●○■□◆◇※]+\s*/, '');     // 装飾記号
  t = t.replace(/^[&＆]+\s*/, '');                 // 連結残骸
  // 「NEW6/14&7/11 」「NEW＼」のような新着マーク＋日付断片・装飾
  t = t.replace(/^(?:NEW|ＮＥＷ|新着)(?=[\s\d０-９!！/／&＆＼\\])[!！]*[\s\d０-９/／&＆.．＼\\]*/, '');
  t = t.replace(/^\d\s*(?=[ァ-ヶ])/, '');          // 「1オンライン説明会」等のページ番号残骸
  t = t.replace(/^\d\s+(?=20\d{2})/, '');          // 「2 2026サマーキャンプ」等の先頭連番残骸
  // 複数イベントが「○○説明会in広島の ○○説明会inふくやまの ○○ガイダンスのご案内」の
  // ように連結したもの → 先頭イベントのみ残す（イベント語が2回以上 かつ 「の␣」連結時）
  if ((t.match(/説明会|ガイダンス|相談会|フェア|見学会/g) || []).length >= 2
      && /(?:説明会|ガイダンス|相談会|フェア|見学会)(?:in[^\sの]+)?の\s/.test(t)) {
    t = t.replace(/((?:説明会|ガイダンス|相談会|フェア|見学会)(?:in[^\sの]+)?)の\s.*$/, '$1');
  }
  // 表の「内容等」列の内訳がタイトルに連結したもの（茨城 setsumeikai 等）
  // 「○○合同説明会【参加団体】・警察・消防・…」→ 一覧以降を切り落とす
  t = t.replace(/\s*【参加団体】.*$/, '');
  t = t.replace(/\s*【場所】.*$/, '');
  t = t.replace(/\s*参加費\s*無料[!！]*$/, '');    // 末尾の宣伝文句
  // 末尾のCTA誘導「ご応募はコチラ」「お申し込みはこちら」
  t = t.replace(/\s*(?:ご|お)?(?:応募|申し?込み?)は?(?:こちら|コチラ)[!！]*$/, '');
  // 末尾の「のお知らせ」「のご案内」（告知ページ見出しの残り。イベント名としては冗長）
  t = t.replace(/\s*の(?:お知らせ|ご案内)$/, '');
  // 末尾の文書件名「○○募集の件」「○○参加募集の件」（PDFリンク文言の巻き込み）
  t = t.replace(/\s*(?:参加|開催)?募集の件$/, '').replace(/\s*の件$/, '');
  // 末尾のファイル名残骸「…（秋田港）-26[PDF」「…（能代港）-5」（閉じ括弧直後のみ。TC-90等の型番は残す）
  t = t.replace(/(?<=[）)])\s*[-－]\d{1,2}(?:\[[A-Za-z]*)?$/, '');
  // 破損した日付範囲括弧「○○の （～31キオクシアアイーナ）」（開始日が欠けた期間表記の残骸）
  t = t.replace(/\s*の?\s*[（(]\s*[~〜～][^）)]*[）)]\s*$/, '');
  // カレンダーの複数項目連結「公務員合同説明会 平日～令和７年度柏崎入隊激励会」
  // → 後続の別項目（～令和N年度…）を切り落とす（激励会・入隊等の行事語を伴う場合のみ）
  t = t.replace(/\s*\S{0,4}[~〜～]令和[\d０-９元]{1,3}年度\S*(?:激励会|入隊|式典|説明会|見学|まつり).*$/, '');
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]+\s*$/u, ''); // 末尾の絵文字
  // 「○○！！ 会場名…」のように本文(！/！！)の後ろへ空白区切りで会場名が連結した
  // ものを切り落とす（例:「公務員合同説明会の！！ 帯広とかちプラザ… ～」）。
  // ※ 会場語を含む場合のみ切る。「○○フェスタ!! 2026」等の年号サフィックスは残す
  t = t.replace(/([!！]{1,2})\s+\S*(?:プラザ|センター|ホール|会館|アトリウム|ビル|駐屯地|基地|分屯|庁舎|公園|体育館|ロビー|広場|[\d０-９][FＦ]).*$/u, '$1');
  t = t.replace(/[\s~〜～]+$/u, '');               // 末尾の波ダッシュ・空白（途中切れマーク）
  // 末尾の助詞断片（「○○の」「○○の！！」等、本文が途中で切れたもの）
  t = t.replace(/[のをがはにへと][\s!！。、,，~〜～]*$/u, '');
  t = t.replace(/[（(]\s*[）)]\s*$/, '');         // 末尾の空括弧「（）」
  t = t.replace(/(?<=説明会|見学会|相談会)同日$/, ''); // 「4種説明会同日」等の「同日開催」切れ端
  t = t.trim();
  // 案内所・事務所名だけのタイトルは説明会イベント（会場名がタイトル化したもの）
  // なので、イベント種別が分かる形に補う（例: 京都の説明会一覧）
  if (/^[一-鿿ぁ-んァ-ヶーa-zA-Z0-9０-９]{2,10}(?:募集案内所|地域事務所|出張所)$/.test(t)) {
    t = `自衛隊説明会（${t}）`;
  }
  return t;
}

/**
 * イベント名が「中身のない/不正な」ものか判定する。
 * OCR残骸・申し込み案内・住所/電話混入・様式断片・注記文・スタブを検出。
 */
function isJunkOrStubTitle(title) {
  if (!title) return true;
  const t = toHalfAlnum(title.trim());
  if (/↑.*申し込み/.test(t))                  return true; // 「↑申し込みはこちら↑」
  if (/【?お問合せ|お問い合わせ先/.test(t))     return true; // 「【お問合せ先】」
  if (/〒\s*\d/.test(t))                       return true; // 郵便番号（住所混入）
  if (/\d{2,4}[-－]\d{3,4}[-－]\d{4}/.test(t)) return true; // 電話番号
  if (/及び定員|提出書類|応募方法|様式第|試験期日|受験案内/.test(t)) return true; // 様式・受験案内の断片
  // 採用試験の試験日そのもの（受験案内であり参加型イベントではない。「〜試験説明会」等は通す）
  if (/(?:採用|資格)試験$/.test(t)
      && !/説明会|見学|体験|相談|ガイダンス|フェア|セミナー/.test(t)) return true;
  if (/タイトル不明/.test(t))                  return true; // OCRフォールバックの残骸
  if (/^乗艦受付|受付時刻$/.test(t))           return true; // 艦艇公開ページの受付時刻ラベル行
  if (/最大射程|発射速度|排水量|巡航速度/.test(t)) return true; // 装備スペック表の行（イベント名ではない）
  if (/^\S{0,12}上空を(?:航過|通過)$/.test(t)) return true; // 飛行経路の述語断片（「宮古港上空を航過」）
  if (/^\S{1,6}地本公式$/.test(t))             return true; // サイト名ラベル（「岩手地本公式」）
  if (/^内\s*容\s/.test(t))                    return true; // 様式のラベル行（「内 容 職業概要説明…」）
  // 主催組織名のみ（イベント種別なし。「二戸地区広域行政事務組合消防本部」等）
  if (/(?:消防本部|行政事務組合|市役所|町役場)$/.test(t)
      && !/説明会|見学|体験|まつり|祭|フェア|フェスタ|コンサート|ガイダンス|相談会/.test(t)) return true;
  // 採用試験日程表の行が平坦化されたもの（「医科・歯科幹部 第1回採用試験 第2回採用試験」）
  if (/第[1１一]回採用試験.*第[2２二]回採用試験/.test(t)) return true;
  // 海自の阪神基地隊が「航空自衛隊」と連結された矛盾タイトル（隣接項目の平坦化事故）
  if (/航空自衛隊\s*阪神基地隊/.test(t))       return true;
  // 教育機関名のみ（種別なし。「防衛医科大学校」単独等。説明会・オープンキャンパス付きは通す）
  if (/^(?:防衛医科大学校|防衛大学校|(?:陸上自衛隊)?高等工科学校)$/.test(t)) return true;
  // 募集種目名のみ（受験案内PDFのOCR。例:「一般曹候補生」「幹部候補生・幹部候補曹」）
  if (/^(?:一般曹候補生|自衛官候補生|幹部候補生|予備自衛官補?|医科・?歯科幹部|技術曹|貸費学生)(?:[・,、][一-鿿ァ-ヶa-zA-Z・]{0,15})?$/.test(t)) return true;
  // 住所の混入（「○丁目35-8」等。県名なしの「德島市…」形式は従来の住所ルールを素通りした）
  if (/丁目[\d０-９]{1,3}[-－‐][\d０-９]/.test(t)) return true;
  if (/入札公告|オープンカウンター|実施要領|仕様書|契約担当官/.test(t)) return true; // 調達・契約文書（イベントではない）
  if (/チラシを参照|参照願います/.test(t))      return true; // 注記文の混入
  // リンク文言の単独タイトル（「ダウンロード」「こちら」等）
  if (/^(?:ダウンロード|詳細|詳しくは|こちら|チラシ[\d０-９]*|PDF|画像|リンク)$/i.test(t)) return true;
  if (/申込み?リンク|応募リンク|広報申込み/.test(t)) return true; // リンク案内の混入
  // ラベル行がタイトル化（「主催:○○」「開催場所:○○」等）
  if (/^(?:主催|共催|開催場所|場所|会場|日時|日程|お問合せ先?)\s*[:：]/.test(t)) return true;
  // OCR文字化け（簡体字・置換文字。例:「海上自衛隧舞鹤基地」「四国大学交流亏」）
  if (/[队乐贝实团济纪记书译录习场隧鹤舰护亏]|�/.test(t)) return true;
  if (/。/.test(t) && t.length >= 30)          return true; // 文章がタイトル化（案内文の混入）
  // 「自衛隊○○地本イベント」「募集案内所イベント」等の中身なしスタブ
  if (/^(?:自衛隊)?(?:.{0,6}地本|募集案内所|地域事務所|出張所)?イベント(?:\s*（[^）]*）)?$/.test(t)) return true;
  // 旧「公式確認」スタブのタイトル（「自衛隊○○地方協力本部のイベント情報」。
  // 2026-07-02 に生成廃止。過去データ・OCRキャッシュからの再混入防御）
  if (/^(?:自衛隊)?.{1,6}地方協力本部の?イベント情報?$/.test(t)) return true;
  // 部隊・組織名だけでイベント種別（見学・説明会等）が無いタイトル
  // （OCRがチラシ最上部の部隊名だけを拾ったもの。例:「海上自衛隊」「自衛隊仙台病院」）
  // ※ 実在イベントの場合は VERIFIED_OVERRIDES でチラシ照合済みの正式名を登録して救済する
  if (/^(?:陸上|海上|航空)?自衛隊(?:[一-鿿ァ-ヶー]{2,8}(?:病院|救難隊|音楽隊|基地|部隊|駐屯地))?$/.test(t)) return true;
  // 助詞・読点で終わる文の断片（タイトルの途中切れ。例:「最新の」「○○について、」「○○（２回目）から」）
  if (/[をがはにへとの、]$/.test(t))           return true;
  if (/(?:から|より)$/.test(t))                return true;
  // 日本語がほぼ無い断片（例:「1 R.22〜＃2 R.24」）。英語タイトルは許容
  const jp = (t.match(/[぀-ヿ㐀-䶿一-鿿]/g) || []).length;
  if (jp < 3 && !/[A-Za-z]{4,}/.test(t))       return true;
  return false;
}

// ── 検疫（quarantine）: 「疑わしい」タイトルの判定 ─────────────────
//
// isJunkOrStubTitle が「確実に不正」を除外するのに対し、こちらは
// 「新種のゴミの可能性が高いが確定ではない」タイトルを検知する。
// writeOutput はこれに該当するイベントを公開（events.json）へ載せず
// 検疫ファイルへ隔離し、管理者へ通知する（安全側デフォルト）。
// → 2026-07-03 の岩手事故（艦艇公開ページの表の行「乗艦受付時刻」等が
//   ルール追加まで3日間公開され続けた）の再発防止。
//
// 【運用】検疫されたタイトルが正規のイベントだった場合は、下の
// APPROVED_TITLES に部分一致パターンを追加すると次回から公開される
// （確定した正式名に直す場合は VERIFIED_OVERRIDES を使う）。

// 検疫を免除する承認済みタイトル（部分一致）。正規と確認できたものだけ追加する。
const APPROVED_TITLES = [
  // 例: 'セリカday',
];

// イベントらしさを示す語（これを含むタイトルは検疫しない＝誤検疫の最小化）
const EVENT_KEYWORD_RE = /説明会|見学|体験|搭乗|公開|まつり|祭|フェス|コンサート|演奏|相談|ガイダンス|ツアー|イベント|教室|大会|式典|行事|講演|セミナー|キャンプ|インターン|オープンキャンパス|オープンスクール|懇談|トークショー|トーク|ラリー|マルシェ|夜市|盆踊り|花火|パレード|展示|航空祭|募集案内|検定|入隊|激励会|音楽隊|ブース|ショー|フライト|クイズ|Quiz|day|Day|DAY|フェア|納涼|夏市|就職|進学|採用|防災/i;

/**
 * 「疑わしい」タイトルか（公開保留＝検疫の対象）。
 * イベント語を含まず、かつ非イベントの兆候（ラベル語・組織名のみ・装備スペック・
 * 述語断片・様式行）がある場合のみ true。イベント語なしでも兆候が無ければ
 * 通常公開する（「県民の日」「つばめのチカラ」等の固有名イベントを守る）。
 */
function isSuspiciousTitle(title) {
  if (!title) return false; // 空は isJunkOrStubTitle 側で除外済み
  const t = toHalfAlnum(String(title).trim());
  if (APPROVED_TITLES.some(p => t.includes(p))) return false;
  if (EVENT_KEYWORD_RE.test(t)) return false;
  // ラベル語で終わる（表の見出し・案内欄がタイトル化。「乗艦受付時刻」等）
  if (/(?:時刻|時間|方法|要領|一覧|概要|案内図|地図|アクセス|住所|連絡先|電話番号|料金|定員|持ち物|注意事項|受付|申込先|問合せ)$/.test(t)) return true;
  // 組織名で終わる（主催者名のみ。「二戸地区広域行政事務組合消防本部」等）
  if (/(?:本部|市役所|町役場|役場|警察署|消防署|組合|協会|連盟|事務局)$/.test(t)) return true;
  // 装備スペックの行（「最大発射速度:30発／分、最大射程約:5,600m」等）
  if (/速度|射程|排水量|全長|全幅|口径|馬力/.test(t) || /\d[,，]?\d*\s*(?:発|km|kt|ノット|mm|㎜|トン)\b/.test(t)) return true;
  // 述語で終わる断片（「宮古港上空を航過」等の行動記述）
  if (/(?:を|に|へ)[一-鿿]{1,4}$/.test(t)) return true;
  // ラベル行の先頭（「内容 …」「日時 …」等。コロン無し版）
  if (/^(?:内\s*容|日\s*時|場\s*所|会\s*場|期\s*間|対\s*象|主\s*催)\s/.test(t)) return true;
  // 「公式」だけのラベル（「岩手地本公式」等）
  if (/公式$/.test(t)) return true;
  return false;
}

/**
 * 過去イベントアーカイブへ退避してよいイベントか（アーカイブ×検疫の統合ポイント）。
 * アーカイブ候補は「前回 events.json」からも収集されるため、検疫導入前の旧データや
 * 旧ルール時代の不正タイトルが混ざり得る。公開と同じ品質基準で退避を判定する:
 *   - id/date/title が無いものは不可
 *   - office_notice（偽日付スタブ・生成廃止済み）は不可
 *   - isJunkOrStubTitle（確実な不正）は不可
 *   - isSuspiciousTitle（検疫対象＝疑わしい）は不可 … 公開を止めたものを過去ログに残さない
 */
function isArchivableEvent(ev) {
  if (!ev || !ev.id || !ev.date || !ev.title) return false;
  if (ev.source_type === 'office_notice') return false;
  if (isJunkOrStubTitle(ev.title)) return false;
  if (isSuspiciousTitle(ev.title)) return false;
  return true;
}

/**
 * 過去年のイベントが現在年の日付で再登録されたものか判定する。
 * 例: サイトに残る2024年の実績一覧を年なし日付として拾い、
 *     現在年(2026)で補完してしまったケース。
 * - タイトル中の西暦がイベント日付の年より古い → 過去物
 * - URL の日付スタンプ（例: 20241027_xxx.pdf）が古い → 過去物
 */
function isStaleDatedEvent(ev) {
  const evYear = parseInt(String(ev.date || '').slice(0, 4), 10);
  if (!evYear) return false;
  const t = toHalfAlnum(ev.title || '');
  const url = String(ev.url || '');
  let durl = url; try { durl = decodeURIComponent(url); } catch { /* keep raw */ }

  // ── タイトル ──────────────────────────────────────────────
  // 西暦（20XX）がイベント年より古い
  for (const m of t.matchAll(/(?:^|\D)(20\d{2})(?:\D|$)/g)) {
    if (parseInt(m[1], 10) < evYear) return true;
  }
  // 和暦（令和元年/令和N年・平成元年/平成N年）。
  // 「年度」は会計年度で当年と1年ずれて表記され得るため、2年以上前のときだけ古いとみなす。
  for (const m of `${t} ${durl}`.matchAll(/(令和|平成)\s*(元|\d{1,2})\s*年(度)?/g)) {
    const base = m[1] === '令和' ? 2018 : 1988;
    const y = base + (m[2] === '元' ? 1 : parseInt(m[2], 10));
    const isFiscal = !!m[3];
    if (isFiscal ? (y <= evYear - 2) : (y < evYear)) return true;
  }

  // ── URL / ファイル名の日付スタンプ ──────────────────────────
  // 西暦8桁: 20YYMMDD_xxx.pdf
  const um = url.match(/\/(20\d{2})\d{4}[^/]*\.(?:pdf|jpe?g|png|gif)/i);
  if (um && parseInt(um[1], 10) < evYear) return true;
  // 和暦スタンプ: R6.9.23 / H31.1.5（令和/平成 + 年 . 月 . 日）。MOD公式の命名規則。
  for (const m of url.matchAll(/(?:^|[^A-Za-z0-9])([RrHh])(\d{1,2})[.\-_]\d{1,2}[.\-_]\d{1,2}/g)) {
    const base = /[Rr]/.test(m[1]) ? 2018 : 1988;
    if (base + parseInt(m[2], 10) < evYear) return true;
  }
  return false;
}

/** 重複判定用の正規化（括弧内・空白・記号・軍種プレフィックスを除去） */
function normForDedup(s) {
  let t = toHalfAlnum(s);
  t = t.replace(/[（(][^）)]*[）)]/g, '');
  // ［艦艇広報］【見学】等の見出しタグ（全角/半角角括弧・隅付き括弧）も除去して比較する
  t = t.replace(/[［\[【][^］\]】]*[］\]】]/g, '');
  t = t.replace(/[\s　・|｜/／&＆!！?？.。、,，:：~〜～\-－]/g, '');
  // 「陸上自衛隊体験型説明会in陸上自衛隊信太山駐屯地」と「体験型説明会in信太山駐屯地」
  // のような軍種名の有無による表記ゆれを同一視する
  t = t.replace(/陸上自衛隊|海上自衛隊|航空自衛隊|自衛隊/g, '');
  // 「○○駐屯地見学会」と「○○駐屯地部隊見学会」の表記ゆれを同一視する
  t = t.replace(/部隊見学/g, '見学');
  return t;
}

/**
 * 同一地本内の重複イベントを統合する。
 * 同一日付で、名称が一致（または一方が他方を含む）し、場所が両立する
 * （どちらか空・一致・包含）場合のみ重複とみなす。
 * ※ 同名でも場所が異なるイベント（例: 同日の説明会を複数事務所で開催）は残す。
 * 重複時は情報量の多い方（場所・時間・備考あり）を残す。
 */
/** URL のファイル名（拡張子なし・小文字）。同一チラシの jpg/pdf 版を同一視するための鍵 */
function urlBasename(u) {
  const m = String(u || '').match(/\/([^/?#]+)\.(?:pdf|jpe?g|png|gif|webp)(?:[?#]|$)/i);
  return m ? m[1].toLowerCase() : '';
}

function dedupEvents(list) {
  const kept = [];
  const score = e => String(e.title || '').length
    + (e.place ? 5 : 0) + (e.time ? 3 : 0) + (e.notes ? 1 : 0);
  for (const ev of list) {
    const n = normForDedup(ev.title || '');
    const ub = urlBasename(ev.url);
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (k.ev.date !== ev.date) continue;
      const sameTitle = k.n === n && n.length > 0;
      const contained = !sameTitle && k.n.length >= 8 && n.length >= 8
        && (k.n.includes(n) || n.includes(k.n));
      if (!sameTitle && !contained) continue;
      // 同名・同日で、同一ソースファイル（チラシの jpg/pdf 版違い等）なら
      // 場所欄の書き方（実会場名 vs 事務所名）が違っても同一イベントとして統合する
      const sameAsset = sameTitle && ub && ub === k.ub;
      if (!sameAsset) {
        const pk = normForDedup(k.ev.place || '');
        const pe = normForDedup(ev.place || '');
        // 場所が両方あり、かつ別物なら別イベント
        if (pk && pe && pk !== pe && !pk.includes(pe) && !pe.includes(pk)) continue;
      }
      if (score(ev) > score(k.ev)) kept[i] = { ev, n, ub };
      merged = true;
      break;
    }
    if (!merged) kept.push({ ev, n, ub });
  }
  return kept.map(k => k.ev);
}

/**
 * チラシ実物との目視照合で確定した修正の恒久登録テーブル。
 *
 * OCRキャッシュは誤ったタイトルを保持し続けるため、events.json を直接
 * 修正しても次のスクレイプで再発する。ここに登録すれば writeOutput が
 * 毎回適用するので再発しない。
 * 【運用】CIの品質チェックで不正タイトルが検出されたら、必ずチラシ実物
 * （url/imageUrl のPDF/画像）を目視照合し、正しい値をここに追加すること。
 * マッチは URL の固有部分（＋必要なら日付）で行う。チラシが差し替わって
 * URLが変われば自動的に適用されなくなる（新チラシは新規OCRされる）。
 */
const VERIFIED_OVERRIDES = [
  // 新潟: OCRが「てんりゅう」を「てんゆう」と脱字（チラシ: 令和8年7/18-20 新潟西港）
  { urlIncludes: 'r8.7.18tenryu.pdf',
    set: { title: '訓練支援艦てんりゅう 一般公開', endDate: '2026-07-20', category: '一般公開' } },
  // 岩手: チラシ最上部の部隊名/キャッチコピーだけが拾われ「見学」等が欠落
  { urlIncludes: 'shokubataiken.pdf',
    set: { title: '自衛隊職場体験（岩手駐屯地）', category: '体験' } },
  { urlIncludes: 'akitabuntonkichi.pdf',
    set: { title: '航空自衛隊秋田分屯基地（秋田救難隊）見学', place: '航空自衛隊秋田分屯基地', category: '体験' } },
  { urlIncludes: '/sendai.pdf',
    set: { title: '自衛隊仙台病院・東北方面衛生隊見学', category: '体験' } },
  { urlIncludes: '/hachinohe.pdf',
    set: { title: '海上自衛隊八戸航空基地見学', category: '体験' } },
  // 岩手: 1つのPDFに2会場（チラシ: 6/20花巻なはんプラザ・6/27北上市生涯学習センター）。
  // ファイル名(kitakami)から場所を誤推定していた
  { urlIncludes: 'kitakami.pdf', date: '2026-06-20', set: { place: 'なはんプラザ（花巻市）' } },
  { urlIncludes: 'kitakami.pdf', date: '2026-06-27', set: { place: '北上市生涯学習センター' } },
  // 岡山: チラシ名称の後半が欠落。
  // ※ 別イベント（6/23 防衛大学校オンライン説明会）が同じPDF URLを誤共有して
  //   いるため、必ず日付でスコープすること（URLだけだと誤適用する）
  { urlIncludes: 'bouidai_open.pdf', date: '2026-06-20',
    set: { title: '防衛医科大学校 OPEN CAMPUS 2026' } },
  // 複数日開催の終了日（チラシ記載）
  { urlIncludes: '2026taikenfes.pdf',      set: { endDate: '2026-07-27' } }, // 函館 7/25-27
  { urlIncludes: '202608premium-tour.pdf', set: { endDate: '2026-08-19' } }, // 福井 8/17-19
  { urlIncludes: '0627-27_josei.jpg',      set: { endDate: '2026-06-27' } }, // 東京 6/26-27
  // 徳島: OCRが場所行を文字化けタイトル化（チラシ: 官公庁合同公務員職業説明会 7/4 四国大学交流プラザ）
  { urlIncludes: 'setumei/setumei02.pdf',
    set: { title: '官公庁合同 公務員職業説明会', place: '四国大学交流プラザ（徳島市）', time: '13:00～16:40', category: '説明会' } },
  // 茨城: setsumeikai.html の表が 7/28 つくば市説明会の会場を前行と同じ「土浦市役所」と
  // 記載しているが、土浦地域事務所ページ（jimusho/tsuchiura.html）では
  // 「イオンモールつくば 3Fイオンホール」と明記（2026-07-17 両ページ照合。開催市とも整合）。
  // このイベントは url が無いため pref+date+titleIncludes でマッチさせる
  { pref: 'ibaraki', date: '2026-07-28', titleIncludes: 'つくば市公安系公務員',
    set: { place: 'イオンモールつくば 3Fイオンホール' } },
];

/** イベントに検証済み修正を適用する（writeOutput から毎回呼ばれる） */
function applyVerifiedOverrides(ev) {
  if (!ev) return ev;
  const u = String(ev.url || '') + ' ' + String(ev.imageUrl || '');
  let out = ev;
  for (const o of VERIFIED_OVERRIDES) {
    // urlIncludes / titleIncludes のどちらかは必須（誤って全件へ適用しないためのガード）
    if (!o.urlIncludes && !o.titleIncludes) continue;
    if (o.urlIncludes && !u.includes(o.urlIncludes)) continue;
    if (o.titleIncludes && !String(ev.title || '').includes(o.titleIncludes)) continue;
    if (o.pref && ev.pref !== o.pref) continue;
    if (o.date && ev.date !== o.date) continue;
    out = { ...out, ...o.set };
  }
  return out;
}

/** 文字列フィールドが実質空か（OCR/JSONが文字列 "null" 等を返すことがある） */
function isEmptyFieldText(v) {
  return v == null || /^(null|undefined|なし|未定|不明|-|ー|―|—)$/i.test(String(v).trim());
}

/**
 * 「場所」欄のゴミを整形する。
 * - OCRがMarkdown表で返した「| 会場名 |」のパイプ残骸を除去
 * - 巡回元の事務所リスト（「A事務所・B事務所 ほか1拠点」等）は会場ではないため
 *   空にする（誤った場所を出すより空欄の方が良い）
 * - ジオコーダの整形住所が混入した「会場名, 日本、〒123-4567 住所…」→ 会場名だけにする
 * - 「・○○見学・△△体験…」のように活動内容の羅列で会場語を含まないものは会場ではない → 空
 */
function cleanPlaceText(raw) {
  if (isEmptyFieldText(raw)) return '';
  let p = String(raw).replace(/\s+/g, ' ').trim();
  p = p.replace(/^[|｜\s]+|[|｜\s]+$/g, '').trim(); // Markdown表残骸
  // ジオコーダの整形住所サフィックス（「, 日本、〒…」「〒123-4567 住所」）を除去
  p = p.replace(/[,、]\s*日本[,、].*$/, '').trim();
  p = p.replace(/[,、]?\s*〒\s*\d{3}-?\d{0,4}.*$/, '').trim();
  if (/ほか\d+拠点$/.test(p)) return '';            // 巡回元事務所リスト
  // 複数の事務所・案内所の列挙も巡回元リスト（実会場は通常1つ）
  const officeCount = (p.match(/事務所|案内所|出張所|分駐所/g) || []).length;
  if (officeCount >= 2 && /・/.test(p)) return '';
  // 先頭「・」で始まる活動内容の羅列（会場を示す語が無い）は会場ではない
  const VENUE_KW = /会場|駐屯地|基地|分屯|港|駅|公園|ホール|センター|会館|プラザ|体育館|アリーナ|庁舎|大学|学校|モール|広場|グラウンド|市役所|町役場|役場|神社|寺|城|イオン|ドーム|スタジアム|球場|美術館|博物館|図書館/;
  if (/^・/.test(p) && !VENUE_KW.test(p)) return '';
  return p;
}

// 都道府県名（address 分離の目印）
const PREF_NAMES_RE = new RegExp(
  '(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)'
);
// 市区町村＋番地（都道府県名を伴わない住所の目印）
const CITY_ADDR_RE = /[一-鿿ぁ-んァ-ヶ]{1,6}[市区町村](?:[一-鿿ぁ-んァ-ヶ]{0,8})?[0-9０-９]{1,4}\s*(?:丁目|番地|番|号|[-−－])/;

/**
 * place に会場名と住所が連結している場合、住所を address 側へ分離する（純粋）。
 * 例: 「郡山労働福祉会館 郡山市虎丸町7番7号」→ place「郡山労働福祉会館」/ address「郡山市虎丸町7番7号」
 * - 目印は「都道府県名」または「市区町村＋番地」。会場か住所のどちらかが空になる分割はしない。
 * - address が既にあれば上書きしない。表示の質と天気ジオコーディングの精度を両立させる。
 * @returns {{place:string, address:string}}
 */
function splitPlaceAddress(rawPlace, existingAddress) {
  let place = String(rawPlace || '').replace(/\s+/g, ' ').trim();
  const address = String(existingAddress || '').trim();
  if (!place) return { place, address };
  const commit = (idx) => {
    const p = place.slice(0, idx).replace(/[\s（(、,・]+$/, '').trim();
    const a = place.slice(idx).replace(/^[\s（(]+/, '').replace(/[）)\s]+$/, '').trim();
    if (!p || !a) return null; // 会場か住所が空になる分割はしない
    return { place: p, address: address || a };
  };
  let m = place.match(PREF_NAMES_RE);       // 1) 都道府県名から（先頭でない場合）
  if (m && m.index > 0) { const r = commit(m.index); if (r) return r; }
  m = place.match(CITY_ADDR_RE);            // 2) 市区町村＋番地
  if (m && m.index > 0) { const r = commit(m.index); if (r) return r; }
  return { place, address };
}

/**
 * 「時間」欄を正準形 `HH:MM～HH:MM`（波ダッシュ ～ 統一）へ整形する。
 * - 「N時M分」「N時」「N時半」「午前/午後」「HHMM（4桁）」「から」「-/〜/~」を変換
 * - 受付/開場/※注記や、時刻(数字)を含まないラベル断片（「一般公開時間」「開」）は除去
 * - 不明・"null" 等は空。複数部制・複数日の表記は構造を保ったまま区切り/注記のみ整える
 */
function cleanTimeText(raw) {
  if (isEmptyFieldText(raw)) return '';
  let t = String(raw).trim();
  if (/^終日$/.test(t)) return '終日';                 // 正準値（終日開催）
  if (!/\d/.test(t)) return '';                       // 時刻情報なし（ラベル/断片）
  t = t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); // 全角数字→半角
  // 受付・開場・開演の補足（括弧・…以降・※以降）を除去
  t = t.replace(/[（(][^）)]*(?:受付|開場|開演)[^）)]*[）)]/g, '');
  t = t.replace(/[…‥][^、,]*受付[^、,]*/g, '');
  t = t.replace(/\s*※.*$/, '');
  // 午前/午後（午後N時→(N%12)+12時）
  t = t.replace(/午前\s*(\d{1,2})\s*時/g, (m, h) => `${h}時`);
  t = t.replace(/午後\s*(\d{1,2})\s*時/g, (m, h) => `${(Number(h) % 12) + 12}時`);
  // 午前/午後＋コロン形式（例: 午前10:30 → 10:30、午後1:30 → 13:30）
  t = t.replace(/午前\s*(\d{1,2})(:\d{2})/g, (m, h, mm) => `${h}${mm}`);
  t = t.replace(/午後\s*(\d{1,2})(:\d{2})/g, (m, h, mm) => `${(Number(h) % 12) + 12}${mm}`);
  // 「N時M分」「N時半」「N時」→ HH:MM
  t = t.replace(/(\d{1,2})\s*時\s*(\d{1,2})\s*分/g, (m, h, mm) => `${h}:${mm.padStart(2, '0')}`);
  t = t.replace(/(\d{1,2})\s*時半/g, (m, h) => `${h}:30`);
  t = t.replace(/(\d{1,2})\s*時/g, (m, h) => `${h}:00`);
  t = t.replace(/\s*から\s*/g, '～');                  // 「14:00から16:00」
  // 区切り（波ダッシュ・チルダ・各種ハイフン）→ ～
  t = t.replace(/[〜~－―—]/g, '～').replace(/(?<=\d)\s*-\s*(?=\d)/g, '～');
  // 4桁 HHMM（前後が数字/コロンでない）→ HH:MM
  t = t.replace(/(?<![\d:])(\d{2})(\d{2})(?![\d:])/g, (m, h, mm) => (Number(h) <= 23 && Number(mm) <= 59) ? `${h}:${mm}` : m);
  // H:MM → 0H:MM（時を2桁化）
  t = t.replace(/(?<![\d:])(\d):(\d{2})/g, '0$1:$2');
  // 複数部制の区切り（「、」「,」で時刻が続く）は「／」に統一
  // 例: 「10:30～11:30、13:30～14:30」→「10:30～11:30／13:30～14:30」
  t = t.replace(/(\d{2}:\d{2})\s*[、,]\s*(?=\d{1,2}:\d{2})/g, '$1／');
  t = t.replace(/\s+/g, ' ').replace(/\s*～\s*/g, '～').trim();
  t = t.replace(/^[、,～\s]+|[、,\s]+$/g, '').trim();
  return t;
}

const EN_WEEKDAY = { sun: '日', mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土' };

/**
 * 「締切」欄を整形する。"null" 等は空、英語表記「7/8 wed.」→「7月8日（水）」。
 * 日付の推測（年補完等）はしない（原文の体裁だけ整える）。
 */
function cleanDeadlineText(raw) {
  if (isEmptyFieldText(raw)) return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\s*(sun|mon|tue|wed|thu|fri|sat)?\.?$/i);
  if (m) return `${+m[1]}月${+m[2]}日${m[3] ? `（${EN_WEEKDAY[m[3].toLowerCase()]}）` : ''}`;
  return s;
}

module.exports = {
  applyVerifiedOverrides,
  cleanEventTitle,
  cleanPlaceText,
  splitPlaceAddress,
  cleanTimeText,
  cleanDeadlineText,
  isEmptyFieldText,
  isJunkOrStubTitle,
  isSuspiciousTitle,
  isArchivableEvent,
  isStaleDatedEvent,
  dedupEvents,
  normForDedup,
  toHalfAlnum,
};
