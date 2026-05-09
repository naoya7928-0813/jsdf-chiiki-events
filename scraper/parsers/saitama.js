'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/saitama/event/';

function resolveUrl(href) {
  if (!href) return '';
  // HTMLの属性が誤ってhref値に混入したケース（例: "file.jpg target=_blank"）を除去
  const clean = href.split(/\s/)[0].split('%20')[0];
  if (clean.startsWith('http')) return clean;
  try {
    return new URL(clean, BASE_URL).href;
  } catch {
    return '';
  }
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseSaitama($) {
  const events = [];
  let idx = 0;

  // イベントカードは section.subSec（コメントアウトされた section は Cheerio が自動除外）
  $('section.subSec').each((_i, secEl) => {
    const $sec = $(secEl);

    // タイトル: h3[id] 優先、なければ h3
    const title = ($sec.find('h3[id]').first().text()
      || $sec.find('h3').first().text()
    ).replace(/\s+/g, ' ').trim();
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

    // 場所: 見学先 または 場所（埼玉は見学型イベントが多い）
    const place = (fields['見学先'] || fields['場所'] || fields['会場'] || '').trim();

    // 時間
    const time = toHalfWidth(
      fields['時間'] || fields['集合時間'] || fields['開催時間'] || fields['受付時間'] || ''
    ).trim();

    // カテゴリ・タグ
    const rawCategory = fields['種目'] || fields['区分'] || fields['カテゴリ'] || '';
    const category    = rawCategory || guessCategory(toHalfWidth(title));
    const tag         = fields['備考'] ? guessTag(fields['備考']) : guessTag(title);

    // URL: セクション内の最初のリンク
    const linkHref = $sec.find('a').first().attr('href') || '';
    const url = resolveUrl(linkHref);

    // 画像URL: div.imgContents の a[href] または img[src]
    const $img    = $sec.find('.imgContents');
    const imgHref = $img.find('a').first().attr('href') || '';
    const imgSrc  = $img.find('img').first().attr('src') || '';
    const imageUrl = resolveUrl(imgHref || imgSrc);

    const ageRequirement = toHalfWidth(fields['応募資格'] || '').trim() || null;
    const deadline       = toHalfWidth(fields['応募締切'] || fields['締切'] || '').trim() || null;
    const notes          = fields['実施内容'] || fields['内容'] || fields['備考'] || null;

    events.push({
      id:      `s-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:    'saitama',
      date:    dateStr,
      weekday,
      title,
      place,
      address: '',
      time,
      category,
      tag,
      url,
      notes:          notes || null,
      ageRequirement,
      deadline,
      imageUrl,
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseSaitama };
