/**
 * usePushNotification
 * Web Push (VAPID) 購読の登録・解除を管理するカスタムフック
 *
 * 状態:
 *   supported  – ブラウザが Push をサポートしているか
 *   subscribed – 現在購読中か
 *   loading    – 処理中フラグ
 *   error      – 最後のエラーメッセージ
 *
 * 操作:
 *   subscribe()   – 購読開始（許可ダイアログ → サーバー登録）
 *   unsubscribe() – 購読解除
 */
import { useState, useEffect, useCallback } from 'react';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotification() {
  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager'   in window;

  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // ── 初期状態チェック ─────────────────────────────────────
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setSubscribed(!!sub);
    }).catch(() => {});
  }, [supported]);

  // ── 購読開始 ─────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      // 通知許可
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('通知の許可が必要です。ブラウザの設定から許可してください。');
        setLoading(false);
        return;
      }

      // VAPID 公開鍵を取得
      const res = await fetch('/api/vapid-public-key');
      if (!res.ok) throw new Error('VAPID key fetch failed');
      const { publicKey } = await res.json();

      // ServiceWorker に購読を登録
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // サーバーに保存
      const saveRes = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!saveRes.ok) throw new Error('Failed to save subscription');

      setSubscribed(true);
    } catch (err) {
      console.error('[usePushNotification] subscribe error', err);
      setError('通知の設定に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  // ── 購読解除 ─────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('[usePushNotification] unsubscribe error', err);
      setError('通知の解除に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, subscribed, loading, error, subscribe, unsubscribe };
}
