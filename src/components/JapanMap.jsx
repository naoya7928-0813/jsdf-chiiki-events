import { useState } from 'react';
import { F } from './Shared';
import { PREFECTURE_SHAPES, REGION_LABEL_POSITIONS } from '../data/prefectureShapes';

// ─── 色計算 ───────────────────────────────────────────────────
function regionFill(regionId, selectedId, hasEvents, primary, hoveredId) {
  if (selectedId === regionId) return primary;
  if (hoveredId  === regionId) return hasEvents ? primary + 'aa' : 'var(--map-hover)';
  if (hasEvents)               return primary + '66';
  return 'var(--map-gray, #d1d5db)';
}

// ─── JapanMap ─────────────────────────────────────────────────
export default function JapanMap({ eventCounts, selectedRegionId, onSelect, primary }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <svg
      viewBox="0 0 1000 1000"
      width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label="日本地図 地域選択"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* ─ 都道府県シェイプ ─ */}
      <g transform="matrix(1.453488,0,0,1.453488,-435.334259,-216.944946)">
        <g transform="matrix(1,0,0,1,6,18)">
          {PREFECTURE_SHAPES.map(({ code, regionId, t, s }) => {
            const count    = eventCounts[regionId] ?? 0;
            const selected = regionId === selectedRegionId;
            const fill     = regionFill(regionId, selectedRegionId, count > 0, primary, hoveredId);
            const sw       = selected ? 1.4 : 0.7;

            return (
              <g
                key={code}
                transform={t}
                onClick={() => { onSelect(regionId); setHoveredId(null); }}
                onMouseEnter={() => setHoveredId(regionId)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: 'pointer' }}
                role="img"
                aria-label={regionId}
              >
                {s.map((shape, i) =>
                  shape.p != null
                    ? <path    key={i} d={shape.p}      fill={fill} stroke="var(--bg)" strokeWidth={sw} strokeLinejoin="round" style={{ transition: 'fill 0.15s' }} />
                    : <polygon key={i} points={shape.g} fill={fill} stroke="var(--bg)" strokeWidth={sw} strokeLinejoin="round" style={{ transition: 'fill 0.15s' }} />
                )}
              </g>
            );
          })}
        </g>
      </g>

      {/* ─ 地域ラベル（1000×1000 viewBox 座標） ─ */}
      {Object.entries(REGION_LABEL_POSITIONS).map(([regionId, { x, y, label }]) => {
        const count    = eventCounts[regionId] ?? 0;
        const selected = regionId === selectedRegionId;
        const hovered  = regionId === hoveredId;
        const active   = selected || hovered;
        const lColor   = selected ? '#fff' : 'var(--text)';
        const bRadius  = 28;   // ラベルからバッジ中心までのオフセット

        return (
          <g
            key={regionId}
            onClick={() => { onSelect(regionId); setHoveredId(null); }}
            onMouseEnter={() => setHoveredId(regionId)}
            onMouseLeave={() => setHoveredId(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* 地域名 */}
            <text
              x={x} y={y}
              textAnchor="middle"
              fontSize={label.length >= 3 ? 24 : label.length === 2 ? 28 : 32}
              fontWeight={active ? 700 : 600}
              fontFamily={F.sans}
              fill={lColor}
              style={{ pointerEvents: 'none', userSelect: 'none', transition: 'fill 0.15s' }}
            >
              {label}
            </text>

            {/* 件数バッジ（視認性向上：r 14→22, fontSize 13→20） */}
            {count > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                {/* 影 付与用の外側リング */}
                <circle
                  cx={x} cy={y + bRadius}
                  r={24}
                  fill="none"
                  stroke="rgba(0,0,0,0.18)"
                  strokeWidth={3}
                />
                <circle
                  cx={x} cy={y + bRadius}
                  r={22}
                  fill={selected ? '#fff' : primary}
                />
                <text
                  x={x} y={y + bRadius}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={count > 99 ? 16 : 20}
                  fontWeight={700}
                  fontFamily={F.mono}
                  fill={selected ? primary : '#fff'}
                  style={{ userSelect: 'none' }}
                >
                  {count}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
