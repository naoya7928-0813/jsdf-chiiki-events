import { useState, useCallback } from 'react';
import { F } from './Shared';
// 規約本文は規約画面と同じレンダラーで描く（見た目を揃え、**強調** も反映する）
import { renderMarkdown } from './LegalScreen';
import { TERMS_MD } from '../constants/terms';
import { PRIVACY_MD } from '../constants/privacy';
import {
  LEGAL_VERSION, LEGAL_REVISED_AT, LEGAL_CHANGES, LEGAL_SUMMARY,
  saveAcceptedLegalVersion,
} from '../constants/legal';

/**
 * ConsentGate — 利用規約・プライバシーポリシーへの同意を求めるゲート
 *
 * 表示条件は App 側（consentStateFor）で判定する。
 *   initial … 初回利用（同意の記録が無い）
 *   revised … 改定があり、同意した版が古い（＝各利用者に一度だけ再確認する）
 *
 * 同意しない場合は本アプリを利用できない。ブラウザのタブを閉じることを試みるが、
 * スクリプトが開いたタブでない限り window.close() はブラウザに拒否されるため、
 * 閉じられなかった場合はアプリ本体を描画しない終了画面を表示し続ける
 * （＝実質的に利用不可）。誤操作からの復帰用に「やはり同意する」だけ残す。
 */

export default function ConsentGate({ state, theme, onAccepted }) {
  const primary = theme?.primary || '#0b2545';
  const isRevised = state === 'revised';
  const [declined, setDeclined] = useState(false);
  const [doc, setDoc] = useState(null);          // 'terms' | 'privacy' | null
  const [confirming, setConfirming] = useState(false);

  const accept = useCallback(() => {
    saveAcceptedLegalVersion(LEGAL_VERSION);
    onAccepted();
  }, [onAccepted]);

  // 「同意しない」→ サイトを閉じる。閉じられない環境では終了画面を出し続ける。
  const decline = useCallback(() => {
    setDeclined(true);
    try { window.close(); } catch { /* ブラウザに拒否される場合がある */ }
  }, []);

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'var(--bg)', color: 'var(--text)',
    display: 'flex', flexDirection: 'column',
    fontFamily: F.sans,
  };

  // ── 同意しなかった場合の終了画面（アプリ本体は描画しない） ──
  if (declined) {
    return (
      <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="consent-closed-title">
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center', gap: 14,
        }}>
          <div id="consent-closed-title" style={{ fontSize: 16, fontWeight: 700 }}>
            ご利用を終了しました
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.9, maxWidth: 420 }}>
            利用規約・プライバシーポリシーに同意いただけないため、本アプリはご利用いただけません。<br />
            このタブを閉じてください。
          </div>
          <button
            onClick={() => { setDeclined(false); setConfirming(false); }}
            style={{
              marginTop: 6, padding: '11px 24px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: F.sans,
            }}
          >
            同意画面に戻る
          </button>
        </div>
      </div>
    );
  }

  // ── 規約全文の閲覧 ──
  if (doc) {
    const isTerms = doc === 'terms';
    return (
      <div style={overlay} role="dialog" aria-modal="true">
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <button
            onClick={() => setDoc(null)}
            style={{
              border: 'none', background: 'transparent', color: 'var(--brand-fg)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: F.sans,
            }}
          >
            ← 戻る
          </button>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {isTerms ? '利用規約' : 'プライバシーポリシー'}
          </div>
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '4px 20px 32px',
          color: 'var(--text)',
        }}>
          {renderMarkdown(isTerms ? TERMS_MD : PRIVACY_MD, primary)}
        </div>
      </div>
    );
  }

  // ── 「同意しない」の確認 ──
  if (confirming) {
    return (
      <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="consent-confirm-title">
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center', gap: 14,
        }}>
          <div id="consent-confirm-title" style={{ fontSize: 15.5, fontWeight: 700 }}>
            同意せずに終了しますか？
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.9, maxWidth: 420 }}>
            利用規約・プライバシーポリシーに同意いただけない場合、本アプリはご利用いただけません。
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                padding: '11px 22px', borderRadius: 10, border: 'none',
                background: primary, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: F.sans,
              }}
            >
              戻る
            </button>
            <button
              onClick={decline}
              style={{
                padding: '11px 22px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: F.sans,
              }}
            >
              終了する
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 同意のお願い（初回 / 改定） ──
  const linkStyle = {
    border: 'none', background: 'transparent', color: 'var(--brand-fg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0,
    textDecoration: 'underline', fontFamily: F.sans,
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '32px 20px 20px',
      }}>
        {/* 内容が短い初回表示では縦中央に寄せる。auto マージンを使うのは、
            justify-content: center だと内容が溢れたときに上端が切れて
            スクロールで戻れなくなるため。 */}
        <div style={{ width: '100%', maxWidth: 520, margin: 'auto 0' }}>
          <div style={{
            fontSize: 10.5, letterSpacing: 2, color: 'var(--text-muted)',
            fontFamily: F.mono, marginBottom: 6,
          }}>
            {isRevised ? 'TERMS UPDATED' : 'BEFORE YOU START'}
          </div>
          <h1 id="consent-title" style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', lineHeight: 1.5 }}>
            {isRevised ? '利用規約・プライバシーポリシーを改定しました' : 'ご利用にあたって'}
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.9, marginBottom: 18 }}>
            {isRevised
              ? `${LEGAL_REVISED_AT}付で内容を改定しました。引き続きご利用いただくには、改めて同意をお願いします。`
              : '本アプリをご利用いただく前に、利用規約とプライバシーポリシーへの同意をお願いします。'}
          </div>

          {/* 初回は「何に同意するのか」の要点、改定時は「何が変わったか」を示す */}
          {(() => {
            const items = isRevised ? LEGAL_CHANGES : LEGAL_SUMMARY;
            if (items.length === 0) return null;
            return (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px 16px', marginBottom: 18, background: 'var(--card)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-fg)', marginBottom: 8 }}>
                  {isRevised ? '主な変更点' : '要点'}
                </div>
                {items.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, lineHeight: 1.8 }}>
                    <span style={{ color: 'var(--brand-fg)', flexShrink: 0 }}>•</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
            <button onClick={() => setDoc('terms')} style={linkStyle}>利用規約を読む</button>
            <button onClick={() => setDoc('privacy')} style={linkStyle}>プライバシーポリシーを読む</button>
          </div>
        </div>
      </div>

      <div style={{
        borderTop: '1px solid var(--border)', padding: '14px 20px',
        display: 'flex', justifyContent: 'center', flexShrink: 0, background: 'var(--bg)',
      }}>
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', gap: 10 }}>
          <button
            onClick={() => setConfirming(true)}
            style={{
              flex: '0 0 auto', padding: '13px 20px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: F.sans,
            }}
          >
            同意しない
          </button>
          <button
            onClick={accept}
            style={{
              flex: 1, padding: '13px 20px', borderRadius: 10, border: 'none',
              background: primary, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: F.sans,
            }}
          >
            同意して利用をはじめる
          </button>
        </div>
      </div>
    </div>
  );
}
