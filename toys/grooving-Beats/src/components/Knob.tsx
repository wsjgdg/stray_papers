import { useCallback, useId, useRef, useState } from "react";
import { cn } from "@/utils/cn";

interface KnobProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  size?: number;
  color?: string;
  format?: (v: number) => string;
  defaultValue?: number;
  className?: string;
  /** full description used for the native tooltip */
  hint?: string;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function Knob({
  label, value, onChange, size = 34, color = "#f2a03d",
  format = (v) => `${Math.round(v * 100)}`, defaultValue = 0.5, className, hint,
}: KnobProps) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const drag = useRef<{ y: number; v: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { y: e.clientY, v: value };
      setActive(true);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drag.current) return;
      const sens = e.shiftKey ? 0.0016 : 0.0062;
      const next = drag.current.v + (drag.current.y - e.clientY) * sens;
      onChange(Math.max(0, Math.min(1, next)));
    },
    [onChange],
  );

  const end = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag.current = null;
    setActive(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") { onChange(Math.min(1, value + step)); e.preventDefault(); }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") { onChange(Math.max(0, value - step)); e.preventDefault(); }
    if (e.key === "Home") { onChange(defaultValue); e.preventDefault(); }
  };

  const c = size / 2;
  const r = c - 3.5;
  const angle = -135 + value * 270;
  const [px, py] = polar(c, c, r - 5.5, angle);
  const [ix, iy] = polar(c, c, 3, angle);
  const show = active || hover;

  return (
    <div
      className={cn("flex flex-col items-center gap-[3px] no-native-drag", className)}
      title={`${hint ?? label} — drag to adjust, shift for fine, double-click to reset`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value * 100)}
          aria-valuetext={`${label} ${format(value)}`}
          className="cursor-ns-resize touch-none outline-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          onDoubleClick={() => onChange(defaultValue)}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onKeyDown={onKeyDown}
        >
          <defs>
            <linearGradient id={`k${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#464f5c" />
              <stop offset="52%" stopColor="#2a303a" />
              <stop offset="100%" stopColor="#171b21" />
            </linearGradient>
          </defs>
          <path d={arc(c, c, r, -135, 135)} fill="none" stroke="#0e1116" strokeWidth={3} strokeLinecap="round" />
          <path
            d={arc(c, c, r, -135, Math.max(-134.6, angle))}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${active ? 5 : 2}px ${color}aa)`, transition: "filter 150ms" }}
          />
          <circle cx={c} cy={c} r={r - 3.5} fill={`url(#k${id})`} stroke="#0c0f13" strokeWidth={1} />
          <circle cx={c} cy={c - 1} r={r - 6} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
          <line x1={ix} y1={iy} x2={px} y2={py} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </svg>
        {show && (
          <div className="pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-edge bg-ink px-1.5 py-0.5 text-[10px] digits text-bone shadow-lg">
            <span className="text-muted">{label}</span> {format(value)}
          </div>
        )}
      </div>
      <span className="label leading-none" style={{ color: active ? color : undefined }}>
        {label}
      </span>
    </div>
  );
}
