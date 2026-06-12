'use strict';

/**
 * イベント名の品質管理モジュール（スクレイパー/チェックスクリプト共通）
 *
 * タイトルは複数経路で生成される（HTMLパーサー直接抽出 / OCR /
 * 事務所巡回 / 前回データ維持）ため、個別経路ではなく
 * 最終出力(writeOutput)とQAスクリプトの両方からこのモジュールを使い、
 * 経路に依存しない防御とする。新種の不正パターンはここに追加すること。
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
  t = t.replace(/^イベント情報\s*/, '');           // 見出し「イベント情報」の巻き込み
  t = t.replace(/^[#＃]+\s*/, '');                 // Markdown見出し残骸
  t = t.replace(/^[★☆●○■□◆◇※]+\s*/, '');     // 装飾記号
  t = t.replace(/^[&＆]+\s*/, '');                 // 連結残骸
  // 「NEW6/14&7/11 」「NEW＼」のような新着マーク＋日付断片・装飾
  t = t.replace(/^(?:NEW|ＮＥＷ|新着)(?=[\s\d０-９!！/／&＆＼\\])[!！]*[\s\d０-９/／&＆.．＼\\]*/, '');
  t = t.replace(/^\d\s*(?=[ァ-ヶ])/, '');          // 「1オンライン説明会」等のページ番号残骸
  t = t.replace(/\s*参加費\s*無料[!！]*$/, '');    // 末尾の宣伝文句
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]+\s*$/u, ''); // 末尾の絵文字
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
  if (/及び定員|提出書類|応募方法|様式第/.test(t)) return true; // 様式・フォームの項目断片
  if (/入札公告|オープンカウンター|実施要領|仕様書/.test(t)) return true; // 調達・契約文書（イベントではない）
  if (/チラシを参照|参照願います/.test(t))      return true; // 注記文の混入
  // リンク文言の単独タイトル（「ダウンロード」「こちら」等）
  if (/^(?:ダウンロード|詳細|詳しくは|こちら|チラシ[\d０-９]*|PDF|画像|リンク)$/i.test(t)) return true;
  if (/申込み?リンク|応募リンク|広報申込み/.test(t)) return true; // リンク案内の混入
  // ラベル行がタイトル化（「主催:○○」「開催場所:○○」等）
  if (/^(?:主催|共催|開催場所|場所|会場|日時|日程|お問合せ先?)\s*[:：]/.test(t)) return true;
  // OCR文字化け（簡体字・置換文字。例:「海上自衛隧舞鹤基地」）
  if (/[队乐贝实团济纪记书译录习场隧鹤舰护]|�/.test(t)) return true;
  if (/。/.test(t) && t.length >= 30)          return true; // 文章がタイトル化（案内文の混入）
  // 「自衛隊○○地本イベント」「募集案内所イベント」等の中身なしスタブ
  if (/^(?:自衛隊)?(?:.{0,6}地本|募集案内所|地域事務所|出張所)?イベント(?:\s*（[^）]*）)?$/.test(t)) return true;
  // 部隊・組織名だけでイベント種別（見学・説明会等）が無いタイトル
  // （OCRがチラシ最上部の部隊名だけを拾ったもの。例:「海上自衛隊」「自衛隊仙台病院」）
  // ※ 実在イベントの場合は VERIFIED_OVERRIDES でチラシ照合済みの正式名を登録して救済する
  if (/^(?:陸上|海上|航空)?自衛隊(?:[一-鿿ァ-ヶー]{2,8}(?:病院|救難隊|音楽隊|基地|部隊|駐屯地))?$/.test(t)) return true;
  // 助詞・読点で終わる文の断片（タイトルの途中切れ。例:「最新の」「○○について、」）
  if (/[をがはにへとの、]$/.test(t))           return true;
  // 日本語がほぼ無い断片（例:「1 R.22〜＃2 R.24」）。英語タイトルは許容
  const jp = (t.match(/[぀-ヿ㐀-䶿一-鿿]/g) || []).length;
  if (jp < 3 && !/[A-Za-z]{4,}/.test(t))       return true;
  return false;
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
  for (const m of t.matchAll(/(?:^|\D)(20\d{2})(?:\D|$)/g)) {
    if (parseInt(m[1], 10) < evYear) return true;
  }
  const um = String(ev.url || '').match(/\/(20\d{2})\d{4}[^/]*\.(?:pdf|jpe?g|png|gif)/i);
  if (um && parseInt(um[1], 10) < evYear) return true;
  return false;
}

/** 重複判定用の正規化（括弧内・空白・記号を除去） */
function normForDedup(s) {
  let t = toHalfAlnum(s);
  t = t.replace(/[（(][^）)]*[）)]/g, '');
  t = t.replace(/[\s　・|｜/／&＆!！?？.。、,，:：~〜～\-－]/g, '');
  return t;
}

/**
 * 同一地本内の重複イベントを統合する。
 * 同一日付で、名称が一致（または一方が他方を含む）し、場所が両立する
 * （どちらか空・一致・包含）場合のみ重複とみなす。
 * ※ 同名でも場所が異なるイベント（例: 同日の説明会を複数事務所で開催）は残す。
 * 重複時は情報量の多い方（場所・時間・備考あり）を残す。
 */
function dedupEvents(list) {
  const kept = [];
  const score = e => String(e.title || '').length
    + (e.place ? 5 : 0) + (e.time ? 3 : 0) + (e.notes ? 1 : 0);
  for (const ev of list) {
    const n = normForDedup(ev.title || '');
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (k.ev.date !== ev.date) continue;
      const sameTitle = k.n === n && n.length > 0;
      const contained = !sameTitle && k.n.length >= 10 && n.length >= 10
        && (k.n.includes(n) || n.includes(k.n));
      if (!sameTitle && !contained) continue;
      const pk = normForDedup(k.ev.place || '');
      const pe = normForDedup(ev.place || '');
      // 場所が両方あり、かつ別物なら別イベント
      if (pk && pe && pk !== pe && !pk.includes(pe) && !pe.includes(pk)) continue;
      if (score(ev) > score(k.ev)) kept[i] = { ev, n };
      merged = true;
      break;
    }
    if (!merged) kept.push({ ev, n });
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
];

/** イベントに検証済み修正を適用する（writeOutput から毎回呼ばれる） */
function applyVerifiedOverrides(ev) {
  if (!ev) return ev;
  const u = String(ev.url || '') + ' ' + String(ev.imageUrl || '');
  let out = ev;
  for (const o of VERIFIED_OVERRIDES) {
    if (!u.includes(o.urlIncludes)) continue;
    if (o.date && ev.date !== o.date) continue;
    out = { ...out, ...o.set };
  }
  return out;
}

/**
 * 「場所」欄のゴミを整形する。
 * - OCRがMarkdown表で返した「| 会場名 |」のパイプ残骸を除去
 * - 巡回元の事務所リスト（「A事務所・B事務所 ほか1拠点」等）は会場ではないため
 *   空にする（誤った場所を出すより空欄の方が良い）
 */
function cleanPlaceText(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/\s+/g, ' ').trim();
  p = p.replace(/^[|｜\s]+|[|｜\s]+$/g, '').trim(); // Markdown表残骸
  if (/ほか\d+拠点$/.test(p)) return '';            // 巡回元事務所リスト
  // 複数の事務所・案内所の列挙も巡回元リスト（実会場は通常1つ）
  const officeCount = (p.match(/事務所|案内所|出張所|分駐所/g) || []).length;
  if (officeCount >= 2 && /・/.test(p)) return '';
  return p;
}

module.exports = {
  applyVerifiedOverrides,
  cleanEventTitle,
  cleanPlaceText,
  isJunkOrStubTitle,
  isStaleDatedEvent,
  dedupEvents,
  normForDedup,
  toHalfAlnum,
};
