/**
 * usePushSubscribed — 「通知をオンにしているか」だけを見る軽いフック
 *
 * usePushNotification は許可ダイアログ・サーバー登録まで面倒を見る重いフックで、
 * 設定画面が使っている。ここは**状態を読むだけ**の用途（ホーム画面アイコンの
 * バッジを出してよいかの判定）に使う。
 *
 * 設定画面で通知を入/切したら usePushNotification が PUSH_CHANGE_EVENT を投げるので、
 * 画面を跨いでも即座に追従する。別のタブや OS 設定から解除された場合に備えて、
 * アプリが再び前面に来たときにも実際の購読を見に行く。
 *
 * 戻り値は true / false / null（＝まだ分からない）の3値。
 * 購読の確認は非同期なので、起動直後にいきなり false を返すと
 * 「通知オフ」と誤って判断され、Service Worker が数えていたバッジを
 * 一瞬消してしまう。分かるまでは null を返し、呼び出し側に判断させない。
 */
import { useState, useEffect } from 'react';
import { PUSH_CHANGE_EVENT } from './usePushNotification';

export function usePushSubscribed() {
  const [subscribed, setSubscribed] = useState(null);   // null = 判定前

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSubscribed(false);   // 通知の仕組み自体が無い環境。ここは待つ必要がない
      return;
    }

    let alive = true;
    const check = () => {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => { if (alive) setSubscribed(!!sub); })
        .catch(() => { if (alive) setSubscribed(false); });   // 判定できない＝出さない
    };
    check();

    // 設定画面での入/切（同一タブ）
    const onChange = (e) => {
      if (!alive) return;
      const next = e?.detail?.subscribed;
      if (typeof next === 'boolean') setSubscribed(next);
      else check();
    };
    // 前面に戻ったとき（別タブ・OS 設定での解除に追従）
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    window.addEventListener(PUSH_CHANGE_EVENT, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener(PUSH_CHANGE_EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return subscribed;
}
