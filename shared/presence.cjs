// 在席状況（プレゼンス）の純粋ロジック（I/O 無し）。
// 「最終アクティビティ時刻」から在席状態を判定し、閲覧者のスコープ内メンバー一覧を組み立てる。
// I/O（Redis からの最終アクセス取得・アカウント解決）は api/_security.js / api/admin/presence.js が担当する。
'use strict';

// 状態のしきい値（秒）。online ≤ onlineSec ＜ away ≤ awaySec ＜ offline。
// awaySec は無操作失効(セッションのidle TTL)に合わせるのが自然（それ以降はセッション自体が切れている）。
const DEFAULT_ONLINE_SEC = 180;   // 3分以内の操作 → 在席中（緑）
const DEFAULT_AWAY_SEC   = 3600;  // 3分〜60分 → 離席中（黄）。以降はオフライン（灰）

/**
 * 最終アクティビティ時刻から在席状態を返す（純粋）。
 * @param {number|null} lastSeenMs 最終アクティビティ(ms)。無ければ null。
 * @param {number} nowMs 現在時刻(ms)
 * @param {{onlineSec?:number, awaySec?:number}} opts
 * @returns {'online'|'away'|'offline'}
 */
function computeState(lastSeenMs, nowMs, opts = {}) {
  const onlineSec = Number.isFinite(opts.onlineSec) ? opts.onlineSec : DEFAULT_ONLINE_SEC;
  const awaySec   = Number.isFinite(opts.awaySec)   ? opts.awaySec   : DEFAULT_AWAY_SEC;
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return 'offline';
  const agoSec = (nowMs - lastSeenMs) / 1000;
  if (agoSec < 0) return 'online';           // 時計ずれの保険
  if (agoSec <= onlineSec) return 'online';
  if (agoSec <= awaySec)   return 'away';
  return 'offline';
}

const STATE_ORDER = { online: 0, away: 1, offline: 2 };

/**
 * 閲覧者のスコープ内メンバー一覧に在席状態を付けて組み立てる（純粋）。
 * @param {Array<{userId,displayId,role,office,organization,label,enabled}>} members
 *        既にスコープで絞り込み済みの対象アカウント（enabled のもの）。
 * @param {Object<string, number>} lastSeenMap userId → 最終アクティビティ(ms)
 * @param {{viewerUserId?:string, nowMs:number, onlineSec?:number, awaySec?:number}} opts
 * @returns {{members:Array, counts:{online:number,away:number,offline:number,total:number}}}
 */
function buildRoster(members, lastSeenMap, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const map = lastSeenMap || {};
  const counts = { online: 0, away: 0, offline: 0, total: 0 };
  const rows = (members || []).map(m => {
    const lastSeenMs = Number(map[m.userId]);
    const state = computeState(lastSeenMs, nowMs, opts);
    counts[state] += 1; counts.total += 1;
    const agoSec = Number.isFinite(lastSeenMs) && lastSeenMs > 0
      ? Math.max(0, Math.round((nowMs - lastSeenMs) / 1000))
      : null;
    return {
      displayId: m.displayId || m.user || '',
      label: m.label || m.displayId || '',
      role: m.role || '',
      office: m.office || '',
      organization: m.organization || '',
      state,
      agoSec,                                   // 最終操作からの経過秒（null=一度もログインなし）
      self: !!(opts.viewerUserId && m.userId === opts.viewerUserId),
    };
  });
  // 在席 → 離席 → オフライン、同状態内は displayId 昇順（自分は各状態の先頭に）
  rows.sort((a, b) =>
    STATE_ORDER[a.state] - STATE_ORDER[b.state]
    || (b.self - a.self)
    || String(a.displayId).localeCompare(String(b.displayId)));
  return { members: rows, counts };
}

module.exports = { computeState, buildRoster, DEFAULT_ONLINE_SEC, DEFAULT_AWAY_SEC };
