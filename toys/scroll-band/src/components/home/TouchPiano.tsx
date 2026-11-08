import type { useHome } from "@/pages/Home/useHome";
import { PIANO_KEYS, layoutLabelOfMidi } from "@/lib/audio/pianoMap";

// 触屏键盘：HUD「琴键」开关后屏幕底部浮出 26 白键横排 + 右邻黑键（发声音高与钢琴层同源）；
// 键名标注跟随当前键盘布局（piano 布局显示 ZXCVBNM/ASDF…/WETYUOP 对应名，无专属键的黑键留 ♯ 可点）；
// 点按即发声并点亮背景琴键，多指各触各键
export function TouchPiano(p: ReturnType<typeof useHome>) {
  const pianoLayout = p.keymap === "piano";
  const whiteLabel = (i: number): string => {
    const pk = PIANO_KEYS[i];
    const label = pianoLayout ? layoutLabelOfMidi(pk.midi) : pk.ch.toUpperCase();
    return label ?? "";
  };
  const blackLabel = (blackMidi: number | null): string =>
    (blackMidi !== null && pianoLayout ? layoutLabelOfMidi(blackMidi) : null) ?? "♯";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2 pb-1" aria-label="触屏键盘">
      <div className="pointer-events-auto relative flex h-20 w-full touch-none select-none overflow-hidden border border-border bg-card/85 backdrop-blur shadow-md">
        {PIANO_KEYS.map((pk, i) => (
          <button
            key={pk.ch}
            type="button"
            aria-label={`白键 ${whiteLabel(i) || pk.ch.toUpperCase()}`}
            onPointerDown={(e) => {
              e.preventDefault();
              p.onTouchKey(i, false);
            }}
            className="flex-1 border-r border-border/40 bg-background/95 font-mono text-[10px] text-muted-foreground last:border-r-0 active:bg-primary/25 active:text-primary"
          >
            {whiteLabel(i)}
          </button>
        ))}
        {PIANO_KEYS.map((pk, i) =>
          pk.blackMidi !== null ? (
            <button
              key={`${pk.ch}b`}
              type="button"
              aria-label={`黑键 ${blackLabel(pk.blackMidi) === "♯" ? `${pk.ch.toUpperCase()} 升` : blackLabel(pk.blackMidi)}`}
              onPointerDown={(e) => {
                e.preventDefault();
                p.onTouchKey(i, true);
              }}
              className="absolute top-0 h-12 w-[2.4%] bg-foreground/90 font-mono text-[8px] text-background active:bg-primary"
              style={{ left: `calc(${(((i + 1) / PIANO_KEYS.length) * 100).toFixed(3)}% - 1.2%)` }}
            >
              {blackLabel(pk.blackMidi)}
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}
