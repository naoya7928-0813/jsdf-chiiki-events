// ホーム画面の「大きさくらべ」: 基地・駐屯地を選んで、広さ（東京ドーム・ディズニー）と
// 滑走路の長さ（東京タワー・スカイツリー等）を比べるボトムシート。中身はイベント詳細と同じ SizeCompare。
import { useEffect, useMemo, useState } from 'react';
import { ICO } from './Icons';
import { F } from './Shared';
import SizeCompare from './SizeCompare';
import FA from '../../shared/facilityArea.cjs';
import { PREFECTURE_INFO } from '../data/regionMap';

const { KNOWN_FACILITIES } = FA;
const DEFAULT_NAME = '入間基地';
const SHORT_BRANCH = { army: '陸自', navy: '海自', air: '空自' };
// 北海道は地本が4つに分かれているため「北海道（札幌）」のように書く
const prefLabel = (key) => {
  const p = PREFECTURE_INFO[key];
  if (!p) return key;
  return p.region === 'hokkaido' ? `北海道（${p.label}）` : p.label;
};
const PREF_ORDER = Object.keys(PREFECTURE_INFO); // 北から南の順

export default function SizeCompareModal({ isOpen, onClose }) {
  const [name, setName] = useState(DEFAULT_NAME);
  const [query, setQuery] = useState('');

  // 都道府県ごと（北から南）にまとめる。名前で絞り込める
  const groups = useMemo(() => {
    const q = query.trim().replace(/\s+/g, '');
    return PREF_ORDER.map(key => ({
      key,
      label: prefLabel(key),
      items: KNOWN_FACILITIES.filter(f => f.pref === key && (!q || f.name.includes(q) || prefLabel(key).includes(q)))
        .sort((a, c) => a.name.localeCompare(c.name, 'ja')),
    })).filter(g => g.items.length);
  }, [query]);
  const hits = groups.reduce((n, g) => n + g.items.length, 0);

  // 絞り込みで選択中の施設が一覧から外れたら、残った先頭を選ぶ
  useEffect(() => {
    if (!hits) return;
    if (!groups.some(g => g.items.some(f => f.name === name))) setName(groups[0].items[0].name);
  }, [groups, hits, name]);

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
          <label htmlFor="sizecmp-select" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>基地・駐屯地を選ぶ（都道府県ごと）</label>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前・都道府県で絞り込み（例: 練馬、武山、神奈川）"
            aria-label="基地・駐屯地を名前・都道府県で絞り込み"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', marginBottom: 6 }} />
          {hits ? (
            <select id="sizecmp-select" value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', fontSize: 15, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
              {groups.map(g => (
                <optgroup key={g.key} label={g.label}>
                  {g.items.map(f => (
                    <option key={f.name} value={f.name}>{f.name}（{SHORT_BRANCH[f.branch]}）{f.area ? '' : '・滑走路のみ'}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 2px' }}>該当する基地・駐屯地がありません（広さ・滑走路が分かる施設だけを載せています）。</div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 12px)' }}>
          {/* key で選び直すたびに比較対象の選択を初期状態に戻す */}
          {hits > 0 && <SizeCompare key={name} ev={facilityEv} currentLabel="選択中" />}
        </div>
      </div>
    </>
  );
}
