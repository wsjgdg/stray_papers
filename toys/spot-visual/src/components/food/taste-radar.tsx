'use client';

import { TASTE_KEYS } from '@/lib/food-data';

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
        <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color} />
      ))}
      {/* labels */}
      {TASTE_KEYS.map((k, i) => {
        const [x, y] = point(i, RADIUS + 16);
        const anchor = Math.abs(x - center) < 6 ? 'middle' : x > center ? 'start' : 'end';
        return (
          <text key={k} x={x} y={y + 4} textAnchor={anchor} className="fill-gray-600" fontSize={12} fontWeight={600}>
            {k}
          </text>
        );
      })}
    </svg>
  );
}
