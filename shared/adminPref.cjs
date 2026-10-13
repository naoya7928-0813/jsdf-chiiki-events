'use strict';
// 都道府県（地本）別の運営画面のURL（2026-10-13 導入）。
//   /admin/<地本キー>  例: /admin/tokyo → 東京地本の運営画面（中身は /admin.html と同じ。vercel.json で振り替え）
// 担当範囲はサーバー側でアカウントから決まる（URL で権限は広がらない）。URL は「どの地本の画面か」を示し、
// 全国担当のアカウントではその地本を初期選択にするだけ。担当の違うアカウントでログインしたら案内を出す。

const PATH_RE = /^\/admin\/([a-z]+)\/?$/;

/** パスから地本キーを取り出す（既知の地本だけ。無ければ null） */
function prefFromAdminPath(pathname, knownPrefs) {
  const m = PATH_RE.exec(String(pathname || ''));
  if (!m) return null;
  const key = m[1];
  const ok = knownPrefs instanceof Set ? knownPrefs.has(key) : Array.isArray(knownPrefs) ? knownPrefs.includes(key) : !!(knownPrefs && knownPrefs[key]);
  return ok ? key : null;
}

/** 地本の運営画面のパス */
const adminPathFor = (pref) => `/admin/${encodeURIComponent(pref)}`;

/**
 * ログインしたアカウントと画面の地本の関係。
 * @returns {'none'|'match'|'national'|'mismatch'}
 *   none … 地本別の画面ではない（/admin.html）
 *   match … 担当の地本の画面
 *   national … 全国担当（どの地本の画面でも使える。初期選択をその地本にする）
 *   mismatch … 担当と違う地本の画面（案内を出す。操作できる範囲は担当の地本のまま）
 */
function adminPageRelation(pagePref, accountOrg) {
  if (!pagePref) return 'none';
  if (!accountOrg || accountOrg === '*') return 'national';
  return accountOrg === pagePref ? 'match' : 'mismatch';
}

module.exports = { prefFromAdminPath, adminPathFor, adminPageRelation };
