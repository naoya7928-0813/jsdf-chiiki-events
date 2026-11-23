'use strict';
/**
 * 知名度の高い自衛隊イベントの掲載漏れ検出（2026-11-23 導入）。
 *
 * 地本・募集案内所のサイトだけを巡回しているため、基地が主催する航空祭などが
 * 地本サイトに載らないと当サイトにも載らない（2026-11-23 時点で築城・新田原・百里の航空祭が未掲載。
 * 公式の航空自衛隊イベント一覧には掲載あり。東京地本の「百里基地航空祭バスツアー」だけが載っていた）。
 *
 * ⚠️ ここは「監視リスト」であって公開データではない。`months` は例年の開催時期の目安で、
 *    掲載漏れを疑う時期を決めるためだけに使う。日付・会場を画面や events.json に出さないこと
 *    （公式情報を推測で作らない）。漏れを見つけたら運営が公式ページで確かめてから手動登録する。
 * 時期の目安が外れても、誤った情報が公開されることはない（通知が早い／遅いだけ）。
 */

const AIRSHOW = /航空祭|エアフェスタ|エアショー|航空ショー|基地祭|AIR\s*FESTA|ブルーインパルス/i;
const RELATED_ONLY = /ツアー|予行|事前|バス|見学会|気になった/;

/** 監視リスト。base = 基地・会場の名前（タイトルに含まれるか）、words = イベント語 */
const MAJOR_EVENTS = Object.freeze([
  { id: 'chitose', name: '千歳基地航空祭', base: '千歳', words: AIRSHOW, pref: 'sapporo', months: [7, 8, 9] },
  { id: 'misawa', name: '三沢基地航空祭', base: '三沢', words: AIRSHOW, pref: 'aomori', months: [8, 9] },
  { id: 'matsushima', name: '松島基地航空祭', base: '松島', words: AIRSHOW, pref: 'miyagi', months: [7, 8] },
  { id: 'komatsu', name: '小松基地航空祭', base: '小松', words: AIRSHOW, pref: 'ishikawa', months: [9, 10] },
  { id: 'hamamatsu', name: 'エアフェスタ浜松', base: '浜松', words: AIRSHOW, pref: 'shizuoka', months: [9, 10, 11] },
  { id: 'gifu', name: '岐阜基地航空祭', base: '岐阜基地', words: AIRSHOW, pref: 'gifu', months: [10, 11] },
  { id: 'iruma', name: '入間航空祭', base: '入間', words: AIRSHOW, pref: 'saitama', months: [10, 11] },
  { id: 'hyakuri', name: '百里基地航空祭', base: '百里', words: AIRSHOW, pref: 'ibaraki', months: [11, 12] },
  { id: 'tsuiki', name: '築城基地航空祭', base: '築城', words: AIRSHOW, pref: 'fukuoka', months: [11, 12] },
  { id: 'nyutabaru', name: '新田原基地エアフェスタ', base: '新田原', words: AIRSHOW, pref: 'miyazaki', months: [11, 12] },
  { id: 'naha', name: '那覇基地 美ら島エアフェスタ', base: '那覇', words: AIRSHOW, pref: 'okinawa', months: [11, 12] },
  { id: 'ongaku', name: '自衛隊音楽まつり', base: '自衛隊音楽まつり', words: /音楽まつり/, pref: 'tokyo', months: [10, 11] },
  { id: 'fuji', name: '富士総合火力演習', base: '総合火力', words: /総合火力|総火演/, pref: 'shizuoka', months: [5, 6, 7, 8] },
]);

const norm = (s) => String(s || '').normalize('NFKC');

/**
 * 監視リストの各イベントの掲載状況。
 * archive（運営側の過去イベント data/events-archive.json の events）を渡すと、今年すでに掲載・開催済みのものを
 * 'held' にする（終了後7日で公開データから消えるため、それだけを見ると開催済みを漏れと誤認する）。
 * @returns [{ id, name, pref, inSeason, status: 'listed'|'held'|'related_only'|'missing', matches: [{pref,id,date,title}] }]
 */
function checkMajorEvents(data, today, { archive = [] } = {}) {
  const month = Number(String(today).slice(5, 7));
  const all = [];
  for (const [k, arr] of Object.entries(data || {})) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) if (e && e.title) all.push({ ...e, _pref: k });
  }
  return MAJOR_EVENTS.map(m => {
    const hits = all.filter(e => {
      const t = norm(e.title);
      return t.includes(m.base) && m.words.test(t);
    });
    const main = hits.filter(e => !RELATED_ONLY.test(norm(e.title)));
    const year = String(today).slice(0, 4);
    const held = (Array.isArray(archive) ? archive : []).filter(e => {
      const t = norm(e && e.title);
      return String(e && e.date).startsWith(year) && t.includes(m.base) && m.words.test(t) && !RELATED_ONLY.test(t);
    });
    const status = main.length ? 'listed' : held.length ? 'held' : hits.length ? 'related_only' : 'missing';
    return {
      id: m.id, name: m.name, pref: m.pref,
      inSeason: m.months.includes(month),
      status,
      matches: [...hits.map(e => ({ pref: e._pref, id: e.id, date: e.date, title: e.title })),
        ...held.map(e => ({ pref: e.pref, id: e.id, date: e.date, title: e.title, archived: true }))],
    };
  });
}

/** 時期なのに本体が掲載されていないもの（要確認） */
function missingInSeason(results) {
  return results.filter(r => r.inSeason && r.status !== 'listed' && r.status !== 'held');
}

module.exports = { MAJOR_EVENTS, checkMajorEvents, missingInSeason };
