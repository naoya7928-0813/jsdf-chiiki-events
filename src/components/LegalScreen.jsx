import { ScreenHeader, F } from './Shared';
import { TERMS_MD   } from '../constants/terms';
import { PRIVACY_MD } from '../constants/privacy';

// ─── マークダウン文字列を React 要素に変換するレンダラー ────────
// 対応記法: # H1 / ## H2 / - 箇条書き / **強調** / 通常テキスト

// 行内の **強調** を <strong> に変換する。
// 規約本文で注意喚起に使っているため、未対応だと「**」が記号のまま表示される。
function inline(text, key = 0) {
  const parts = String(text).split(/\*\*/);
  if (parts.length < 3) return text;               // 対になっていなければそのまま
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={`${key}-${i}`} style={{ fontWeight: 700 }}>{part}</strong>
      : part
  );
}

export function renderMarkdown(md, primary) {
  const lines = md.split('\n');
  const nodes = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // H1 はヘッダー側で表示するためスキップ
    } else if (line.startsWith('## ')) {
      nodes.push(
        <div key={key++} style={{
          fontSize: 13, fontWeight: 700, color: primary,
          marginTop: 20, marginBottom: 6,
          paddingBottom: 5,
          borderBottom: `1px solid ${primary}22`,
          letterSpacing: 0.5,
        }}>
          {inline(line.slice(3), key)}
        </div>
      );
    } else if (line.startsWith('- ')) {
      nodes.push(
        <div key={key++} style={{
          display: 'flex', gap: 8, marginBottom: 4,
          fontSize: 13, color: 'var(--text)', lineHeight: 1.75,
        }}>
          <span style={{ color: primary, flexShrink: 0 }}>•</span>
          <span>{inline(line.slice(2), key)}</span>
        </div>
      );
    } else if (line.trim()) {
      nodes.push(
        <div key={key++} style={{
          fontSize: 13, color: 'var(--text)',
          lineHeight: 1.8, marginBottom: 6,
        }}>
          {inline(line, key)}
        </div>
      );
    }
  }

  return nodes;
}

// ─── 法的情報画面 ──────────────────────────────────────────────
export default function LegalScreen({ doc, theme, onBack }) {
  const { primary } = theme;
  const isTerms = doc === 'terms';
  const md      = isTerms ? TERMS_MD : PRIVACY_MD;
  const title   = isTerms ? '利用規約' : 'プライバシーポリシー';
  const sub     = isTerms ? 'TERMS OF SERVICE' : 'PRIVACY POLICY';

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', fontFamily: F.sans,
    }}>
      <ScreenHeader
        primary={primary}
        title={title}
        subtitle={sub}
        onBack={onBack}
      />

      <div style={{
        flex: 1, overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 20px',
        paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 24px)',
      }}>
        {renderMarkdown(md, primary)}

        {/* 非公式アプリである旨の注記 */}
        <div style={{
          marginTop: 28, padding: '12px 14px',
          background: `${primary}08`,
          border: `1px solid ${primary}22`,
          borderRadius: 10,
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
        }}>
          本アプリは個人開発の非公式アプリです。防衛省・自衛隊とは一切関係ありません。
        </div>
      </div>
    </div>
  );
}
