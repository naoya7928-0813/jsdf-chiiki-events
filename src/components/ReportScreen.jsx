import { useState } from 'react';
import { ScreenHeader, F } from './Shared';
import { NTFY_BUG_TOPIC } from '../config';

/* global __APP_VERSION__ */

const CATEGORIES = ['バグ', '表示崩れ', '表記の誤り', '要望', 'その他'];
const CONTENT_MAX = 1000; // 内容の最大文字数
const CONTACT_MAX = 200;  // 連絡先の最大文字数

// 自動添付する状況情報を組み立てる（個人情報は含めない）
function buildContext(updatedAt) {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '不明';
  let size = '';
  try { size = `${window.innerWidth}×${window.innerHeight}`; } catch { /* noop */ }
  const sentAt = new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).replace(',', '');
  return {
    version,
    ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '不明',
    size,
    updatedAt: updatedAt || '不明',
    sentAt,
  };
}

export default function ReportScreen({ theme, updatedAt, onBack }) {
  const { primary } = theme;
  const [category, setCategory] = useState('バグ');
  const [content,  setContent]  = useState('');
  const [contact,  setContact]  = useState('');
  const [status,   setStatus]   = useState('idle'); // idle | sending | done | error
  const [showCtx,  setShowCtx]  = useState(false);

  const ctx = buildContext(updatedAt);
  const canSend = content.trim().length >= 1 && status !== 'sending';

  async function handleSubmit() {
    if (!canSend) return;
    setStatus('sending');
    const message =
      `【種別】${category}\n` +
      `【内容】\n${content.trim()}\n\n` +
      `【連絡先】${contact.trim() || '未記入'}\n\n` +
      `―― 状況（自動添付）――\n` +
      `バージョン: ${ctx.version}\n` +
      `端末/ブラウザ: ${ctx.ua}\n` +
      `画面サイズ: ${ctx.size}\n` +
      `データ更新: ${ctx.updatedAt}\n` +
      `送信日時: ${ctx.sentAt}`;
    try {
      const res = await fetch('https://ntfy.sh', {
        method: 'POST',
        body: JSON.stringify({
          topic: NTFY_BUG_TOPIC,
          title: `🐞 ${category}の報告`,
          message,
          tags: ['beetle'],
          priority: (category === 'バグ' || category === '表示崩れ') ? 4 : 3,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  const inputBase = {
    width: '100%', boxSizing: 'border-box', fontFamily: F.sans, fontSize: 14,
    color: 'var(--text)', background: 'var(--card)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px',
    outline: 'none',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      <ScreenHeader primary={primary} title="バグ・不具合の報告" subtitle="REPORT" onBack={onBack} />

      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '18px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)',
      }}>
        {status === 'done' ? (
          <div style={{
            marginTop: 24, textAlign: 'center', padding: '28px 18px',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>送信しました</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              ご報告ありがとうございます。<br />内容を確認し、改善に役立てます。
            </div>
            <button onClick={onBack} style={{
              marginTop: 18, padding: '10px 22px', borderRadius: 10, border: 'none',
              background: primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F.sans,
            }}>閉じる</button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7, margin: '0 0 16px' }}>
              アプリの不具合・表示の崩れ・表記の誤り・ご要望などをお知らせください。
            </p>

            {/* 種別 */}
            <Label>種別</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {CATEGORIES.map(c => {
                const on = category === c;
                return (
                  <button key={c} onClick={() => setCategory(c)} style={{
                    padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F.sans,
                    fontSize: 13, fontWeight: on ? 700 : 500,
                    border: `1px solid ${on ? primary : 'var(--border)'}`,
                    background: on ? `${primary}14` : 'var(--card)',
                    color: on ? primary : 'var(--text-sub)',
                  }}>{c}</button>
                );
              })}
            </div>

            {/* 内容 */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: 0.3 }}>
                内容 <span style={{ color: '#ef4444' }}>*</span>
              </div>
              <div style={{
                fontSize: 11, fontFamily: F.mono,
                color: content.length >= CONTENT_MAX ? '#ef4444' : 'var(--text-muted)',
              }}>
                {content.length} / {CONTENT_MAX}
              </div>
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value.slice(0, CONTENT_MAX))}
              maxLength={CONTENT_MAX}
              placeholder="例: 一覧画面で〇〇のイベント名が途中で切れて表示されます"
              rows={6}
              style={{ ...inputBase, resize: 'vertical', lineHeight: 1.6, marginBottom: 18 }}
            />

            {/* 連絡先（任意） */}
            <Label>返信先の連絡先（任意）</Label>
            <input
              value={contact}
              onChange={e => setContact(e.target.value.slice(0, CONTACT_MAX))}
              maxLength={CONTACT_MAX}
              placeholder="メールアドレス等（返信が必要な場合のみ）"
              inputMode="email"
              style={{ ...inputBase, marginBottom: 16 }}
            />

            {/* 自動添付の案内 */}
            <div style={{
              padding: '11px 13px', borderRadius: 10, marginBottom: 18,
              background: `${primary}08`, border: `1px solid ${primary}22`,
            }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                ※ 不具合の調査のため、ご利用中の<strong>アプリのバージョン・端末/ブラウザ情報・画面サイズ・データの更新時刻</strong>が自動で一緒に送信されます（氏名・位置情報などの個人情報は含まれません）。
              </div>
              <button onClick={() => setShowCtx(v => !v)} style={{
                marginTop: 8, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                color: primary, fontSize: 11.5, fontWeight: 700, fontFamily: F.sans,
              }}>
                {showCtx ? '送信される情報を隠す' : '送信される情報を確認する'}
              </button>
              {showCtx && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono, lineHeight: 1.7,
                  wordBreak: 'break-all',
                }}>
                  バージョン: {ctx.version}<br />
                  端末/ブラウザ: {ctx.ua}<br />
                  画面サイズ: {ctx.size}<br />
                  データ更新: {ctx.updatedAt}
                </div>
              )}
            </div>

            {status === 'error' && (
              <div style={{
                padding: '10px 13px', borderRadius: 10, marginBottom: 14,
                background: '#ef444412', border: '1px solid #ef444433',
                fontSize: 12.5, color: '#ef4444', lineHeight: 1.6,
              }}>
                送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。
              </div>
            )}

            <button onClick={handleSubmit} disabled={!canSend} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none', fontFamily: F.sans,
              fontSize: 15, fontWeight: 700, cursor: canSend ? 'pointer' : 'default',
              background: canSend ? primary : 'var(--border)',
              color: canSend ? '#fff' : 'var(--text-muted)',
              transition: 'background 0.15s',
            }}>
              {status === 'sending' ? '送信中…' : '送信する'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 7, letterSpacing: 0.3 }}>
      {children}
    </div>
  );
}
