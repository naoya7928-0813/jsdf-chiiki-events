import { useEffect, useRef } from 'react';
import { F } from './Shared';
import { ICO } from './Icons';

const NOTICE_CSS = `
@keyframes domain-notice-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
@keyframes domain-notice-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .domain-notice-card, .domain-notice-backdrop { animation: none !important; }
}
`;

/**
 * DomainNotice — ドメイン移行のお知らせ（開いたときに一度だけ）
 *
 * 出す・出さないの判定は shared/domainNotice.cjs にある。ここは見た目だけ。
 * 文面は「今どちらのドメインを見ているか」で変える:
 *
 *   moved-away（旧ドメイン）… 新しいURLへ移動してもらう。まだ気づいていない人向け
 *   moved-here（新ドメイン）… お気に入りや設定が空になっている理由を説明する
 *
 * OfflineNotice と同じ作り（背景タップ・Esc・フォーカス移動）に合わせてある。
 * 見た目が揃っていないと、同じ「知らせるだけの窓」だと分かりにくいため。
 *
 * @param {'moved-away'|'moved-here'} mode どちらの文面か
 * @param {string}   newUrl   新しい公開URL
 * @param {Function} onClose  閉じる（呼び出し側が「閉じた記録」を保存する）
 * @param {object}   theme    配色（ボタンの色）
 */
export default function DomainNotice({ mode, newUrl, onClose, theme }) {
  const primary  = theme?.primary || '#0b2545';
  const closeRef = useRef(null);
  const movedAway = mode === 'moved-away';

  // Esc で閉じられるようにする（キーボード操作でも行き止まりにしない）
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 開いた直後に主ボタンへフォーカスを移す（読み上げ・キーボードの起点）
  useEffect(() => { closeRef.current?.focus(); }, []);

  const host  = (() => { try { return new URL(newUrl).host; } catch { return newUrl; } })();
  const title = movedAway ? 'サイトのアドレスが変わりました' : 'アドレスが変わりました';

  return (
    <>
      <style>{NOTICE_CSS}</style>

      {/* 背景（タップで閉じる） */}
      <div
        className="domain-notice-backdrop"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.45)',
          animation: 'domain-notice-fade 0.18s ease-out',
        }}
      />

      {/* 本体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="domain-notice-title"
        aria-describedby="domain-notice-body"
        className="domain-notice-card"
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
          animation: 'domain-notice-in 0.2s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'var(--tag-bg)', border: '1px solid var(--border)',
          }}>
            {ICO.extLink('var(--brand-fg)', 18)}
          </span>
          <div id="domain-notice-title" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
            {title}
          </div>
        </div>

        <div id="domain-notice-body" style={{ fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-sub)' }}>
          {movedAway ? (
            <>
              当サイトは新しいアドレスへ移りました。
              <div style={{ marginTop: 8 }}>
                新しいアドレス:{' '}
                <b style={{ color: 'var(--text)', fontFamily: F.mono, wordBreak: 'break-all' }}>{host}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                お手数ですが、ブックマークやホーム画面のアイコンを登録し直してください。
                アドレスが変わるため、お気に入り・配色などの設定・通知の登録は引き継がれません。
              </div>
            </>
          ) : (
            <>
              このサイトのアドレスは{' '}
              <b style={{ color: 'var(--text)', fontFamily: F.mono, wordBreak: 'break-all' }}>{host}</b>
              {' '}に変わりました。
              <div style={{ marginTop: 8 }}>
                以前のアドレスでお使いだった方は、<b style={{ color: 'var(--text)' }}>お気に入り・配色などの設定・通知の登録が引き継がれません</b>。
                ブラウザがアドレスごとに分けて保存しているためです。お手数ですが登録し直してください。
              </div>
              <div style={{ marginTop: 8 }}>
                ブックマークやホーム画面のアイコンも、新しいアドレスで登録し直すことをおすすめします。
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {movedAway && (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-sub)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: F.sans,
              }}
            >
              あとで
            </button>
          )}
          {movedAway ? (
            <a
              ref={closeRef}
              href={newUrl}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                border: 'none', background: primary, color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F.sans,
                textAlign: 'center', textDecoration: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              新しいサイトへ移動
            </a>
          ) : (
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
          )}
        </div>
      </div>
    </>
  );
}
