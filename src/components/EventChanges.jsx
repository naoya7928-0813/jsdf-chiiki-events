// 変更・中止のお知らせ（利用者向けの表示）。
//   ChangeFlags       … 一覧カードの小さな印（日時変更あり / 会場変更あり / 重要なお知らせ）
//   EventChangeNotice … 詳細画面の上部。中止・延期は目立つ帯、その下に公開済みの変更履歴
// データは運営が「公開」にしたものだけ（/api/manual-events が絞り込み済み。useEvents が形を検証）。
import { F } from './Shared';
import { publicChangeFlags, sanitizePublicChanges } from '../../shared/eventChanges.cjs';

const FLAG_DEFS = [
  ['datetime', '日時変更あり', '#2563eb'],
  ['venue',    '会場変更あり', '#0891b2'],
  ['notice',   '重要なお知らせ', '#b45309'],
];

/** 一覧カード用の印。中止・延期は StatusBadge が出すのでここでは出さない */
export function ChangeFlags({ ev }) {
  const flags = publicChangeFlags(ev);
  const on = FLAG_DEFS.filter(([k]) => flags[k]);
  if (!on.length) return null;
  return on.map(([k, label, color]) => (
    <span key={k} style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
      color, background: `${color}14`, border: `1px solid ${color}55`,
      fontFamily: F.sans, flexShrink: 0, letterSpacing: 0.3,
    }}>{label}</span>
  ));
}

function fmtAt(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

/**
 * 詳細画面の「変更のお知らせ」。
 * 中止・延期のときは、利用者が誤って会場へ向かわないよう本文の先頭に強い色の帯を出す。
 */
export function EventChangeNotice({ ev }) {
  const changes = sanitizePublicChanges(ev && ev.changes);
  const status = ev && ev.status;
  const severe = status === 'cancelled' || status === 'postponed';
  if (!severe && changes.length === 0) return null;

  // 帯に添える理由は、その状態を登録した最新の記録から取る
  const lead = changes.find(c => c.type === status) || null;
  const color = status === 'cancelled' ? '#dc2626' : '#7c3aed';

  return (
    <div style={{ padding: '6px 16px 14px' }}>
      {severe && (
        <div role="alert" style={{
          borderRadius: 12, padding: '14px 16px', marginBottom: changes.length ? 10 : 0,
          background: color, color: '#fff', fontFamily: F.sans,
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>
            {status === 'cancelled' ? 'このイベントは開催中止になりました' : 'このイベントは開催が延期されました'}
          </div>
          {lead && (lead.reason || lead.after) && (
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.7, opacity: 0.95 }}>
              {lead.reason}{lead.reason && lead.after ? ' ' : ''}{lead.after && lead.after !== lead.reason ? lead.after : ''}
            </div>
          )}
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
            最新の情報は公式ページでもご確認ください。
          </div>
        </div>
      )}

      {changes.length > 0 && (
        <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--sep)' }}>
            変更のお知らせ
          </div>
          {changes.map((c, i) => (
            <div key={c.id || i} style={{ padding: '11px 14px', borderTop: i ? '1px solid var(--sep)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-fg)' }}>{c.label}</span>
                {c.at && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: F.mono }}>{fmtAt(c.at)} 更新</span>}
              </div>
              {(c.before || c.after) && (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginTop: 4 }}>
                  {c.before && <><span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{c.before}</span>{c.after ? ' → ' : ''}</>}
                  {c.after && <strong style={{ fontWeight: 700 }}>{c.after}</strong>}
                </div>
              )}
              {c.reason && <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.7, marginTop: 2 }}>理由: {c.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
