'use client';

import { motion } from 'framer-motion';
import { Fragment } from 'react';

/**
 * 呼吸波环：用两个交替的 spring 动画模拟 1→1.25→1 + 0.6→0→0.6
 * spring 只支持两帧，所以拆分为两个 motion.div 交替播放。
 */
export function BreathRing({
  color = 'rgba(239,68,68,0.6)',
  layers = 2,
  size = 'inset-0',
}: {
  color?: string;
  layers?: number;
  size?: string;
}) {
  return (
    <>
      {Array.from({ length: layers }).map((_, i) => (
        <Fragment key={i}>
          {/* 扩张阶段 */}
          <motion.div
            key={`${i}-expand`}
            className={`absolute ${size} rounded-full border-2 pointer-events-none`}
            style={{ borderColor: color }}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 20,
              duration: 1.5,
              delay: i * 0.75,
              repeat: Infinity,
              repeatDelay: 1.5,
            }}
          />
          {/* 收缩阶段 - 由第二个 div 接力 */}
          <motion.div
            key={`${i}-contract`}
            className={`absolute ${size} rounded-full border-2 pointer-events-none`}
            style={{ borderColor: color }}
            initial={{ scale: 1.25, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.6 }}
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 20,
              duration: 1.5,
              delay: i * 0.75 + 0.75,
              repeat: Infinity,
              repeatDelay: 1.5,
            }}
          />
        </Fragment>
      ))}
    </>
  );
}
