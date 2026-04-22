import { F } from './Shared';

const TOPIC = 'jsdf-chiiki-events-7928';

const isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

// ─── ntfy 購読ガイドモーダル ──────────────────────────────────
// SettingsScreen / NotificationScreen から呼び出す。
// 画面下部からスライドアップするボトムシート形式。
export default function NtfyGuideModal({ primary, onClose }) {
  const steps = [
    isIOS
      ? 'App Store から「ntfy」アプリをインストール（無料）'
      : isAndroid
        ? 'Google Play から「ntfy」アプリをインストール（無料）'
        : 'ブラウザで https://ntfy.sh を開く',
    'アプリを起動し、右下の「＋」ボタンをタップ',
    `トピック名に「${TOPIC}」と入力して購読`,
    '以降、イベントが更新されるたびに通知が届きます',
  ];

  return (
    // 背景クリックで閉じる
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430,
          background: 'var(--card)',
          borderRadius: '18px 18px 0 0',
          padding: '24px 20px',
          paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)',
        }}
      >
        {/* ドラッグハンドル */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border)', margin: '0 auto 20px',
        }} />

        {/* タイトル */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: `${primary}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z"
                stroke={primary} strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M10 21a2 2 0 004 0"
                stroke={primary} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: F.sans }}>
            プッシュ通知の設定方法
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            無料アプリ「ntfy」でイベント更新通知を受け取れます
          </div>
        </div>

        {/* 手順 */}
        {steps.map((text, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, fontFamily: F.mono, marginTop: 1,
            }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, flex: 1, fontFamily: F.sans }}>
              {text}
            </div>
          </div>
        ))}

        {/* トピック名コピー欄 */}
        <div style={{
          background: 'var(--bg)', border: `1px solid ${primary}33`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 2 }}>
              トピック名
            </div>
            <div style={{ fontSize: 14, fontFamily: F.mono, color: primary, fontWeight: 600 }}>
              {TOPIC}
            </div>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(TOPIC)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${primary}`,
              background: 'transparent', color: primary, fontSize: 12,
              cursor: 'pointer', fontFamily: F.sans, fontWeight: 500,
            }}
          >
            コピー
          </button>
        </div>

        {/* アプリストアボタン */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(isIOS || !isAndroid) && (
            <a
              href="https://apps.apple.com/app/ntfy/id1625396347"
              target="_blank" rel="noopener noreferrer"
              style={{
                flex: 1, height: 46, borderRadius: 10,
                background: '#000', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                fontFamily: F.sans, gap: 6,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              App Store
            </a>
          )}
          {(isAndroid || !isIOS) && (
            <a
              href="https://play.google.com/store/apps/details?id=io.heckel.ntfy"
              target="_blank" rel="noopener noreferrer"
              style={{
                flex: 1, height: 46, borderRadius: 10,
                background: '#01875f', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                fontFamily: F.sans,
              }}
            >
              Google Play
            </a>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)',
            fontSize: 14, cursor: 'pointer', fontFamily: F.sans,
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
