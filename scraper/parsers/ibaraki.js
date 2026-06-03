'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo, jstYear, titleHash } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/ibaraki/event.html';
const SETSUMEIKAI_URL = 'https://www.mod.go.jp/pco/ibaraki/setsumeikai.html';

/** 令和年なしの「X月Y日」→ スクレイピング時の西暦を返す（過去日は isPast() で除外）*/
function inferYear() {
  return jstYear();
}

/** お問い合わせ先テキストから担当事務所名（〜募集案内所/地域事務所/出張所）を抽出 */
function extractOffice(raw) {
  if (!raw) return '';
  const m = toHalfWidth(raw).match(/([一-龯ぁ-んァ-ヶ]+(?:募集案内所|地域事務所|出張所|案内所))/);
  return m ? m[1] : '';
}

/**
 * 茨城: div.post 内に h3（タイトル）+ h4（日時）+ p（場所・詳細）の平坦構造
 * 日付は「4月26日　日曜日　午前10時から午後3時」形式（令和年なし）
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseIbaraki($) {
  const events = [];
  let idx = 0;

  // セクション見出しとして無視する h3 テキスト
  const SKIP = ['自衛隊イベント情報', '広報官がイベント会場にいます', '自衛官の採用試験について'];

  $('div.post h3').each((_i, h3El) => {
    const title = $(h3El).text().replace(/\s+/g, ' ').trim();
    if (!title || SKIP.some(s => title.includes(s))) return;

    // この h3 と次の h3 の間にある最初の h4 と p を収集
    let h4Text = '';
    let pText  = '';
    let $el    = $(h3El).next();

    while ($el.length && !$el.is('h3')) {
      if ($el.is('h4') && !h4Text) {
        h4Text = $el.text().replace(/\s+/g, ' ').trim();
      }
      if ($el.is('p') && !pText && !$el.find('img').length) {
        const t = $el.text().replace(/\s+/g, ' ').trim();
        if (t) pText = t;
      }
      $el = $el.next();
    }

    if (!h4Text) return;

    // 全角→半角、「日時：」プレフィックスを除去
    const raw = toHalfWidth(h4Text).replace(/^日時[：:]\s*/, '');

    // 月・日・曜日を抽出（令和年なし）
    const dtMatch = raw.match(/(\d+)月(\d+)日\s*([月火水木金土日])/);
    if (!dtMatch) return;

    const month   = parseInt(dtMatch[1], 10);
    const day     = parseInt(dtMatch[2], 10);
    const weekday = dtMatch[3];
    const year    = inferYear(month, day);
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) return;

    // 時間: 曜日 のあとの部分（「午前10時から午後3時」等）
    const timeMatch = raw.match(/曜日\s*(.*)/);
    const time = timeMatch ? timeMatch[1].trim() : '';

    // 場所: p テキストから「場所：〇〇」または「場所は〇〇にて」を抽出
    const placeMatch = pText.match(/場所[：:は]?\s*([^。。\n<]+)/);
    const place = placeMatch
      ? placeMatch[1].replace(/にて.*|まで.*|<br>.*/, '').trim()
      : '';

    events.push({
      id:             `ib-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'ibaraki',
      date:           dateStr,
      weekday,
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          pText || null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 茨城: setsumeikai.html の採用説明会スケジュール（表形式）をパースする。
 * 各事務所が担当する説明会イベントが「日時 / 名称等 / 場所 / お問い合わせ先」の
 * 4列テーブルで掲載されている。お問い合わせ先から担当事務所を抽出する。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseIbarakiSetsumeikai($) {
  const events = [];

  $('table').each((_t, tblEl) => {
    const $tbl = $(tblEl);
    // ヘッダーに「日時」「名称」を含む説明会スケジュール表のみ対象
    const header = $tbl.find('tr').first().text().replace(/\s+/g, '');
    if (!/日時|名称/.test(header)) return;

    $tbl.find('tr').each((_r, trEl) => {
      const $tds = $(trEl).find('td');
      if ($tds.length < 4) return; // ヘッダー(th)・不完全行を除外

      const c0        = toHalfWidth($($tds[0]).text().replace(/\s+/g, ' ').trim());
      const $titleTd  = $($tds[1]);
      const title     = $titleTd.text().replace(/\s+/g, ' ').trim();
      const place     = $($tds[2]).text().replace(/\s+/g, ' ').trim();
      const contact   = $($tds[3]).text().replace(/\s+/g, ' ').trim();
      if (!title || !c0) return;

      const dtMatch = c0.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝])[）)]/);
      if (!dtMatch) return;

      const month   = parseInt(dtMatch[1], 10);
      const day     = parseInt(dtMatch[2], 10);
      const weekday = dtMatch[3];
      const year    = jstYear();
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      // 時間: 「X月Y日（曜）」より後ろ（例: ①10:00②11:00 / 10:00～15:00）
      const time = c0.slice(c0.indexOf(dtMatch[0]) + dtMatch[0].length).trim();

      // タイトルセル内のリンク（外部イベントページ等）を URL に
      const href = $titleTd.find('a').first().attr('href') || '';
      let url = '';
      if (href) {
        try { url = href.startsWith('http') ? href : new URL(href, SETSUMEIKAI_URL).href; } catch { /* noop */ }
      }

      const office = extractOffice(contact);

      events.push({
        // 同一日に同名イベント（例: 公安系公務員合同説明会）が複数会場であるため
        // 会場・時間も含めて id を一意化する
        id:             `ib-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, `${title}|${place}|${time}`)}`,
        pref:           'ibaraki',
        date:           dateStr,
        weekday,
        title,
        place,
        address:        '',
        time,
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url,
        notes:          office ? `担当: ${office}` : null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseIbaraki, parseIbarakiSetsumeikai };
