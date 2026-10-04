'use strict';

const {
  guessCategory, guessTag, isPast, toHalfWidth, reiwaToAD, reiwaNum,
  padTwo, jstYear, resolveYearByWeekday, titleHash,
} = require('./utils');

const TOP_URL = 'https://www.mod.go.jp/pco/hyogo/';
const EVENT_URL = 'https://www.mod.go.jp/pco/hyogo/event/index.html';
const SETSUMEIKAI_URL = 'https://www.mod.go.jp/pco/hyogo/want/setumeikai.html';

const FIELD_LABEL_RE = /^(?:日\s*時|場\s*所|対\s*象|応募条件|締め切り|締切|申し?込み期限|申込期限|問い合わせ先|お問い合わせ先|注意事項)$/;
const GENERIC_HEADING_RE = /^(?:イベント情報|自衛隊説明会|自衛隊\s*説明会まとめ|最新情報|お知らせ|職業説明会・相談会|\d{1,2}月|[《〖【]\s*\d{1,2}月\s*[》〗】])$/;
const EVENT_HEADING_RE = /説明会|相談会|公開|見学|イベント|フェスタ|祭|まつり|演奏|コンサート|セミナー|ガイダンス|体験|展示|試験|座談会|交流会|オープンキャンパス|進学|就職|転職/i;
const NEXT_FIELD = '(?=日\\s*時|場\\s*所|対\\s*象|応募条件|締め切り|締切|申し?込み期限|申込期限|問い合わせ先|お問い合わせ先|注意事項|$)';

function compact(value) {
  return String(value || '').replace(/[\u00a0\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
}

function flattenDom(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const child of node.children || []) flattenDom(child, out);
  return out;
}

function isEventHeadingText(text) {
  const t = compact(text);
  if (!t || FIELD_LABEL_RE.test(t) || GENERIC_HEADING_RE.test(t)) return false;
  if (t.length > 90) return false;
  return EVENT_HEADING_RE.test(t);
}

function elementId($, el) {
  let cur = $(el);
  for (let i = 0; i < 4 && cur.length; i++, cur = cur.parent()) {
    const id = cur.attr('id') || cur.attr('name');
    if (id) return id;
  }
  return '';
}

function toAbs(raw, base) {
  try { return new URL(raw, base).href; } catch { return ''; }
}

/**
 * h3/h4/h5 のイベント見出しを境界として、次のイベント見出しまでを1ボックスとして切り出す。
 * CSSクラス名ではなく見出し＋「日時/場所」ラベルを基準にするため、サイトの装飾変更に強い。
 */
function eventSections($) {
  const root = $.root().get(0);
  const flat = flattenDom(root);
  const index = new Map(flat.map((node, i) => [node, i]));
  const headings = $('h3,h4,h5').toArray()
    .filter(el => isEventHeadingText($(el).text()))
    .sort((a, b) => index.get(a) - index.get(b));
  const headingSet = new Set(headings);

  return headings.map((heading, i) => {
    const start = index.get(heading);
    const end = i + 1 < headings.length ? index.get(headings[i + 1]) : flat.length;
    const text = [];
    const assets = [];
    for (let p = start; p < end; p++) {
      const node = flat[p];
      if (p !== start && headingSet.has(node)) break;
      if (node.type === 'text' && node.data) text.push(node.data);
      if (node.type === 'tag' && node.attribs) {
        if (node.name === 'img' && node.attribs.src) assets.push(node.attribs.src);
        if (node.name === 'a' && node.attribs.href && /\.(?:pdf|jpe?g|png|webp)(?:[?#].*)?$/i.test(node.attribs.href)) {
          assets.push(node.attribs.href);
        }
      }
    }
    return {
      heading,
      title: compact($(heading).text()),
      text: compact(text.join(' ')),
      id: elementId($, heading),
      assets: [...new Set(assets)],
    };
  });
}

function field(text, labelPattern) {
  const src = toHalfWidth(compact(text));
  const re = new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*([\\s\\S]*?)${NEXT_FIELD}`, 'i');
  const m = src.match(re);
  return m ? compact(m[1]) : '';
}

function timeFrom(text) {
  const src = toHalfWidth(text);
  const all = [...src.matchAll(/(?:^|[^\d])(\d{1,2}:\d{2}\s*[～〜~\-]\s*\d{1,2}:\d{2})/g)]
    .map(m => m[1].replace(/\s+/g, '').replace(/[〜~]/g, '～'));
  return [...new Set(all)].join(' / ');
}

function resolveYear(month, day, weekday) {
  const current = jstYear();
  const byWeekday = resolveYearByWeekday(month, day, weekday || '', current);
  if (byWeekday) return byWeekday;

  // 年表記が無い場合、数日前・数か月前の掲載を翌年扱いにはしない。
  // 半年以上前の月日だけ、年末に掲載される翌年予定として補正する。
  const thisYear = `${current}-${padTwo(month)}-${padTwo(day)}`;
  if (!isPast(thisYear)) return current;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const daysAgo = (Date.parse(today) - Date.parse(thisYear)) / 86400000;
  return daysAgo > 180 ? current + 1 : current;
}

function addDate(out, seen, year, month, day, weekday = '') {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return;
  const date = `${y}-${padTwo(m)}-${padTwo(d)}`;
  if (isPast(date) || seen.has(date)) return;
  seen.add(date);
  out.push({ date, weekday: String(weekday || '').replace(/[・\s祝]/g, '').slice(0, 1) });
}

/**
 * 日時欄から開催日を抽出する。
 * - 複数日列挙: 10/28、11/25、12/16 → 3件
 * - 期間: 10/25～11/1 → 開始日1件（期間文字列は notes に残す）
 * - 毎週: 10月(毎週月・木) → 当月の該当曜日を展開
 */
function parseDates(rawText) {
  const src = toHalfWidth(compact(rawText)).replace(/[（）]/g, c => c === '（' ? '(' : ')');
  const dates = [];
  const seen = new Set();

  // 「10月(毎週月・木)」のような定期開催を展開する。
  for (const recurring of src.matchAll(/(\d{1,2})月\s*\(?毎週\s*([月火水木金土日](?:[・,、][月火水木金土日])*)\)?/g)) {
    const month = Number(recurring[1]);
    const weekdays = recurring[2].split(/[・,、]/).filter(Boolean);
    const weekdayIndex = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
    const year = resolveYear(month, 15, '');
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      const wd = Object.keys(weekdayIndex).find(k => weekdayIndex[k] === new Date(Date.UTC(year, month - 1, d)).getUTCDay());
      if (weekdays.includes(wd)) addDate(dates, seen, year, month, d, wd);
    }

    // 例: 「10月(毎週月・木)17日(土)」は、毎週分に加えて17日も個別開催日。
    // recurring の直後だけを見ることで、後続イベントの日付を誤って拾わない。
    const tail = src.slice(recurring.index + recurring[0].length);
    const extra = tail.match(/^\s*(\d{1,2})\s*日(?:\s*\(([月火水木金土日祝・]+)\))?/);
    if (extra) addDate(dates, seen, resolveYear(month, Number(extra[1]), extra[2] || ''), month, Number(extra[1]), extra[2] || '');
  }

  const matches = [];
  const re = /(?:(?:令和\s*(元|\d{1,2})\s*年)|(20\d{2})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*\(([月火水木金土日祝・]+)\))?|(?<!\d)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\(([月火水木金土日祝・]+)\))?/g;
  for (const m of src.matchAll(re)) {
    let year, month, day, weekday;
    if (m[3]) {
      month = Number(m[3]); day = Number(m[4]); weekday = m[5] || '';
      year = m[1] ? reiwaToAD(reiwaNum(m[1])) : (m[2] ? Number(m[2]) : resolveYear(month, day, weekday));
    } else {
      month = Number(m[6]); day = Number(m[7]); weekday = m[8] || '';
      year = resolveYear(month, day, weekday);
    }
    matches.push({ index: m.index, end: m.index + m[0].length, year, month, day, weekday });
  }

  // 「A～B」は期間なので開始日のみ。それ以外の列挙日はすべて登録する。
  for (let i = 0; i < matches.length; i++) {
    if (i > 0) {
      const between = src.slice(matches[i - 1].end, matches[i].index);
      if (/[～〜~\-]/.test(between)) continue;
    }
    const m = matches[i];
    addDate(dates, seen, m.year, m.month, m.day, m.weekday);
  }

  return dates.sort((a, b) => a.date.localeCompare(b.date));
}

function cleanTitle(title) {
  return compact(title)
    .replace(/^\s*[★●◆■・]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 100);
}

function makeEventsFromSection(section, sourceUrl, defaultCategory) {
  const title = cleanTitle(section.title);
  if (!title || !isEventHeadingText(title)) return [];

  const dateText = field(section.text, '日\\s*時') || section.text;
  const dates = parseDates(dateText);
  if (!dates.length) return [];

  const place = field(section.text, '場\\s*所').slice(0, 120);
  const target = field(section.text, '対\\s*象|応募条件').slice(0, 240);
  const deadline = field(section.text, '締め切り|締切|申し?込み期限|申込期限').slice(0, 120);
  const time = timeFrom(dateText);
  const sectionUrl = section.id ? `${sourceUrl}#${section.id}` : sourceUrl;
  const notes = /[～〜~\-]/.test(dateText) && dates.length === 1 ? `開催期間: ${dateText.slice(0, 100)}` : null;
  const assets = section.assets.map(raw => toAbs(raw, sourceUrl)).filter(Boolean);

  return dates.map(({ date, weekday }) => ({
    id: `hy-${date.replace(/-/g, '')}-${titleHash(date, `${title}|${place}|${section.id || ''}`)}`,
    pref: 'hyogo',
    date,
    weekday,
    title,
    place,
    address: '',
    time,
    category: defaultCategory || guessCategory(toHalfWidth(title)),
    tag: guessTag(title),
    url: sectionUrl,
    notes,
    ageRequirement: target || null,
    deadline: deadline || null,
    imageUrl: '',
    _hyogoAssets: assets,
  }));
}

function parseSections($, sourceUrl, defaultCategory = '') {
  const out = [];
  const seen = new Set();
  for (const section of eventSections($)) {
    for (const ev of makeEventsFromSection(section, sourceUrl, defaultCategory)) {
      const key = `${ev.date}|${ev.title.replace(/\s/g, '')}|${ev.place.replace(/\s/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ja'));
}

/** 新HPのイベント詳細ボックス（event/index.html）をHTMLから直接解析する。 */
function parseHyogoEvents($) {
  return parseSections($, EVENT_URL);
}

/** 新HPの説明会詳細ボックス（want/setumeikai.html）をHTMLから直接解析する。 */
function parseHyogoSetsumeikai($) {
  return parseSections($, SETSUMEIKAI_URL, '説明会');
}

/**
 * TOP/イベント/説明会ページ上のイベント関連画像URLを抽出する。
 * HTML本文で必要項目が取れる場合はHTMLを優先し、画像はOCR補完用として扱う。
 */
function parseHyogoImages($, baseUrl = TOP_URL) {
  const EXCLUDE = /logo|nav|menu|slider|footer|header|sp[/_]|icon|WEBmanual|kazokukai|recruit[0-9]|map|youtube/i;
  const EVENT = /setumeikai|banner|event|fes|festival|kengaku|ensou|concert|brief|meeting|amatsusora|aoshima/i;
  const urls = [];

  $('img[src]').each((_, img) => {
    const src = $(img).attr('src') || '';
    const alt = compact($(img).attr('alt') || '');
    if (!src || EXCLUDE.test(src)) return;
    const haystack = `${src} ${alt}`;
    if (!EVENT.test(haystack) && !/\d{4}/.test(haystack)) return;
    const full = toAbs(src, baseUrl);
    if (full && !urls.includes(full)) urls.push(full);
  });

  return urls;
}

module.exports = { parseHyogoEvents, parseHyogoSetsumeikai, parseHyogoImages, parseDates };
