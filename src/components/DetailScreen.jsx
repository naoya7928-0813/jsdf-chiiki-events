// useState は不要になったため削除（お気に入り状態は props で受け取る）
import { ICO } from './Icons';
import { Emblem, F, splitDate, SectionTitle, iconBtnStyle } from './Shared';

export default function DetailScreen({ event, onBack, theme, favorites, onToggleFavorite }) {
  const ev = event;
  if (!ev) return null;

  // お気に入り状態は App.jsx の favorites Set から取得する
  const starred = favorites.has(ev.id);

  const { m, d } = splitDate(ev.date);
  const { primary, accent } = theme;

  const openMap = () => {
    const q = encodeURIComponent(`${ev.place} ${ev.address}`);
    window.open(`https://maps.google.com/maps?q=${q}`, '_blank', 'noopener');
  };

  const openUrl = () => {
    if (ev.url) window.open(ev.url, '_blank', 'noopener');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヒーローヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        background: primary, color: '#fff',
        position: 'relative', overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0 12px,transparent 12px 24px)' }} />
        <div style={{ position: 'relative', padding: '6px 16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <button onClick={onBack} aria-label="戻る" style={iconBtnStyle}>
              {ICO.back('#fff', 16)}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onToggleFavorite(ev.id)} aria-label={starred ? 'お気に入り解除' : 'お気に入り登録'} style={{
                ...iconBtnStyle,
                background: starred ? '#fff' : 'rgba(255,255,255,0.1)',
              }}>
                {ICO.star(starred ? accent : '#fff', 16, starred ? accent : 'none')}
              </button>
              <button
                onClick={() => navigator.share?.({ title: ev.title, text: `${ev.date} ${ev.place}`, url: location.href })}
                aria-label="シェア"
                style={iconBtnStyle}
              >
                {ICO.share('#fff', 16)}
              </button>
            </div>
          </div>

          <div style={{
            display: 'inline-block', fontSize: 10, fontFamily: F.mono,
            padding: '3px 8px', borderRadius: 3,
            background: 'rgba(255,255,255,0.15)', letterSpacing: 1.5,
          }}>{ev.category.toUpperCase()} · {ev.tag}</div>

          <div style={{ fontFamily: F.serif, fontSize: 21, fontWeight: 600, marginTop: 12, lineHeight: 1.35 }}>
            {ev.title}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
            paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.15)',
          }}>
            <div style={{
              minWidth: 56, textAlign: 'center', padding: '6px 10px',
              background: 'rgba(255,255,255,0.12)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 9, fontFamily: F.mono, opacity: 0.8 }}>{m}月</div>
              <div style={{ fontFamily: F.serif, fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{d}</div>
              <div style={{ fontSize: 9, marginTop: 2 }}>({ev.weekday})</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.65, fontFamily: F.mono, letterSpacing: 1 }}>TIME</div>
              <div style={{ fontSize: 15, fontFamily: F.mono, fontWeight: 500, marginTop: 2 }}>{ev.time}</div>
            </div>
          </div>
        </div>
      </div>

      {/* スクロール本文 */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0' }}>
        {/* 開催場所 */}
        <div style={{ padding: '6px 16px 14px' }}>
          <SectionTitle>開催場所</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{ev.place}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ev.address}</div>
            {/* 地図プレースホルダー（タップでGoogle Maps起動） */}
            <button onClick={openMap} style={{
              marginTop: 12, width: '100%', height: 110, borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border)', overflow: 'hidden', position: 'relative',
              background: 'var(--tag-bg)',
              padding: 0,
            }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-100%)' }}>
                {ICO.pin(accent, 28)}
              </div>
              <div style={{
                position: 'absolute', bottom: 8, right: 0, left: 0,
                textAlign: 'center', fontSize: 10, color: 'var(--text)',
                fontFamily: F.mono, fontWeight: 500,
              }}>タップして地図アプリで開く</div>
            </button>
          </div>
        </div>

        {/* イベント詳細 */}
        <div style={{ padding: '6px 16px 14px' }}>
          <SectionTitle>イベント詳細</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14, fontSize: 14, color: 'var(--text)', lineHeight: 1.8, letterSpacing: 0.2 }}>
            本イベントは、自衛隊の任務や各職種について直接お話しできる機会です。
            現役自衛官による業務説明、装備品の見学、個別相談コーナーをご用意しております。
            詳しい内容やスケジュールは公式ページをご確認ください。
          </div>
        </div>

        {/* 参加時の注意事項・備考（GASデータの notes フィールドがある場合のみ表示） */}
        {ev.notes && (
          <div style={{ padding: '6px 16px 14px' }}>
            <SectionTitle>参加時の注意事項</SectionTitle>
            <div style={{
              background: 'var(--card)', borderRadius: 12,
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              {/* 注意アイコン + テキスト */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `${primary}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {ICO.check(primary, 12)}
                </div>
                <div style={{
                  fontSize: 14, color: 'var(--text)',
                  lineHeight: 1.75, letterSpacing: 0.2, flex: 1,
                }}>
                  {ev.notes}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 主催 */}
        <div style={{ padding: '6px 16px 20px' }}>
          <SectionTitle>主催・お問い合わせ</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Emblem ch="神" size={38} primary={primary} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  神奈川地方協力本部
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: F.mono }}>
                  045-XXX-XXXX
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 下部 CTA */}
      <div style={{
        padding: '12px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)',
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 10, flexShrink: 0,
      }}>
        <button onClick={openMap} style={{
          minHeight: 48, padding: '0 18px',
          border: `1px solid ${primary}`, background: 'var(--card)', color: primary,
          borderRadius: 8, cursor: 'pointer', fontWeight: 500,
          fontFamily: F.sans, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {ICO.map(primary, 14)} 地図
        </button>
        <button onClick={openUrl} disabled={!ev.url} style={{
          flex: 1, minHeight: 48, border: 'none',
          background: ev.url ? primary : '#9aa2b1',
          color: '#fff', borderRadius: 8, cursor: ev.url ? 'pointer' : 'default',
          fontWeight: 600, fontFamily: F.sans, fontSize: 14, letterSpacing: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span>公式ページを開く</span>
          {ICO.extLink('#fff', 14)}
        </button>
      </div>
    </div>
  );
}
