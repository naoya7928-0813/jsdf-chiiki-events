/**
 * usePushNotification
 * Web Push (VAPID) 購読の登録・解除を管理するカスタムフック
 *
 * 状態:
 *   status     – 'unsupported' | 'ios-not-installed' | 'ready' | 'subscribed'
 *   loading    – 処理中フラグ
 *   error      – 最後のエラーメッセージ（null = エラーなし）
 *
 * 操作:
 *   subscribe()   – 購読開始（許可ダイアログ → サーバー登録）
 *   unsubscribe() – 購読解除
 */
import { useState, useEffect, useCallback } from 'react';

// ── ブラウザ判定ユーティリティ ────────────────────────────────
function detectEnv() {
  if (typeof window === 'undefined') return { supported: false, reason: 'ssr' };

  // iOS 検出（iPhone / iPad / iPod + iPad Pro）
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ホーム画面から起動されたか（standalone モード）
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  // iOS は standalone でなければ Push 不可
  if (isIOS && !isStandalone) {
    return { supported: false, reason: 'ios-not-installed' };
  }

  // 基本 API チェック
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: 'unsupported' };
  }

  return { supported: true, reason: null };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData  = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotification() {
  const { supported, reason } = detectEnv();

  // 通知の登録・解除はサーバーへの保存を伴うため、オフラインでは行えない。
  // 通知の許可ダイアログだけ出して失敗させると分かりにくいので、先に止める。
  const offlineNow = () => {
    try { return navigator.onLine === false; } catch { return false; }
  };

  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  // ── 初期状態チェック（既存購読の確認） ───────────────────
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  // ── 購読開始 ─────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!supported) return;
    if (offlineNow()) {
      setError('オフラインのため通知を設定できません。通信できる状態でお試しください。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 通知許可リクエスト
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setError('通知がブロックされています。ブラウザの設定から「許可」に変更してください。');
        return;
      }
      if (permission !== 'granted') {
        setError('通知を許可してください。');
        return;
      }

      // VAPID 公開鍵を取得（/api/subscribe の GET に統合）
      const keyRes = await fetch('/api/subscribe');
      if (!keyRes.ok) throw new Error(`VAPID key fetch failed: ${keyRes.status}`);
      const { publicKey } = await keyRes.json();

      // ServiceWorker 準備待ち（タイムアウト 10 秒）
      const swReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ServiceWorker ready timeout')), 10000)
        ),
      ]);

      // Push 購読を作成
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // サーバーに保存
      const saveRes = await fetch('/api/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!saveRes.ok) throw new Error(`Subscribe API failed: ${saveRes.status}`);

      setSubscribed(true);
    } catch (err) {
      console.error('[usePushNotification] subscribe error', err);
      // エラー種別に応じてメッセージを分ける
      if (err.name === 'NotAllowedError') {
        setError('通知の許可が必要です。ブラウザの設定から許可してください。');
      } else if (err.message.includes('timeout')) {
        setError('サービスワーカーの準備に失敗しました。ページを再読み込みして再試行してください。');
      } else {
        setError(`通知の設定に失敗しました（${err.message}）`);
      }
    } finally {
      setLoading(false);
    }
  }, [supported]);

  // ── 購読解除 ─────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    if (offlineNow()) {
      setError('オフラインのため通知を解除できません。通信できる状態でお試しください。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const swReg = await navigator.serviceWorker.ready;
      const sub   = await swReg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/subscribe', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
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

  return { supported, reason, subscribed, loading, error, subscribe, unsubscribe };
}
