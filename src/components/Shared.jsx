import { ICO } from './Icons';

// ── タブバー用メディアクエリを<head>に注入（1回のみ） ──────────
const _TB_CSS_ID = 'jsdf-tabbar-mq';
if (typeof document !== 'undefined' && !document.getElementById(_TB_CSS_ID)) {
  const _el = document.createElement('style');
  _el.id = _TB_CSS_ID;
  _el.textContent = `
    /* ── ブラウザ表示（Safari 内）: デフォルト ── */
    .jsdf-tab-bar {
      padding-top: 8px;
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    }

    /* ── PWA スタンドアロン（ホーム画面から起動） ──────────────
       safe-area-inset-bottom (~34px) がボタン下の余白になるため、
       paddingTop を削ってボタンをやや下方にシフトし空欄を埋める  */
    @media (display-mode: standalone) {
      .jsdf-tab-bar {
        padding-top: 2px;
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 2px);
      }
      .jsdf-tab-bar button {
        min-height: 44px !important;
        padding-top: 4px !important;
        padding-bottom: 10px !important;
      }
    }

    /* ── 背の低い端末（≤700px）: 上下パディング縮小 ── */
    @media (max-height: 700px) {
      .jsdf-tab-bar {
        padding-top: 4px;
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 3px);
      }
      .jsdf-tab-bar button {
        min-height: 40px !important;
        padding-top: 3px !important;
        padding-bottom: 3px !important;
      }
    }
    /* ── 極端に低い端末（≤600px）: さらに縮小 ── */
    @media (max-height: 600px) {
      .jsdf-tab-bar {
        padding-top: 2px;
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 2px);
      }
      .jsdf-tab-bar button {
        min-height: 36px !important;
        padding-top: 2px !important;
        padding-bottom: 2px !important;
      }
    }
  `;
  document.head.appendChild(_el);
}

// ─── ユーティリティ ──────────────────────────────────────────
export function splitDate(d) {
  const [, m, dd] = d.split('-');
  return { m: +m, d: +dd };
}
export function parseYM(d) {
  const [y, m] = d.split('-');
  return `${+y}年 ${+m}月`;
}

// ─── フォントスタック定数 ────────────────────────────────────
export const F = {
  sans:  '"Hiragino Sans","ヒラギノ角ゴシック","Yu Gothic UI","游ゴシック","Noto Sans JP",-apple-system,BlinkMacSystemFont,sans-serif',
  serif: '"Hiragino Mincho ProN","ヒラギノ明朝 ProN","Yu Mincho","游明朝","Noto Serif JP",serif',
  mono:  '"SF Mono","IBM Plex Mono",ui-monospace,"Menlo","Consolas",monospace',
};

// ─── 紋章 ────────────────────────────────────────────────────
export function Emblem({ ch, size = 28, primary = '#0b2545' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#fff" stroke={primary} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="13" fill="none" stroke={primary} strokeWidth="0.7" />
      <text x="20" y="25" textAnchor="middle"
        fontFamily={F.serif} fontSize="13" fontWeight="700" fill={primary}>
        {ch}
      </text>
    </svg>
  );
}

// ─── 自衛隊制服迷彩パレット ──────────────────────────────────
// 陸：2型迷彩（ウッドランド）緑/濃緑/赤茶/黒
// 海：3型迷彩（デジタル紺）濃紺/中青/青灰
// 空：航空迷彩（灰青ウッドランド）灰青/濃灰/灰茶
const CAMO_PALETTES = {
  jgsdf: { bg: '#4e5c38', d1: '#29390f', d2: '#3c5020', d3: '#5a2e18', d4: '#181a0a' },
  jmsdf: { bg: '#182540', d1: '#0c1828', d2: '#1e3558', d3: '#2e4d78', d4: '#081018' },
  jasdf: { bg: '#3e4a56', d1: '#252c34', d2: '#38444e', d3: '#4c3c36', d4: '#586670' },
};
function getCamoPalette(primary) {
  if (primary === '#0b2545') return CAMO_PALETTES.jmsdf;
  if (primary === '#2a4a6b') return CAMO_PALETTES.jasdf;
  return CAMO_PALETTES.jgsdf;
}

// ─── 共通ヘッダー（自衛隊制服迷彩パターン） ──────────────────
export function ScreenHeader({ primary, title, subtitle, onBack, trailing }) {
  const c = getCamoPalette(primary);
  return (
    <div style={{
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      paddingBottom: 14,
      color: '#fff', position: 'relative', overflow: 'hidden',
    }}>
      {/* ── 制服迷彩タイルパターン ── */}
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <pattern id="scr-hdr-camo" x="0" y="0" width="120" height="60" patternUnits="userSpaceOnUse">
            <rect width="120" height="60" fill={c.bg}/>
            <ellipse cx="18"  cy="14" rx="15" ry="8"  fill={c.d1} transform="rotate(-20 18 14)"/>
            <ellipse cx="72"  cy="38" rx="21" ry="11" fill={c.d2} transform="rotate(15 72 38)"/>
            <ellipse cx="105" cy="16" rx="13" ry="7"  fill={c.d1} transform="rotate(-10 105 16)"/>
            <ellipse cx="48"  cy="52" rx="17" ry="8"  fill={c.d3} transform="rotate(25 48 52)"/>
            <ellipse cx="0"   cy="30" rx="10" ry="14" fill={c.d2} transform="rotate(5 0 30)"/>
            <ellipse cx="34"  cy="44" rx="14" ry="7"  fill={c.d4} transform="rotate(10 34 44)"/>
            <ellipse cx="86"  cy="10" rx="12" ry="6"  fill={c.d3} transform="rotate(-25 86 10)"/>
            <ellipse cx="116" cy="48" rx="12" ry="6"  fill={c.d1} transform="rotate(20 116 48)"/>
            <ellipse cx="60"  cy="55" rx="10" ry="5"  fill={c.d4} transform="rotate(-8 60 55)"/>
            <ellipse cx="58"  cy="24" rx="14" ry="7"  fill={c.d2} transform="rotate(-15 58 24)"/>
            <ellipse cx="100" cy="50" rx="15" ry="7"  fill={c.d3} transform="rotate(18 100 50)"/>
            <ellipse cx="8"   cy="52" rx="10" ry="5"  fill={c.d1} transform="rotate(-20 8 52)"/>
            <ellipse cx="120" cy="28" rx="9"  ry="12" fill={c.d2} transform="rotate(8 120 28)"/>
          </pattern>
          <linearGradient id="scr-hdr-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="60%" stopColor="transparent"/>
            <stop offset="100%" stopColor="#000" stopOpacity="0.18"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#scr-hdr-camo)"/>
        <rect width="100%" height="100%" fill={primary} fillOpacity="0.14"/>
        <rect width="100%" height="100%" fill="url(#scr-hdr-fade)"/>
      </svg>

      {/* ── コンテンツ（前面） ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 20px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={onBack} aria-label="戻る" style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
            }}>{ICO.back('#fff', 16)}</button>
          )}
          <div>
            {subtitle && (
              <div style={{ fontFamily: F.sans, fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                {subtitle}
              </div>
            )}
            <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, letterSpacing: 1, marginTop: 2 }}>
              {title}
            </div>
          </div>
        </div>
        {trailing}
      </div>
    </div>
  );
}

// ─── 下部タブバー（CSS変数対応） ──────────────────────────────
export function BottomTabBar({ active, onChange, primary }) {
  const tabs = [
    { id: 'home',      label: 'ホーム',     icon: (c, s)     => ICO.home(c, s) },
    { id: 'list',      label: 'イベント',   icon: (c, s)     => ICO.cal(c, s)  },
    // お気に入りはアクティブ時に塗りつぶしスターを表示
    { id: 'favorites', label: 'お気に入り', icon: (c, s, on) => ICO.star(c, s, on ? c : 'none') },
    { id: 'settings',  label: '設定',       icon: (c, s)     => ICO.user(c, s) },
  ];
  return (
    <div className="jsdf-tab-bar" style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--card)',
      display: 'flex', justifyContent: 'space-around',
      flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isA = active === t.id
          || (active === 'detail'    && t.id === 'list')
          || (active === 'favorites' && t.id === 'favorites');
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-label={t.label} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 12px', minHeight: 44,
          }}>
            {t.icon(isA ? primary : 'var(--icon-muted)', 22, isA)}
            <span style={{
              fontSize: 10, fontFamily: F.sans,
              color: isA ? primary : 'var(--text-muted)',
              fontWeight: isA ? 600 : 400,
            }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── ヘッダーアイコンボタンのベーススタイル ──────────────────
export const iconBtnStyle = {
  width: 44, height: 44, borderRadius: 8, minHeight: 44,
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.18)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
};

// ─── ローディングスピナー ────────────────────────────────────
export function Spinner({ primary }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `3px solid ${primary}22`,
        borderTopColor: primary,
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

// ─── エラーバナー ────────────────────────────────────────────
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      margin: '8px 16px 0',
      padding: '8px 12px',
      background: '#fff3f3', border: '1px solid #fca5a5',
      borderRadius: 8, fontSize: 12, color: '#b91c1c',
      fontFamily: F.sans,
    }}>
      ⚠ データ取得に失敗しました。サンプルデータを表示しています。
    </div>
  );
}

// ─── セクションタイトル（詳細画面用） ───────────────────────
export function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: F.serif, fontSize: 13, fontWeight: 600,
      color: 'var(--text)', letterSpacing: 1,
      marginBottom: 8, paddingLeft: 2,
    }}>{children}</div>
  );
}
