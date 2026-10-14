// イベント詳細: 会場の広さくらべ（駐屯地・基地の広さを東京ドーム・ディズニーと、滑走路の長さを東京タワー等と比べる）。
// 面積・長さと照合は shared/facilityArea.cjs。図は実際の形ではなく、同じ縮尺の図形で大きさだけを比べる。
import { useMemo, useState } from 'react';
import { SectionTitle } from './Shared';
import FA from '../../shared/facilityArea.cjs';

const {
  REFERENCES, FACILITY_AREAS, AREA_METHOD, RUNWAYS, BRANCH_LABEL,
  findFacility, compareArea, ratioText, haText, compareLength, lengthRatioText, mText,
} = FA;
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

/**
 * 滑走路の長さを、比較対象を横に並べた帯で見せる図。
 * 並ぶ数が多いとき（車など）は、何台かをまとめて1マスにする（1マス＝○台）。
 */
function RunwayFigure({ runwayM, refItem }) {
  const W = 300, H = 74, X0 = 6, LEN = W - 12;
  const count = runwayM / refItem.m;
  const per = count > 40 ? Math.ceil(count / 40 / 5) * 5 : 1; // 1マスにまとめる数（5の倍数）
  const tileLen = (LEN * refItem.m * per) / runwayM;
  const tiles = Math.ceil(count / per);
  const shorter = count < 1; // 比較対象の方が長い（滑走路が東京スカイツリーより短い 等）
  const runLen = shorter ? LEN * count : LEN;
  const refLen = shorter ? LEN : tileLen;
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block', maxWidth: 420, margin: '0 auto' }}
        aria-label={`滑走路（${mText(runwayM)}）と${refItem.label}（${refItem.m}m）を同じ縮尺で並べた図`}>
        {/* 滑走路（中心線つき） */}
        <rect x={X0} y={8} width={runLen} height={22} rx={2} fill="var(--text-muted)" fillOpacity={0.55} />
        <line x1={X0 + 4} y1={19} x2={X0 + runLen - 4} y2={19} stroke="#fff" strokeWidth={1.2} strokeDasharray="6 5" />
        {/* 比較対象（同じ縮尺で並べる） */}
        {shorter ? (
          <rect x={X0} y={40} width={refLen} height={16} rx={2} fill={REF_COLOR} fillOpacity={0.75} />
        ) : Array.from({ length: tiles }, (_, k) => {
          const x = X0 + k * tileLen;
          const w = Math.min(tileLen, X0 + LEN - x);
          return <rect key={k} x={x + 0.5} y={40} width={Math.max(0.6, w - 1)} height={16} rx={tileLen > 6 ? 1.5 : 0}
            fill={REF_COLOR} fillOpacity={k % 2 ? 0.45 : 0.8} />;
        })}
      </svg>
      <figcaption style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
        <span><span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 8, marginRight: 4, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.6 }} />滑走路（{mText(runwayM)}）</span>
        <span><span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 8, marginRight: 4, borderRadius: 2, background: REF_COLOR }} />
          {refItem.label}（{refItem.m}m）{!shorter && (per > 1 ? `＝1マス${per}${refItem.unit}` : '＝1マス')}</span>
      </figcaption>
    </figure>
  );
}

/** 全国の基地・駐屯地を大きい順に（棒は平方根で伸ばす＝小さい施設も見えるように） */
function RankingList({ rows, current, currentLabel, value, text }) {
  const max = value(rows[0]) || 1;
  return (
    <div style={{ marginTop: 10, maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
      {rows.map((f, i) => {
        const me = f.name === current;
        return (
          <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '7px 10px', borderTop: i ? '1px solid var(--border)' : 'none', background: me ? 'var(--tag-bg)' : 'transparent' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.name}{me ? `（${currentLabel}）` : ''}
              </div>
              <div style={{ height: 6, borderRadius: 3, marginTop: 3, background: me ? 'var(--brand-fg)' : 'var(--border)', width: `${Math.max(2, 100 * Math.sqrt(value(f) / max))}%` }} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>{text(f)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 比較対象の選択（2列のボタン） */
function RefChooser({ items, selId, onSelect, label, sub }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6, marginBottom: 10 }}>
      {items.map(c => {
        const on = c.id === selId;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => onSelect(c.id)}
            style={{ padding: '8px 6px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1.4,
              border: `1.5px solid ${on ? REF_COLOR : 'var(--border)'}`, background: on ? `${REF_COLOR}22` : 'transparent', color: 'var(--text)' }}>
            {c.label}<br /><span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{sub(c)}</span>
          </button>
        );
      })}
    </div>
  );
}

const toggleBtn = { width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--brand-fg)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const noteStyle = { fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 };
const card = { background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 };

function AreaSection({ facility, currentLabel }) {
  const area = facility.area;
  const [refId, setRefId] = useState('dome');
  const [showRanking, setShowRanking] = useState(false);
  const comps = compareArea(area.ha);
  const sel = comps.find(c => c.id === refId) || comps[0];
  const sub = (c) => (c.ratio >= 1 ? ratioText(c.ratio) : `の${ratioText(c.ratio)}`);
  const dome = REFERENCES.find(r => r.id === 'dome');
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>会場の広さくらべ</SectionTitle>
      <div style={card}>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10, lineHeight: 1.6 }}>
          <strong>{facility.name}</strong>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>（{BRANCH_LABEL[facility.branch]}）</span>
          の広さは <strong>{haText(area.ha)}</strong>。
          {area.note && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>※{area.note}</span>}
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--brand-fg)', marginTop: 2 }}>
            {sel.label}{sel.ratio >= 1 ? ' ' : ''}{sub(sel)}
          </span>
        </div>
        <RefChooser items={comps} selId={sel.id} onSelect={setRefId} label="広さを比べる対象" sub={sub} />
        <SquaresFigure facility={{ name: facility.name, ha: area.ha }} refItem={sel} />
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 4px' }}>
          <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 4, borderRadius: 2, border: '2px solid var(--brand-fg)', verticalAlign: -1 }} />{facility.name}（{haText(area.ha)}）</span>
          <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, marginRight: 4, borderRadius: 2, background: REF_COLOR, verticalAlign: -1 }} />{sel.label}（{haText(sel.ha)}）{sel.ratio >= 1 ? '＝1マス' : ''}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10 }}>同じ縮尺の正方形で広さだけを比べた図（形は実際と異なります）</div>

        <button type="button" onClick={() => setShowRanking(v => !v)} aria-expanded={showRanking} style={toggleBtn}>
          {showRanking ? '全国の基地・駐屯地の広さを閉じる' : '全国の基地・駐屯地の広さとくらべる'}
        </button>
        {showRanking && (
          <RankingList rows={[...FACILITY_AREAS].sort((a, b) => b.ha - a.ha)} current={facility.name} currentLabel={currentLabel}
            value={(f) => f.ha} text={(f) => <>{haText(f.ha)}<br />ドーム{ratioText(f.ha / dome.ha)}</>} />
        )}

        <div style={noteStyle}>
          ※面積の求め方：{facility.name}は{AREA_METHOD[area.src]}{area.from ? `（${area.from}）` : ''}。
          {showRanking ? `一覧はほかに${[...new Set(FACILITY_AREAS.map(f => f.src))].filter(k => k !== area.src).map(k => AREA_METHOD[k]).join('、')}を含みます。` : ''}
          いずれも測量した値ではなく、敷地の数え方（演習場・飛行場を含めるか等）でも変わるため、<strong>正確でない可能性があります</strong>。目安としてご覧ください。
          比較対象：{REFERENCES.map(r => `${r.label}＝${r.note}`).join('、')}。
        </div>
      </div>
    </div>
  );
}

function RunwaySection({ facility, currentLabel }) {
  const rw = facility.runway;
  const [refId, setRefId] = useState('tower');
  const [showRanking, setShowRanking] = useState(false);
  const comps = compareLength(rw.m);
  const sel = comps.find(c => c.id === refId) || comps[0];
  const sub = (c) => lengthRatioText(c.ratio, c.unit);
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>滑走路の長さくらべ</SectionTitle>
      <div style={card}>
        <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10, lineHeight: 1.6 }}>
          <strong>{facility.name}</strong>の滑走路は <strong>{mText(rw.m)}</strong>。
          {rw.note && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>※{rw.note}</span>}
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--brand-fg)', marginTop: 2 }}>
            {sel.label}を横に並べて {sub(sel)}
          </span>
        </div>
        <RefChooser items={comps} selId={sel.id} onSelect={setRefId} label="長さを比べる対象" sub={sub} />
        <RunwayFigure runwayM={rw.m} refItem={sel} />
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', margin: '4px 0 10px' }}>同じ縮尺で長さだけを比べた図（東京タワー・スカイツリーは高さを横にした長さ）</div>

        <button type="button" onClick={() => setShowRanking(v => !v)} aria-expanded={showRanking} style={toggleBtn}>
          {showRanking ? '全国の滑走路の長さを閉じる' : '全国の基地・駐屯地の滑走路とくらべる'}
        </button>
        {showRanking && (
          <RankingList rows={[...RUNWAYS].sort((a, b) => b.m - a.m)} current={facility.name} currentLabel={currentLabel}
            value={(f) => f.m} text={(f) => <>{mText(f.m)}<br />タワー{lengthRatioText(f.m / 333, '本')}</>} />
        )}

        <div style={noteStyle}>
          ※長さの求め方：いちばん長い滑走路の長さを、Wikipedia の各基地の記事（航空路誌などの公表値）から引用しています。
          延長部分（オーバーラン）は含まず、改修などで変わることがあるため、<strong>正確でない可能性があります</strong>。目安としてご覧ください。
          比較対象：{comps.map(r => `${r.label}＝${r.note}`).join('、')}。
        </div>
      </div>
    </div>
  );
}

export default function SizeCompare({ ev, currentLabel = 'この会場' }) {
  const facility = useMemo(() => findFacility(ev), [ev]);
  if (!facility) return null;
  return (
    <>
      {facility.area && <AreaSection facility={facility} currentLabel={currentLabel} />}
      {facility.runway && <RunwaySection facility={facility} currentLabel={currentLabel} />}
    </>
  );
}
