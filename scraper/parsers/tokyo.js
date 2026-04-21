'use strict';

/**
 * 東京地方協力本部 イベントページパーサー
 * 対象: https://www.mod.go.jp/pco/tokyo/event2/index.html
 *
 * HTML構造の想定:
 *   <section>
 *     <h3>（または <h4>）イベントタイトル</h3>
 *     <dl>
 *       <dt>日時</dt><dd>令和８年４月２６日（日）10:00～12:00</dd>
 *       <dt>場所</dt><dd>市ヶ谷駐屯地 厚生センター</dd>
 *       <dt>住所</dt><dd>新宿区市谷本村町5-1</dd>
 *       <dt>種目</dt><dd>説明会</dd>
 *       <dt>備考</dt><dd>事前申込制</dd>
 *     </dl>
 *   </section>
 *
 * 全角数字（令和８年４月２６日）を半角変換してからISO8601へ変換。
 */

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseTokyo($) {
  const events = [];
  let idx = 0;

  // ── section 要素を走査 ──
  $('section').each((_i, secEl) => {
    const $sec = $(secEl);

    // タイトルは section 内の最初の見出し（h2〜h4）
    const titleEl = $sec.find('h2, h3, h4, H2, H3, H4').first();
    const title   = titleEl.text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    // dl > dt + dd のペアを Map に変換
    const fields = {};
    $sec.find('dl').each((_j, dlEl) => {
      $(dlEl).find('dt').each((_k, dtEl) => {
        const key = $(dtEl).text().replace(/\s+/g, '').trim();
        const dd  = $(dtEl).next('dd');
        fields[key] = dd.text().replace(/\s+/g, ' ').trim();
      });
    });

    // ── 日時の解析 ──
    // 対応フォーマット:
    //   "令和８年４月２６日（日）10:00～12:00"
    //   "令和8年4月26日(日) 10:00～12:00"
    const rawDate = toHalfWidth(
      fields['日時'] || fields['開催日時'] || fields['日程'] || ''
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

    if (isPast(dateStr)) return;

    // 日付以降の時刻部分を抽出 "10:00～12:00"
    const timeMatch = rawDate.match(/[）)]\s*(\d{1,2}:\d{2}.+)/);
    const time = timeMatch ? timeMatch[1].trim() : '';

    // ── 場所・住所 ──
    const place   = fields['場所'] || fields['開催場所'] || fields['会場'] || '';
    const address = fields['住所'] || fields['所在地'] || '';

    // ── カテゴリ・タグ ──
    // dl 内の「種目」「区分」フィールドを優先し、なければタイトルから推定
    const rawCategory = fields['種目'] || fields['区分'] || fields['カテゴリ'] || '';
    const category    = rawCategory || guessCategory(title);
    const tag         = fields['備考'] ? guessTag(fields['備考']) : guessTag(title);

    // ── URL ──
    const href = $sec.find('a').filter((_k, a) => {
      const text = $(a).text();
      return /詳細|公式|申込|申し込み|こちら/i.test(text);
    }).attr('href') || $sec.find('a').first().attr('href') || '';
    const url = href.startsWith('http') ? href
      : href ? `https://www.mod.go.jp${href.startsWith('/') ? '' : '/pco/tokyo/event2/'}${href}`
      : '';

    // ── 備考（notesフィールド）──
    const notes = fields['備考'] || fields['注意事項'] || fields['その他'] || null;

    events.push({
      id:       `t-${dateStr.replace(/-/g, '')}-${++idx}`,
      date:     dateStr,
      weekday,
      title,
      place,
      address,
      time,
      category,
      tag,
      url,
      notes:    notes || null,
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseTokyo };
