'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo, titleHash, jstYear } = require('./utils');

const BASE       = 'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/';
const SOURCE_URL = BASE + 'index.html';
const SETSUMEIKAI_URL = 'https://www.mod.go.jp/pco/kyoto/boshuka/jieikan/setsumeikai.html';

/** 相対URL → 絶対URL */
function toAbs(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return BASE + href.replace(/^\.?\//, '');
}

/**
 * 京都地本イベントページ (kouhoushitsu/index.html) のパーサー
 *
 * パターン1（旧形式）: テーブルに「実施日」ヘッダー + テキスト日付・詳細
 * パターン2（新形式）: テーブルに「X月 イベント情報」ヘッダー + PDF/画像リンク
 *   → _flyerUrl を設定したスタブを返し、index.js の enrichFromFlyer で日付補完
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseKyoto($) {
  const events  = [];
  const seenUrl = new Set();

  $('table').each((_, tbl) => {
    const rows = $(tbl).find('tr');
    if (rows.length < 2) return;

    const firstCellText = $(rows[0]).find('td,th').first().text().trim();

    // ── パターン1: 「実施日」ヘッダーのテキスト形式 ──────────────
    if (firstCellText === '実施日') {
      const rawDate = $(rows[1]).find('td,th').first().text().trim().replace(/\s+/g, ' ');

      const reiwaM = rawDate.match(/令和(\d+)年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);
      const gregM  = rawDate.match(/(\d{4})年(\d+)月(\d+)日[（(]([月火水木金土日祝・]+)[）)]/);

      let dateStr = '', weekday = '';
      if (reiwaM) {
        const y = reiwaToAD(parseInt(reiwaM[1], 10));
        dateStr = `${y}-${padTwo(parseInt(reiwaM[2], 10))}-${padTwo(parseInt(reiwaM[3], 10))}`;
        weekday = reiwaM[4];
      } else if (gregM) {
        dateStr = `${gregM[1]}-${padTwo(parseInt(gregM[2], 10))}-${padTwo(parseInt(gregM[3], 10))}`;
        weekday = gregM[4];
      } else {
        return;
      }
      if (isPast(dateStr)) return;

      const detail = rows.length > 2
        ? $(rows[2]).text().replace(/\s+/g, ' ').trim()
        : $(rows[1]).find('td,th').eq(1).text().replace(/\s+/g, ' ').trim();

      const nameM = detail.match(/【■イベント名[】]】?\s*[「『]?([^「『】]+?)[」』]?\s*(?:【|$)/i)
        || detail.match(/[「『]([^「『]+)[」』]/);
      const title = nameM ? nameM[1].trim() : detail.substring(0, 40).trim();
      if (!title) return;

      const placeM = detail.match(/【■(?:場所|開催場所|会場)[】]】?\s*([^【]+?)(?:【|$)/i);
      const timeM  = detail.match(/(\d+:\d+[～〜]\d+:\d+)/);

      events.push({
        id:             `ky-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title.substring(0, 60))}`,
        pref:           'kyoto',
        date:           dateStr,
        weekday,
        title:          title.substring(0, 60),
        place:          placeM ? placeM[1].trim() : '',
        address:        '',
        time:           timeM ? timeM[1] : '',
        category:       guessCategory(toHalfWidth(title)),
        tag:            guessTag(title),
        url:            SOURCE_URL,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
      return;
    }

    // ── パターン2: 「X月 イベント情報」ヘッダーの PDF/画像形式 ───
    if (/イベント情報/.test(firstCellText)) {
      // 画像優先（Groq Vision / Tesseract が使えるため）
      // 同じ href に PDF と PNG の両方がある場合は PNG を使う
      const imgUrls = [];
      $(tbl).find('img[src]').each((_, img) => {
        const src = $(img).attr('src') || '';
        if (/\.(jpe?g|png|gif|webp)/i.test(src)) imgUrls.push(toAbs(src));
      });
      const pdfUrls = [];
      $(tbl).find('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (/\.pdf(\?.*)?$/i.test(href)) pdfUrls.push(toAbs(href));
      });

      // 優先順: 画像 → PDF（画像があれば Groq/Tesseract で処理可能）
      const candidates = imgUrls.length ? imgUrls : pdfUrls;

      for (const flyerUrl of [...new Set(candidates)]) {
        if (seenUrl.has(flyerUrl)) continue;
        seenUrl.add(flyerUrl);
        events.push({
          id:             `ky-stub-${titleHash('', flyerUrl.split('/').pop())}`,
          pref:           'kyoto',
          date:           '',
          weekday:        '',
          title:          '京都地本イベント',
          place:          '',
          address:        '',
          time:           '',
          category:       '採用イベント',
          tag:            '',
          url:            SOURCE_URL,
          notes:          null,
          ageRequirement: null,
          deadline:       null,
          imageUrl:       '',
          _flyerUrl:      flyerUrl,
        });
      }
    }
  });

  return events;
}

/**
 * 京都地本の募集採用説明会ページ (boshuka/jieikan/setsumeikai.html) のパーサー。
 * 各事務所ごとに h3（「○○募集案内所が行う…説明会」）＋テーブル
 * （実施日 / 時間 / 場所 / お問合せ先）の構成。日付のある行のみ抽出し、
 * 担当事務所は直前の h3 から得る。「随時実施」等の非日付行はスキップ。
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseKyotoSetsumeikai($) {
  const events = [];
  const seq    = $('h3, table').toArray(); // h3→table の対応付け用（DOM順）

  $('table').each((_t, tblEl) => {
    const $tbl   = $(tblEl);
    const header = $tbl.find('tr').first().find('th, td')
      .map((_i, c) => toHalfWidth($(c).text()).replace(/\s+/g, '')).get();
    const dateCol  = header.findIndex(h => h.includes('実施日'));
    if (dateCol < 0) return;
    const timeCol  = header.findIndex(h => h.includes('時間'));
    const placeCol = header.findIndex(h => h.includes('場所'));

    // 直前の h3 から担当事務所名を得る
    const idx = seq.indexOf(tblEl);
    let office = '';
    for (let j = idx - 1; j >= 0; j--) {
      if (seq[j].tagName === 'h3') {
        office = $(seq[j]).text().replace(/\s+/g, ' ').trim().replace(/が行う.*$/, '').trim();
        break;
      }
    }

    $tbl.find('tr').slice(1).each((_r, tr) => {
      const cells = $(tr).find('th, td');
      if (!cells.length) return;
      const dateText = toHalfWidth($(cells[dateCol] || cells[0]).text().replace(/\s+/g, ' ').trim());
      const dm = dateText.match(/(\d+)月(\d+)日[（(]([月火水木金土日祝])[）)]/);
      if (!dm) return; // 「随時実施」「平日」等は日付なし → スキップ

      const month = parseInt(dm[1], 10);
      const day   = parseInt(dm[2], 10);
      const weekday = dm[3];
      const dateStr = `${jstYear()}-${padTwo(month)}-${padTwo(day)}`;
      if (isPast(dateStr)) return;

      // 時間・場所（「時間 & 場所」結合列のケースも処理）
      let time = '', place = '';
      const placeRaw = placeCol >= 0 && cells[placeCol] ? $(cells[placeCol]).text().replace(/\s+/g, ' ').trim() : '';
      const timeRaw  = timeCol  >= 0 && cells[timeCol]  ? toHalfWidth($(cells[timeCol]).text().replace(/\s+/g, ' ').trim()) : '';
      const tMatch = (timeRaw || placeRaw).match(/\d{1,2}:\d{2}\s*[～~\-]\s*\d{1,2}:\d{2}/);
      time = tMatch ? tMatch[0].replace(/\s/g, '') : '';
      if (placeCol >= 0 && placeCol !== timeCol) {
        place = placeRaw;
      } else {
        // 時間&場所が同一セル → 時刻を除いた残りを場所とする
        place = (placeRaw || timeRaw).replace(time, '').replace(/[■()（）]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      const title = '自衛官 就職・進学説明会';
      events.push({
        id:             `ky-set-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, `${title}|${place}|${office}`)}`,
        pref:           'kyoto',
        date:           dateStr,
        weekday,
        title,
        place:          place || office,
        address:        '',
        time,
        category:       '説明会',
        tag:            guessTag(title),
        url:            SETSUMEIKAI_URL,
        notes:          office ? `担当: ${office}` : null,
        ageRequirement: null,
        deadline:       null,
        imageUrl:       '',
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseKyoto, parseKyotoSetsumeikai };
