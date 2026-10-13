// イベントの変更・中止のお知らせ（変更履歴）— 純粋ロジック（管理API・公開API・画面で共有）。
//
// 設計方針（CLAUDE.md「イベントの変更・中止管理」参照）:
// - **開催状況（status）と変更履歴（changes）を分ける**。
//     status  … いま開催するのか（開催予定=published / 受付終了=closed / 中止=cancelled / 延期=postponed）
//     changes … 何がいつどう変わったかの記録（日時変更・会場変更・内容変更・重要なお知らせ 等）
//   「日時変更」は開催状況ではない（変更後の日時で開催予定のまま）ので status にしない。
// - 変更記録は運営が登録する。利用者には `public: true` のものだけを出す。
//   根拠（evidence）・操作者（by）は管理用で公開しない。
// - 通知は「公開する」かつ「確認済みの根拠」がある変更だけ。曖昧な情報で利用者を動かさない。
// - 自動収集イベントでは上書き（manual:overrides）に保存するため、次回のスクレイプで消えない。
'use strict';

// 種別 → 表示名・連動する開催状況・通知の可否
//   status:  この変更を登録すると開催状況をこの値にする（null は変えない）
//   notify:  利用者へのプッシュ通知に使えるか（重要な変更のみ）
//   flag:    一覧カードに出す「変更あり」の印
const CHANGE_TYPES = Object.freeze({
  cancelled: { label: '開催中止',       status: 'cancelled', notify: true,  flag: null },
  postponed: { label: '開催延期',       status: 'postponed', notify: true,  flag: null },
  datetime:  { label: '日時変更',       status: null,        notify: true,  flag: 'datetime' },
  venue:     { label: '会場変更',       status: null,        notify: true,  flag: 'venue' },
  content:   { label: '内容変更',       status: null,        notify: false, flag: null },
  closed:    { label: '受付終了',       status: 'closed',    notify: false, flag: null },
  resumed:   { label: '開催予定に戻す', status: 'published', notify: true,  flag: null },
  notice:    { label: '重要なお知らせ', status: null,        notify: true,  flag: 'notice' },
});
const CHANGE_TYPE_IDS = Object.freeze(Object.keys(CHANGE_TYPES));

// 開催状況の表示名（公開・管理の両方で使う）
const STATUS_LABELS = Object.freeze({
  published: '開催予定', closed: '受付終了', cancelled: '開催中止', postponed: '開催延期', draft: '下書き',
});

const LIMITS = Object.freeze({ reason: 200, before: 200, after: 200, evidence: 300, maxEntries: 30 });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}(?:[～~]\d{1,2}:\d{2})?$/;
const ID_RE = /^chg-[a-z0-9]{6,20}$/;

/** 制御文字・ゼロ幅・双方向制御を除き、改行は空白へ。HTML として解釈させない（< > は全角へ） */
function cleanField(input, maxLen) {
  let s = String(input ?? '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '');
  s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // 画面は React のテキストとして描画するので実害はないが、データとしても HTML を持たせない
  s = s.replace(/</g, '＜').replace(/>/g, '＞');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 「イベント情報にも反映する」値の検証。
 * 日時変更なら date/endDate/time、会場変更なら place/address だけを受け付ける。
 * @returns {{apply: Object}|{error: string}}
 */
function normalizeApply(type, raw) {
  if (!raw || typeof raw !== 'object') return { apply: {} };
  const out = {};
  if (type === 'datetime' || type === 'postponed') {
    if (raw.date !== undefined && raw.date !== '') {
      if (!isRealDate(raw.date)) return { error: '変更後の開催日が不正です（YYYY-MM-DD）' };
      out.date = raw.date;
    }
    if (raw.endDate !== undefined) {
      if (raw.endDate === '' || raw.endDate === null) out.endDate = null;
      else if (!isRealDate(raw.endDate)) return { error: '変更後の終了日が不正です' };
      else out.endDate = raw.endDate;
    }
    if (out.date && out.endDate && out.endDate < out.date) return { error: '終了日が開催日より前になっています' };
    if (raw.time !== undefined) {
      const t = cleanField(raw.time, 40);
      if (t && !TIME_RE.test(t.replace(/\s/g, ''))) return { error: '時間は HH:MM または HH:MM～HH:MM で入力してください' };
      out.time = t;
    }
  }
  if (type === 'venue') {
    if (raw.place !== undefined) out.place = cleanField(raw.place, 80);
    if (raw.address !== undefined) out.address = cleanField(raw.address, 100);
    if (out.place === '') return { error: '変更後の会場名を入力してください' };
  }
  return { apply: out };
}

/**
 * 運営の入力から変更記録1件を作る（純粋）。
 * @param {Object} input { type, reason, before, after, public, notify, evidence, confirmed, apply }
 * @param {{ by?: string, now?: string, id?: string }} ctx
 * @returns {{ entry: Object, apply: Object } | { error: string }}
 */
function buildChangeEntry(input, ctx = {}) {
  const e = input || {};
  const type = String(e.type || '');
  const def = CHANGE_TYPES[type];
  if (!def) return { error: '変更種別が不正です' };

  const reason = cleanField(e.reason, LIMITS.reason);
  const before = cleanField(e.before, LIMITS.before);
  const after  = cleanField(e.after, LIMITS.after);
  const evidence = cleanField(e.evidence, LIMITS.evidence);
  const isPublic = e.public === true;
  const notify = e.notify === true;
  const confirmed = e.confirmed === true;

  // 中止・延期・日時/会場変更は、利用者が「どうなったか」を読めることが要る
  if ((type === 'cancelled' || type === 'postponed') && !reason) {
    return { error: '中止・延期は理由（利用者に表示する説明）を入力してください' };
  }
  if ((type === 'datetime' || type === 'venue' || type === 'content' || type === 'notice') && !after) {
    return { error: '変更後の内容（お知らせ本文）を入力してください' };
  }
  // 通知は「公開する変更」かつ「通知に使える種別」かつ「確認済みの根拠つき」のみ
  if (notify) {
    if (!isPublic) return { error: '通知するには「利用者に公開する」をオンにしてください' };
    if (!def.notify) return { error: `「${def.label}」は通知の対象外です` };
    if (!confirmed || !evidence) {
      return { error: '通知するには一次情報（公式発表のURL・確認方法）を「根拠」に入力し、「確認済み」にチェックしてください' };
    }
  }

  const ap = normalizeApply(type, e.apply);
  if (ap.error) return { error: ap.error };

  const id = ctx.id && ID_RE.test(ctx.id) ? ctx.id : `chg-${randomId()}`;
  const entry = {
    id, type, reason, before, after,
    public: isPublic,
    notify,
    evidence,
    confirmed,
    at: ctx.now || new Date().toISOString(),
    by: cleanField(ctx.by, 40),
  };
  return { entry, apply: ap.apply };
}

function randomId() {
  try {
    // Node 18+/ブラウザ
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint8Array(8);
      c.getRandomValues(a);
      return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
    }
  } catch { /* fallthrough */ }
  return Math.random().toString(36).slice(2, 14);
}

/** 保存済みの変更記録を形として信用できるものだけにする（壊れたデータの防御） */
function sanitizeStoredChanges(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object' || !CHANGE_TYPES[c.type]) continue;
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) continue;
    out.push({
      id: c.id, type: c.type,
      reason: cleanField(c.reason, LIMITS.reason),
      before: cleanField(c.before, LIMITS.before),
      after: cleanField(c.after, LIMITS.after),
      public: c.public === true,
      notify: c.notify === true,
      evidence: cleanField(c.evidence, LIMITS.evidence),
      confirmed: c.confirmed === true,
      at: typeof c.at === 'string' ? c.at.slice(0, 40) : '',
      by: cleanField(c.by, 40),
      ...(typeof c.notifiedAt === 'string' ? { notifiedAt: c.notifiedAt.slice(0, 40) } : {}),
    });
  }
  return out;
}

/**
 * 公開してよい変更記録だけを、公開用の形で返す（新しい順）。
 * 根拠・操作者・通知の内部状態は出さない。
 */
function publicChanges(list) {
  return sanitizeStoredChanges(list)
    .filter(c => c.public)
    .map(c => ({
      id: c.id, type: c.type, label: CHANGE_TYPES[c.type].label,
      reason: c.reason, before: c.before, after: c.after, at: c.at,
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * 公開API から受け取った変更のお知らせ（publicChanges の出力形）を画面用に検証する。
 * 配信データ・端末キャッシュの壊れた値で描画が落ちないようにする（新しい順）。
 */
function sanitizePublicChanges(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object' || !CHANGE_TYPES[c.type]) continue;
    out.push({
      id: typeof c.id === 'string' ? c.id.slice(0, 40) : '',
      type: c.type, label: CHANGE_TYPES[c.type].label,
      reason: cleanField(c.reason, LIMITS.reason),
      before: cleanField(c.before, LIMITS.before),
      after: cleanField(c.after, LIMITS.after),
      at: typeof c.at === 'string' ? c.at.slice(0, 40) : '',
    });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, LIMITS.maxEntries);
}

/** 画面用: 公開済みの変更のお知らせから一覧カードの印を作る（publicChanges の出力形を受け取る） */
function publicChangeFlags(ev) {
  const pub = sanitizePublicChanges(ev && ev.changes);
  const has = f => pub.some(c => CHANGE_TYPES[c.type].flag === f);
  return {
    cancelled: ev?.status === 'cancelled',
    postponed: ev?.status === 'postponed',
    datetime: has('datetime'),
    venue: has('venue'),
    notice: has('notice'),
  };
}

/**
 * 変更記録を追加し、種別に連動する開催状況・反映値を適用した新しいオブジェクトを返す（純粋）。
 * target は手動イベント本体、または自動収集イベントの上書きレコード。
 */
function applyChange(target, entry, apply = {}) {
  const def = CHANGE_TYPES[entry.type];
  const next = { ...(target || {}) };
  const list = sanitizeStoredChanges(next.changes);
  list.unshift(entry);
  next.changes = list.slice(0, LIMITS.maxEntries);
  if (def && def.status) next.status = def.status;
  for (const [k, v] of Object.entries(apply || {})) {
    if (v === null) { next[k] = null; continue; }
    next[k] = v;
  }
  next.changesUpdatedAt = entry.at;
  return next;
}

/** 公開状態の切り替え（純粋）。見つからなければ null */
function setChangeVisibility(target, changeId, isPublic) {
  const list = sanitizeStoredChanges(target && target.changes);
  const i = list.findIndex(c => c.id === changeId);
  if (i < 0) return null;
  list[i] = { ...list[i], public: isPublic === true };
  return { ...target, changes: list, changesUpdatedAt: new Date().toISOString() };
}

/** 変更記録の取り消し（純粋）。開催状況は戻さない（戻すなら「開催予定に戻す」を登録する） */
function removeChange(target, changeId) {
  const list = sanitizeStoredChanges(target && target.changes);
  const i = list.findIndex(c => c.id === changeId);
  if (i < 0) return null;
  const removed = list.splice(i, 1)[0];
  return { next: { ...target, changes: list, changesUpdatedAt: new Date().toISOString() }, removed };
}

/**
 * 一覧カードの印（純粋）。status と公開済みの変更記録から作る。
 * @returns {{ cancelled: boolean, postponed: boolean, datetime: boolean, venue: boolean, notice: boolean }}
 */
function changeFlags(ev) {
  const pub = publicChanges(ev && ev.changes);
  const has = f => pub.some(c => CHANGE_TYPES[c.type].flag === f);
  return {
    cancelled: ev?.status === 'cancelled',
    postponed: ev?.status === 'postponed',
    datetime: has('datetime'),
    venue: has('venue'),
    notice: has('notice'),
  };
}

/**
 * 変更前の値を、現在のイベント内容から作る（管理画面の初期値用）。
 */
function describeBefore(type, ev) {
  if (!ev) return '';
  const range = ev.endDate && ev.endDate !== ev.date ? `${ev.date}〜${ev.endDate}` : (ev.date || '');
  if (type === 'datetime' || type === 'postponed') return [range, ev.time].filter(Boolean).join(' ');
  if (type === 'venue') return [ev.place, ev.address].filter(Boolean).join(' / ');
  return '';
}

/** プッシュ通知の文面（純粋）。タイトルに種別、本文に変更後の内容か理由 */
function buildChangeNotification(ev, entry) {
  const def = CHANGE_TYPES[entry.type];
  const title = `【${def.label}】${cleanField(ev && ev.title, 60)}`;
  const body = cleanField(
    entry.type === 'cancelled' || entry.type === 'postponed' || entry.type === 'resumed'
      ? (entry.reason || entry.after || def.label)
      : (entry.after || entry.reason || def.label),
    120);
  return { title, body, url: `/event/${encodeURIComponent(ev && ev.id ? ev.id : '')}`, tag: `change-${entry.id}` };
}

module.exports = {
  CHANGE_TYPES, CHANGE_TYPE_IDS, STATUS_LABELS, LIMITS,
  cleanField, normalizeApply, buildChangeEntry, sanitizeStoredChanges, publicChanges,
  sanitizePublicChanges, publicChangeFlags,
  applyChange, setChangeVisibility, removeChange, changeFlags, describeBefore, buildChangeNotification,
};
