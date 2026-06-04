'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo , titleHash } = require('./utils');

const BASE_URL = 'https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html';

/** 相対URLを絶対URLに解決する */
function resolveUrl(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, BASE_URL).href;
  } catch {
    return '';
  }
}

/** "1000" や "930" → "10:00" / "09:30" */
function formatHHMM(s) {
  const n = s.replace(':', '');
  if (n.length === 3) return `0${n[0]}:${n.slice(1)}`;
  if (n.length === 4) return `${n.slice(0, 2)}:${n.slice(2)}`;
  return s;
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
function parseKanagawa($) {
  const events = [];
  let idx = 0;

  // H3「令和X年Y月イベント一覧」→ 直後の UL を走査
  $('h3, H3').each((_i, h3el) => {
    const h3text = toHalfWidth($(h3el).text());
    const ymMatch = h3text.match(/令和(\d+)年(\d+)月/);
    if (!ymMatch) return;

    const baseYear  = reiwaToAD(parseInt(ymMatch[1], 10));
    const baseMonth = parseInt(ymMatch[2], 10);

    // 直後の UL を探す
    let sibling = $(h3el).next();
    while (sibling.length && !sibling.is('ul, UL')) {
      sibling = sibling.next();
    }
    if (!sibling.length) return;

    sibling.find('li, LI').each((_j, liEl) => {
      const $li = $(liEl);

      // 場所とURLはリンク要素から取得
      const $a   = $li.find('a').first();
      const place = $a.text().replace(/\s+/g, ' ').trim();
      const url   = resolveUrl($a.attr('href') || '');

      // LI 全テキストを半角化・正規化
      const raw = toHalfWidth($li.text()).replace(/\s+/g, ' ').trim();

      // 日付: M/D 形式（例: 4/15、4/26-5/6 の先頭日）
      const dateMatch = raw.match(/(\d{1,2})\/(\d{1,2})/);
      if (!dateMatch) return;

      const m = parseInt(dateMatch[1], 10);
      const d = parseInt(dateMatch[2], 10);

      // 翌年またぎ: H3が11月以降でLIが1月等の場合
      const year    = (m < baseMonth && baseMonth >= 11) ? baseYear + 1 : baseYear;
      const dateStr = `${year}-${padTwo(m)}-${padTwo(d)}`;

      if (isPast(dateStr)) return;

      // タイトル: 日付パターンより前のテキスト
      const datePos = raw.indexOf(dateMatch[0]);
      const title   = raw.substring(0, datePos).replace(/\s+/g, ' ').trim();
      if (!title) return;

      // 時刻: HHMM-HHMM or HHMM～HHMM（例: 1000-1220、0930～1200）
      const timeMatch = raw.match(/(\d{3,4})[:\-～~](\d{3,4})/);
      const time = timeMatch
        ? `${formatHHMM(timeMatch[1])}～${formatHHMM(timeMatch[2])}`
        : '';

      events.push({
        // 同一日に同名イベント（例: 高等工科学校説明会）が複数事務所であるため
        // 会場(place)も含めて id を一意化する
        id:       `k-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, `${title}|${place}`)}`,
        pref:     'kanagawa',
        date:     dateStr,
        weekday:  '',
        title,
        place,
        address:  '',
        time,
        category: guessCategory(title),
        tag:      guessTag(title),
        url,
        notes:    null,
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseKanagawa };
