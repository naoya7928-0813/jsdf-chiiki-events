'use strict';
/**
 * 自衛隊の種別（陸上・海上・航空）の判定。
 *
 * events.json のスクレイプ品には種別のフィールドが無いため、文面から推定する。
 * 運営が手動入力したイベントは `branch`（配列）を持つので、そちらを優先する
 * （人が入力した値を推定で上書きしない）。
 *
 * フロント（FilterBar / ListScreen）・運営画面のテンプレ・API 検証で共有する。
 */

const BRANCH_VALUES = ['ground', 'maritime', 'air'];

// 「基地」は海自（舞鶴基地）と空自（入間基地）の両方が使うなど、単独では決め手に
// ならない語がある。まず「陸上/海上/航空自衛隊」など明示の語（strong）を見て、
// どの種別の明示語も無いときだけ施設・装備の語（weak）で補う。
const BRANCH_DEFS = [
  {
    id: 'ground', label: '陸上', short: '陸', color: '#3f6212',
    strong: /陸上自衛隊|陸自(?!衛)|駐屯地|方面隊|普通科|特科|機甲|戦車|高等工科学校/,
    weak:   /装甲車|軽装甲機動車|偵察|レンジャー/,
  },
  {
    id: 'maritime', label: '海上', short: '海', color: '#1d4ed8',
    strong: /海上自衛隊|海自(?!衛)|護衛艦|艦艇|掃海|潜水艦|地方隊|基地隊|体験航海|乗艦/,
    weak:   /岸壁|ふ頭|埠頭|カッター/,
  },
  {
    id: 'air', label: '航空', short: '空', color: '#0e7490',
    strong: /航空自衛隊|空自(?!衛)|航空祭|ブルーインパルス|飛行隊|高射群|レーダーサイト/,
    weak:   /戦闘機|輸送機|救難|管制|航空機/,
  },
];

/** 運営画面のセレクト用（id/label のみ） */
const BRANCH_OPTIONS = BRANCH_DEFS.map(b => ({ id: b.id, label: b.label }));

/** 種別 id から定義を引く */
function branchDef(id) {
  return BRANCH_DEFS.find(b => b.id === id) || null;
}

/** 保存前の正規化：既知の値だけを残し、重複を除く。空配列は undefined 相当（＝未指定） */
function normalizeBranches(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (BRANCH_VALUES.includes(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 推定に使う文字列（タイトル・場所・備考・カテゴリを横断） */
function haystackOf(ev) {
  if (!ev || typeof ev !== 'object') return '';
  return [ev.title, ev.place, ev.notes, ev.category].filter(Boolean).join(' ');
}

/**
 * イベントがその種別に該当するか。
 * `branchId === 'all'` は常に true。
 * 運営が明示した ev.branch があればそれだけを見る（推定で上書きしない）。
 */
function matchesBranch(ev, branchId) {
  if (branchId === 'all' || !branchId) return true;
  const manual = normalizeBranches(ev && ev.branch);
  if (manual.length > 0) return manual.includes(branchId);
  const def = branchDef(branchId);
  if (!def) return false;
  const hay = haystackOf(ev);
  if (!hay) return false;
  if (def.strong.test(hay)) return true;
  // どの種別の明示語も無いときだけ、施設・装備の語で補う
  const anyStrong = BRANCH_DEFS.some(b => b.strong.test(hay));
  return !anyStrong && def.weak.test(hay);
}

/** イベントの種別（複数該当しうる）。該当なしは空配列 */
function branchesOf(ev) {
  const manual = normalizeBranches(ev && ev.branch);
  if (manual.length > 0) return manual;
  return BRANCH_DEFS.filter(b => matchesBranch(ev, b.id)).map(b => b.id);
}

module.exports = {
  BRANCH_VALUES, BRANCH_DEFS, BRANCH_OPTIONS,
  branchDef, normalizeBranches, matchesBranch, branchesOf,
};
