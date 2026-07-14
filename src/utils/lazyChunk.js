// ─── 遅延読込チャンクの復旧処理 ──────────────────────────────
// 画面（お気に入り・設定・詳細など）は lazy() で別チャンクに分割している。
// デプロイでチャンク名（ハッシュ）が変わると、古い app shell を保持している
// クライアント（特にインストール済み PWA）は消えた旧チャンクを要求し続け、
// dynamic import が失敗 → ErrorBoundary（「表示中に問題が発生しました」）になる。
// 一度だけ「SW の precache を捨てて再読込」して最新の app shell を取り直す。
import { lazy } from 'react';

const RELOAD_AT_KEY = 'jsdf-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 60_000; // 復旧できない環境で無限リロードにならないようにする

/** SW の precache を破棄し、次の読込でネットワークから最新 index.html / チャンクを取得させる */
export async function purgeAppShell() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => /workbox|precache/i.test(k)).map(k => caches.delete(k).catch(() => {}))
      );
    }
  } catch { /* 復旧処理の失敗自体は握りつぶし、リロードに進む */ }
}

/** 直近でリロード済みなら true（リロードループ防止） */
function reloadedRecently() {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    return Date.now() - at < RELOAD_COOLDOWN_MS;
  } catch { return false; }
}

function markReloaded() {
  try { sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now())); } catch { /* ignore */ }
}

/**
 * チャンク取得失敗から復旧する。
 * @returns {boolean} リロードを開始したら true（呼び出し側は待機してよい）
 */
export function recoverFromChunkError() {
  if (reloadedRecently()) return false;
  markReloaded();
  purgeAppShell().finally(() => window.location.reload());
  return true;
}

/**
 * React.lazy の置き換え。取得に失敗したら 1 回だけ再試行し、
 * それでも駄目なら app shell を取り直して自動リロードする。
 */
export function lazyWithRecovery(factory) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // 一時的な通信断のための即時リトライ
      try {
        return await factory();
      } catch { /* 恒久的な失敗（旧チャンクが消えている）として復旧へ */ }

      if (recoverFromChunkError()) {
        // リロードが始まるまでエラーを出さない（エラー画面の一瞬の表示を防ぐ）
        await new Promise(() => {});
      }
      throw err; // クールダウン中は ErrorBoundary に委ねる（手動の再読み込み導線がある）
    }
  });
}
