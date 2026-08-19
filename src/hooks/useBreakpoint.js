import { useState, useEffect, createContext, useContext } from 'react';

/**
 * 画面サイズの区分を返す。
 *
 * 本アプリはモバイル前提（430px 固定枠・下部タブ）で作られていたため、
 * PC では 1440px 中 430px しか使わず両脇が空いていた。
 * 幅の判定を1か所に集約し、各画面が同じ境界で分岐できるようにする。
 *
 *   mobile  : ～767px    従来どおり。下部タブバー。
 *   tablet  : 768～1023  1カラムのまま横幅だけ広げる。下部タブバー。
 *   desktop : 1024px～   左サイドナビ + 横幅を活かした各画面レイアウト。
 *
 * ただし幅だけで決めると、横向きスマホ（例 852x393）が tablet 扱いになり
 * 560px の1カラムに押し込まれる。横向きは「幅に余裕があり高さが希少」なので、
 * 縦に積むほど地図が潰れる。実測では iPhone 14 Pro 横で地図が約200pxしか
 * 残らず、地域名が読めなかった。
 * そこで「横長かつ低い」画面は desktop 相当（サイドナビ + 2カラム）として扱う。
 * サイドナビは高さを消費しないため、下部タブ(48px)を置き換えると
 * 縦方向をそのぶん回収できる。
 */
export const BP = {
  tablet:  768,
  desktop: 1024,
  // 横向きスマホと判定する条件
  landscapeMinWidth:  700,
  landscapeMaxHeight: 540,
};

/** 表示レイアウトの選択肢（設定画面から変更できる） */
export const LAYOUT_MODES = ['auto', 'landscape', 'portrait'];

function viewport() {
  try {
    return { w: window.innerWidth, h: window.innerHeight };
  } catch {
    return { w: 0, h: 0 };
  }
}

/** 実際の画面サイズだけから区分を出す（設定による上書き前） */
function naturalBreakpoint() {
  const { w, h } = viewport();
  if (w >= BP.desktop) return 'desktop';
  // 横向きスマホ・小型タブレット横
  if (w >= BP.landscapeMinWidth && h <= BP.landscapeMaxHeight) return 'desktop';
  if (w >= BP.tablet) return 'tablet';
  return 'mobile';
}

/** 物理的にスマホサイズかどうか（設定 UI の出し分けに使う） */
export function isPhoneSized() {
  const { w, h } = viewport();
  return Math.min(w, h) <= 560;
}

/**
 * スマートフォン（タッチ主体の小型端末）かどうかを、画面サイズではなく端末種別で判定する。
 *
 * 横向きスマホは幅 852px 等になり「幅だけ見ると PC と区別がつかない」。
 * ただし物理的な画面は 6 インチ程度しかないため、PC と同じ密度で
 * 2カラムに割ると1列あたりの実寸が小さすぎて読めない。
 * サイズではなく入力方式（粗いポインタ＝指）と短辺で判定する。
 *
 *   pointer: coarse … マウスでなく指で操作している
 *   短辺 <= 560px  … タブレットを除外する（iPad 横は短辺 744px）
 */
export function isTouchPhone() {
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const { w, h } = viewport();
    return coarse && Math.min(w, h) <= 560;
  } catch { return false; }
}

/**
 * 画面区分を返す。
 * @param {'auto'|'landscape'|'portrait'} [mode] 設定画面での上書き。既定は auto
 */
export function useBreakpoint(mode = 'auto') {
  const [bp, setBp] = useState(() => resolve(mode));

  useEffect(() => {
    const apply = () => setBp(resolve(mode));
    apply();
    // resize は回転時にも発火する。orientationchange は端末により
    // 発火順が前後するので、両方購読して取りこぼしを防ぐ。
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [mode]);

  return bp;
}

function resolve(mode) {
  const natural = naturalBreakpoint();
  if (mode === 'landscape') {
    // 横向きレイアウトを強制。ただし物理的に狭い画面で2カラムにすると
    // かえって潰れるため、最低限の幅がある場合だけ desktop 扱いにする。
    return viewport().w >= BP.landscapeMinWidth ? 'desktop' : natural;
  }
  if (mode === 'portrait') {
    // 縦向きレイアウトを強制（サイドナビを出さず1カラム）。
    // PC で使うと極端に狭くなるので、スマホ相当の画面に限る。
    return isPhoneSized() ? 'mobile' : natural;
  }
  return natural;
}

/**
 * 表示レイアウト設定を配る Context。
 * BottomTabBar / HomeScreen など各画面は useIsDesktop() を引数なしで呼ぶため、
 * 設定値はここから受け取らせる（呼び出し側の変更を不要にする）。
 */
export const LayoutModeContext = createContext('auto');

export function useLayoutMode() {
  return useContext(LayoutModeContext);
}

/** デスクトップ相当（左サイドナビ + 横幅活用）かどうか */
export function useIsDesktop(mode) {
  const ctxMode = useLayoutMode();
  return useBreakpoint(mode ?? ctxMode) === 'desktop';
}

/**
 * 要素自身の幅を購読する（コンテナクエリ相当）。
 *
 * 詳細画面は「一覧の右ペイン（約700px）」と「ホームから直接開いた全幅（約1200px）」の
 * 両方で使われる。ウィンドウ幅で判定すると前者でも横並びに切り替わって潰れるため、
 * 置かれた場所の実寸で判断する。
 *
 * @param {{current: HTMLElement|null}} ref
 * @returns {number} 要素の幅(px)。未計測は 0
 */
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
