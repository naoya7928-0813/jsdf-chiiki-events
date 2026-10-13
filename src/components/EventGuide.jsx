// イベント詳細: 参加準備ガイドとよくある質問（運営が公開したものだけ。useEvents が形を検証済み）。
// FAQ は <details> のアコーディオン（キーボード・読み上げに標準で対応し、スマホでも縦に詰まらない）。
import { SectionTitle } from './Shared';
import { sanitizePublicFaq, sanitizePublicGuide } from '../../shared/eventGuide.cjs';

export function EventGuideSection({ ev }) {
  const items = sanitizePublicGuide(ev && ev.guide);
  if (!items.length) return null;
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>参加準備ガイド</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {items.map((it, i) => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px',
            borderTop: i ? '1px solid var(--sep)' : 'none',
          }}>
            <div style={{ fontSize: 11.5, color: 'var(--brand-fg)', fontWeight: 700, paddingTop: 2, minWidth: 84, flexShrink: 0 }}>{it.label}</div>
            <div style={{
              fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line', minWidth: 0, overflowWrap: 'anywhere',
              color: it.state === 'na' ? 'var(--text-muted)' : 'var(--text)',
            }}>{it.text}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 2px 0', lineHeight: 1.6 }}>
        運営が確認した項目のみ掲載しています。記載のない項目は公式ページでご確認ください。
      </div>
    </div>
  );
}

export function EventFaqSection({ ev }) {
  const faq = sanitizePublicFaq(ev && ev.faq);
  if (!faq.length) return null;
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>よくある質問</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {faq.map((f, i) => (
          <details key={f.id || i} style={{ borderTop: i ? '1px solid var(--sep)' : 'none' }}>
            <summary style={{
              cursor: 'pointer', padding: '13px 14px', fontSize: 14, fontWeight: 600, color: 'var(--text)',
              lineHeight: 1.5, listStyle: 'revert', overflowWrap: 'anywhere',
            }}>
              <span style={{ color: 'var(--brand-fg)', marginRight: 6 }}>Q.</span>{f.q}
            </summary>
            <div style={{ padding: '0 14px 13px 34px', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              <span style={{ color: 'var(--brand-fg)', fontWeight: 700, marginLeft: -20, marginRight: 6 }}>A.</span>{f.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
