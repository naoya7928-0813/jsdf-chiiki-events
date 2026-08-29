import { useEffect, useRef } from 'react';
import { F } from './Shared';
import { ICO } from './Icons';

const NOTICE_CSS = `
@keyframes offline-notice-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
@keyframes offline-notice-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .offline-notice-card, .offline-notice-backdrop { animation: none !important; }
}
`;

/**
 * OfflineNotice — オフライン（および取得失敗）を知らせるポップアップ
 *
 * 以前は画面上部に帯を常時表示していたが、狭い画面では一覧の表示領域を
 * 常に奪ってしまう。通信できないことは「起きた時に一度伝われば足りる」ため、
 * サイトを開いた時（および通信が切れた時）にポップアップで知らせ、
 * 閉じたあとは画面上下に何も残さない。
 *
 * 「今見えている情報がいつ時点のものか」はこのポップアップで必ず示す
 * （データ自体は端末内に保持しているので、閉じたあとも閲覧は続けられる）。
 *
 * @param {boolean} offline      ブラウザが通信不能と報告している
 * @param {string?} lastSyncedAt 最後にデータを取得できた日時（"YYYY/MM/DD HH:mm"）
 * @param {Function} onClose     閉じる
 * @param {Function?} onRetry    再取得（通信はできるが取得に失敗した場合のみ表示）
 */
export default function OfflineNotice({ offline, lastSyncedAt, onClose, onRetry, theme }) {
  const primary  = theme?.primary || '#0b2545';
  const closeRef = useRef(null);

  // Esc で閉じられるようにする（キーボード操作でも行き止まりにしない）
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 開いた直後に「閉じる」へフォーカスを移す（読み上げ・キーボードの起点）
  useEffect(() => { closeRef.current?.focus(); }, []);

  const title = offline ? '現在オフラインです' : '最新の情報を取得できませんでした';
  const lead  = offline
    ? '通信できないため、最新のイベント情報を取得できません。端末に保存しておいた情報を表示しています。'
    : '通信はできていますが、最新のイベント情報を取得できませんでした。端末に保存しておいた情報を表示しています。';

  return (
    <>
      <style>{NOTICE_CSS}</style>

      {/* 背景（タップで閉じる） */}
      <div
        className="offline-notice-backdrop"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.45)',
          animation: 'offline-notice-fade 0.18s ease-out',
        }}
      />

      {/* 本体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-notice-title"
        aria-describedby="offline-notice-body"
        className="offline-notice-card"
        style={{
          position: 'absolute', zIndex: 901,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(340px, calc(100% - 40px))',
          background: 'var(--card)', color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-container, 12px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          padding: '20px 20px 16px',
          fontFamily: F.sans,
          animation: 'offline-notice-in 0.2s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'var(--offline-bg)', border: '1px solid var(--offline-border)',
          }}>
            {ICO.wifiOff('var(--offline-text)', 18)}
          </span>
          <div id="offline-notice-title" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
            {title}
          </div>
        </div>

        <div id="offline-notice-body" style={{ fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-sub)' }}>
          {lead}
          <div style={{ marginTop: 8 }}>
            {lastSyncedAt
              ? <>表示中の内容は <b style={{ color: 'var(--text)', fontFamily: F.mono }}>{lastSyncedAt}</b> 時点のものです。</>
              : '表示中の内容は最新ではない場合があります。'}
            {offline && '通信が回復すると自動で最新の情報に更新します。'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {onRetry && !offline && (
            <button
              onClick={() => { onRetry(); onClose(); }}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-sub)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: F.sans,
              }}
            >
              再試行
            </button>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: 'none', background: primary, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F.sans,
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </>
  );
}
