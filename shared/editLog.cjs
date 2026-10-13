'use strict';
// イベントごとの編集記録（誰が・いつ・何をしたか）。2026-10-13 導入。
//
// 監査ログ（manual:history）は全体で最大 AUDIT_MAX 件の追記専用リストで、古いものから消え、
// 閲覧も audit:read 権限に限られる。運営画面で「このイベントを誰が追加・修正したか」を
// いつでも確認できるよう、イベント本体（手動イベント）／上書き（自動収集イベント）にも記録を持たせる。
//
// - 保存先のキーは `_log`。先頭が "_" のキーは公開API（/api/manual-events）が必ず除去する
// - 記録するのは運営者の表示用ID（displayId）だけ。氏名・アカウント名は入れない
// - 新しい順・最大 MAX_LOG 件

const MAX_LOG = 50;

const ACTION_LABELS = Object.freeze({
  create: '追加',
  update: '修正',
  status: '状態変更',
  override: '上書き修正',
  'override-clear': '上書き取消',
  change: '変更・中止の登録',
  'change-edit': '変更・中止の記録を修正',
  guide: 'FAQ・ガイド・アクセスの保存',
  image: '画像の追加・修正',
});

// 記録しない項目（記録そのもの・自動で変わるメタ情報）
const IGNORE_FIELDS = new Set(['_log', '_by', '_at', '_pref', '_office', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy',
  'weekday', 'endWeekday', 'weatherLocationNeedsUpdate', 'changesUpdatedAt', 'guideUpdatedAt']);

const FIELD_LABELS = Object.freeze({
  title: 'イベント名', date: '開催日', endDate: '終了日', time: '時間', place: '会場', address: '住所',
  category: '種別', tag: '申込要否', tags: 'タグ', branch: '陸海空', ageRequirement: '対象', deadline: '締切',
  url: 'URL', notes: '備考', status: '開催状況', weatherLocation: '天気用の座標', changes: '変更・中止',
  faq: 'FAQ', guide: '参加準備ガイド', access: '交通アクセス', images: '画像', imagesHidden: '画像の表示', office: '担当事務所', pref: '地本',
});

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 変更された項目名（表示用ラベル）を返す。 */
function changedFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out = [];
  for (const k of keys) {
    if (IGNORE_FIELDS.has(k) || k.startsWith('_')) continue;
    if (!same(before?.[k], after?.[k])) out.push(FIELD_LABELS[k] || k);
  }
  return out;
}

/**
 * 記録を1件足した新しい配列を返す（元の配列は変更しない）。
 * @param {Array} log 既存の記録
 * @param {{by:string, action:string, fields?:string[], note?:string, at?:string}} e
 */
function appendLog(log, { by, action, fields = [], note = '', at = new Date().toISOString() } = {}) {
  const entry = {
    at,
    by: String(by || '').slice(0, 40),
    action: ACTION_LABELS[action] ? action : 'update',
    ...(fields.length ? { fields: fields.slice(0, 20).map(f => String(f).slice(0, 30)) } : {}),
    ...(note ? { note: String(note).slice(0, 120) } : {}),
  };
  const prev = Array.isArray(log) ? log.filter(x => x && typeof x === 'object') : [];
  return [entry, ...prev].slice(0, MAX_LOG);
}

/** record に記録を足したコピーを返す（before があれば変更項目を自動で入れる）。 */
function withLog(record, { by, action, before, note, at } = {}) {
  const fields = before ? changedFields(before, record) : [];
  return { ...record, _log: appendLog(record && record._log, { by, action, fields, note, at }) };
}

/** 表示用（運営画面）: 「2026/10/13 09:12 OP-T 修正（イベント名・会場）」 */
function describeLog(entry) {
  const label = ACTION_LABELS[entry?.action] || '修正';
  const f = Array.isArray(entry?.fields) && entry.fields.length ? `（${entry.fields.join('・')}）` : '';
  return `${label}${f}${entry?.note ? ` ${entry.note}` : ''}`;
}

/** 作成者・最終更新者（記録が無い旧データは createdBy/updatedBy・_by で補う）。 */
function authorship(record) {
  const log = Array.isArray(record?._log) ? record._log : [];
  const created = [...log].reverse().find(x => x.action === 'create');
  const last = log[0];
  return {
    createdBy: created?.by || record?.createdBy || '',
    createdAt: created?.at || record?.createdAt || '',
    updatedBy: last?.by || record?.updatedBy || record?._by || '',
    updatedAt: last?.at || record?.updatedAt || record?._at || '',
  };
}

module.exports = { MAX_LOG, ACTION_LABELS, FIELD_LABELS, changedFields, appendLog, withLog, describeLog, authorship };
