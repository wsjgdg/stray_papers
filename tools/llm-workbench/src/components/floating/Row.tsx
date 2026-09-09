import type { Tone } from './format';

export function Row({
  label,
  value,
  sub,
  accent,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClass =
    tone === 'alert'
      ? 'text-[#ef6b6b]'
      : tone === 'warn'
        ? 'text-[#e6b15e]'
        : accent
          ? 'text-accent'
          : 'text-ink';
  return (
    <div
      className={
        'flex items-center justify-between gap-2 rounded px-1 ' +
        (active ? 'ring-1 ring-accent/60 ' : '') +
        (onClick ? 'cursor-pointer hover:bg-[#16223a]' : '')
      }
      onClick={onClick}
      title={onClick ? '点击在主窗口打开该模型' : undefined}
    >
      <span className="text-muted">{label}</span>
      <span className={'min-w-0 truncate ' + colorClass} title={value}>
        {value}
        {sub && <span className="ml-1 text-[10px] text-muted">{sub}</span>}
      </span>
    </div>
  );
}
