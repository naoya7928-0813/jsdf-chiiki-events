'use strict';
/**
 * pwaTheme — ホーム画面アプリ（PWA）の見た目の唯一の出どころ
 *
 * 「アプリの色」はブラウザで見ているときの配色とは別に、次の4か所で決まる。
 * どれか1つでも配色とズレると、起動のたびに違う色が挟まって目立つ。
 *
 *   1. manifest の theme_color     … OS のステータスバー／タイトルバーの色
 *   2. manifest の background_color … 起動時にOSが出すスプラッシュの地色
 *   3. <meta name="theme-color">    … 実行中のステータスバー色（Android は動的に追従する）
 *   4. ホーム画面アイコン            … 一番目に入る「アプリの色」
 *
 * 利用者は陸/海/空の配色を選べる（src/config.js の COLOR_SCHEMES）ので、
 * 上の4つも選んだ配色に合わせる。manifest は配色ごとに1つずつ用意し
 * （scripts/generate-manifests.mjs）、実行時に <link rel="manifest"> を
 * 差し替える（インストール時にその配色で登録される）。
 *
 * ⚠ theme は COLOR_SCHEMES[key].primary と、splash は SplashScreen.jsx の
 *   CONFIGS[key].bg と一致していなければならない。ズレると「OSのスプラッシュ →
 *   アプリのスプラッシュ」で色が変わってちらつく。shared/pwaTheme.test.cjs が
 *   実ファイルを読んで検証している。
 */

/** 配色キー（src/config.js の COLOR_SCHEMES と同じ並び） */
const SCHEME_KEYS = ['jgsdf', 'jmsdf', 'jasdf'];

/** 既定の配色（src/config.js の DEFAULT_SCHEME と同値） */
const DEFAULT_SCHEME = 'jgsdf';

/**
 * 配色ごとの PWA 配色。
 *   theme  … ヘッダーの背景色＝ステータスバーの色（COLOR_SCHEMES[key].primary）
 *   splash … 起動スプラッシュの地色（SplashScreen の CONFIGS[key].bg の中間色）
 *
 * splash に白系（従来の #f5f6f8）を置くと、アプリ側のスプラッシュが暗いため
 * 起動のたびに白い画面を一瞬経由する。暗い地色で揃えることでそれを消す。
 */
const PWA_SCHEMES = {
  jgsdf: { label: '陸上自衛隊', theme: '#3a4130', splash: '#1a2410' },
  jmsdf: { label: '海上自衛隊', theme: '#0b2545', splash: '#071833' },
  jasdf: { label: '航空自衛隊', theme: '#2a4a6b', splash: '#071a33' },
};

/** localStorage のキー（src/App.jsx の loadScheme と同じ） */
const SCHEME_KEY = 'jsdf-scheme';

/**
 * ホーム画面（ランチャー）のショートカット。
 * url は src/App.jsx の ROUTE_SCREENS に実在するパスであること
 * （存在しないパスを置くと 404 画面に着地する）。
 */
const SHORTCUTS = [
  { key: 'list',          name: 'イベント一覧', short: '一覧',       url: '/list',          desc: '全国のイベントを一覧で見る' },
  { key: 'favorites',     name: 'お気に入り',   short: 'お気に入り', url: '/favorites',     desc: '登録したイベントを見る' },
  { key: 'notifications', name: '通知',         short: '通知',       url: '/notifications', desc: '新着イベントのお知らせを見る' },
  { key: 'settings',      name: '設定',         short: '設定',       url: '/settings',      desc: '配色・通知などの設定' },
];

/** 未知のキーを既定へ丸める（保存値が壊れていても落ちない） */
function normalizeScheme(key) {
  return SCHEME_KEYS.includes(key) ? key : DEFAULT_SCHEME;
}

/** ステータスバー／タイトルバーの色 */
function themeColorFor(key) {
  return PWA_SCHEMES[normalizeScheme(key)].theme;
}

/** 起動スプラッシュの地色 */
function splashColorFor(key) {
  return PWA_SCHEMES[normalizeScheme(key)].splash;
}

/** 配色ごとの manifest のパス（既定も含め全配色ぶん用意する） */
function manifestPathFor(key) {
  return `/manifest-${normalizeScheme(key)}.webmanifest`;
}

/** 配色ごとの iOS ホーム画面アイコン */
function appleTouchIconFor(key) {
  return `/icons/apple-touch-icon-${normalizeScheme(key)}.png`;
}

/**
 * manifest 本体を組み立てる。
 * vite.config.js（既定配色の manifest.webmanifest）と
 * scripts/generate-manifests.mjs（配色ごとの manifest）が同じ関数を使う。
 */
function buildManifest(key) {
  const scheme = normalizeScheme(key);
  const { theme, splash } = PWA_SCHEMES[scheme];
  return {
    name: '地本イベント情報（非公式まとめ）',
    short_name: '地本イベント',
    description: '自衛隊地方協力本部のイベント情報をまとめた非公式アプリ',
    theme_color: theme,
    background_color: splash,
    display: 'standalone',
    // orientation は指定しない。
    // 以前は 'portrait' で固定していたが、アプリ側に「表示の向き」設定
    // （縦表示 / 横表示 / 自由回転）があるため、manifest で縦に固定すると
    // インストール版だけ横向きレイアウトを一切使えなくなる（画面を活かせない）。
    start_url: '/',
    id: '/',
    scope: '/',
    lang: 'ja',
    dir: 'ltr',
    categories: ['news', 'education', 'lifestyle'],
    // ショートカットや通知から開いたとき、既に開いているウィンドウを使い回す
    // （毎回新しいウィンドウが増えるのを防ぐ）
    launch_handler: { client_mode: 'navigate-existing' },
    icons: [
      { src: `/icons/icon-${scheme}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/icon-${scheme}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/icon-${scheme}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: SHORTCUTS.map(s => ({
      name: s.name,
      short_name: s.short,
      description: s.desc,
      url: s.url,
      icons: [{ src: `/icons/shortcut-${scheme}-${s.key}-96.png`, sizes: '96x96', type: 'image/png' }],
    })),
  };
}

module.exports = {
  SCHEME_KEYS, DEFAULT_SCHEME, PWA_SCHEMES, SCHEME_KEY, SHORTCUTS,
  normalizeScheme, themeColorFor, splashColorFor,
  manifestPathFor, appleTouchIconFor, buildManifest,
};
