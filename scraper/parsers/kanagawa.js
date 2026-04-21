'use strict';

/**
 * 神奈川地方協力本部 イベントページパーサー
 * 対象: https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html
 *
 * HTML構造の想定:
 *   <H3>令和X年Y月イベント一覧</H3>
 *   <UL>
 *     <LI>4月25日（土）自衛官候補生募集説明会　横浜地域事務所　13:30～15:30</LI>
 *     ...
 *   </UL>
 *
 * Shift_JIS → UTF-8 変換は呼び出し元（index.js）で実施済み。
 * cheerio オブジェクト $ を受け取り、イベント配列を返す。
 */

const { guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, padTwo } = require('./utils');

/**
 * @param {import('cheerio').CheerioAPI} $  cheerio でパース済みのオブジェクト
 * @returns {Array<Object>} イベントオブジェクトの配列
 */
function parseKanagawa($) {
  const events = [];
  let idx = 0;

  // ── H3 タグを順に走査して年月を確定し、直後の UL からイベントを抽出 ──
  $('h3, H3').each((_i, h3el) => {
    const h3text = toHalfWidth($(h3el).text());

    // "令和8年4月" のような年月をキャプチャ
    const ymMatch = h3text.match(/令和(\d+)年(\d+)月/);
    if (!ymMatch) return; // イベント一覧以外の H3 は無視

    const baseYear  = reiwaToAD(parseInt(ymMatch[1], 10));
    const baseMonth = parseInt(ymMatch[2], 10);

    // 直後の UL を探す（間に他の要素が挟まる場合も考慮）
    let sibling = $(h3el).next();
    while (sibling.length && !sibling.is('ul, UL')) {
      sibling = sibling.next();
    }
    if (!sibling.length) return;

    sibling.find('li, LI').each((_j, liEl) => {
      // LI 全体のテキストを正規化
      const raw = toHalfWidth($(liEl).text().replace(/\s+/g, ' ').trim());

      // ── 日付・曜日の抽出 ──
      // 例: "4月25日（土）" or "4月25日(土)"
      const dateMatch = raw.match(/(\d{1,2})月(\d{1,2})日[（(]([月火水木金土日祝・]+)[）)]/);
      if (!dateMatch) return;

      const month   = parseInt(dateMatch[1], 10);
      const day     = parseInt(dateMatch[2], 10);
      const weekday = dateMatch[3];

      // 月が H3 の月より小さければ翌年（年末→年始をまたぐケース）
      const year = (month < baseMonth && baseMonth >= 11) ? baseYear + 1 : baseYear;
      const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;

      // 過去のイベントはスキップ
      if (isPast(dateStr)) return;

      // ── 日付部分を除いた残りテキストを分解 ──
      const rest = raw
        .replace(/\d+月\d+日[（(][^）)]+[）)]/, '')
        .trim();

      // 時刻: "13:30～15:30" or "13:30〜15:30" or "10:00開場"
      const timeMatch = rest.match(/\d{1,2}:\d{2}[～〜～\-–]?\d{0,2}:?\d{0,2}[^\s　]*/);
      const time = timeMatch ? timeMatch[0].trim() : '';

      // 時刻を除いた残り（タイトル＋場所）
      const withoutTime = rest.replace(time, '').replace(/\s+/g, ' ').trim();

      // タイトル・場所を空白または全角スペースで分割
      // 末尾の塊を "場所" と推定（例: "説明会　横浜地域事務所" → title/place）
      const parts = withoutTime.split(/\s+|　+/).filter(Boolean);
      let title, place;
      if (parts.length >= 2) {
        place = parts.pop();         // 末尾 = 場所
        title = parts.join(' ');     // 先頭〜 = タイトル
      } else {
        title = withoutTime;
        place = '';
      }

      // LI 内にリンクがあれば URL を取得
      const href = $(liEl).find('a').attr('href') || '';
      const url  = href.startsWith('http') ? href
        : href ? `https://www.mod.go.jp${href.startsWith('/') ? '' : '/pco/kanagawa/kouho/event/'}${href}`
        : '';

      events.push({
        id:       `k-${dateStr.replace(/-/g, '')}-${++idx}`,
        date:     dateStr,
        weekday,
        title:    title || withoutTime,
        place,
        address:  '',
        time,
        category: guessCategory(title || withoutTime),
        tag:      guessTag(title || withoutTime),
        url,
        notes:    null,
      });
    });
  });

  // 日付昇順でソート
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseKanagawa };
