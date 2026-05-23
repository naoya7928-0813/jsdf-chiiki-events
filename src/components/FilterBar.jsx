import { useMemo } from 'react';
import { F } from './Shared';

// メインカテゴリとして個別チップを表示するカテゴリ一覧
export const STANDARD_CATEGORIES = [
  '説明会', '地域参加', '広報活動', '体験', '採用イベント',
  '艦艇公開', '演奏会', '記念行事', '一般公開',
];

// 期間フィルター定義
export const PERIODS = [
  { id: 'all',       label: '全期間' },
  { id: 'today',     label: '今日'   },
  { id: 'thisWeek',  label: '今週'   },
  { id: 'thisMonth', label: '今月'   },
  { id: 'nextMonth', label: '来月'   },
];

// ── タグ定義（固定リスト + 照合キーワード） ────────────────────
// 各タグは title・notes・tag フィールドをまとめてキーワード検索する。
// 単一値の ev.tag 完全一致より大幅に多くのイベントをヒットさせる。
export const TAG_DEFS = [
  { id: '要予約',   label: '要予約',   rx: /予約|申込|申し込み|事前|事前登録/ },
  { id: '入場無料', label: '入場無料', rx: /無料|入場無料/                     },
  { id: '家族向け', label: '家族向け', rx: /家族|子ども|お子|ファミリー|親子/   },
  { id: '学生向け', label: '学生向け', rx: /高校生|中学生|学生|大学生|学校/    },
  { id: '抽選',     label: '抽選',     rx: /抽選/                              },
  { id: 'オンライン', label: 'オンライン', rx: /オンライン|Zoom|zoom|ウェブ/   },
  { id: 'OB・OG',  label: 'OB・OG',  rx: /OB|OG|元自衛官/                   },
];

/** イベントがタグ定義にマッチするか（title + notes + tag を横断） */
export function matchesTag(ev, tagId) {
  const def = TAG_DEFS.find(d => d.id === tagId);
  if (!def) return ev.tag === tagId;
  const haystack = [ev.title, ev.notes, ev.tag].filter(Boolean).join(' ');
  return def.rx.test(haystack);
}

// 期間ごとの件数を返すユーティリティ（ListScreen でも再利用）
export function calcPeriodCounts(events) {
  const n    = new Date(Date.now() + 9 * 3600 * 1000);
  const tStr = n.toISOString().slice(0, 10);

  const wEnd = new Date(n); wEnd.setDate(n.getDate() + 6);
  const wStr = wEnd.toISOString().slice(0, 10);

  const mEnd = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  const mStr = mEnd.toISOString().slice(0, 10);

  const nmStart = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  const nmEnd   = new Date(n.getFullYear(), n.getMonth() + 2, 0);
  const nmSStr  = nmStart.toISOString().slice(0, 10);
  const nmEStr  = nmEnd.toISOString().slice(0, 10);

  const inRange = (e, s, f) => { const ee = e.endDate ?? e.date; return e.date <= f && ee >= s; };

  return {
    all:       events.length,
    today:     events.filter(e => inRange(e, tStr,  tStr)).length,
    thisWeek:  events.filter(e => inRange(e, tStr,  wStr)).length,
    thisMonth: events.filter(e => inRange(e, tStr,  mStr)).length,
    nextMonth: events.filter(e => inRange(e, nmSStr, nmEStr)).length,
  };
}

// ─── フィルターバー（期間 / カテゴリ / タグ） ────────────────────
export default function FilterBar({
  events,
  activeCategory,
  activeTag,
  activePeriod,
  onCategoryChange,
  onTagChange,
  onPeriodChange,
  primary,
}) {
  const periodCounts   = useMemo(() => calcPeriodCounts(events), [events]);
  const categories     = ['すべて', ...STANDARD_CATEGORIES, 'その他'];
  const categoryCounts = {
    'すべて': events.length,
    ...Object.fromEntries(
      STANDARD_CATEGORIES.map(cat => [cat, events.filter(e => e.category === cat).length])
    ),
    'その他': events.filter(e => !STANDARD_CATEGORIES.includes(e.category)).length,
  };

  // タグごとのヒット件数（キーワード横断検索）
  const tagCounts = useMemo(() =>
    Object.fromEntries(TAG_DEFS.map(d => [d.id, events.filter(ev => matchesTag(ev, d.id)).length])),
    [events]
  );

  const scrollRow = {
    display: 'flex', gap: 6,
    overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
  };
  const onWheel = e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } };

  return (
    <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>

      {/* ── 期間チップ行 ── */}
      <div style={{ ...scrollRow, padding: '8px 16px 0' }} onWheel={onWheel}>
        {PERIODS.map(({ id, label }) => {
          const isOn = activePeriod === id;
          const cnt  = periodCounts[id];
          return (
            <button
              key={id}
              onClick={() => onPeriodChange(id)}
              style={{
                flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20,
                border: `1.5px solid ${isOn ? primary : 'var(--border)'}`,
                background: isOn ? `${primary}18` : 'var(--bg)',
                color: isOn ? primary : 'var(--text-muted)',
                fontSize: 12, fontWeight: isOn ? 700 : 400,
              }}
            >
              {label}
              <span style={{
                fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                background: isOn ? `${primary}28` : 'var(--tag-bg)',
                color: isOn ? primary : 'var(--text-muted)',
                borderRadius: 8, padding: '0 5px', lineHeight: '16px',
              }}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── カテゴリチップ行 ── */}
      <div style={{ ...scrollRow, padding: '6px 16px 0' }} onWheel={onWheel}>
        {categories.map(cat => {
          const key  = cat === 'すべて' ? 'all' : cat;
          const isOn = activeCategory === key;
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(key)}
              style={{
                flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 13px', borderRadius: 20,
                border: `1.5px solid ${isOn ? primary : 'var(--border)'}`,
                background: isOn ? primary : 'var(--bg)',
                color: isOn ? '#fff' : 'var(--text-muted)',
                fontSize: 12, fontWeight: isOn ? 600 : 400,
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

      {/* ── タグ行（固定リスト・件数バッジ付き・カテゴリと同等の強度） ── */}
      <div style={{ ...scrollRow, padding: '6px 16px 0' }} onWheel={onWheel}>
        {TAG_DEFS.map(({ id, label }) => {
          const isOn = activeTag === id;
          const cnt  = tagCounts[id];
          return (
            <button
              key={id}
              onClick={() => onTagChange(isOn ? 'all' : id)}
              style={{
                flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20,
                border: `1.5px solid ${isOn ? primary : cnt > 0 ? 'var(--border)' : 'var(--border)'}`,
                background: isOn ? primary : 'var(--bg)',
                color: isOn ? '#fff' : cnt > 0 ? 'var(--text-muted)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: isOn ? 600 : 400,
                opacity: cnt === 0 ? 0.35 : 1,
              }}
            >
              {label}
              <span style={{
                fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                background: isOn ? 'rgba(255,255,255,0.25)' : 'var(--tag-bg)',
                color: isOn ? '#fff' : 'var(--text-muted)',
                borderRadius: 8, padding: '0 5px', lineHeight: '16px',
              }}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
