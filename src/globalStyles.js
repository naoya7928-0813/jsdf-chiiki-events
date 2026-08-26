// 公開アプリ・運営者ページ共通のグローバルCSS（CSS変数 + リセット）。
// 両エントリ（main.jsx / admin-entry.jsx）で同じ見た目になるよう一元管理する。
export const GLOBAL_CSS = `
  /* ─── ライトモード（デフォルト） ─── */
  :root {
    --bg:         #f5f6f8;
    --card:       #ffffff;
    --border:     #e5e8ee;
    --sep:        #eef1f6;
    --text:       #0f172a;
    --text-sub:   #475569;
    --text-muted: #6b7280;
    --icon-muted: #c8cdd6;
    --month-sep:  #d8dce3;
    --tag-bg:     #eef1f6;
    --badge-bg:   #eef1f6;
    --map-gray:        #d1d5db;
    --map-hover:       #c4c8d0;
    --notice-bg:       rgba(133,107,0,0.07);
    --notice-border:   rgba(133,107,0,0.15);
    /* オフライン帯（「いつ時点の情報か」を示す常時表示バー） */
    --offline-bg:      #fff8e6;
    --offline-border:  #f0d9a0;
    --offline-text:    #7a5b00;
    /* 角丸の2段階ルール（フィードバック§4-2⑤）:
       外側の容れ物（カード・モーダル・バナー）は大きめ、
       内側の要素（バッジ・チップ・タグ）は小さめ＝角ばった規格ラベル調に統一する。 */
    --radius-container: 12px;
    --radius-element:   4px;
    --radius-tag:       2px;   /* カテゴリバッジ等の角ばったタグ形 */
  }

  /* ─── ダークモード ─── */
  [data-theme="dark"] {
    --bg:         #0d1117;
    --card:       #161b22;
    --border:     #30363d;
    --sep:        #21262d;
    --text:       #e6edf3;
    --text-sub:   #8b949e;
    --text-muted: #6e7681;
    --icon-muted: #484f58;
    --month-sep:  #30363d;
    --tag-bg:     #21262d;
    --badge-bg:   #21262d;
    --map-gray:        #2d3748;
    --map-hover:       #3d4a5e;
    --notice-bg:       rgba(255,200,0,0.06);
    --notice-border:   rgba(255,200,0,0.12);
    --offline-bg:      #2b2415;
    --offline-border:  #4a3d1c;
    --offline-text:    #e3c983;
  }

  /* ─── OS設定がダーク かつ data-theme 未指定の場合 ─── */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]):not([data-theme="dark"]) {
      --bg:         #0d1117;
      --card:       #161b22;
      --border:     #30363d;
      --sep:        #21262d;
      --text:       #e6edf3;
      --text-sub:   #8b949e;
      --text-muted: #6e7681;
      --icon-muted: #484f58;
      --month-sep:  #30363d;
      --tag-bg:     #21262d;
      --badge-bg:   #21262d;
      --map-gray:        #2d3748;
      --map-hover:       #3d4a5e;
      --notice-bg:       rgba(255,200,0,0.06);
      --notice-border:   rgba(255,200,0,0.12);
      --offline-bg:      #2b2415;
      --offline-border:  #4a3d1c;
      --offline-text:    #e3c983;
    }
  }

  /* ─── リセット & ベース ─── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
    background: var(--bg);
    /* ページ自体はスクロールさせず、アプリ内の領域だけスクロールさせる。
       モバイル（特にiOS）の下部ラバーバンド／余計な動きを抑える。 */
    overflow: hidden;
    overscroll-behavior: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  body {
    /* 画面に固定してビューポート外への移動（バウンス）を防ぐ */
    position: fixed;
    inset: 0;
    width: 100%;
    font-feature-settings: "palt" 1;
    /* 日付・件数・時刻の桁幅を揃える（一覧の整列感。フィードバック§4-2②） */
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    color: var(--text);
  }

  #root { height: 100%; height: 100dvh; overflow: hidden; }

  /* 横スクロールのチップ列: 右端をフェードさせ「続きがある」ことを伝える
     （フィードバック§4-2③。全チップ列共通） */
  .jsdf-hscroll {
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
    mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
  }

  ::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; }
  button { -webkit-appearance: none; appearance: none; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── 404画面のレスポンシブ ───
     インラインstyleでは幅に応じた出し分けができないため、ここをCSSで持つ。
     JSのブレークポイント判定に頼らず、実際の表示幅にそのまま追従させる。 */
  .nf-wrap {
    width: 100%;
    max-width: 460px;
    /* 内容が短いときは縦中央へ。auto マージンを使うのは、justify-content:center だと
       内容が溢れたときに上端が切れてスクロールで戻れなくなるため。 */
    margin: auto 0;
  }
  .nf-code {
    font-family: "SF Mono","IBM Plex Mono",ui-monospace,"Menlo","Consolas",monospace;
    font-size: clamp(36px, 11vw, 52px);
    letter-spacing: clamp(3px, 1.6vw, 8px);
    line-height: 1;
    font-weight: 500;
    opacity: 0.28;
    margin-bottom: 4px;
  }
  .nf-title  { font-size: clamp(15px, 4.2vw, 19px); }
  .nf-lead   { font-size: clamp(12px, 3.4vw, 13.5px); }
  /* 狭い画面ではボタンを横並びのまま縮め、折り返したときは全幅にして押しやすくする */
  .nf-actions > button { flex: 1 1 auto; min-width: 148px; }
  /* トラックは minmax(0,1fr) にすること。単なる 1fr は minmax(auto,1fr) と同義で、
     最小幅が中身の min-content になる。タイトルは white-space:nowrap なので、
     長い名前だとトラックごと親からはみ出し、省略記号（…）が効かずに切れてしまう。
     ※ この CSS はテンプレートリテラル内なので、コメントにバッククォートを書かないこと
       （文字列が途中で終わってビルドが壊れる）。 */
  .nf-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  /* グリッドアイテム自身も既定が min-width:auto なので、これが無いと
     カードが中身の min-content 幅まで広がって親からはみ出す。 */
  .nf-list > button { min-width: 0; }

  @media (min-width: 720px) {
    /* 幅に余裕があれば提案を2列にして、下半分が空くのを防ぐ */
    .nf-wrap { max-width: 720px; }
    .nf-list { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }

  /* iOS Safari は font-size が 16px 未満の入力欄をタップすると自動でズームインし、
     そのズームがログイン後の画面まで残って「拡大表示」に見える不具合になる。
     タッチ端末では入力系フォントを 16px 以上に固定して自動ズームを無効化する
     （インライン style の fontSize:14 も !important で上書きする。デスクトップは対象外）。 */
  @media (pointer: coarse) {
    input, select, textarea { font-size: 16px !important; }
  }
`;

/** グローバルCSSを <head> に注入する */
export function injectGlobalStyles() {
  const el = document.createElement('style');
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}
