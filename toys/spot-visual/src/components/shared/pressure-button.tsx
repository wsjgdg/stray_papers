'use client';

import { forwardRef } from 'react';
import { motion, useTransform, type HTMLMotionProps } from 'framer-motion';
import { usePressurePress } from '@/lib/motion-hooks';

/**
 * 重按压感按钮：包裹 usePressurePress，
 * translateY/scaleZ 跟随按压 depth，松手 spring 回弹。
 * 用于结论球、SOS 等核心大按钮。
 *
 * 使用 transform-style: preserve-3d + perspective 才能让 scaleZ 可见。
 * style 里的 motion values 会自动订阅更新。
 */
export interface PressureButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  /** 按下时最大下沉像素 */
  maxDepth?: number;
}

export const PressureButton = forwardRef<HTMLButtonElement, PressureButtonProps>(
  function PressureButton({ maxDepth = 6, children, className, style, onPointerDown, onPointerUp, onPointerLeave, ...rest }, ref) {
    const { depth, onPointerDown: pd, onPointerUp: pu, onPointerLeave: pl } = usePressurePress();
    // depth 是 spring 化的 MotionValue，直接作为 style 值 motion 会订阅
    const translateY = useTransform(depth, (v) => v * maxDepth);
    const scaleZ = useTransform(depth, (v) => 1 - v * 0.08);

    return (
      <div style={{ perspective: 400 }}>
        <motion.button
          ref={ref}
          className={className}
          style={{
            transformStyle: 'preserve-3d',
            translateY,
            scaleZ,
            ...style,
          }}
          onPointerDown={(e) => { pd(e); onPointerDown?.(e); }}
          onPointerUp={(e) => { pu(); onPointerUp?.(e); }}
          onPointerLeave={(e) => { pl(); onPointerLeave?.(e); }}
          {...rest}
        >
          {children}
        </motion.button>
      </div>
    );
  },
);
