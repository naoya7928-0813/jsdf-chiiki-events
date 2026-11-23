'use strict';
/**
 * 「自分の都道府県」設定（2026-11-23 導入）。
 *
 * 設定画面で選んだ地本（都道府県）を端末内（localStorage）にだけ保存し、
 *   - アプリを開いたとき（トップ "/" から開いたときだけ）その都道府県のイベント一覧から始める
 *   - イベント一覧を開いたときの最初の絞り込みをその都道府県にする（「全国」へはタブ1回で戻れる）
 * 共有リンク（/event/… など）から開いたときは、そのページをそのまま表示する（設定で上書きしない）。
 * 判定はここに集約（src/App.jsx・設定画面・テスト）。
 */

const MY_PREF_KEY = 'jsdf-my-pref';

/** 保存値を検査する。対応している地本キーでなければ ''（未設定） */
function normalizeMyPref(value, supported) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  const ok = supported instanceof Set ? supported.has(v) : Array.isArray(supported) ? supported.includes(v) : false;
  return ok ? v : '';
}

/**
 * 起動時に最初に出す画面。
 * @param {{ myPref: string, pathname: string, operator?: boolean }} p
 * @returns {'list'|'home'}
 */
function startScreenFor({ myPref, pathname, operator = false }) {
  if (operator) return 'home';
  if (!myPref) return 'home';
  return (pathname || '/') === '/' ? 'list' : 'home';
}

/** イベント一覧の最初の絞り込み（地域タブ）。未設定なら全国 */
function defaultListRegion(myPref) {
  return myPref || 'all';
}

module.exports = { MY_PREF_KEY, normalizeMyPref, startScreenFor, defaultListRegion };
