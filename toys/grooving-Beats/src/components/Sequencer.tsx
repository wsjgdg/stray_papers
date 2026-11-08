import { useEffect, useRef, useState } from "react";
import {
  Bank,
  TRACKS,
  TrackId,
  TrackState,
  Step,
  noteName,
  SCALE,
  DEFAULT_PAN,
  DEFAULT_REV,
  DEFAULT_DLY,
  shiftRow,
  invertRow,
  reverseRow,
  euclideanPattern,
} from "@/audio/model";
import { Knob } from "./Knob";
import { cn } from "@/utils/cn";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface Props {
  bank: Bank;
  tracks: Record<TrackId, TrackState>;
  playStep: number;
  playing: boolean;
  selected: TrackId;
  keyRoot: number;
  intervals?: number[];
  onSelect: (id: TrackId) => void;
  onAudition: (id: TrackId, n?: number) => void;
  onStep: (id: TrackId, i: number, next: Step) => void;
  onTrack: (id: TrackId, patch: Partial<TrackState>) => void;
  onRowChange?: (id: TrackId, newRow: Step[]) => void;
  /** pitch armed in the harmony panel — melodic steps receive it on click/drag */
  armedDegree: number | null;
}

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** full label in tooltips, short label on the panel */
const SHORT: Record<string, string> = { CUTOFF: "CUT", DECAY: "DEC", LEVEL: "LVL", SPACE: "SPC" };
const short = (s: string) => SHORT[s] ?? s;

const vFromY = (el: HTMLElement, clientY: number) => {
  const r = el.getBoundingClientRect();
  const f = 1 - (clientY - r.top) / r.height;
  return f < 0.22 ? 0 : f < 0.5 ? 1 : f < 0.8 ? 2 : 3;
};

export function Sequencer({
  bank,
  tracks,
  playStep,
  playing,
  selected,
  keyRoot,
  intervals = SCALE,
  onSelect,
  onAudition,
  onStep,
  onTrack,
  onRowChange,
  armedDegree,
}: Props) {
  const paint = useRef<number | null>(null);
  const laneDrag = useRef(false);
  const [stripMode, setStripMode] = useState<"synth" | "mix">("synth");
  const [showPads, setShowPads] = useState(true);
  const [liveRec, setLiveRec] = useState(false);

  useEffect(() => {
    const up = () => {
      paint.current = null;
      laneDrag.current = false;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const steps = bank[TRACKS[0].id]?.length ?? 16;
  const cols = {
    display: "grid",
    gridTemplateColumns: `260px repeat(${steps}, minmax(0,1fr))`,
    gap: "5px",
  } as React.CSSProperties;

  const hit = (id: TrackId, i: number, e: React.PointerEvent | React.MouseEvent) => {
    const cur = bank[id][i];
    if (e.shiftKey || e.button === 2) {
      onStep(id, i, { ...cur, v: 0 });
      paint.current = 0;
      return;
    }
    if (e.altKey && TRACKS.find((t) => t.id === id)?.melodic) {
      const n = (cur.n + 1) % 8;
      onStep(id, i, { v: cur.v || 2, n });
      onAudition(id, n);
      return;
    }
    if (armedDegree !== null && TRACKS.find((t) => t.id === id)?.melodic) {
      const v = cur.v || 2;
      onStep(id, i, { ...cur, v, n: armedDegree });
      onAudition(id, armedDegree);
      paint.current = v;
      return;
    }
    const next = cur.v === 0 ? 2 : cur.v === 2 ? 3 : cur.v === 3 ? 1 : 0;
    onStep(id, i, { ...cur, v: next });
    paint.current = next;
    if (next > 0) onAudition(id, cur.n);
  };

  const laneHit = (i: number, e: React.PointerEvent | React.MouseEvent) => {
    const def = TRACKS.find((t) => t.id === selected)!;
    const cur = bank[selected][i];
    if (e.shiftKey || e.button === 2) {
      onStep(selected, i, { ...cur, v: 0 });
      return;
    }
    if (e.altKey && def.melodic) {
      const n = (cur.n + 1) % 8;
      onStep(selected, i, { v: cur.v || 2, n });
      onAudition(selected, n);
      return;
    }
    if ((e as React.PointerEvent).pointerType === "mouse" && e.type === "pointerdown") {
      const v = vFromY(e.currentTarget as HTMLElement, e.clientY);
      const n = armedDegree !== null && def.melodic ? armedDegree : cur.n;
      onStep(selected, i, { ...cur, v, n });
      laneDrag.current = true;
      if (v > 0) onAudition(selected, cur.n);
      return;
    }
    const next = cur.v === 0 ? 2 : cur.v === 2 ? 3 : cur.v === 3 ? 1 : 0;
    onStep(selected, i, { ...cur, v: next });
    if (next > 0) onAudition(selected, cur.n);
  };

  const triggerPad = (id: TrackId) => {
    onSelect(id);
    onAudition(id);
    if (liveRec && playing && playStep >= 0 && playStep < steps) {
      const cur = bank[id][playStep];
      onStep(id, playStep, { ...cur, v: 3 });
    }
  };

  const nudge = (dir: -1 | 1) => {
    if (!onRowChange) return;
    const cur = bank[selected];
    onRowChange(selected, shiftRow(cur, dir));
  };

  const applyEuclidean = (pulses: number) => {
    if (!onRowChange) return;
    const pattern = euclideanPattern(pulses, steps);
    const cur = bank[selected];
    const next = pattern.map((hit, i) => ({
      ...cur[i],
      v: hit ? (i % 4 === 0 ? 3 : 2) : 0,
    }));
    onRowChange(selected, next);
  };

  const applyInvert = () => {
    if (!onRowChange) return;
    onRowChange(selected, invertRow(bank[selected]));
  };

  const applyReverse = () => {
    if (!onRowChange) return;
    onRowChange(selected, reverseRow(bank[selected]));
  };

  const selDef = TRACKS.find((t) => t.id === selected)!;

  return (
    <div className="select-none" style={{ minWidth: steps * 34 + 300 }}>
      {/* ---------------- Finger Drumming Pads Strip ---------------- */}
      {showPads && (
        <div className="mb-3 grid grid-cols-8 gap-2 rounded-[5px] border border-edge/60 bg-[#12151b]/80 p-2">
          {TRACKS.map((t) => {
            const isSel = selected === t.id;
            const liveHit = playing && playStep >= 0 && bank[t.id][playStep]?.v > 0 && !tracks[t.id].mute;
            return (
              <button
                key={t.id}
                onPointerDown={() => triggerPad(t.id)}
                title={`${t.name} trigger pad (${t.key})`}
                className={cn(
                  "group relative flex h-[48px] flex-col items-center justify-between rounded-[4px] border p-1.5 transition-all",
                  isSel
                    ? "border-amber/80 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "border-edge/60 bg-[#171b22] hover:border-edge-2 hover:bg-[#1e232c]",
                  liveHit && "border-amber bg-amber/20 shadow-[0_0_12px_rgba(242,160,61,0.3)]",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="digits text-[9px] font-bold text-muted group-hover:text-bone">
                    {t.code}
                  </span>
                  <kbd className="digits rounded-[2px] bg-black/40 px-1 text-[8px] text-amber">
                    {t.key}
                  </kbd>
                </div>
                <span
                  className="font-display text-[10px] font-bold tracking-wider"
                  style={{ color: t.color }}
                >
                  {t.name}
                </span>
                <span
                  className="h-[2px] w-full rounded-full transition-opacity"
                  style={{ background: t.color, opacity: liveHit ? 1 : isSel ? 0.8 : 0.2 }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* ---------------- Quick Track Tools Bar ---------------- */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-edge/50 pb-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="label text-muted">track tool:</span>
          <span
            className="digits font-display text-[12px] font-bold tracking-wider"
            style={{ color: selDef.color }}
          >
            {selDef.name}
          </span>
          <div className="ml-1 flex items-center gap-1">
            <button
              onClick={() => nudge(-1)}
              title="Nudge track steps 1 step left (rotate left)"
              className="btn flex h-[22px] items-center gap-1 rounded-[3px] px-1.5 text-[10px] text-bone/80 hover:text-amber"
            >
              <ChevronLeft className="h-3 w-3" /> NUDGE
            </button>
            <button
              onClick={() => nudge(1)}
              title="Nudge track steps 1 step right (rotate right)"
              className="btn flex h-[22px] items-center gap-1 rounded-[3px] px-1.5 text-[10px] text-bone/80 hover:text-amber"
            >
              NUDGE <ChevronRight className="h-3 w-3" />
            </button>
            <span className="mx-1 h-3 w-px bg-edge" />
            <span className="label text-muted/80">euclid:</span>
            {([3, 5, 7] as const).map((p) => (
              <button
                key={p}
                onClick={() => applyEuclidean(p)}
                title={`Generate Euclidean rhythm: ${p} evenly-spaced hits across ${steps} steps`}
                className="btn h-[22px] rounded-[3px] px-1.5 text-[10px] digits text-teal hover:border-teal"
              >
                {p}
              </button>
            ))}
            <span className="mx-1 h-3 w-px bg-edge" />
            <button
              onClick={applyInvert}
              title="Invert steps: active become silent, silent become hits"
              className="btn h-[22px] rounded-[3px] px-2 text-[10px] text-bone/80 hover:text-amber"
            >
              INVERT
            </button>
            <button
              onClick={applyReverse}
              title="Reverse step order for this track"
              className="btn h-[22px] rounded-[3px] px-2 text-[10px] text-bone/80 hover:text-amber"
            >
              REVERSE
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLiveRec(!liveRec)}
            data-on={liveRec}
            title="Live Pad Overdub: tapping pads while playing records hits into the live step"
            className={cn(
              "btn flex h-[22px] items-center gap-1 rounded-[3px] px-2 text-[10px] tracking-wide",
              liveRec ? "border-coral/70 bg-coral/15 text-coral" : "text-muted hover:text-bone",
            )}
          >
            <Sparkles className="h-3 w-3" /> {liveRec ? "REC OVERDUB ON" : "OVERDUB"}
          </button>
          <button
            onClick={() => setShowPads(!showPads)}
            className="btn h-[22px] rounded-[3px] px-2 text-[10px] text-muted hover:text-bone"
          >
            {showPads ? "HIDE PADS" : "SHOW PADS"}
          </button>
        </div>
      </div>

      {/* ---------------- Step Ruler ---------------- */}
      <div className="pb-2" style={cols}>
        <div className="flex items-end justify-between pr-3">
          <div className="flex items-center gap-2">
            <span className="label">voice</span>
            <div className="flex overflow-hidden rounded-[3px] border border-edge">
              {(["synth", "mix"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setStripMode(m)}
                  data-on={stripMode === m}
                  title={m === "synth" ? "Sound design knobs: Tune, Decay/Cutoff, Level" : "Mixer knobs: Stereo Pan, Reverb send, Delay send"}
                  className={cn(
                    "btn h-[18px] rounded-none border-0 border-r border-edge px-1.5 text-[8px] font-bold tracking-wider last:border-r-0",
                    stripMode === m ? "bg-amber/20 text-amber" : "text-muted",
                  )}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <span className="label">steps</span>
        </div>
        {Array.from({ length: steps }, (_, i) => {
          const isBeat = i % 4 === 0;
          const live = playing && playStep === i;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "digits text-[10px] transition-colors duration-100",
                  live ? "text-amber" : isBeat ? "text-bone/70" : "text-muted/50",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="h-[3px] w-full rounded-full transition-all duration-100"
                style={{
                  background: live ? "#f2a03d" : isBeat ? "#3d4653" : "#262c35",
                  boxShadow: live ? "0 0 10px #f2a03d" : "none",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ---------------- Rows ---------------- */}
      <div className="flex flex-col gap-[5px]" onContextMenu={(e) => e.preventDefault()}>
        {TRACKS.map((def) => {
          const ts = tracks[def.id];
          const row = bank[def.id];
          const isSel = selected === def.id;
          const firing = playing && playStep >= 0 && row[playStep]?.v > 0 && !ts.mute;
          const dimmed = ts.mute;

          const panVal = (ts.pan !== undefined ? ts.pan : DEFAULT_PAN[def.id] ?? 0);
          const revVal = (ts.rev !== undefined ? ts.rev : DEFAULT_REV[def.id] ?? 0);
          const dlyVal = (ts.dly !== undefined ? ts.dly : DEFAULT_DLY[def.id] ?? 0);

          return (
            <div
              key={def.id}
              className={cn(
                "items-center rounded-[4px] py-[3px] transition-colors duration-200",
                isSel ? "bg-white/[0.045]" : "hover:bg-white/[0.02]",
              )}
              style={cols}
            >
              {/* strip */}
              <div className="flex items-center gap-2 pl-2 pr-3">
                <span
                  className="h-4 w-[3px] shrink-0 rounded-full transition-all"
                  style={{
                    background: isSel ? def.color : "#2f3742",
                    boxShadow: isSel ? `0 0 8px ${def.color}` : "none",
                  }}
                />
                <button
                  onClick={() => {
                    const changed = selected !== def.id;
                    onSelect(def.id);
                    if (changed) onAudition(def.id);
                  }}
                  className="group flex min-w-0 items-center gap-2 text-left"
                  title={`${def.name} — click to select & audition (${def.key})`}
                >
                  <span
                    key={firing ? `f${playStep}` : "idle"}
                    className={cn("h-[7px] w-[7px] shrink-0 rounded-full", firing && "ledblink")}
                    style={{
                      background: firing ? def.color : alpha(def.color, 0.22),
                      color: def.color,
                    }}
                  />
                  <span
                    className="truncate font-display text-[12px] font-semibold tracking-[0.1em] transition-colors group-hover:text-bone"
                    style={{ color: isSel ? def.color : "#c3c8d1", opacity: dimmed ? 0.4 : 1 }}
                  >
                    {def.name}
                  </span>
                </button>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => onTrack(def.id, { mute: !ts.mute })}
                    data-on={ts.mute}
                    aria-pressed={ts.mute}
                    aria-label={`Mute ${def.name}`}
                    title="Mute (M)"
                    className="btn h-[19px] w-[19px] rounded-[3px] text-[9px] font-semibold leading-none data-[on=true]:border-coral/70! data-[on=true]:bg-coral/25! data-[on=true]:text-coral!"
                  >
                    M
                  </button>
                  <button
                    onClick={() => onTrack(def.id, { solo: !ts.solo })}
                    data-on={ts.solo}
                    aria-pressed={ts.solo}
                    aria-label={`Solo ${def.name}`}
                    title="Solo (S)"
                    className="btn h-[19px] w-[19px] rounded-[3px] text-[9px] font-semibold leading-none data-[on=true]:border-amber/70! data-[on=true]:bg-amber/25! data-[on=true]:text-amber!"
                  >
                    S
                  </button>
                  <button
                    onClick={() => onTrack(def.id, { lock: !ts.lock })}
                    data-on={ts.lock}
                    aria-pressed={ts.lock}
                    aria-label={`Lock ${def.name} from randomizer`}
                    title="Lock — DICE keeps this track's pattern (L)"
                    className="btn h-[19px] w-[19px] rounded-[3px] text-[9px] font-semibold leading-none data-[on=true]:border-violet/70! data-[on=true]:bg-violet/25! data-[on=true]:text-violet!"
                  >
                    L
                  </button>

                  <div className="ml-1 flex items-start gap-[6px]">
                    {stripMode === "synth" ? (
                      <>
                        <Knob
                          label={short(def.p1Label)}
                          hint={`${def.name} · ${def.p1Label}`}
                          size={28}
                          color={def.color}
                          value={ts.p1}
                          defaultValue={def.defaults.p1}
                          format={def.p1Fmt}
                          onChange={(v) => onTrack(def.id, { p1: v })}
                        />
                        <Knob
                          label={short(def.p2Label)}
                          hint={`${def.name} · ${def.p2Label}`}
                          size={28}
                          color={def.color}
                          value={ts.p2}
                          defaultValue={def.defaults.p2}
                          format={def.p2Fmt}
                          onChange={(v) => onTrack(def.id, { p2: v })}
                        />
                        <Knob
                          label="LVL"
                          hint={`${def.name} · output level`}
                          size={28}
                          color="#e9e5dc"
                          value={ts.gain}
                          defaultValue={def.defaults.gain}
                          onChange={(v) => onTrack(def.id, { gain: v })}
                        />
                      </>
                    ) : (
                      <>
                        <Knob
                          label="PAN"
                          hint={`${def.name} · stereo position`}
                          size={28}
                          color="#7fa8ff"
                          value={(panVal + 1) / 2}
                          defaultValue={0.5}
                          format={(val) => {
                            const p = Math.round((val * 2 - 1) * 50);
                            return p === 0 ? "C" : p < 0 ? `L${-p}` : `R${p}`;
                          }}
                          onChange={(v) => onTrack(def.id, { pan: v * 2 - 1 })}
                        />
                        <Knob
                          label="REV"
                          hint={`${def.name} · reverb send`}
                          size={28}
                          color="#c08be8"
                          value={revVal}
                          defaultValue={DEFAULT_REV[def.id]}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => onTrack(def.id, { rev: v })}
                        />
                        <Knob
                          label="DLY"
                          hint={`${def.name} · delay send`}
                          size={28}
                          color="#5fd3c4"
                          value={dlyVal}
                          defaultValue={DEFAULT_DLY[def.id]}
                          format={(v) => `${Math.round(v * 100)}%`}
                          onChange={(v) => onTrack(def.id, { dly: v })}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* steps */}
              {row.map((st, i) => {
                const on = st.v > 0;
                const live = playing && playStep === i;
                const beat = i % 4 === 0;
                const fill =
                  st.v === 3 ? def.color : st.v === 2 ? alpha(def.color, 0.72) : alpha(def.color, 0.3);
                return (
                  <button
                    key={i}
                    onPointerDown={(e) => {
                      if (e.pointerType === "touch") return;
                      if (e.button === 0 || e.button === 2) hit(def.id, i, e);
                    }}
                    onClick={(e) => {
                      if ((e.nativeEvent as PointerEvent).pointerType === "touch" || e.detail === 0)
                        hit(def.id, i, e);
                    }}
                    onPointerEnter={() => {
                      if (paint.current === null) return;
                      if (armedDegree !== null && def.melodic) {
                        if (paint.current > 0 && st.n !== armedDegree) {
                          onStep(def.id, i, { ...st, n: armedDegree });
                        }
                        return;
                      }
                      if (paint.current !== st.v) {
                        onStep(def.id, i, { ...st, v: paint.current });
                      }
                    }}
                    title={`${def.name} · step ${i + 1}${
                      def.melodic && on
                        ? ` · ${noteName(keyRoot, st.n, def.id === "stab" ? 4 : 2, intervals)}`
                        : ""
                    }`}
                    aria-label={`${def.name} step ${i + 1} ${
                      on ? ["", "ghost", "normal", "accent"][st.v] : "off"
                    }`}
                    className={cn(
                      "relative h-[30px] rounded-[3px] border transition-[border-color,background,transform] duration-100",
                      "hover:-translate-y-[1px]",
                      on
                        ? "border-transparent"
                        : beat
                        ? "border-[#39414d] bg-[#191d24]"
                        : "border-[#2a313a] bg-[#14181e]",
                      live && !on && "border-amber/45 bg-amber/10",
                      dimmed && "opacity-35",
                    )}
                    style={
                      on
                        ? {
                            background: fill,
                            boxShadow: st.v === 3 ? `0 0 12px ${alpha(def.color, 0.5)}` : undefined,
                          }
                        : undefined
                    }
                  >
                    {on && (
                      <span
                        key={live ? `h${playStep}` : "s"}
                        className={cn("pointer-events-none absolute inset-0 rounded-[3px]", live && "hitflash")}
                        style={{
                          background: fill,
                          boxShadow:
                            st.v === 3
                              ? `inset 0 1px 0 rgba(255,255,255,0.55)`
                              : `inset 0 1px 0 rgba(255,255,255,0.18)`,
                        }}
                      />
                    )}
                    {st.v === 1 && (
                      <span className="pointer-events-none absolute inset-[6px] rounded-[2px] border border-dashed border-black/45" />
                    )}
                    {def.melodic && on && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold digits text-black/70">
                        {noteName(keyRoot, st.n, def.id === "stab" ? 4 : 2, intervals).replace(/[0-9]/g, "")}
                      </span>
                    )}
                    {!on && beat && (
                      <span className="pointer-events-none absolute inset-x-0 bottom-[3px] mx-auto h-[2px] w-[10px] rounded-full bg-white/10" />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ---------------- Velocity / Pitch Lane ---------------- */}
      <div className="mt-3 border-t border-edge/60 pt-3" style={cols}>
        <div className="flex flex-col justify-center gap-0.5 pl-2 pr-3">
          <span className="label" style={{ color: selDef.color }}>
            lane · {selDef.name}
          </span>
          <span className="text-[9px] leading-tight text-muted/70">
            drag = velocity · click cycles{selDef.melodic ? " · alt = pitch" : ""} · shift = clear
          </span>
        </div>
        {bank[selected].map((st, i) => {
          const live = playing && playStep === i;
          return (
            <button
              key={i}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") return;
                if (e.button === 0 || e.button === 2) laneHit(i, e);
              }}
              onClick={(e) => {
                if ((e.nativeEvent as PointerEvent).pointerType === "touch" || e.detail === 0) laneHit(i, e);
              }}
              onPointerEnter={(e) => {
                if (!laneDrag.current || e.pointerType !== "mouse") return;
                const cur = bank[selected][i];
                const v = vFromY(e.currentTarget as HTMLElement, e.clientY);
                if (v !== cur.v) onStep(selected, i, { ...cur, v });
              }}
              aria-label={`lane ${i + 1} velocity ${["off", "ghost", "normal", "accent"][st.v]}`}
              className={cn(
                "relative h-[34px] overflow-hidden rounded-[3px] border bg-[#14171d] transition-colors",
                live ? "border-amber/60" : "border-[#2a313a]",
                st.v === 0 && "hover:border-white/25",
              )}
            >
              {st.v > 0 && (
                <span
                  className="absolute inset-x-[2px] bottom-[2px] rounded-[2px]"
                  style={{
                    height: `calc(${(st.v / 3) * 100}% - 2px)`,
                    background: alpha(selDef.color, 0.3 + (0.7 * st.v) / 3),
                    boxShadow: st.v === 3 ? `0 0 10px ${alpha(selDef.color, 0.5)}` : undefined,
                  }}
                />
              )}
              {selDef.melodic && st.v > 0 && (
                <span className="digits absolute right-1 top-[1px] text-[8px] font-semibold text-black/70">
                  {noteName(keyRoot, st.n, selDef.id === "stab" ? 4 : 2, intervals).replace(/[0-9]/g, "")}
                </span>
              )}
              {live && <span className="absolute inset-y-0 left-0 w-[2px] bg-amber shadow-[0_0_8px_#f2a03d]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
