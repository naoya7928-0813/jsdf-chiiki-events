import { useState } from 'react';
import { ScreenHeader, F } from './Shared';

/* global __APP_VERSION__ */

const CATEGORIES = ['バグ', '表示崩れ', 'イベント情報の誤り', '表記の誤り', '要望', 'その他'];
const CONTENT_MAX = 1000; // 内容の最大文字数
const CONTACT_MAX = 200;  // 連絡先の最大文字数

// 自動添付する状況情報を組み立てる（個人情報は含めない）
function buildContext(updatedAt) {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '不明';
  let size = '';
  try { size = `${window.innerWidth}×${window.innerHeight}`; } catch { /* noop */ }
  let url = '';
  try { url = window.location.href; } catch { /* noop */ }
  const sentAt = new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).replace(',', '');
  return {
    version,
    ua: (typeof navigator !== 'undefined' && navigator.userAgent) || '不明',
    size,
    url: url || '不明',
    updatedAt: updatedAt || '不明',
    sentAt,
  };
}

export default function ReportScreen({ theme, updatedAt, onBack, target }) {
  const { primary } = theme;
  // 詳細から「情報の誤りを報告」で開いた場合は種別を事前選択
  const [category, setCategory] = useState(target ? 'イベント情報の誤り' : 'バグ');
  const [content,  setContent]  = useState('');
  const [contact,  setContact]  = useState('');
  const [status,   setStatus]   = useState('idle'); // idle | sending | done | error
  const [showCtx,  setShowCtx]  = useState(false);

  const ctx = buildContext(updatedAt);
  const canSend = content.trim().length >= 1 && status !== 'sending';

  async function handleSubmit() {
    if (!canSend) return;
    setStatus('sending');
    // 詳細から開いた場合は対象イベント情報を添付（イベントID・地本名・名称・日付）
    const targetBlock = target
      ? `―― 対象イベント（自動添付）――\n` +
        `地本: ${target.prefLabel || target.pref || '不明'}\n` +
        `イベント名: ${target.title || '不明'}\n` +
        `開催日: ${target.date || '不明'}\n` +
        `イベントID: ${target.id || '不明'}\n\n`
      : '';
    const message =
      `【種別】${category}\n` +
      `【内容】\n${content.trim()}\n\n` +
      `【連絡先】${contact.trim() || '未記入'}\n\n` +
      targetBlock +
      `―― 状況（自動添付）――\n` +
      `ページURL: ${ctx.url}\n` +
      `バージョン: ${ctx.version}\n` +
      `端末/ブラウザ: ${ctx.ua}\n` +
      `画面サイズ: ${ctx.size}\n` +
      `データ更新: ${ctx.updatedAt}\n` +
      `送信日時: ${ctx.sentAt}`;
    try {
      // 送信先トピックはサーバー側（/api/report）でのみ扱う。
      // フロントにはトピック名を持たせない。
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `🐞 ${category}の報告`,
          message,
          priority: ['バグ', '表示崩れ', 'イベント情報の誤り'].includes(category) ? 4 : 3,
        }),
      });
      if (res.status === 429) { setStatus('rate'); return; } // 送信が多すぎる
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }} aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9.2" stroke="#16a34a" strokeWidth="1.6" />
                <path d="M7.5 12.3l3 3 6-6.2" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
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

            {/* 対象イベント（詳細から「情報の誤りを報告」で開いた場合のみ） */}
            {target && (
              <div style={{
                marginBottom: 18, padding: '11px 13px', borderRadius: 10,
                background: `${primary}0c`, border: `1px solid ${primary}33`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: primary, marginBottom: 5, letterSpacing: 0.3 }}>
                  報告対象のイベント
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                  {target.title || '（名称不明）'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  {[target.prefLabel && `${target.prefLabel}地本`, target.date].filter(Boolean).join('・')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
                  このイベントの情報（日付・場所・名称など）の誤りを下にご記入ください。
                </div>
              </div>
            )}

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
              placeholder={category === 'イベント情報の誤り'
                ? '例: 〇〇県の「△△イベント」の日付（または場所・名称）が実際と違います。正しくは□□です'
                : '例: 一覧画面で〇〇のイベント名が途中で切れて表示されます'}
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
              style={{ ...inputBase, marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
              ※ 個人で運営しているため、いただいた内容すべてには対応できず、<strong>返信できない場合があります</strong>。あらかじめご了承ください。
            </div>

            {/* 自動添付の案内 */}
            <div style={{
              padding: '11px 13px', borderRadius: 10, marginBottom: 18,
              background: `${primary}08`, border: `1px solid ${primary}22`,
            }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                ※ 不具合の調査のため、ご利用中の<strong>ページURL・アプリのバージョン・端末/ブラウザ情報・画面サイズ・データの更新時刻</strong>が自動で一緒に送信されます（氏名・位置情報などの個人情報は含まれません）。
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
                  ページURL: {ctx.url}<br />
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

            {status === 'rate' && (
              <div style={{
                padding: '10px 13px', borderRadius: 10, marginBottom: 14,
                background: '#f59e0b14', border: '1px solid #f59e0b44',
                fontSize: 12.5, color: '#b45309', lineHeight: 1.6,
              }}>
                短時間に送信が集中したため、一時的に受け付けを制限しています。しばらく待ってから、もう一度お試しください。
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
