'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/tokyo/event2/';

/** 相対URLを絶対URLに変換し、../ を解決する */
function resolveUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, BASE_URL).href;
  } catch {
    return '';
  }
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseTokyo($) {
  const events = [];
  let idx = 0;

  // イベントカードは .box-2in1 直下の section
  $('#batabata .box-2in1 > section').each((_i, secEl) => {
    const $sec = $(secEl);

    // タイトル: h3.keshi が優先、なければ h4
    const title = ($sec.find('h3.keshi').first().text()
      || $sec.find('h4').first().text()
      || $sec.find('h3, h4').first().text()
    ).replace(/\s+/g, ' ').trim();
    if (!title) return;

    // dl > dt + dd のペアを Map に変換（全角スペース含むキーを正規化）
    const fields = {};
    $sec.find('dl dt').each((_k, dtEl) => {
      const key = toHalfWidth($(dtEl).text()).replace(/\s+/g, '').trim();
      const dd  = $(dtEl).next('dd');
      fields[key] = dd.text().replace(/\s+/g, ' ').trim();
    });

    // ── 日時の解析 ──
    const rawDate = toHalfWidth(
      fields['開催日時'] || fields['日時'] || fields['日程'] || fields['開催日'] || ''
    );
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

    // 終了日を解析（「〜X月Y日」または「〜Y日」形式）
    let endDate = null;
    const endMatch = rawDate.match(/[〜~](?:(\d+)月)?(\d+)日/);
    if (endMatch) {
      const endMonth = endMatch[1] ? parseInt(endMatch[1], 10) : month;
      const endDay   = parseInt(endMatch[2], 10);
      // 終了月が開始月より小さければ翌月（例：4月28日〜5月10日の 5 > 4 なので問題なし）
      const endYear  = (endMonth < month) ? year + 1 : year;
      endDate = `${endYear}-${padTwo(endMonth)}-${padTwo(endDay)}`;
    }

    // 終了日があれば終了日、なければ開始日で過去判定
    if (isPast(endDate || dateStr)) return;

    // 日付以降の時刻部分 "10:00～12:00"（rawDate に含まれる場合）
    const timeMatch = rawDate.match(/[）)]\s*(\d{1,2}:\d{2}.+)/);
    // rawDate にない場合は独立した時刻フィールドを探す
    const rawTime = toHalfWidth(
      fields['時間'] || fields['集合時間'] || fields['開催時間'] || fields['受付時間'] || ''
    ).replace(/\s+/g, ' ').trim();
    const time = timeMatch ? timeMatch[1].trim() : rawTime;

    // ── 場所 ──
    const place = (fields['場所'] || fields['開催場所'] || fields['会場'] || '')
      .replace(/^\s+/, '').trim();

    // ── カテゴリ・タグ ──
    const rawCategory = fields['種目'] || fields['区分'] || fields['カテゴリ'] || '';
    const category    = rawCategory || guessCategory(toHalfWidth(title));

    // 応募終了スパンがあればタグに反映
    const isEnded = $sec.find('.aka1').text().includes('応募終了');
    const tag = isEnded ? '応募終了'
      : fields['備考'] ? guessTag(fields['備考'])
      : guessTag(title);

    // ── URL ──
    const linkEl = $sec.find('.imgsyoukai-url a').first();
    const url = resolveUrl(linkEl.attr('href') || '');

    // ── ポスター画像URL ──
    const imgSrc  = $sec.find('.imgsyoukai-img img').first().attr('src') || '';
    const imageUrl = resolveUrl(imgSrc);

    // ── 応募資格・締切・notes ──
    const ageRequirement = toHalfWidth(fields['応募資格'] || '').replace(/^\s+/, '').trim() || null;
    const deadline       = toHalfWidth(fields['応募締切'] || '').replace(/^\s+/, '').trim() || null;
    const notes          = (fields['実施内容'] || fields['備考'] || fields['注意事項'] || null);

    events.push({
      id:      `t-${dateStr.replace(/-/g, '')}-${++idx}`,
      pref:    'tokyo',
      date:    dateStr,
      endDate: endDate || null,
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

module.exports = { parseTokyo };
