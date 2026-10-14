// ホーム画面の「大きさくらべ」: 基地・駐屯地を選んで、広さ（東京ドーム・ディズニー）と
// 滑走路の長さ（東京タワー・スカイツリー等）を比べるボトムシート。中身はイベント詳細と同じ SizeCompare。
import { useEffect, useMemo, useState } from 'react';
import { ICO } from './Icons';
import { F } from './Shared';
import SizeCompare from './SizeCompare';
import FA from '../../shared/facilityArea.cjs';

const { KNOWN_FACILITIES, BRANCH_LABEL } = FA;
const BRANCH_ORDER = ['army', 'navy', 'air'];
const DEFAULT_NAME = '入間基地';

export default function SizeCompareModal({ isOpen, onClose }) {
  const [name, setName] = useState(DEFAULT_NAME);

  // 種別ごとに五十音順（読みが無いので名前順）で並べる
  const groups = useMemo(() => BRANCH_ORDER.map(b => ({
    branch: b,
    items: KNOWN_FACILITIES.filter(f => f.branch === b).sort((a, c) => a.name.localeCompare(c.name, 'ja')),
  })).filter(g => g.items.length), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const facilityEv = { place: name };
  return (
    <>
      <style>{'@keyframes sizecmp-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}'}</style>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(3px)', zIndex: 200 }} />
      <div role="dialog" aria-modal="true" aria-label="基地・駐屯地の大きさくらべ"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 201, maxWidth: 640, margin: '0 auto',
          background: 'var(--bg)', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 40px rgba(0,0,0,0.28)',
          display: 'flex', flexDirection: 'column', maxHeight: '88vh', fontFamily: F.sans,
          animation: 'sizecmp-slide-up 0.28s ease-out',
        }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 16px 10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>大きさくらべ</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>基地・駐屯地の広さと滑走路の長さを、身近なものと比べます</div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {ICO.close('var(--text-muted)', 14)}
          </button>
        </div>
        <div style={{ padding: '0 16px 8px' }}>
          <label htmlFor="sizecmp-select" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>基地・駐屯地を選ぶ</label>
          <select id="sizecmp-select" value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', fontSize: 15, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
            {groups.map(g => (
              <optgroup key={g.branch} label={BRANCH_LABEL[g.branch]}>
                {g.items.map(f => (
                  <option key={f.name} value={f.name}>{f.name}{f.area ? '' : '（滑走路のみ）'}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 12px)' }}>
          {/* key で選び直すたびに比較対象の選択を初期状態に戻す */}
          <SizeCompare key={name} ev={facilityEv} currentLabel="選択中" />
        </div>
      </div>
    </>
  );
}
