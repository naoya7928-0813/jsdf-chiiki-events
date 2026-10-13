// イベント詳細の画像枠。表示の可否は shared/eventImages.cjs の decideImageDisplay が決める。
// 現在は全体スイッチ（EVENT_IMAGES_ENABLED）が false のため「（現在準備中）」だけを表示する。
import { SectionTitle } from './Shared';
import { decideImageDisplay } from '../../shared/eventImages.cjs';

export default function EventImages({ ev, enabled }) {
  const d = decideImageDisplay(ev, enabled === undefined ? undefined : { enabled });
  if (d.state === 'hidden') return null;
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>画像</SectionTitle>
      {d.state === 'preparing' ? (
        <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: '14px 16px', fontSize: 13.5, color: 'var(--text-muted)' }}>
          （現在準備中）
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {d.images.map((im) => (
            <figure key={im.url} style={{ margin: 0, background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <img src={im.url} alt={im.alt || ''} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                style={{ display: 'block', width: '100%', height: 'auto', background: 'var(--tag-bg)' }} />
              <figcaption style={{ padding: '8px 12px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                出典：{im.credit}{im.edited ? '（加工して作成）' : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
