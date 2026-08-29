import { useContext } from 'react';
import { ICO } from './Icons';
import { F, OperatorNavContext } from './Shared';

/**
 * デスクトップ用の左サイドナビ。
 *
 * 下部タブバーは親指で届く範囲に置くモバイルの作法で、PC では画面下端まで
 * 視線を往復させることになる。1024px 以上では左に固定し、
 * 同じ4項目（＋運営者の管理）をラベル付きで縦に並べる。
 * タブの id は BottomTabBar と同じにして、遷移処理を共通のまま使う。
 */
export const SIDENAV_WIDTH = 232;

export default function SideNav({ active, onChange, primary, unreadCount = 0, onOpenNotifications }) {
  const op = useContext(OperatorNavContext);

  const tabs = [
    { id: 'home',      label: 'ホーム',       icon: (c, s)     => ICO.home(c, s) },
    { id: 'list',      label: 'イベント',     icon: (c, s)     => ICO.cal(c, s)  },
    { id: 'favorites', label: 'お気に入り',   icon: (c, s, on) => ICO.star(c, s, on ? c : 'none') },
    { id: 'settings',  label: '設定',         icon: (c, s)     => ICO.user(c, s) },
  ];
  if (op?.operator) {
    tabs.push({ id: 'admin', label: '管理', icon: (c, s) => ICO.gear(c, s), onTap: op.openAdmin });
  }

  return (
    <nav
      aria-label="メインナビゲーション"
      style={{
        width: SIDENAV_WIDTH, flexShrink: 0, height: '100%',
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        fontFamily: F.sans,
      }}
    >
      {/* ─ ブランド ─ */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--sep)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>
          地本イベントナビ
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          非公式・有志運営
        </div>
      </div>

      {/* ─ ナビ項目 ─ */}
      <div style={{ flex: 1, padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflowY: 'auto' }}>
        {tabs.map(t => {
          const isA = active === t.id
            || (active === 'detail'    && t.id === 'list')
            || (active === 'favorites' && t.id === 'favorites');
          return (
            <button
              key={t.id}
              onClick={() => (t.onTap ? t.onTap() : onChange(t.id))}
              aria-current={isA ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '11px 14px',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderRadius: 'var(--radius-container)',
                background: isA ? 'var(--tag-bg)' : 'transparent',
                color: isA ? 'var(--brand-fg)' : 'var(--text-sub)',
                fontFamily: F.sans, fontSize: 14,
                fontWeight: isA ? 700 : 500,
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => { if (!isA) e.currentTarget.style.background = 'var(--sep)'; }}
              onMouseLeave={e => { if (!isA) e.currentTarget.style.background = 'transparent'; }}
            >
              {t.icon(isA ? 'var(--brand-fg)' : 'var(--icon-muted)', 20, isA)}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─ 通知（下部固定） ─ */}
      {onOpenNotifications && (
        <div style={{ padding: 12, borderTop: '1px solid var(--sep)' }}>
          <button
            onClick={onOpenNotifications}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '11px 14px',
              border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
              borderRadius: 'var(--radius-container)',
              color: 'var(--text-sub)', fontFamily: F.sans, fontSize: 14, fontWeight: 500,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--sep)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {ICO.bell('var(--icon-muted)', 20)}
            <span>お知らせ</span>
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 'auto',
                minWidth: 20, height: 20, padding: '0 6px',
                borderRadius: 10, background: primary, color: '#fff',
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
        </div>
      )}
    </nav>
  );
}
