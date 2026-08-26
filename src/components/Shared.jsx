import { createContext, useContext } from 'react';
import { ICO } from './Icons';
import { useIsDesktop } from '../hooks/useBreakpoint';

// 運営者ナビ用コンテキスト。operator=true のときだけ下部タブに「管理」を出す。
// 公開アプリ(/)では provider を置かないため、管理タブも管理コードも一切現れない。
export const OperatorNavContext = createContext(null);

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
  sans:  '"Hiragino Sans","ヒラギノ角ゴシック","Yu Gothic UI","游ゴシック","Noto Sans JP Variable","Noto Sans JP",-apple-system,BlinkMacSystemFont,sans-serif',
  serif: '"Hiragino Mincho ProN","ヒラギノ明朝 ProN","Yu Mincho","游明朝","Noto Serif JP Variable","Noto Serif JP",serif',
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

// ─── 共通ヘッダー ────────────────────────────────────────────
export function ScreenHeader({ primary, title, subtitle, onBack, trailing }) {
  return (
    <div style={{
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      paddingBottom: 14,
      background: primary,
      color: '#fff',
    }}>

      <div style={{
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
  const op = useContext(OperatorNavContext);
  // デスクトップでは App が左サイドナビ（SideNav）を出すので、下部タブは畳む。
  // タブバーは各画面が個別に描画しているため、App 側で一括に消せない。
  // ここで自己判断させることで、画面側の変更を不要にしている。
  //
  // ただし運営者ページ(/admin.html)は App が SideNav を出さない
  // （isDesktopLayout = !operator && ...）。運営者まで畳むと、デスクトップ幅で
  // ナビが1つも無くなり「管理」タブに到達できなくなる。
  // 畳むのは「SideNav が実際に出ている場合」だけにする。
  const isDesktop = useIsDesktop();
  if (isDesktop && !op?.operator) return null;
  const tabs = [
    { id: 'home',      label: 'ホーム',     icon: (c, s)     => ICO.home(c, s) },
    { id: 'list',      label: 'イベント',   icon: (c, s)     => ICO.cal(c, s)  },
    // お気に入りはアクティブ時に塗りつぶしスターを表示
    { id: 'favorites', label: 'お気に入り', icon: (c, s, on) => ICO.star(c, s, on ? c : 'none') },
    { id: 'settings',  label: '設定',       icon: (c, s)     => ICO.user(c, s) },
  ];
  // 運営者モードのみ「管理」タブを追加（公開アプリには出ない）
  if (op?.operator) {
    tabs.push({ id: 'admin', label: '管理', icon: (c, s) => ICO.gear(c, s), onTap: op.openAdmin });
  }
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
          <button key={t.id} onClick={() => (t.onTap ? t.onTap() : onChange(t.id))} aria-label={t.label} style={{
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
      display: 'flex', alignItems: 'flex-start', gap: 6,
      margin: '8px 16px 0',
      padding: '8px 12px',
      background: '#fff3f3', border: '1px solid #fca5a5',
      borderRadius: 8, fontSize: 12, color: '#b91c1c',
      fontFamily: F.sans,
    }}>
      <span style={{ display: 'flex', marginTop: 1, flexShrink: 0 }}>{ICO.warn('#b91c1c', 13)}</span>
      <span>データ取得に失敗しました。サンプルデータを表示しています。</span>
    </div>
  );
}

// ─── オフライン表示 ────────────────────────────────────────────
// 通信できないとき／最新を取得できなかったときに、画面上部へ常時表示する。
// 「今見えている情報がいつ時点のものか」を隠さないための帯。
// データ自体は端末内に保持しているので、閲覧は続けられる。
export function OfflineBanner({ offline, stale, lastSyncedAt, onRetry }) {
  // 通信不能、または表示中のデータが最新でないときに出す
  if (!offline && !stale) return null;
  const isOffline = Boolean(offline);

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 14px',
        background: 'var(--offline-bg, #fff8e6)',
        borderBottom: '1px solid var(--offline-border, #f0d9a0)',
        fontSize: 11.5, lineHeight: 1.6, color: 'var(--offline-text, #7a5b00)',
        fontFamily: F.sans, flexShrink: 0,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{ICO.warn('var(--offline-text, #7a5b00)', 13)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {isOffline ? 'オフラインです。' : '最新の情報を取得できませんでした。'}
        {lastSyncedAt
          ? `${lastSyncedAt} 時点の情報を表示しています。`
          : '保存済みの情報を表示しています。'}
      </span>
      {onRetry && !isOffline && (
        <button
          onClick={onRetry}
          style={{
            flexShrink: 0, border: 'none', background: 'transparent',
            color: 'var(--offline-text, #7a5b00)', fontSize: 11.5, fontWeight: 700,
            textDecoration: 'underline', cursor: 'pointer', padding: 0, fontFamily: F.sans,
          }}
        >
          再試行
        </button>
      )}
    </div>
  );
}

// ─── 状態バッジ（中止 / 受付終了） ───────────────────────────
// スクレイパー/運営が付与した status を利用者に明確に表示する。
//   cancelled → 「中止」（赤・目立つ）
//   closed    → 「受付終了」（オレンジ）
// published / 未設定は何も表示しない（通常イベント）。size='sm' は一覧カード用。
const STATUS_BADGE = {
  cancelled: { label: '中止', bg: '#dc2626' },
  closed:    { label: '受付終了', bg: '#b45309' },
};
export function StatusBadge({ status, size = 'sm' }) {
  const s = STATUS_BADGE[status];
  if (!s) return null;
  const pad = size === 'lg' ? '3px 10px' : '2px 7px';
  const fs = size === 'lg' ? 11 : 10;
  return (
    <span style={{
      fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 3,
      background: s.bg, color: '#fff', letterSpacing: 0.5, flexShrink: 0,
      fontFamily: F.sans,
    }}>{s.label}</span>
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
