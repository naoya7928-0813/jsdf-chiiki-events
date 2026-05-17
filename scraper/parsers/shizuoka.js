'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * 静岡地本イベントページのパーサー
 * URL: https://www.mod.go.jp/pco/sizuoka/event/index.html
 *
 * 構造: .card-body.p-4 ごとに 1 件（Bootstrap カード）
 *   p.text-primary.card-text.mb-0       → カテゴリ（例: 一般公開, EVENT, 体験航海）
 *   h4.card-title                        → イベント名
 *   p.card-text[.bi-calendar-date icon] → 日付テキスト
 *   p.card-text[.bi-clock icon]          → 時間テキスト
 *   p.card-text（残り）                  → 場所
 *   p.card-text[.bi-info-circle icon]   → 参加対象（ageRequirement）
 *   p.card-text.small                   → 連絡事項（notes）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseShizuoka($) {
  const events = [];
  let idx = 0;

  $('.card-body.p-4').each((_i, bodyEl) => {
    const $body = $(bodyEl);

    const title = $body.find('h4.card-title').text().replace(/\s+/g, ' ').trim();
    if (!title) return;

    // カテゴリラベル（p.text-primary.mb-0）
    const categoryLabel = $body.find('p.text-primary.card-text.mb-0').first()
      .text().replace(/\s+/g, ' ').trim();

    // 日付: .bi-calendar-date アイコンを含む p
    // ※ <span> は曜日（例: <span class="text-primary">土</span>）を含むため除去しない
    const $datePara = $body.find('p.card-text').filter((_j, p) =>
      $(p).find('.bi-calendar-date').length > 0
    ).first();
    const rawDate = toHalfWidth($datePara.clone()
      .find('i').remove().end()   // <i> アイコンのみ除去
      .text().replace(/\s+/g, ' ').trim()
    );

    // "2026年5月14日(木)..." or "令和8年5月6日（土）..."
    const gregMatch  = rawDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[（(]([月火水木金土日祝]+)[）)]/);
    const reiwaMatch = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

    let dateStr, weekday;
    if (reiwaMatch) {
      const year = reiwaToAD(parseInt(reiwaMatch[1], 10));
      dateStr  = `${year}-${padTwo(parseInt(reiwaMatch[2], 10))}-${padTwo(parseInt(reiwaMatch[3], 10))}`;
      weekday  = reiwaMatch[4];
    } else if (gregMatch) {
      dateStr  = `${gregMatch[1]}-${padTwo(parseInt(gregMatch[2], 10))}-${padTwo(parseInt(gregMatch[3], 10))}`;
      weekday  = gregMatch[4];
    } else {
      return;
    }
    if (isPast(dateStr)) return;

    // 時間: .bi-clock アイコンを含む p（bi-dash → 〜 に変換）
    const $timePara = $body.find('p.card-text').filter((_j, p) =>
      $(p).find('.bi-clock').length > 0
    ).first();
    const timeRaw = $timePara.clone()
      .find('i.bi-dash').replaceWith('〜').end()
      .find('i').remove().end()
      .text().replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // 先頭の時刻パターン "HH:MM〜HH:MM" を抽出
    const timeMatch = toHalfWidth(timeRaw).match(/\d+:\d+[〜～]\d+:\d+/);
    const time      = timeMatch ? timeMatch[0] : toHalfWidth(timeRaw).replace(/\s+/g, '').substring(0, 20);

    // 場所: bi-calendar-date / bi-clock / bi-info-circle を含まず、.small でなく、.mb-0 でもない p
    const usedIconClasses = ['.bi-calendar-date', '.bi-clock', '.bi-info-circle', '.bi-asterisk'];
    let place = '';
    $body.find('p.card-text').each((_j, pEl) => {
      const $p = $(pEl);
      if ($p.hasClass('mb-0')) return;
      if ($p.hasClass('small') || $p.hasClass('mb-1')) return;
      if (usedIconClasses.some(ic => $p.find(ic).length > 0)) return;
      const text = $p.clone().find('i').remove().end().text().replace(/\s+/g, ' ').trim();
      if (text && !place) place = text;
    });

    // 参加対象
    const $agePara = $body.find('p.card-text').filter((_j, p) =>
      $(p).text().includes('参加対象')
    ).first();
    const ageRaw = $agePara.clone()
      .find('i').remove().end()
      .text().replace(/\s+/g, ' ').trim()
      .replace(/^参加対象\s*[・\-]\s*/, '')
      .trim();
    const ageRequirement = ageRaw || null;

    // 連絡事項（.small）
    const notesParts = [];
    $body.find('p.card-text.small, p.card-text.mb-1').each((_j, pEl) => {
      const text = $(pEl).clone().find('i, span.fas, span.fab').remove().end()
        .text().replace(/\s+/g, ' ').trim();
      if (text) notesParts.push(text);
    });
    const notes = notesParts.join('\n') || null;

    events.push({
      id:             `sz-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'shizuoka',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time:           toHalfWidth(time),
      category:       guessCategory(toHalfWidth(title)) || categoryLabel,
      tag:            guessTag(`${title} ${ageRequirement || ''} ${notes || ''}`),
      url:            '',
      notes,
      ageRequirement,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseShizuoka };
