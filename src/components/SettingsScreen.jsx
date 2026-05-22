import { useState } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F } from './Shared';
import { COLOR_SCHEMES, REGION_SOURCE } from '../config';
import { usePushNotification } from '../hooks/usePushNotification';

// package.json の version を vite.config.js の define で埋め込んだ定数
/* global __APP_VERSION__ */

export default function SettingsScreen({
  theme,
  onColorChange, onDarkModeChange,
  onOpenHome, onOpenRegion, onOpenList, onOpenFavorites,
  onOpenLegal,
}) {
  const { primary, schemeKey, darkMode } = theme;

  // ── Web Push ─────────────────────────────────────────────────
  const push = usePushNotification();

  const [sourceOpen, setSourceOpen] = useState(false);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 10px' }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>SETTINGS</div>
          <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: 1, marginTop: 2 }}>ユーザー設定</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0 8px' }}>

        {/* ─ 1. ブラウザ通知（Web Push） ─ */}
        <GroupTitle>ブラウザ通知</GroupTitle>
        <Card>
          {push.supported ? (
            <ToggleRow
              label="プッシュ通知"
              sub={
                push.subscribed
                  ? '通知が有効です。新しいイベントをお知らせします'
                  : '新しいイベントが追加されたときに通知を受け取る'
              }
              on={push.subscribed}
              loading={push.loading}
              onChange={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
              primary={primary}
            />
          ) : (
            <div style={{ padding: '14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              このブラウザはプッシュ通知に対応していません。
            </div>
          )}
          {push.error && (
            <div style={{
              padding: '8px 14px 12px',
              fontSize: 12, color: '#e05252', lineHeight: 1.5,
            }}>
              {push.error}
            </div>
          )}
        </Card>
        <div style={{
          margin: '6px 16px 0',
          padding: '8px 12px',
          background: 'var(--tag-bg)',
          borderRadius: 8, fontSize: 11, color: 'var(--text-muted)',
          fontFamily: F.sans, lineHeight: 1.6,
        }}>
          プッシュ通知をONにすると、スクレイパーが新しいイベントを検出した際に通知が届きます。通知の許可はブラウザからいつでも取り消せます。
        </div>

        {/* ─ 2. テーマカラー ─ */}
        <GroupTitle>テーマカラー</GroupTitle>
        <Card>
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              アプリの配色（3自衛隊のカラーから選択）
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(COLOR_SCHEMES).map(([k, v]) => {
                const isA = schemeKey === k;
                return (
                  <button key={k} onClick={() => onColorChange(k)} style={{
                    flex: 1, minHeight: 76, padding: 10,
                    border: `1.5px solid ${isA ? v.primary : 'var(--border)'}`,
                    background: isA ? v.primary : 'var(--card)',
                    borderRadius: 10, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 5, fontFamily: F.sans, transition: 'all 0.15s',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: v.primary,
                      border: '2px solid #fff',
                      boxShadow: isA ? `0 0 0 2px ${v.primary}` : `0 0 0 1.5px ${v.primary}44`,
                    }} />
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: isA ? '#fff' : 'var(--text)' }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, color: isA ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>
                      {v.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ─ 4. ダークモード（3択セグメント） ─ */}
        <GroupTitle>ダークモード</GroupTitle>
        <Card>
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              画面の明るさ設定
            </div>
            {/* セグメントコントロール */}
            <div style={{
              display: 'flex', background: 'var(--badge-bg)',
              borderRadius: 8, padding: 3, gap: 2,
            }}>
              {[
                { id: 'system', label: 'システム' },
                { id: 'light',  label: 'ライト'   },
                { id: 'dark',   label: 'ダーク'   },
              ].map(m => {
                const isA = darkMode === m.id;
                return (
                  <button key={m.id} onClick={() => onDarkModeChange(m.id)} style={{
                    flex: 1, height: 40, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: isA ? 'var(--card)' : 'transparent',
                    color: isA ? primary : 'var(--text-muted)',
                    fontFamily: F.sans, fontSize: 13,
                    fontWeight: isA ? 600 : 400,
                    boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ─ 5. 法的情報 ─ */}
        <GroupTitle>法的情報</GroupTitle>
        <Card>
          <LegalLinkRow label="利用規約"             onTap={() => onOpenLegal('terms')}   />
          <LegalLinkRow label="プライバシーポリシー" onTap={() => onOpenLegal('privacy')} last />
        </Card>

        {/* ─ 6. データ出典 ─ */}
        <div style={{
          margin: '20px 16px 0',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setSourceOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: F.sans,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--text-muted)' }}>
              データ出典
            </span>
            <span style={{
              display: 'flex', transition: 'transform 0.2s',
              transform: sourceOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            }}>
              {ICO.chev('var(--text-muted)', 12)}
            </span>
          </button>
          {sourceOpen && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              {Object.values(REGION_SOURCE).map(src => (
                <div key={src.url} style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  lineHeight: 1.7, paddingLeft: 8, marginTop: 8,
                }}>
                  {'・'}{src.name}
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 8 }}>
                {'・'}日本地図: Geolonia Inc. / Wikipedia contributors (GFDL)
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                lineHeight: 1.7, marginTop: 8,
                paddingTop: 8, borderTop: '1px solid var(--sep)',
              }}>
                本アプリは上記サイトの情報を加工して作成した非公式アプリです。防衛省・自衛隊とは一切関係ありません。
              </div>
            </div>
          )}
        </div>

        {/* ─ 7. バージョン ─ */}
        <div style={{ textAlign: 'center', padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 20px)', fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono }}>
          自衛隊地本イベント情報 {__APP_VERSION__}
        </div>
      </div>

      <BottomTabBar
        active="settings"
        onChange={id => {
          if (id === 'home')           onOpenHome();
          else if (id === 'list')      onOpenList();
          else if (id === 'favorites') onOpenFavorites();
        }}
        primary={primary}
      />

    </div>
  );
}

// ─── 内部コンポーネント ──────────────────────────────────────

function GroupTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--text-muted)',
      padding: '14px 24px 6px', letterSpacing: 2,
      fontFamily: F.sans, fontWeight: 500,
    }}>{children}</div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--card)', margin: '0 16px',
      borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
    }}>{children}</div>
  );
}

function ToggleRow({ label, sub, on, onChange, primary, last, loading }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 60,
      padding: '12px 14px', gap: 12,
      borderBottom: last ? 'none' : '1px solid var(--sep)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', letterSpacing: 0.2 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
        )}
      </div>
      <button
        role="switch" aria-checked={on}
        onClick={loading ? undefined : onChange}
        disabled={loading}
        style={{
          width: 44, height: 26, borderRadius: 26,
          background: loading ? 'var(--border)' : on ? primary : 'var(--border)',
          position: 'relative', cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
          transition: 'background 0.2s', padding: 0, flexShrink: 0,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <div style={{
          position: 'absolute', width: 22, height: 22, borderRadius: '50%',
          background: '#fff', top: 2, left: on ? 20 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

/** 法的情報リンク行（タップで画面遷移） */
function LegalLinkRow({ label, onTap, last }) {
  return (
    <button
      onClick={onTap}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', minHeight: 50,
        padding: '12px 14px', gap: 10,
        borderBottom: last ? 'none' : '1px solid var(--sep)',
        background: 'transparent', border: 'none',
        borderBottomWidth: last ? 0 : 1,
        borderBottomStyle: last ? 'none' : 'solid',
        borderBottomColor: 'var(--sep)',
        cursor: 'pointer', textAlign: 'left', fontFamily: F.sans,
      }}
    >
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="var(--icon-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

/** 準備中行（タップ不可・バッジ表示） */
function ComingSoonRow({ label, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 50,
      padding: '12px 14px', gap: 10,
      borderBottom: last ? 'none' : '1px solid var(--sep)',
    }}>
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <span style={{
        fontSize: 10, padding: '2px 9px', borderRadius: 10,
        background: 'var(--badge-bg)', color: 'var(--text-muted)',
        fontFamily: F.mono, letterSpacing: 1, fontWeight: 500,
      }}>準備中</span>
    </div>
  );
}

/** 外部リンク行（アイコン付き） */
function ExternalLinkRow({ label, url, last }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', minHeight: 50,
        padding: '12px 14px', gap: 10,
        borderBottom: last ? 'none' : '1px solid var(--sep)',
        textDecoration: 'none',
      }}
    >
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
      {/* 外部リンクアイコン */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 4h6v6M20 4L10 14M6 6h4M6 6v12h12v-4"
          stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  );
}
