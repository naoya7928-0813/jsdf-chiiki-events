import { useState, useEffect } from 'react';

/**
 * ブラウザのオンライン／オフライン状態を購読する。
 *
 * オフラインでは動かない部分（Googleマップの埋め込み・報告の送信・通知の購読）を、
 * 失敗してから気付かせるのではなく、あらかじめ代替表示に切り替えるために使う。
 *
 * navigator.onLine は「ネットワークに繋がっているか」しか分からず、
 * 繋がっていても通信できない場合がある。あくまで表示切り替えの目安として使い、
 * 実際の失敗時のフォールバックは各所で別途用意する。
 */
export function useOnline() {
  const [online, setOnline] = useState(() => {
    try { return navigator.onLine !== false; } catch { return true; }
  });

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
