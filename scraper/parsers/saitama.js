'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/saitama/event/';

function resolveUrl(href, baseUrl = BASE_URL) {
  if (!href) return '';
  // HTMLの属性が誤ってhref値に混入したケース（例: "file.jpg target=_blank"）を除去
  const clean = href.split(/\s/)[0].split('%20')[0];
  if (clean.startsWith('http')) return clean;
  try {
    return new URL(clean, baseUrl).href;
  } catch {
    return '';
  }
}

/** お問い合わせ先テキストから担当事務所名（〜地域事務所/募集案内所/出張所）を抽出 */
function extractOffice(raw) {
  if (!raw) return '';
  const m = raw.match(/([一-龯ぁ-んァ-ヶ]+(?:地域事務所|募集案内所|出張所))/);
  return m ? m[1] : '';
}

/**
 * 埼玉地本のイベント／採用説明会ページをパースする。
 * `/event/`（一般イベント）と `/job-fair/`（各事務所の採用説明会）が
 * 同一の section.subSec / h3 / h4 / dl 構造のため、baseUrl を切り替えて共用する。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} [baseUrl] 相対URL解決の基準（job-fair 取得時は当該ページURL）
 * @returns {Array<Object>}
 */
function parseSaitama($, baseUrl = BASE_URL) {
  const events = [];

  // イベントカードは section.subSec（コメントアウトされた section は Cheerio が自動除外）
  $('section.subSec').each((_i, secEl) => {
    const $sec = $(secEl);

    // タイトル: h3[id] 優先、なければ h3
    const title = ($sec.find('h3[id]').first().text()
      || $sec.find('h3').first().text()
    ).replace(/\s+/g, ' ').trim()
      // 末尾に付くことがある日付（例: "…in朝霞 8.6.20（土）"）を除去
      .replace(/\s*\d{1,2}\.\d{1,2}\.\d{1,2}\s*[（(][月火水木金土日祝・]+[）)]\s*$/, '')
      .trim();
    if (!title) return;

    // 日付: dl ではなく h4 テキストに含まれる（例: 令和８年５月１９日（火））
    const rawDate = toHalfWidth($sec.find('h4').first().text().replace(/\s+/g, ' ').trim());
    if (!rawDate) return;

    const dtMatch = rawDate.match(
      /令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/
    );
    if (!dtMatch) return;

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const month   = parseInt(dtMatch[2], 10);
    const day     = parseInt(dtMatch[3], 10);
    const weekday = dtMatch[4];
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;

    if (isPast(dateStr)) return;

    // dl > dt + dd のペアを Map に変換
    const fields = {};
    $sec.find('dl dt').each((_k, dtEl) => {
      const key = toHalfWidth($(dtEl).text()).replace(/\s+/g, '').trim();
      const dd  = $(dtEl).next('dd');
      fields[key] = dd.text().replace(/\s+/g, ' ').trim();
    });

    // 場所: 見学先 / 場所 / 会場（埼玉は見学型・説明会型イベントが多い）
    const place = (fields['見学先'] || fields['場所'] || fields['会場'] || '').trim();
    // 住所: 所在地（説明会ページにあり、地図精度向上に使用）
    const address = (fields['所在地'] || fields['住所'] || '').trim();

    // 時間: 時程（説明会ページ）も対象に含める
    const time = toHalfWidth(
      fields['時間'] || fields['集合時間'] || fields['開催時間'] || fields['受付時間'] || fields['時程'] || ''
    ).trim();

    // カテゴリ・タグ
    const rawCategory = fields['種目'] || fields['区分'] || fields['カテゴリ'] || '';
    const category    = rawCategory || guessCategory(toHalfWidth(title));
    const tag         = fields['備考'] ? guessTag(fields['備考']) : guessTag(title);

    // URL: セクション内の最初のリンク
    const linkHref = $sec.find('a').first().attr('href') || '';
    const url = resolveUrl(linkHref, baseUrl);

    // 画像URL: div.imgContents の a[href] または img[src]
    const $img    = $sec.find('.imgContents');
    const imgHref = $img.find('a').first().attr('href') || '';
    const imgSrc  = $img.find('img').first().attr('src') || '';
    const imageUrl = resolveUrl(imgHref || imgSrc, baseUrl);

    const ageRequirement = toHalfWidth(fields['応募資格'] || fields['対象者'] || '').trim() || null;
    const deadline       = toHalfWidth(fields['応募締切'] || fields['締切'] || '').trim() || null;

    // 担当事務所（お問い合わせ先の〜地域事務所等）を notes 先頭に付与
    const office    = extractOffice(fields['お問い合わせ先'] || '');
    const baseNotes = fields['実施内容'] || fields['内容'] || fields['備考'] || null;
    const notes     = office
      ? `担当: ${office}${baseNotes ? `\n${baseNotes}` : ''}`
      : (baseNotes || null);

    events.push({
      id:      `s-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:    'saitama',
      date:    dateStr,
      weekday,
      title,
      place,
      address,
      time,
      category,
      tag,
      url,
      notes,
      ageRequirement,
      deadline,
      imageUrl,
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseSaitama };
