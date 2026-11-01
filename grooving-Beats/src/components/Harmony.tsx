import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Dices } from "lucide-react";
import { Bank, NOTE_NAMES, noteName, ScaleId, SCALES, getScale } from "@/audio/model";
import { Module } from "./Shell";
import { Helix, LiveNote, degreeOctave, pcColor } from "./Helix";
import { cn } from "@/utils/cn";

export { degreeOctave, pcColor } from "./Helix";
export type { LiveNote } from "./Helix";

interface HarmonyProps {
  keyRoot: number;
  scaleId?: ScaleId;
  bank: Bank;
  voice: "bass" | "stab";
  armed: number | null;
  live: LiveNote[];
  playing: boolean;
  onArm: (degree: number) => void;
  onAudition: (degree: number) => void;
  onVoice: (voice: "bass" | "stab") => void;
  onKey: (dir: 1 | -1) => void;
  onScaleChange?: (scale: ScaleId) => void;
  onMelody: () => void;
}

export function Harmony({
  keyRoot,
  scaleId = "pentatonic",
  bank,
  voice,
  armed,
  live,
  playing,
  onArm,
  onAudition,
  onVoice,
  onKey,
  onScaleChange,
  onMelody,
}: HarmonyProps) {
  const curScale = getScale(scaleId);
  const intervals = curScale.intervals;
  const oct = degreeOctave(voice);

  const { usage, max } = useMemo(() => {
    const counts = new Array(8).fill(0) as number[];
    for (const id of ["bass", "stab"] as const) {
      for (const st of bank[id] ?? []) if (st.v > 0) counts[st.n] += 1;
    }
    return { usage: counts, max: Math.max(1, ...counts) };
  }, [bank]);

  const activeDegrees = usage.filter((u) => u > 0).length;

  return (
    <Module
      title="harmony · scale visualiser"
      tint="#5fd3c4"
      right={
        <div className="flex items-center gap-2">
          <span className="label hidden sm:inline text-muted/70">{curScale.tag}</span>
          <span className="label">
            {playing && live.length > 0 ? "live · " : ""}
            {activeDegrees}/8 degrees in use
          </span>
        </div>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,430px)_minmax(0,1fr)]">
        {/* 3D helix */}
        <div className="lcd relative h-[208px] overflow-hidden rounded-[6px]">
          <Helix
            keyRoot={keyRoot}
            voice={voice}
            armed={armed}
            live={live}
            playing={playing}
            usage={usage}
            intervals={intervals}
            onPick={(d) => {
              onArm(d);
              onAudition(d);
            }}
          />
          <span className="label pointer-events-none absolute left-2 top-1.5 text-teal/60">
            pitch helix · up = higher
          </span>
          <span className="label pointer-events-none absolute right-2 top-1.5">drag to orbit · tilt</span>
          <span className="label pointer-events-none absolute bottom-1.5 left-2">
            {NOTE_NAMES[keyRoot]} {curScale.name.toLowerCase()}
          </span>
          <span className="label pointer-events-none absolute bottom-1.5 right-2">
            {voice.toUpperCase()} · OCT {oct}
          </span>
        </div>

        {/* chips + controls */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }, (_, d) => {
              const color = pcColor(d, intervals);
              const isArmed = armed === d;
              const count = usage[d];
              return (
                <button
                  key={d}
                  onClick={() => {
                    onArm(d);
                    onAudition(d);
                  }}
                  aria-pressed={isArmed}
                  title={`${noteName(keyRoot, d, oct, intervals)} · degree ${d + 1} · +${intervals[d]} semitones — click to audition & arm`}
                  className={cn(
                    "relative flex flex-col gap-1 rounded-[4px] border px-2 pb-1 pt-1.5 text-left transition-colors",
                    isArmed
                      ? "border-amber/80 bg-amber/10"
                      : "border-edge/70 bg-[#161a20] hover:border-edge-2 hover:bg-[#1b2028]",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="digits text-[14px] font-semibold leading-none" style={{ color }}>
                      {noteName(keyRoot, d, oct, intervals)}
                    </span>
                    <span className="label text-[8px] leading-none">+{intervals[d]}</span>
                  </div>
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${count ? Math.max(14, (count / max) * 100) : 0}%`, background: color }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="label text-[8px]">deg {d + 1}</span>
                    <span className="digits text-[8px] text-muted">{count || "·"}</span>
                  </div>
                  {isArmed && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber shadow-[0_0_8px_#f2a03d]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge/50 pt-2">
            <div className="flex items-center gap-1">
              <span className="label">key</span>
              <button
                onClick={() => onKey(-1)}
                aria-label="Transpose key down"
                className="btn flex h-5 w-5 items-center justify-center rounded-[3px] text-muted hover:text-amber"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="digits min-w-[38px] text-center text-[12px] text-amber">{NOTE_NAMES[keyRoot]} min</span>
              <button
                onClick={() => onKey(1)}
                aria-label="Transpose key up"
                className="btn flex h-5 w-5 items-center justify-center rounded-[3px] text-muted hover:text-amber"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <span className="label">scale</span>
              <select
                value={curScale.id}
                onChange={(e) => onScaleChange?.(e.target.value as ScaleId)}
                aria-label="Select musical scale"
                className="btn h-[22px] rounded-[3px] border border-edge bg-[#161a20] px-2 text-[10px] font-semibold text-teal outline-none"
              >
                {SCALES.map((sc) => (
                  <option key={sc.id} value={sc.id} className="bg-[#12151a] text-bone">
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex overflow-hidden rounded-[4px] border border-edge">
              {(["bass", "stab"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onVoice(v)}
                  data-on={voice === v}
                  title={v === "bass" ? "Bass voice — octave 2" : "Stab voice — octave 4"}
                  className={cn(
                    "btn h-[22px] rounded-none border-0 border-r border-edge px-2 text-[9px] tracking-[0.12em] last:border-r-0",
                    voice === v ? "bg-teal/15 text-teal" : "text-bone/60",
                  )}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={onMelody}
              title="Rewrite the melody of the current bank, staying inside the scale"
              className="btn flex h-[26px] items-center gap-1.5 rounded-[4px] px-2.5 text-[10px] tracking-[0.1em] text-bone/80"
            >
              <Dices className="h-3 w-3" /> NEW MELODY
            </button>

            <span className="text-[10px] leading-tight text-muted/80">
              {armed !== null
                ? `Armed ${noteName(keyRoot, armed, oct, intervals)} — draw it into the grid, or click the chip again to release.`
                : "Click a degree to arm a pitch, then draw it into the grid (or Alt-click steps to cycle)."}
            </span>
          </div>
        </div>
      </div>
    </Module>
  );
}
