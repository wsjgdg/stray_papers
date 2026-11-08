'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 水波进度液面 + 粒子飞溅。
 *
 * - progress 0~1：水面 y 从底部升到顶部，两层正弦波 path 横向漂移制造液面晃动。
 * - broken=true：渲染 12 个粒子从液面位置向外随机角度飞溅（衰减消失）。
 * - 满格时由父组件通过 onComplete 监听 progress===1 触发全屏震动。
 *
 * 纯展示组件，progress/broken 由父级 useLongPressCharge 驱动。
 */
export function LiquidCharge({
  progress,
  broken,
  width = 64,
  height = 64,
  fill = '#EF4444',
  baseFill = '#22C55E',
}: {
  progress: number;
  broken: boolean;
  width?: number;
  height?: number;
  fill?: string;
  baseFill?: string;
}) {
  const id = useMemo(() => `lc-${Math.random().toString(36).slice(2, 8)}`, []);
  // 水面 y：progress=0 时在底部，1 时在顶部
  const waterY = height - progress * height;
  const waveAmp = 2;
  const waterTop = Math.max(0, waterY);

  // 粒子角度
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        angle: (i / 12) * Math.PI * 2 + Math.random() * 0.3,
        dist: 18 + Math.random() * 14,
        r: 1.5 + Math.random() * 2,
        delay: Math.random() * 0.05,
      })),
    [],
  );

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full">
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x="0" y="0" width={width} height={height} rx={width / 2} />
        </clipPath>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.95" />
          <stop offset="100%" stopColor={fill} stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* 底色（未充能部分） */}
      <rect x="0" y="0" width={width} height={height} rx={width / 2} fill={baseFill} opacity="0.25" />

      <g clipPath={`url(#${id}-clip)`}>
        {/* 水波液面 */}
        <motion.path
          d={`M 0 ${waterTop + waveAmp}
              Q ${width / 4} ${waterTop - waveAmp} ${width / 2} ${waterTop + waveAmp}
              T ${width} ${waterTop + waveAmp}
              L ${width} ${height} L 0 ${height} Z`}
          fill={`url(#${id}-grad)`}
          animate={{
            d: [
              `M 0 ${waterTop + waveAmp} Q ${width / 4} ${waterTop - waveAmp} ${width / 2} ${waterTop + waveAmp} T ${width} ${waterTop + waveAmp} L ${width} ${height} L 0 ${height} Z`,
              `M 0 ${waterTop + waveAmp} Q ${width / 4} ${waterTop + waveAmp * 2} ${width / 2} ${waterTop + waveAmp} T ${width} ${waterTop + waveAmp} L ${width} ${height} L 0 ${height} Z`,
              `M 0 ${waterTop + waveAmp} Q ${width / 4} ${waterTop - waveAmp} ${width / 2} ${waterTop + waveAmp} T ${width} ${waterTop + waveAmp} L ${width} ${height} L 0 ${height} Z`,
            ],
          }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* 高光波纹 */}
        <motion.ellipse
          cx={width / 2}
          cy={waterTop + 1}
          rx={width / 3}
          ry={1}
          fill="#fff"
          opacity="0.4"
          animate={{ rx: [width / 3, width / 2.5, width / 3] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      </g>

      {/* 粒子飞溅 */}
      <AnimatePresence>
        {broken && (
          <g>
            {particles.map((p, i) => {
              const cx = width / 2;
              const cy = waterTop;
              return (
                <motion.circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={p.r}
                  fill={fill}
                  initial={{ opacity: 1, x: 0, y: 0 }}
                  animate={{
                    opacity: 0,
                    x: Math.cos(p.angle) * p.dist,
                    y: Math.sin(p.angle) * p.dist,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: p.delay, ease: 'easeOut' }}
                />
              );
            })}
          </g>
        )}
      </AnimatePresence>
    </svg>
  );
}
