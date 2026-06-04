'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, jstYear, titleHash } = require('./utils');

/**
 * 大阪地本イベントページ (experience/event.html) のパーサー
 *
 * 構造: h3 = イベント名、直後の table の「日時」行に開催日時、「場所」行に会場
 *   table row: "日時 | 令和8年4月25日(土) 08:00～15:00"
 *   table row: "場所 | 陸上自衛隊信太山駐屯地"
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseOsaka($) {
  const events = [];
  const SOURCE_URL = 'https://www.mod.go.jp/pco/osaka/experience/event.html';

  $('table').each((_, tbl) => {
    let dateStr = '', weekday = '', time = '', place = '';

    $(tbl).find('tr').each((_, tr) => {
      const cells = $(tr).find('td,th');
      if (cells.length < 2) return;
      const label = cells.first().text().trim().replace(/\s+/g, '');
      const value = cells.eq(1).text().trim().replace(/\s+/g, ' ');

      if (label === '日時' || label === '実施日') {
        // "令和8年4月25日(土) 08:00～15:00"
        const reiwaM = value.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);
        // "5月9日（日）11:00"
        const monthM = value.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝]+)[）)]/);

        if (reiwaM) {
          const y = reiwaToAD(parseInt(reiwaM[1], 10));
          dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
          weekday = reiwaM[4];
        } else if (monthM) {
          const m     = parseInt(monthM[1], 10);
          const d     = parseInt(monthM[2], 10);
          dateStr = `${jstYear()}-${padTwo(m)}-${padTwo(d)}`;
          weekday = monthM[3];
        }
        const timeM = value.match(/(\d+:\d+[～〜]\d+:\d+)/);
        if (timeM) time = timeM[1];

      } else if (label === '場所') {
        place = value.split(/[（(]/)[0].trim(); // 住所部分は除く
      }
    });

    if (!dateStr || isPast(dateStr)) return;

    // 直前の h3 をタイトルとして使用（h2/h4/区切り要素はスキップ）
    let title = '';
    let el = $(tbl).prev();
    for (let i = 0; i < 8 && el.length; i++) {
      if (el.is('h3')) { title = el.text().trim(); break; }
      if (el.is('h2') || el.is('h4') || el.is('hr')) break;
      el = el.prev();
    }
    if (!title) return;

    events.push({
      id:             `os-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
      pref:           'osaka',
      date:           dateStr,
      weekday,
      title:          title.substring(0, 60),
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            SOURCE_URL,
      notes:          null,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    });
  });

  return events;
}

const SESSION_URL = 'https://www.mod.go.jp/pco/osaka/recruit/session/menu.html';

/**
 * 大阪地本の募集案内所等説明会ページ (recruit/session/menu.html) のパーサー。
 * 1テーブル＝1案内のキー値形式（場所 / 日時(or期間) / 時間 / 内容）。
 * 見出し(h2)がカテゴリ（個別説明会・ハローワーク説明会 等）。
 * 日時から将来の開催日を抽出（①②の複数日対応、A～Bの期間は開始日のみ）。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseOsakaSession($) {
  const events = [];
  const seq = $('h2, h3, table').toArray();

  $('table').each((_t, tblEl) => {
    const $tbl = $(tblEl);

    // キー値テーブルを Map 化
    const fields = {};
    $tbl.find('tr').each((_r, tr) => {
      const cells = $(tr).find('th, td');
      if (cells.length < 2) return;
      const key = toHalfWidth($(cells[0]).text()).replace(/\s+/g, '');
      const val = $(cells[1]).text().replace(/\s+/g, ' ').trim();
      if (key && !(key in fields)) fields[key] = val;
    });

    const dateRaw = toHalfWidth(fields['日時'] || fields['期間'] || fields['日にち'] || '');
    if (!dateRaw) return;

    const dateMatches = [...dateRaw.matchAll(/(?:令和(\d+)年)?(\d+)月(\d+)日[（(]([月火水木金土日祝])[）)]/g)];
    if (dateMatches.length === 0) return;

    // 直前の見出し（カテゴリ）
    const idx = seq.indexOf(tblEl);
    let heading = '';
    for (let j = idx - 1; j >= 0; j--) {
      if (seq[j].tagName === 'h2' || seq[j].tagName === 'h3') { heading = $(seq[j]).text().replace(/\s+/g, ' ').trim(); break; }
    }
    const category = heading.replace(/^[０-９0-9]+月\s*/, '').replace(/のご案内$/, '').trim() || '説明会';
    const place    = (fields['場所'] || '').trim();
    const content  = (fields['内容'] || '').trim();
    const timeRaw  = toHalfWidth(fields['時間'] || fields['日時'] || '');
    const time     = (timeRaw.match(/\d{1,2}:\d{2}\s*[～~\-]\s*\d{1,2}:\d{2}/g) || []).join(' ');

    // 「M月D日(曜)～M月D日(曜)」の期間は開始日のみ。①②列挙は全日。
    const isRange = /\d+月\d+日[（(][^）)]*[）)]\s*[～~]\s*(?:令和\d+年)?\d+月\d+日/.test(dateRaw);
    const picks   = isRange ? dateMatches.slice(0, 1) : dateMatches;

    const seen = new Set();
    for (const m of picks) {
      const year    = m[1] ? reiwaToAD(parseInt(m[1], 10)) : jstYear();
      const month   = parseInt(m[2], 10);
      const day     = parseInt(m[3], 10);
      const weekday = m[4];
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr) || seen.has(dateStr)) continue;
      seen.add(dateStr);

      const title = category;
      events.push({
        id:             `os-set-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, `${title}|${place}`)}`,
        pref:           'osaka',
        date:           dateStr,
        weekday,
        title,
        place,
        address:        '',
        time,
        category:       guessCategory(toHalfWidth(`${title} ${content}`)) || '説明会',
        tag:            guessTag(title),
        url:            SESSION_URL,
        notes:          content || null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    }
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseOsaka, parseOsakaSession };
