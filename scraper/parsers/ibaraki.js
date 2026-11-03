'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo, jstYear, titleHash, resolveYearByWeekday } = require('./utils');

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
 * 「日程」欄の日付を読む（令和年なし）。
 *   11月3日(火・祝) / 11月8日(日)のみ               → 1日
 *   11月11日(火)、12日(水)、17日(火)                → 飛び飛びの複数日（日ごとに1件）
 *   11月21日(土)～23日(月)                          → 連日開催（endDate）
 * 年は曜日から決める（年末に翌年1月の予定が並ぶため）。曜日と合わない日付は採らない。
 * @returns {Array<{date:string, weekday:string, endDate?:string, endWeekday?:string}>}
 */
function parseScheduleDates(text) {
  const raw = toHalfWidth(String(text || '')).replace(/\s+/g, '');
  const re = /(?:(\d{1,2})月)?(\d{1,2})日[(（]([^)）]*)[)）]/g;
  const items = [];
  let month = null;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m[1]) month = Number(m[1]);
    if (!month) continue;
    items.push({ month, day: Number(m[2]), weekday: m[3], index: m.index, end: m.index + m[0].length });
  }
  const nowYear = jstYear();
  const toDate = (it) => {
    // 曜日が合う年（今年・来年）を優先。合わないとき（ページの曜日の書き間違い。
    // 2026-11 実例「11月11日(火)、12日(水)」）は日付を捨てず、修正前と同じく今年として扱う。
    // 半年以上前の月日だけは年末に載る翌年の予定とみなす。曜日は公開時に日付から計算し直される。
    let y = resolveYearByWeekday(it.month, it.day, it.weekday, nowYear);
    if (!y) {
      const thisYear = `${nowYear}-${padTwo(it.month)}-${padTwo(it.day)}`;
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      y = (Date.parse(today) - Date.parse(thisYear)) / 86400000 > 180 ? nowYear + 1 : nowYear;
    }
    const date = `${y}-${padTwo(it.month)}-${padTwo(it.day)}`;
    const dt = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== it.day) return null; // 2月30日などの実在しない日付
    return { date, weekday: '日月火水木金土'[dt.getUTCDay()] };
  };

  // 「A～B」の2日だけなら連日開催として1件にまとめる
  if (items.length === 2 && /^[～~\-－]/.test(raw.slice(items[0].end, items[1].index))) {
    const a = toDate(items[0]);
    const b = toDate(items[1]);
    if (a && b && b.date > a.date) return [{ ...a, endDate: b.date, endWeekday: b.weekday }];
  }
  return items.map(toDate).filter(Boolean);
}

/** dl（dt=項目名 / dd=値）の表を {項目名: {text, href}} に */
function readDl($, $dl) {
  const out = {};
  $dl.find('dt').each((_i, dtEl) => {
    const key = $(dtEl).text().replace(/\s+/g, '').trim();
    const $dd = $(dtEl).nextAll('dd').first();
    if (!key || !$dd.length || out[key]) return;
    out[key] = {
      text: $dd.text().replace(/\s+/g, ' ').trim(),
      href: $dd.find('a[href]').first().attr('href') || '',
    };
  });
  return out;
}

function eventsFromDl($, $dl, title, pText) {
  const f = readDl($, $dl);
  const schedule = f['日程'] || f['日時'] || f['開催日'];
  if (!schedule) return [];

  const time  = f['時間'] ? toHalfWidth(f['時間'].text) : '';
  const place = (f['場所'] || f['会場'] || { text: '' }).text;
  const notes = (f['内容'] || {}).text || pText || null;
  let url = '';
  const href = (f['詳細'] || {}).href;
  if (href) {
    try { url = new URL(href, BASE_URL).href; } catch { /* noop */ }
  }

  return parseScheduleDates(schedule.text)
    .filter(d => !isPast(d.endDate || d.date))
    .map(d => ({
      id:             `ib-${d.date.replace(/-/g, '')}-${titleHash(d.date, title)}`,
      pref:           'ibaraki',
      date:           d.date,
      weekday:        d.weekday,
      ...(d.endDate ? { endDate: d.endDate, endWeekday: d.endWeekday } : {}),
      title,
      place,
      address:        '',
      time,
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url,
      notes,
      ageRequirement: null,
      deadline:       null,
      imageUrl:       '',
    }));
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

    // この h3 と次の h3 の間にある最初の h4・p・dl を収集
    let h4Text = '';
    let pText  = '';
    let $dl    = null;
    let $el    = $(h3El).next();

    while ($el.length && !$el.is('h3')) {
      if ($el.is('h4') && !h4Text) {
        h4Text = $el.text().replace(/\s+/g, ' ').trim();
      }
      if ($el.is('p') && !pText && !$el.find('img').length) {
        const t = $el.text().replace(/\s+/g, ' ').trim();
        if (t) pText = t;
      }
      if ($el.is('dl') && !$dl) $dl = $el;
      $el = $el.next();
    }

    // 2026-10 以降の形式: h3 の後に <dl><dt>日程</dt><dd>11月3日(火・祝)</dd>… の項目表
    if ($dl) {
      for (const ev of eventsFromDl($, $dl, title, pText)) {
        events.push(ev);
      }
      return;
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
