import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Card({
  title,
  subtitle,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={clsx('card flex flex-col overflow-hidden', className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1', bodyClass ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'up' | 'down' | 'warn';
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'up'
        ? 'text-up'
        : tone === 'down'
          ? 'text-down'
          : tone === 'warn'
            ? 'text-amber-400'
            : 'text-ink';
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx('mt-1 truncate text-xl font-semibold', toneClass)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function Chip({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'up' | 'down' | 'warn' | 'ok';
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: 'border-edge bg-[#0e1728] text-muted',
    accent: 'border-accent/40 bg-accent/10 text-accent',
    up: 'border-red-500/40 bg-red-500/10 text-red-400',
    down: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    ok: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-edge border-t-accent" />
      {label ?? '加载中…'}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-muted">{text}</div>;
}

/** 归一化进度条：value 在 [min,max] 区间内的相对位置 */
export function Bar({
  value,
  max,
  color = '#4da3ff',
  height = 6,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="w-full overflow-hidden rounded-full bg-[#1a2438]" style={{ height }}>
      <div style={{ width: `${pct}%`, height, background: color }} />
    </div>
  );
}

export function Sparkline({ values, color = '#4da3ff' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / span) * (h - 4) - 2}`);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
