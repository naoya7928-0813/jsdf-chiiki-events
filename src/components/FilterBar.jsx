import { useMemo } from 'react';
import { F } from './Shared';
// 陸海空の判定は shared/branch.cjs に集約（運営テンプレ・API と共有）
import { BRANCH_DEFS, matchesBranch } from '../../shared/branch.cjs';

export { BRANCH_DEFS, matchesBranch };

// メインカテゴリとして個別チップを表示するカテゴリ一覧
export const STANDARD_CATEGORIES = [
  '説明会', '地域参加', '広報活動', '体験', '採用イベント',
  '艦艇公開', '演奏会', '記念行事', '一般公開',
];

// 期間フィルター定義
export const PERIODS = [
  { id: 'all',       label: '全期間' },
  { id: 'today',     label: '今日'   },
  { id: 'weekend',   label: '今週末' },
  { id: 'thisWeek',  label: '今週'   },
  // 今週が「今日から6日後まで」の相対期間なので、来週もその続き（7〜13日後）にする。
  // 暦の月曜〜日曜にすると「今週」との間に隙間・重なりができて分かりにくい。
  { id: 'nextWeek',  label: '来週'   },
  { id: 'thisMonth', label: '今月'   },
  { id: 'nextMonth', label: '来月'   },
];

// 今週末（直近の土曜・日曜）の日付範囲を { sat, sun } で返す。
// 日曜日は当日を週末扱い（過ぎた土曜には戻さない）。ListScreen と件数計算で共有。
export function weekendRange(tStr) {
  const addDays = (s, n) => {
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const dow = new Date(tStr + 'T00:00:00Z').getUTCDay(); // 0=日 .. 6=土
  if (dow === 0) return { sat: tStr, sun: tStr };          // 日曜: 当日のみ
  const toSat = 6 - dow;
  return { sat: addDays(tStr, toSat), sun: addDays(tStr, toSat + 1) };
}

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
  // JST の今日を YYYY-MM-DD 文字列で取得（UTC+9 をオフセットして ISO 変換）
  const tStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const Y  = Number(tStr.slice(0, 4));
  const Mo = Number(tStr.slice(5, 7)); // 1-indexed

  // ヘルパー: n 日後の YYYY-MM-DD（UTC 基準で計算→ TZ 影響なし）
  const addDays = (s, n) => {
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  // ヘルパー: 月の末日（1-indexed month）
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = n => String(n).padStart(2, '0');

  const wStr  = addDays(tStr, 6);
  const nwS   = addDays(tStr, 7);   // 来週のはじまり
  const nwE   = addDays(tStr, 13);  // 来週のおわり
  const mStr = `${Y}-${pad(Mo)}-${pad(lastDay(Y, Mo))}`;

  // 来月（年またぎ対応）
  const nmY    = Mo === 12 ? Y + 1 : Y;
  const nmM    = Mo === 12 ? 1 : Mo + 1;
  const nmSStr = `${nmY}-${pad(nmM)}-01`;
  const nmEStr = `${nmY}-${pad(nmM)}-${pad(lastDay(nmY, nmM))}`;

  const inRange = (e, s, f) => { const ee = e.endDate ?? e.date; return e.date <= f && ee >= s; };
  const { sat: satStr, sun: sunStr } = weekendRange(tStr);

  return {
    all:       events.length,
    today:     events.filter(e => inRange(e, tStr,  tStr)).length,
    // 今週末：直近の土日に開催がかかるイベント（かつ終了前）
    weekend:   events.filter(e => inRange(e, satStr, sunStr) && (e.endDate ?? e.date) >= tStr).length,
    thisWeek:  events.filter(e => inRange(e, tStr,  wStr)).length,
    // 来週：7〜13日後に開催がかかるもの
    nextWeek:  events.filter(e => inRange(e, nwS,   nwE)).length,
    thisMonth: events.filter(e => inRange(e, tStr,  mStr)).length,
    // 来月：開始日ベースで判定
    nextMonth: events.filter(e => e.date >= nmSStr && e.date <= nmEStr).length,
  };
}

// 申請済みフィルター用の特別タグ ID（TAG_DEFS には含めない）
export const APPLIED_TAG_ID = '申請済み';
// 終了済みフィルター用の特別タグ ID（通常は非表示、このタグ選択時のみ表示）
export const ENDED_TAG_ID = '終了済み';

// ─── 折り畳みトグルの山形アイコン ────────────────────────────
function ChevUpDown({ up }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
        stroke="var(--text-muted)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── フィルターバー（期間 / カテゴリ / タグ） ────────────────────
export default function FilterBar({
  events, applied,
  activeCategory,
  activeTag,
  activePeriod,
  activeBranch,
  onCategoryChange,
  onTagChange,
  onPeriodChange,
  onBranchChange,
  primary,
  // 折り畳み制御
  collapsed = false,
  onToggleCollapsed,
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

  // 種別ごとの件数（陸海空。判定できないイベントはどこにも入らない）
  const branchCounts = useMemo(() =>
    Object.fromEntries(BRANCH_DEFS.map(b => [b.id, events.filter(ev => matchesBranch(ev, b.id)).length])),
    [events]
  );

  // 申請済みの件数（applied Set から直接カウント）
  const appliedCount = useMemo(
    () => events.filter(ev => applied?.has(ev.id)).length,
    [events, applied]
  );
  // 終了済みの件数（ended フラグ）
  const endedCount = useMemo(() => events.filter(ev => ev.ended).length, [events]);

  // アクティブなフィルター数（トグルヘッダーのバッジ用）
  const activeCount =
    (activePeriod !== 'all' ? 1 : 0) +
    (activeCategory !== 'all' ? 1 : 0) +
    (activeBranch !== 'all' ? 1 : 0) +
    (activeTag !== 'all' ? 1 : 0);

  // 折り畳み時にサマリーとして表示するラベル
  const activePeriodLabel    = PERIODS.find(p => p.id === activePeriod)?.label;
  const activeCategoryLabel  = activeCategory === 'all' ? null : activeCategory;
  const activeTagLabel       = activeTag === 'all' ? null : activeTag;
  const activeBranchDef      = BRANCH_DEFS.find(b => b.id === activeBranch) || null;

  const scrollRow = {
    display: 'flex', gap: 6,
    overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
  };
  const onWheel = e => { if (e.deltaY !== 0) { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; } };

  return (
    <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>

      {/* ── トグルヘッダー（常時表示） ── */}
      <button
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'フィルターを展開' : 'フィルターを収納'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: F.sans, textAlign: 'left',
        }}
      >
        {/* スライダーアイコン */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M3 6h18M6 12h12M10 18h4"
            stroke={activeCount > 0 ? primary : 'var(--text-muted)'}
            strokeWidth="2" strokeLinecap="round"
          />
        </svg>

        <span style={{
          fontSize: 12, fontWeight: activeCount > 0 ? 600 : 400,
          color: activeCount > 0 ? 'var(--brand-fg)' : 'var(--text-muted)',
        }}>
          絞り込み
        </span>

        {/* アクティブフィルター数バッジ */}
        {activeCount > 0 && (
          <span style={{
            fontSize: 10, background: primary, color: '#fff',
            borderRadius: 8, padding: '1px 6px',
            fontFamily: F.mono, fontWeight: 700, flexShrink: 0,
          }}>
            {activeCount}
          </span>
        )}

        {/* 折り畳み時：アクティブフィルターのサマリーチップ */}
        {collapsed && activeCount > 0 && (
          <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'hidden', alignItems: 'center' }}>
            {activePeriod !== 'all' && (
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 10,
                background: `${primary}18`, color: 'var(--brand-fg)',
                fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {activePeriodLabel}
              </span>
            )}
            {activeBranchDef && (
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 10,
                background: activeBranchDef.color, color: '#fff',
                fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {activeBranchDef.label}
              </span>
            )}
            {activeCategory !== 'all' && (
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 10,
                background: primary, color: '#fff',
                fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
                maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {activeCategoryLabel}
              </span>
            )}
            {activeTag !== 'all' && (
              <span style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 10,
                background: `${primary}18`, color: 'var(--brand-fg)',
                fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
                maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {activeTagLabel}
              </span>
            )}
          </div>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <ChevUpDown up={!collapsed} />
        </span>
      </button>

      {/* ── 展開時のチップ行 ── */}
      {!collapsed && (
        <div style={{ paddingBottom: 8 }}>

          {/* 期間チップ行 */}
          <div className="jsdf-hscroll" style={{ ...scrollRow, padding: '2px 16px 0' }} onWheel={onWheel}>
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
                    color: isOn ? 'var(--brand-fg)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: isOn ? 700 : 400,
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                    background: isOn ? `${primary}28` : 'var(--tag-bg)',
                    color: isOn ? 'var(--brand-fg)' : 'var(--text-muted)',
                    borderRadius: 8, padding: '0 5px', lineHeight: '16px',
                  }}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 種別チップ行（陸・海・空）— もう一度押すと解除 */}
          <div className="jsdf-hscroll" style={{ ...scrollRow, padding: '6px 16px 0' }} onWheel={onWheel}>
            {BRANCH_DEFS.map(({ id, label, short, color }) => {
              const isOn = activeBranch === id;
              const cnt  = branchCounts[id];
              return (
                <button
                  key={id}
                  onClick={() => onBranchChange(isOn ? 'all' : id)}
                  aria-pressed={isOn}
                  style={{
                    flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20,
                    border: `1.5px solid ${isOn ? color : cnt > 0 ? `${color}88` : 'var(--border)'}`,
                    background: isOn ? color : 'var(--bg)',
                    color: isOn ? '#fff' : cnt > 0 ? color : 'var(--text-muted)',
                    fontSize: 12, fontWeight: isOn ? 700 : 400,
                    opacity: cnt === 0 ? 0.4 : 1,
                  }}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700, lineHeight: '15px',
                    width: 15, height: 15, borderRadius: 4, textAlign: 'center',
                    background: isOn ? 'rgba(255,255,255,0.25)' : `${color}1f`,
                    color: isOn ? '#fff' : color,
                  }}>
                    {short}
                  </span>
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

          {/* カテゴリチップ行 */}
          <div className="jsdf-hscroll" style={{ ...scrollRow, padding: '6px 16px 0' }} onWheel={onWheel}>
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

          {/* タグ行（固定リスト・件数バッジ付き） */}
          <div className="jsdf-hscroll" style={{ ...scrollRow, padding: '6px 16px 0' }} onWheel={onWheel}>

            {/* 申請済みチップ（先頭・緑系） */}
            {(() => {
              const isOn = activeTag === APPLIED_TAG_ID;
              return (
                <button
                  onClick={() => onTagChange(isOn ? 'all' : APPLIED_TAG_ID)}
                  style={{
                    flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20,
                    border: `1.5px solid ${isOn ? '#16a34a' : appliedCount > 0 ? '#16a34a88' : 'var(--border)'}`,
                    background: isOn ? '#16a34a' : appliedCount > 0 ? '#16a34a0d' : 'var(--bg)',
                    color: isOn ? '#fff' : appliedCount > 0 ? '#16a34a' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: isOn ? 600 : 400,
                    opacity: appliedCount === 0 ? 0.4 : 1,
                  }}
                >
                  ✓ 申請済み
                  <span style={{
                    fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                    background: isOn ? 'rgba(255,255,255,0.25)' : '#16a34a22',
                    color: isOn ? '#fff' : '#16a34a',
                    borderRadius: 8, padding: '0 5px', lineHeight: '16px',
                  }}>
                    {appliedCount}
                  </span>
                </button>
              );
            })()}

            {/* 終了済みチップ（通常は非表示・選択時のみ終了済みを表示） */}
            {(() => {
              const isOn = activeTag === ENDED_TAG_ID;
              return (
                <button
                  onClick={() => onTagChange(isOn ? 'all' : ENDED_TAG_ID)}
                  style={{
                    flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: F.sans, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20,
                    border: `1.5px solid ${isOn ? '#6b7280' : endedCount > 0 ? '#6b728088' : 'var(--border)'}`,
                    background: isOn ? '#6b7280' : 'var(--bg)',
                    color: isOn ? '#fff' : endedCount > 0 ? '#6b7280' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: isOn ? 600 : 400,
                    opacity: endedCount === 0 ? 0.4 : 1,
                  }}
                >
                  終了済み
                  <span style={{
                    fontSize: 10, fontFamily: F.mono, fontWeight: 600,
                    background: isOn ? 'rgba(255,255,255,0.25)' : '#6b728022',
                    color: isOn ? '#fff' : '#6b7280',
                    borderRadius: 8, padding: '0 5px', lineHeight: '16px',
                  }}>
                    {endedCount}
                  </span>
                </button>
              );
            })()}

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
                    border: `1.5px solid ${isOn ? primary : 'var(--border)'}`,
                    background: isOn ? primary : 'var(--bg)',
                    color: isOn ? '#fff' : 'var(--text-muted)',
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
      )}
    </div>
  );
}
