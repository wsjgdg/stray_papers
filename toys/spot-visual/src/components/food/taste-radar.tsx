'use client';

import { TASTE_KEYS, TASTE_DIMENSIONS } from '@/lib/food-data';

interface Props {
  taste: Record<string, number>;
  size?: number;
  color?: string;
}

const SIZE_DEFAULT = 240;
const RADIUS = 86;

export function TasteRadar({ taste, size = SIZE_DEFAULT, color = '#DC2626' }: Props) {
  const center = size / 2;
  const n = TASTE_KEYS.length;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, r: number) => {
    const a = angleFor(i);
    return [center + r * Math.cos(a), center + r * Math.sin(a)] as const;
  };

  const dataPts = TASTE_KEYS.map((k, i) => {
    const v = Math.max(0, Math.min(100, taste[k] ?? 0)) / 100;
    return point(i, RADIUS * v);
  });
  const dataPoly = dataPts.map((p) => p.join(',')).join(' ');

  const rings = [0.25, 0.5, 0.75, 1];

  /** 悬停提示：维度名 + 当前值 + 该维度 0/100 的锚点含义 */
  const tip = (k: string) => {
    const d = TASTE_DIMENSIONS.find((x) => x.key === k);
    const v = taste[k] ?? 0;
    if (!d) return `${k}：${v}`;
    return `${d.name}：${v} / 100\n0 = ${d.low}\n100 = ${d.high}`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
      {/* grid rings */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={TASTE_KEYS.map((_, i) => point(i, RADIUS * r).join(',')).join(' ')}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={1}
        />
      ))}
      {/* axes */}
      {TASTE_KEYS.map((_, i) => {
        const [x, y] = point(i, RADIUS);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#E2E8F0" strokeWidth={1} />;
      })}
      {/* data polygon */}
      <polygon points={dataPoly} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <g key={i} className="cursor-help">
          <title>{tip(TASTE_KEYS[i])}</title>
          <circle cx={p[0]} cy={p[1]} r={4} fill={color} fillOpacity={0.9} />
        </g>
      ))}
      {/* labels */}
      {TASTE_KEYS.map((k, i) => {
        const [x, y] = point(i, RADIUS + 16);
        const anchor = Math.abs(x - center) < 6 ? 'middle' : x > center ? 'start' : 'end';
        return (
          <text
            key={k}
            x={x}
            y={y + 4}
            textAnchor={anchor}
            className="fill-gray-600 cursor-help"
            fontSize={12}
            fontWeight={600}
          >
            <title>{tip(k)}</title>
            {k}
          </text>
        );
      })}
    </svg>
  );
}
