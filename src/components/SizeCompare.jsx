// イベント詳細: 会場の広さくらべ（駐屯地・基地の広さを東京ドーム・ディズニーと比べる）。
// 面積と照合は shared/facilityArea.cjs。図は実際の敷地の形ではなく、同じ縮尺の正方形で広さだけを比べる。
import { useMemo, useState } from 'react';
import { SectionTitle } from './Shared';
import FA from '../../shared/facilityArea.cjs';

const { REFERENCES, FACILITY_AREAS, BRANCH_LABEL, findFacilityArea, compareArea, ratioText, haText } = FA;
const REF_COLOR = '#e8a317';

/**
 * 同じ縮尺の正方形で比べる図。
 * 会場の方が広いときは、会場の正方形に比較対象の大きさのマス目を敷き詰める（「64個分」を目で数えられる）。
 * 比較対象の方が広いときは、比較対象の正方形の左下に会場を重ねる。
 */
function SquaresFigure({ facility, refItem }) {
  const W = 240, PAD = 6, MAX = W - PAD * 2;
  const big = Math.max(facility.ha, refItem.ha);
  const side = (ha) => Math.max(2, MAX * Math.sqrt(ha / big));
  const sF = side(facility.ha), sR = side(refItem.ha);
  const H = MAX + PAD * 2;
  const x0 = PAD, bottom = PAD + MAX;
  const fill = 'var(--brand-fg)';
  const label = `${facility.name}（${haText(facility.ha)}）と${refItem.label}（${haText(refItem.ha)}）を同じ縮尺の正方形で比べた図`;
  if (facility.ha >= refItem.ha) {
    const n = Math.ceil(sF / sR); // 1辺に並ぶマス（端は切れる）
    const tiles = [];
    for (let i = 0; i < n && tiles.length < 900; i++) {
      for (let j = 0; j < n && tiles.length < 900; j++) tiles.push([x0 + j * sR, bottom - (i + 1) * sR]);
    }
    const clipId = `sc-clip-${facility.name}`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', maxWidth: 260, margin: '0 auto' }}>
        <defs><clipPath id={clipId}><rect x={x0} y={bottom - sF} width={sF} height={sF} /></clipPath></defs>
        <rect x={x0} y={bottom - sF} width={sF} height={sF} fill={fill} fillOpacity={0.12} />
        <g clipPath={`url(#${clipId})`}>
          {tiles.map(([x, y], k) => (
            <rect key={k} x={x + 0.6} y={y + 0.6} width={Math.max(0.8, sR - 1.2)} height={Math.max(0.8, sR - 1.2)} rx={sR > 8 ? 1.5 : 0}
              fill={REF_COLOR} fillOpacity={k === 0 ? 0.95 : 0.4} />
          ))}
        </g>
        <rect x={x0} y={bottom - sF} width={sF} height={sF} fill="none" stroke={fill} strokeWidth={2} />
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: 'block', maxWidth: 260, margin: '0 auto' }}>
      <rect x={x0} y={bottom - sR} width={sR} height={sR} fill={REF_COLOR} fillOpacity={0.4} stroke={REF_COLOR} strokeWidth={2} />
      <rect x={x0} y={bottom - sF} width={sF} height={sF} fill={fill} fillOpacity={0.35} stroke={fill} strokeWidth={2} />
    </svg>
  );
}

/** 全国の基地・駐屯地を広い順に（棒は面積の平方根で伸ばす＝小さい施設も見えるように） */
function RankingList({ current }) {
  const max = FACILITY_AREAS[0]?.ha || 1;
  const dome = REFERENCES.find(r => r.id === 'dome');
  const rows = [...FACILITY_AREAS].sort((a, b) => b.ha - a.ha);
  return (
    <div style={{ marginTop: 10, maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
      {rows.map((f, i) => {
        const me = f.name === current.name;
        return (
          <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '7px 10px', borderTop: i ? '1px solid var(--border)' : 'none', background: me ? 'var(--tag-bg)' : 'transparent' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name}{me ? '（この会場）' : ''}
              </div>
              <div style={{ height: 6, borderRadius: 3, marginTop: 3, background: me ? 'var(--brand-fg)' : 'var(--border)', width: `${Math.max(2, 100 * Math.sqrt(f.ha / max))}%` }} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {haText(f.ha)}<br />ドーム{ratioText(f.ha / dome.ha)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SizeCompare({ ev }) {
  const facility = useMemo(() => findFacilityArea(ev), [ev]);
  const [refId, setRefId] = useState('dome');
  const [showRanking, setShowRanking] = useState(false);
  if (!facility) return null;
  const comps = compareArea(facility.ha);
  const sel = comps.find(c => c.id === refId) || comps[0];
  const sentence = (c) => (c.ratio >= 1 ? `${c.label} ${ratioText(c.ratio)}` : `${c.label}の${ratioText(c.ratio)}`);
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>会場の広さくらべ</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10, lineHeight: 1.6 }}>
          <strong>{facility.name}</strong>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>（{BRANCH_LABEL[facility.branch]}）</span>
          の広さは <strong>{haText(facility.ha)}</strong>。
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--brand-fg)', marginTop: 2 }}>{sentence(sel)}</span>
        </div>

        <div role="radiogroup" aria-label="比べる対象" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6, marginBottom: 10 }}>
          {comps.map(c => {
            const on = c.id === sel.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setRefId(c.id)}
                style={{ padding: '8px 6px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1.4,
                  border: `1.5px solid ${on ? REF_COLOR : 'var(--border)'}`, background: on ? `${REF_COLOR}22` : 'transparent', color: 'var(--text)' }}>
                {c.label}<br /><span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{c.ratio >= 1 ? ratioText(c.ratio) : `の${ratioText(c.ratio)}`}</span>
              </button>
            );
          })}
        </div>

        <SquaresFigure facility={facility} refItem={sel} />
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 4px' }}>
          <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 4, borderRadius: 2, border: '2px solid var(--brand-fg)', verticalAlign: -1 }} />{facility.name}（{haText(facility.ha)}）</span>
          <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 4, borderRadius: 2, background: REF_COLOR, verticalAlign: -1 }} />{sel.label}（{haText(sel.ha)}）{sel.ratio >= 1 ? '＝1マス' : ''}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10 }}>同じ縮尺の正方形で広さだけを比べた図（形は実際と異なります）</div>

        <button type="button" onClick={() => setShowRanking(v => !v)} aria-expanded={showRanking}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--brand-fg)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {showRanking ? '全国の基地・駐屯地の広さを閉じる' : '全国の基地・駐屯地の広さとくらべる'}
        </button>
        {showRanking && <RankingList current={facility} />}

        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 }}>
          広さはおおよその目安です（敷地の境界や数え方で変わります）。
          {facility.name}の面積は{facility.src === 'wiki' ? ' Wikipedia の記載' : '地図データ（© OpenStreetMap contributors）の敷地の形から計算した値'}
          {showRanking ? '（一覧の各施設も同様）' : ''}、
          比較対象は {REFERENCES.map(r => `${r.label}＝${r.note}`).join('、')}。
        </div>
      </div>
    </div>
  );
}
