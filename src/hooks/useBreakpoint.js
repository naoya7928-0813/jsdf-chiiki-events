import { useState, useEffect } from 'react';

/**
 * 画面幅の区分を返す。
 *
 * 本アプリはモバイル前提（430px 固定枠・下部タブ）で作られていたため、
 * PC では 1440px 中 430px しか使わず両脇が空いていた。
 * 幅の判定を1か所に集約し、各画面が同じ境界で分岐できるようにする。
 *
 *   mobile  : ～767px    従来どおり。下部タブバー。
 *   tablet  : 768～1023  1カラムのまま横幅だけ広げる。下部タブバー。
 *   desktop : 1024px～   左サイドナビ + 横幅を活かした各画面レイアウト。
 *
 * matchMedia を使うのは、既存の isWide / ダークモード判定と揃えるため
 * （resize イベントより発火が少なく、再レンダリングを抑えられる）。
 */
export const BP = { tablet: 768, desktop: 1024 };

function currentBreakpoint() {
  try {
    if (window.matchMedia(`(min-width: ${BP.desktop}px)`).matches) return 'desktop';
    if (window.matchMedia(`(min-width: ${BP.tablet}px)`).matches)  return 'tablet';
  } catch { /* 非対応環境ではモバイル扱い */ }
  return 'mobile';
}

export function useBreakpoint() {
  const [bp, setBp] = useState(currentBreakpoint);

  useEffect(() => {
    const queries = [
      window.matchMedia(`(min-width: ${BP.desktop}px)`),
      window.matchMedia(`(min-width: ${BP.tablet}px)`),
    ];
    const apply = () => setBp(currentBreakpoint());
    queries.forEach(q => q.addEventListener('change', apply));
    apply();
    return () => queries.forEach(q => q.removeEventListener('change', apply));
  }, []);

  return bp;
}

/** デスクトップ（左サイドナビ）かどうか */
export function useIsDesktop() {
  return useBreakpoint() === 'desktop';
}
