import { useMemo } from 'react';
import { F, Emblem } from './Shared';
import { ICO } from './Icons';
import { PREFECTURE_INFO } from '../data/regionMap';

/**
 * NotFoundScreen — 404（お探しのページが見つかりません）
 *
 * 表示理由を出し分ける:
 *   'event' … /event/:id を開いたがそのイベントが見つからない
 *             （掲載期間の終了・削除・共有リンクの期限切れ）
 *   'path'  … アプリに存在しないURL
 *
 * 行き止まりにしないため、直近のイベントを数件提示して導線を作る。
 * 静的パス（/events/<県>.html 等）で 404 を返すのは public/404.html。
 */

const MAX_SUGGESTIONS = 4;

/** JST 今日の日付 "YYYY-MM-DD" */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 全地本を横断して、開催が近い順に数件返す */
function pickUpcoming(events, limit = MAX_SUGGESTIONS) {
  if (!events || typeof events !== 'object') return [];
  const today = jstToday();
  const flat = [];
  for (const list of Object.values(events)) {
    if (!Array.isArray(list)) continue;
    for (const ev of list) {
      if (!ev || !ev.date || ev.ended) continue;
      if ((ev.endDate || ev.date) < today) continue;
      flat.push(ev);
    }
  }
  flat.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return flat.slice(0, limit);
}

/** "2026-09-01" → "9/1" */
function shortDate(d) {
  const m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : '';
}

export default function NotFoundScreen({
  reason = 'path',
  events,
  theme,
  onOpenHome,
  onOpenList,
  onOpenDetail,
}) {
  const primary = theme?.primary || '#0b2545';
  const isEvent = reason === 'event';
  const suggestions = useMemo(() => pickUpcoming(events), [events]);

  const btnPrimary = {
    padding: '12px 24px', borderRadius: 10, border: 'none',
    fontSize: 13.5, fontWeight: 700, color: '#fff', background: primary,
    cursor: 'pointer', fontFamily: F.sans,
  };
  const btnGhost = {
    padding: '12px 24px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    fontSize: 13.5, fontWeight: 600, color: 'var(--text)',
    cursor: 'pointer', fontFamily: F.sans,
  };

  return (
    <div style={{
      flex: 1, overflowY: 'auto', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 20px 40px', fontFamily: F.sans,
    }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>

        {/* 404 の記号 */}
        <div style={{
          fontFamily: F.mono, fontSize: 46, fontWeight: 500,
          letterSpacing: 6, color: `${primary}`, opacity: 0.28,
          lineHeight: 1, marginBottom: 4,
        }}>
          404
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          {ICO.search('var(--icon-muted, #9ca3af)', 32)}
        </div>

        <h1 style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>
          {isEvent ? 'このイベントは見つかりませんでした' : 'ページが見つかりません'}
        </h1>

        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.9, marginBottom: 26 }}>
          {isEvent ? (
            <>
              掲載期間が終了したか、内容が変更された可能性があります。<br />
              共有リンクは、イベント終了から約1週間で表示できなくなります。
            </>
          ) : (
            <>
              お探しのページは、移動または削除された可能性があります。<br />
              URLに誤りがないかご確認ください。
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 34 }}>
          <button onClick={onOpenHome} style={btnPrimary}>ホームへ戻る</button>
          <button onClick={onOpenList} style={btnGhost}>イベント一覧を見る</button>
        </div>

        {/* 行き止まりにしない: 直近のイベントを提示 */}
        {suggestions.length > 0 && (
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              letterSpacing: 1, marginBottom: 10, textAlign: 'center',
            }}>
              開催が近いイベント
            </div>
            <div style={{
              border: '1px solid var(--border)', borderRadius: 12,
              overflow: 'hidden', background: 'var(--card)',
            }}>
              {suggestions.map((ev, i) => {
                const info = PREFECTURE_INFO[ev.pref];
                return (
                  <button
                    key={ev.id || i}
                    onClick={() => onOpenDetail && onOpenDetail(ev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                      padding: '12px 14px', background: 'transparent',
                      border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: F.sans,
                    }}
                  >
                    {info?.emblem && <Emblem ch={info.emblem} size={26} primary={primary} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        {shortDate(ev.date)}{ev.weekday ? `（${ev.weekday}）` : ''}
                        {info?.label ? ` ・ ${info.label}` : ''}
                      </div>
                    </div>
                    {ICO.chev('var(--icon-muted, #9aa2b1)', 13)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
