'use strict';

const { guessCategory, guessTag, isPast, toHalfWidth, padTwo } = require('./utils');

// PDF・画像ファイル名から場所名へのマッピング
const PLACE_MAP = {
  ichinoseki: '一関',
  kitakami:   '北上',
  morioka:    '盛岡',
  hanamaki:   '花巻',
  ofunato:    '大船渡',
  miyako:     '宮古',
  kuji:       '久慈',
  kamaishi:   '釜石',
  rikuzentakata: '陸前高田',
  oshu:       '奥州',
};

/** ファイル名（拡張子なし）から場所名を推測 */
function filenameToPlace(href) {
  const filename = (href.split('/').pop() || '').replace(/\.\w+$/, '').toLowerCase();
  return PLACE_MAP[filename] || '';
}

/** 岩手地本イベントカレンダーパーサー
 * URL: https://www.mod.go.jp/pco/iwate/event/index.html
 *
 * 構造:
 *   <div class="calendar-wrap">
 *     <div class="calendar-title">2026年　５月</div>
 *     <table class="calendar">
 *       <thead><tr><th>MON</th>...</tr></thead>
 *       <tbody>
 *         <tr>
 *           <td id="20260510" class="sun">
 *             <p>10</p>
 *             <a href="../assets/img/event/until20260510/ichinoseki.pdf">
 *               <img src="../assets/img/event/until20260510/ichinoseki.jpg">
 *             </a>
 *           </td>
 *         </tr>
 *       </tbody>
 *     </table>
 *   </div>
 *
 * ポイント:
 *   - td[id="YYYYMMDD"] が正確なイベント日
 *   - ファイル名から場所名を推定
 *   - .jpg サムネイルを imageUrl として OCR に渡す
 */
function parseIwate($) {
  const events = [];
  let idx = 0;
  const seen = new Set();

  const BASE = 'https://www.mod.go.jp/pco/iwate/';

  // イベントPDFまたは外部リンクを持つ td[id] を全て検索
  $('td[id]').each((_i, td) => {
    const rawId = $(td).attr('id') || '';
    // id は YYYYMMDD 形式
    if (!/^\d{8}$/.test(rawId)) return;

    const year    = rawId.slice(0, 4);
    const month   = rawId.slice(4, 6);
    const day     = rawId.slice(6, 8);
    const dateStr = `${year}-${month}-${day}`;
    if (isPast(dateStr)) return;

    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday  = weekdays[d.getDay()] || '';

    // td 内のリンクを全て処理
    $(td).find('a[href]').each((_j, a) => {
      const href    = $(a).attr('href') || '';
      const imgSrc  = $(a).find('img').attr('src') || '';

      // boshuu（募集）関連を除外
      if (/boshuu|boshu/i.test(href)) return;

      const place   = filenameToPlace(href) || filenameToPlace(imgSrc);
      const title   = place ? `自衛隊岩手地本イベント（${place}）` : '自衛隊岩手地本イベント';

      // 重複除去（同日同ファイル）
      const dedupeKey = `${dateStr}-${href}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      // 絶対URL 変換
      const toAbs = (rel) => {
        if (!rel) return '';
        if (rel.startsWith('http')) return rel;
        // "../assets/..." → BASE + "assets/..."
        return BASE + rel.replace(/^\.\.\//, '');
      };

      const pdfUrl  = toAbs(href.endsWith('.pdf') ? href : '');
      const imageUrl = toAbs(imgSrc.endsWith('.jpg') || imgSrc.endsWith('.png') ? imgSrc : '');

      // 外部リンク（PDF でないもの）は url として使う
      const eventUrl = href.startsWith('http') ? href : pdfUrl;

      events.push({
        id:             `iw-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
        pref:           'iwate',
        date:           dateStr,
        weekday,
        title,
        place,
        address:        '',
        time:           '',
        category:       guessCategory(title),
        tag:            guessTag(title),
        url:            eventUrl,
        notes:          null,
        ageRequirement: null,
        deadline:       null,
        imageUrl,
      });
    });
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { parseIwate };
