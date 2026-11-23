'use strict';
/**
 * 一次ソースで照合済みの追加イベント（data/verified-events.json。2026-11-23 導入）。
 *
 * 地本サイトの巡回では拾えないが、公式資料（基地の公告・告知 PDF 等）を通常の取得で読めて
 * 日時・会場を確認できたイベントを、スクレイプのたびに公開データへ合流させる（writeOutput の整形・
 * 検疫・重複統合・終了後の削除をそのまま通る）。
 *
 * ⚠️ 追加してよいのは「一次ソースを実際に読み、日時・会場の記載を引用できる」ものだけ。
 *    ニュース記事・検索結果の要約・例年の時期からの推測では追加しない。ボット確認を回避して取得しない。
 *    evidence に出典URL・記載の引用・確認日を必ず残す（公開データには出さない＝運営の確認用）。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^verified-[a-z0-9-]{3,60}$/;
const isHttp = (u) => typeof u === 'string' && /^https?:\/\/[^\s<>"]+$/.test(u);

/** 1件を検査して公開用の形に。不備があれば { error } */
function normalizeVerifiedEvent(raw, prefKeys) {
  const e = raw || {};
  const err = (m) => ({ error: `${e.id || '(id なし)'}: ${m}` });
  if (!ID_RE.test(String(e.id || ''))) return err('id は verified- で始める英小文字・数字・ハイフン');
  if (!prefKeys.includes(e.pref)) return err('pref が地本キーでない');
  if (!DATE_RE.test(String(e.date || '')) || Number.isNaN(Date.parse(`${e.date}T00:00:00Z`))) return err('date が YYYY-MM-DD でない');
  if (e.endDate && (!DATE_RE.test(e.endDate) || e.endDate < e.date)) return err('endDate が不正');
  if (!String(e.title || '').trim()) return err('title が空');
  if (!String(e.place || '').trim()) return err('place が空');
  if (!isHttp(e.url)) return err('url（公式ページ）が無い');
  const ev = e.evidence || {};
  if (!isHttp(ev.url) || !String(ev.quote || '').trim() || !DATE_RE.test(String(ev.checkedAt || ''))) {
    return err('evidence（出典URL・記載の引用・確認日）が不足');
  }
  const out = {
    id: e.id, pref: e.pref, date: e.date, title: String(e.title).trim(), place: String(e.place).trim(),
    address: String(e.address || ''), time: String(e.time || ''), category: String(e.category || ''),
    tag: String(e.tag || ''), url: e.url, notes: String(e.notes || ''),
    source_type: 'verified_source', verifiedBy: 'primary-source', verifiedAt: ev.checkedAt,
  };
  if (e.endDate) out.endDate = e.endDate;
  return { event: out };
}

/**
 * 公開データ（地本キー→配列）へ合流させる。同じ ID が既にあれば上書きしない（スクレイプ結果を優先）。
 * @returns {{ added: string[], errors: string[] }}
 */
function mergeVerifiedEvents(output, list, prefKeys) {
  const added = [], errors = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const r = normalizeVerifiedEvent(raw, prefKeys);
    if (r.error) { errors.push(r.error); continue; }
    const ev = r.event;
    if (!Array.isArray(output[ev.pref])) output[ev.pref] = [];
    if (output[ev.pref].some(x => x && x.id === ev.id)) continue;
    output[ev.pref].push(ev);
    added.push(ev.id);
  }
  return { added, errors };
}

module.exports = { normalizeVerifiedEvent, mergeVerifiedEvents };
