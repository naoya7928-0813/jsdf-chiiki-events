import { F } from './Shared';

// メインカテゴリとして個別チップを表示するカテゴリ一覧
export const STANDARD_CATEGORIES = [
  '説明会', '地域参加', '広報活動', '体験', '採用イベント',
  '艦艇公開', '演奏会', '記念行事', '一般公開',
];

// ─── カテゴリ・タグ フィルターバー ───────────────────────────
export default function FilterBar({
  events,
  activeCategory,
  activeTag,
  onCategoryChange,
  onTagChange,
  primary,
}) {
  const categories = ['すべて', ...STANDARD_CATEGORIES, 'その他'];
  const categoryCounts = {
    'すべて': events.length,
    ...Object.fromEntries(
      STANDARD_CATEGORIES.map(cat => [cat, events.filter(e => e.category === cat).length])
    ),
    'その他': events.filter(e => !STANDARD_CATEGORIES.includes(e.category)).length,
  };
  const tags = [...new Set(events.map(e => e.tag).filter(t => t && t !== '応募終了'))];

  return (
    <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      {/* カテゴリ行 */}
      <div style={{
        display: 'flex', gap: 6,
        padding: '8px 16px 0',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
        onWheel={e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }}
      >
        {categories.map(cat => {
          const key    = cat === 'すべて' ? 'all' : cat;
          const isOn   = activeCategory === key;
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(key)}
              style={{
                flexShrink: 0,
                padding: '5px 13px', borderRadius: 20,
                border: `1.5px solid ${isOn ? primary : 'var(--border)'}`,
                background: isOn ? primary : 'var(--bg)',
                color: isOn ? '#fff' : 'var(--text-muted)',
                fontSize: 12, fontWeight: isOn ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {cat}
              <span style={{
                fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                background: isOn ? 'rgba(255,255,255,0.25)' : 'var(--tag-bg)',
                color: isOn ? '#fff' : 'var(--text-muted)',
                borderRadius: 8, padding: '0 5px', lineHeight: '16px',
              }}>
                {categoryCounts[cat]}
              </span>
            </button>
          );
        })}
      </div>

      {/* タグ行（タグがある場合のみ） */}
      {tags.length > 0 && (
        <div style={{
          display: 'flex', gap: 6,
          padding: '6px 16px 0',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
          onWheel={e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } }}
        >
          {tags.map(tag => {
            const isOn = activeTag === tag;
            return (
              <button
                key={tag}
                onClick={() => onTagChange(isOn ? 'all' : tag)}
                style={{
                  flexShrink: 0,
                  padding: '3px 10px', borderRadius: 20,
                  border: `1px solid ${isOn ? 'var(--text)' : 'var(--border)'}`,
                  background: isOn ? 'var(--tag-bg)' : 'transparent',
                  color: isOn ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: 11, fontWeight: isOn ? 600 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: F.sans,
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
