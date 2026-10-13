/**
 * useFavoriteWatch — お気に入りイベントの「変更・中止の通知」をサーバーへ伝える
 *
 * お気に入りは端末内（localStorage）にしか無い。運営が中止・延期・日時/会場変更を
 * 登録したときに「そのイベントをお気に入りにしている人」へ通知するには、サーバーが
 * 宛先とイベントIDの対応を知る必要がある（/api/watch）。
 *
 * 送るのは、利用者が設定で「お気に入りの変更・中止を通知」をオンにし、かつ
 * プッシュ通知を登録しているときだけ（既定はオフ）。送る内容は push の宛先と
 * お気に入りのイベントID（最大100件）のみ。オフにするとサーバーから消す。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { PUSH_CHANGE_EVENT } from './usePushNotification';

export const WATCH_PREF_KEY = 'jsdf-watch-favorites';
export const WATCH_CHANGE_EVENT = 'jsdf-watch-change';
const MAX_IDS = 100;
const DEBOUNCE_MS = 1500;

export function readWatchPref() {
  try { return localStorage.getItem(WATCH_PREF_KEY) === '1'; } catch { return false; }
}

/** 設定画面用: 現在の設定値と切り替え関数 */
export function useWatchPref() {
  const [on, setOn] = useState(readWatchPref);
  useEffect(() => {
    const sync = () => setOn(readWatchPref());
    window.addEventListener(WATCH_CHANGE_EVENT, sync);
    return () => window.removeEventListener(WATCH_CHANGE_EVENT, sync);
  }, []);
  const set = useCallback((next) => {
    try { next ? localStorage.setItem(WATCH_PREF_KEY, '1') : localStorage.removeItem(WATCH_PREF_KEY); } catch { /* 保存できなくても今回の操作は反映する */ }
    setOn(next);
    try { window.dispatchEvent(new CustomEvent(WATCH_CHANGE_EVENT, { detail: { on: next } })); } catch { /* noop */ }
  }, []);
  return [on, set];
}

async function currentEndpoint() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.endpoint : null;
  } catch { return null; }
}

/**
 * App 全体で1回だけ使う。お気に入り・設定・購読状態が変わるたびに（少し待って）同期する。
 * @param {Set<string>} favorites
 */
export function useFavoriteWatch(favorites) {
  const [enabled, setEnabled] = useState(readWatchPref);
  const [tick, setTick] = useState(0);         // 購読状態の変化で再同期させる
  const lastSent = useRef('');                  // 同じ内容を送り直さない（このタブ内のみ・保存しない）
  // オフのときにサーバーへ削除を送るのは「この画面でオフに切り替えた」ときだけ。
  // 一度もオンにしていない利用者に毎回削除リクエストを送らない
  const turnedOff = useRef(false);

  useEffect(() => {
    const onPref = () => { const v = readWatchPref(); if (!v) turnedOff.current = true; setEnabled(v); };
    const onPush = () => { lastSent.current = ''; setTick(t => t + 1); };
    window.addEventListener(WATCH_CHANGE_EVENT, onPref);
    window.addEventListener(PUSH_CHANGE_EVENT, onPush);
    return () => {
      window.removeEventListener(WATCH_CHANGE_EVENT, onPref);
      window.removeEventListener(PUSH_CHANGE_EVENT, onPush);
    };
  }, []);

  useEffect(() => {
    const ids = [...(favorites || [])].map(String).filter(Boolean).sort().slice(0, MAX_IDS);
    const t = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!enabled && !turnedOff.current) return;
      const endpoint = await currentEndpoint();
      if (!endpoint) return;                     // 通知未登録なら何もしない
      const sig = enabled ? `on|${endpoint}|${ids.join(',')}` : `off|${endpoint}`;
      if (sig === lastSent.current) return;
      try {
        const r = await fetch('/api/watch', {
          method: enabled ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enabled ? { endpoint, eventIds: ids } : { endpoint }),
        });
        if (r.ok) { lastSent.current = sig; if (!enabled) turnedOff.current = false; }
      } catch { /* 次の変更・次回起動で再送する */ }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [favorites, enabled, tick]);
}
