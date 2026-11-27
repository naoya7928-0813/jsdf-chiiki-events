'use strict';
/**
 * イベントIDの引き継ぎ（2026-11-27 導入）。
 *
 * 自動収集イベントの ID は「取得経路の接頭辞＋開催日＋タイトル等のハッシュ」で作るため、
 * 同じイベントでも取得経路（地本HQのチラシ探索 `-off-`／募集案内所巡回 `-office-`）や
 * タイトルの読み方が回ごとに変わると ID が変わる。重複統合（dedupEvents）でどちらが残るかも回ごとに揺れ、
 * 実測で東京「リーフレット」は毎回、栃木「HondaFes 26」等も数回に1回 ID が入れ替わっていた。
 * ID が変わると個別ページ（/event/<id>）の URL が変わり、旧 URL は 404 になる
 * （Search Console「見つかりませんでした（404）」の主因）。お気に入り・運営の上書き（中止設定等）・閲覧数も切れる。
 *
 * そこで、今回の公開データに「前回は無かった ID」のイベントがあり、それが「前回公開していて今回は無くなった ID」の
 * イベントと同じものだと確かめられたときだけ、前回の ID を使い続ける。
 *
 * 同じイベントとみなす条件（どれか1つでも欠けたら引き継がない＝推測で ID を付け替えない）:
 *   - 同じ地本・同じ開催日（初日）
 *   - 正規化したタイトルが一致、または長い方が短い方を含む（両方8文字以上。dedupEvents と同じ基準）
 *   - 会場が矛盾しない（どちらかが空・掲載元の案内所名だけ／一致／一方が他方を含む）
 *   - 候補が1対1（前回側も今回側も相手が1件だけ）。同じ日に同名の別会場イベントがあるときは引き継がない
 *   - 前回の ID を今回ほかのイベントが使っていない
 *
 * 純粋関数（入出力のみ・fs を使わない）。scraper/index.js の writeOutput が重複統合の後に呼ぶ。
 */

const { normForDedup, isPlaceholderPlace } = require('./titleQuality.cjs');

const MIN_CONTAIN_LEN = 8;

function sameTitle(a, b) {
  const x = normForDedup(a || ''), y = normForDedup(b || '');
  if (!x || !y) return false;
  if (x === y) return x.length >= 3;
  return x.length >= MIN_CONTAIN_LEN && y.length >= MIN_CONTAIN_LEN && (x.includes(y) || y.includes(x));
}

function placesCompatible(a, b) {
  if (isPlaceholderPlace(a) || isPlaceholderPlace(b)) return true;
  const pa = normForDedup(a.place || ''), pb = normForDedup(b.place || '');
  if (!pa || !pb) return true;
  return pa === pb || pa.includes(pb) || pb.includes(pa);
}

/** 前回と今回の2件が同じイベントか（ID の引き継ぎ用。上の条件のうち1対1以外） */
function isSameEventForId(prev, cur) {
  if (!prev || !cur || !prev.date || prev.date !== cur.date) return false;
  if (!sameTitle(prev.title, cur.title)) return false;
  return placesCompatible(prev, cur);
}

/** 手動入力イベント（Redis 側で ID を管理する）か */
const isManual = (ev) => /^manual-/.test(String(ev && ev.id || ''));

/**
 * 今回のデータ（地本キー → 配列）で ID が変わった同一イベントに前回の ID を付け直す。data をその場で書き換える。
 * @returns {Array<{pref,from,to,title,date}>} 付け直した記録（ログ用）
 */
function carryOverEventIds(prevData, data) {
  const changes = [];
  if (!prevData || typeof prevData !== 'object' || !data || typeof data !== 'object') return changes;
  const curIds = new Set();
  for (const arr of Object.values(data)) if (Array.isArray(arr)) for (const e of arr) if (e && e.id) curIds.add(e.id);
  const prevIds = new Set();
  for (const arr of Object.values(prevData)) if (Array.isArray(arr)) for (const e of arr) if (e && e.id) prevIds.add(e.id);

  for (const [key, arr] of Object.entries(data)) {
    if (!Array.isArray(arr) || !Array.isArray(prevData[key])) continue;
    // 前回あって今回消えた ID（候補の旧 ID）と、前回なくて今回現れた ID（候補の新 ID）
    const vanished = prevData[key].filter(e => e && e.id && !isManual(e) && !curIds.has(e.id));
    const appeared = arr.filter(e => e && e.id && !isManual(e) && !prevIds.has(e.id));
    if (!vanished.length || !appeared.length) continue;
    const matchesOfCur = new Map(appeared.map(c => [c, vanished.filter(p => isSameEventForId(p, c))]));
    for (const [cur, cands] of matchesOfCur) {
      if (cands.length !== 1) continue;
      const prev = cands[0];
      // 前回側から見ても相手が1件だけ（同じ日の同名イベントが今回2件に分かれた等は引き継がない）
      if (appeared.filter(c => isSameEventForId(prev, c)).length !== 1) continue;
      if (curIds.has(prev.id)) continue; // ほかのイベントが既に使っている
      const from = cur.id;
      cur.id = prev.id;
      curIds.delete(from);
      curIds.add(prev.id);
      changes.push({ pref: key, from, to: prev.id, title: cur.title, date: cur.date });
    }
  }
  return changes;
}

module.exports = { carryOverEventIds, isSameEventForId };
