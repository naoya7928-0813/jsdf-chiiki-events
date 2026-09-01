/**
 * appBadge — ホーム画面アイコンの右上に出る未読バッジ（数字）
 *
 * ホーム画面へ追加したアプリだけの機能（Badging API）。
 * ブラウザのタブで見ているときは何も起きない。
 *
 * 更新する経路が2つあり、どちらからでも同じ数字になるようにする:
 *   1. アプリを開いているとき … App.jsx が「お知らせの未読件数」を書き込む
 *   2. アプリを閉じているとき … Service Worker が push を受けるたびに +1 する
 *
 * 2 は localStorage を読めない（Service Worker には無い）ため、件数を
 * IndexedDB に持たせて両者で共有する。1 の側は書き込むときに IndexedDB も
 * 同じ値へ揃えるので、アプリを開いて既読にすれば SW 側の数え上げもリセットされる。
 *
 * 対応状況: Android の Chrome / Edge、iOS 16.4 以降の「ホーム画面に追加」済み
 * アプリ、デスクトップのインストール版。未対応の環境では何もしない
 * （例外も投げない）ので、呼び出し側で分岐する必要はない。
 */

const DB_NAME  = 'jsdf-badge';
const STORE    = 'state';
const KEY      = 'unread';
const DB_VER   = 1;

/** Badging API が使えるか（SW / ページのどちらからでも判定できる） */
function badgeApi() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav || typeof nav.setAppBadge !== 'function') return null;
  return nav;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** 保存されている件数を読む。読めなければ 0（バッジが消えるだけで壊れない） */
export async function readBadgeCount() {
  try {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

async function writeBadgeCount(count) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(count, KEY);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch { /* 保存できなくてもバッジ表示自体は行う */ }
}

/**
 * バッジを指定件数にする（0 以下なら消す）。
 * 保存値も同じ件数へ揃えるので、次に push が来たときはここからの積み上げになる。
 */
export async function setBadgeCount(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  await writeBadgeCount(n);
  const nav = badgeApi();
  if (!nav) return n;
  try {
    if (n > 0) await nav.setAppBadge(n);
    else if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
    else await nav.setAppBadge(0);
  } catch { /* 権限が無い等。バッジが出ないだけ */ }
  return n;
}

/** バッジを 1 件増やす（Service Worker が push を受けたときに使う） */
export async function incrementBadgeCount(by = 1) {
  const current = await readBadgeCount();
  return setBadgeCount(current + by);
}

/** バッジを消す */
export function clearBadgeCount() {
  return setBadgeCount(0);
}
