import { ICO } from './Icons';
import { Emblem, F, splitDate, SectionTitle, iconBtnStyle } from './Shared';
import { REGION_HQ, REGION_SOURCE } from '../config';

export default function DetailScreen({ event, onBack, theme, favorites, onToggleFavorite }) {
  const ev = event;
  if (!ev) return null;

  const starred  = favorites.has(ev.id);
  const { m, d } = splitDate(ev.date);
  const { primary, accent } = theme;

  // 地域判定: id プレフィックスで判別（k-=神奈川、s-=埼玉、t-=東京）
  const regionKey = ev.id.startsWith('k-') ? 'kanagawa'
                  : ev.id.startsWith('s-') ? 'saitama'
                  : 'tokyo';
  const hq        = REGION_HQ[regionKey];
  const source    = REGION_SOURCE[regionKey];

  // 地図クエリ: place + address があれば address 優先、なければ place
  const mapQuery = encodeURIComponent(ev.address ? `${ev.place} ${ev.address}` : ev.place);
  const mapSrc   = `https://maps.google.com/maps?q=${mapQuery}&output=embed&hl=ja&z=15`;

  const openUrl = () => {
    if (ev.url) window.open(ev.url, '_blank', 'noopener');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヒーローヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        background: primary, color: '#fff',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
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
          }}>{ev.category}{ev.tag ? ` · ${ev.tag}` : ''}</div>

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
              {ev.weekday && <div style={{ fontSize: 9, marginTop: 2 }}>({ev.weekday})</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.65, fontFamily: F.mono, letterSpacing: 1 }}>TIME</div>
              <div style={{ fontSize: 15, fontFamily: F.mono, fontWeight: 500, marginTop: 2 }}>
                {ev.time || '時間未定'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* スクロール本文 */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0' }}>
        {/* 開催場所 + 地図 */}
        <div style={{ padding: '6px 16px 14px' }}>
          <SectionTitle>開催場所</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: ev.address ? 4 : 12 }}>
              {ev.place}
            </div>
            {ev.address && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{ev.address}</div>
            )}
            {/* インライン地図 */}
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', height: 200 }}>
              <iframe
                src={mapSrc}
                width="100%"
                height="200"
                style={{ border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`${ev.place}の地図`}
              />
            </div>
          </div>
        </div>

        {/* 参加資格・締切 */}
        {(ev.ageRequirement || ev.deadline) && (
          <div style={{ padding: '6px 16px 14px' }}>
            <SectionTitle>参加資格・締切</SectionTitle>
            <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {ev.ageRequirement && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                  borderBottom: ev.deadline ? '1px solid var(--sep)' : 'none',
                }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: primary, fontWeight: 700, paddingTop: 2, minWidth: 52 }}>年齢</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{ev.ageRequirement}</div>
                </div>
              )}
              {ev.deadline && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: primary, fontWeight: 700, paddingTop: 2, minWidth: 52 }}>締切</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{ev.deadline}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 参加時の注意事項 */}
        {ev.notes && (
          <div style={{ padding: '6px 16px 14px' }}>
            <SectionTitle>イベント内容</SectionTitle>
            <div style={{
              background: 'var(--card)', borderRadius: 12,
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `${primary}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {ICO.check(primary, 12)}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, flex: 1, whiteSpace: 'pre-line' }}>
                  {ev.notes}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 主催・お問い合わせ */}
        <div style={{ padding: '6px 16px 20px' }}>
          <SectionTitle>主催・お問い合わせ</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            {/* 担当事務所（place が地本名でなければ表示） */}
            {ev.place && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `${primary}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {ICO.pin(primary, 16)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{ev.place}</div>
              </div>
            )}
            {/* 地本本部（電話番号フォールバック） */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: ev.place ? 12 : 0,
              borderTop: ev.place ? '1px solid var(--sep)' : 'none',
            }}>
              <Emblem ch={hq.emblem} size={38} primary={primary} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{hq.name}</div>
                <a href={`tel:${hq.tel.replace(/-/g, '')}`} style={{
                  fontSize: 12, color: primary, marginTop: 2, display: 'block',
                  fontFamily: F.mono, textDecoration: 'none',
                }}>
                  {hq.tel}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 出典注釈 */}
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            padding: '12px 14px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: 'var(--text-muted)', marginBottom: 6,
            }}>
              データ出典
            </div>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: primary,
                textDecoration: 'none', display: 'block', lineHeight: 1.6,
              }}
            >
              {source.name}
            </a>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)',
              lineHeight: 1.7, marginTop: 6,
              paddingTop: 6, borderTop: '1px solid var(--sep)',
            }}>
              本アプリは上記サイトの情報を加工して作成した非公式アプリです。最新情報・詳細は出典元をご確認ください。
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
        <button onClick={openUrl} disabled={!ev.url} style={{
          flex: 1, minHeight: 48, border: 'none',
          background: ev.url ? primary : 'var(--tag-bg)',
          color: ev.url ? '#fff' : 'var(--text-muted)',
          borderRadius: 8, cursor: ev.url ? 'pointer' : 'default',
          fontWeight: 600, fontFamily: F.sans, fontSize: 14, letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span>{ev.url ? '公式ページを開く' : '公式ページなし'}</span>
          {ev.url && ICO.extLink('#fff', 14)}
        </button>
      </div>
    </div>
  );
}
