import { useEffect, useRef } from "react";
import { SCALE, TrackId, noteName } from "@/audio/model";

/* ------------------------------------------------------------------
   3D PITCH HELIX — the scale as a coil you can orbit
     · angle   = pitch class. Absolute, so C keeps one bearing and
                 transposing the key visibly turns the coil.
     · height  = semitones above the tonic. Pitch rises upward and
                 each octave stacks directly above the last.
     · spine   = a true sampled helix, depth-sorted with the beads.
     · links   = every played note draws a glowing path along the
                 coil from the previous note of the same voice.
------------------------------------------------------------------ */

export interface LiveNote {
  degree: number;
  vel: number;
  voice: TrackId;
  step: number;
  bank: number;
}

const TAU = Math.PI * 2;
const SPAN = 17;          // semitones covered by the eight degrees (0 … 17)
const RISE = 2.5;         // world-space height of that span
const CHAIN_LO = -1.5;    // the spine overhangs the chain a little, fading out
const CHAIN_HI = 18.5;
const SPINE_N = 150;
const RADIUS = 1;
const RING_R = 1.1;       // the chroma floor, just outside the coil
const PERSP = 0.14;
const TILT_REF = 0.4;     // elevation used to size the scene, so it never breathes while orbiting
const TRAIL_MS = 1500;
const PULSE_MS = 700;

const PC_COLOR: Record<number, string> = {
  0: "#f2a03d", 3: "#5fd3c4", 5: "#7fa8ff", 7: "#8fd14f", 10: "#c08be8",
};
const VOICE_GLOW: Partial<Record<TrackId, string>> = { bass: "#a6ec66", stab: "#8fb4ff" };

export const pcColor = (degree: number, intervals: number[] = SCALE) =>
  PC_COLOR[intervals[degree % intervals.length] % 12] ?? "#8b929e";
export const degreeOctave = (voice: "bass" | "stab") => (voice === "stab" ? 4 : 2);

const yOf = (s: number) => ((s - SPAN / 2) / SPAN) * RISE;
const yGround = yOf(CHAIN_LO) - 0.12;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const overhang = (s: number) => clamp01(Math.min((s - CHAIN_LO) / 1.3, (CHAIN_HI - s) / 1.3));
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(a).toFixed(3)})`;
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/* camera: yaw about the axis, then tilt so we look down into the coil */
interface Cam { cyaw: number; syaw: number; ctl: number; stl: number }
const camAt = (yaw: number, tilt: number): Cam => ({
  cyaw: Math.cos(yaw),
  syaw: Math.sin(yaw),
  ctl: Math.cos(tilt),
  stl: Math.sin(tilt),
});
/** unit-scale projection: x/y are screen offsets before scaling, z is depth */
const project = (cam: Cam, theta: number, y: number, rad: number) => {
  const x = Math.cos(theta) * rad;
  const z = Math.sin(theta) * rad;
  const x1 = x * cam.cyaw + z * cam.syaw;
  const z1 = -x * cam.syaw + z * cam.cyaw;
  const up = y * cam.ctl + z1 * cam.stl;      // camera sits above: the far side rises
  const depth = -y * cam.stl + z1 * cam.ctl;  // positive = further from the viewer
  return { x: x1, y: up, z: depth, k: 1 / (1 + depth * PERSP) };
};

type Drawable =
  | { kind: "spine"; z: number; x0: number; y0: number; x1: number; y1: number; f: number; e: number }
  | { kind: "trail"; z: number; x0: number; y0: number; x1: number; y1: number; a: number; col: string }
  | { kind: "node"; z: number; x: number; y: number; r: number; d: number; used: boolean; col: string; hit: number };

interface Pulse { d: number; t0: number; vel: number }
interface Trail { a: number; b: number; t0: number; vel: number; voice: TrackId }
interface Hit { d: number; x: number; y: number; r: number }

interface HelixProps {
  keyRoot: number;
  voice: "bass" | "stab";
  armed: number | null;
  live: LiveNote[];
  playing: boolean;
  usage: number[];
  intervals?: number[];
  onPick: (degree: number) => void;
}

export function Helix({ keyRoot, voice, armed, live, playing, usage, intervals = SCALE, onPick }: HelixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ keyRoot, voice, armed, live, playing, usage, intervals, onPick });
  props.current = { keyRoot, voice, armed, live, playing, usage, intervals, onPick };

  const yaw = useRef(0.5);
  const tilt = useRef(TILT_REF);
  const hits = useRef<Hit[]>([]);
  const hover = useRef(-1);
  const drag = useRef<{ x: number; y: number; yaw: number; tilt: number; moved: boolean } | null>(null);
  const pulses = useRef<Pulse[]>([]);
  const trails = useRef<Trail[]>([]);
  const lastSemi = useRef<Partial<Record<TrackId, number>>>({});
  const lastStamp = useRef("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 320;
    let h = 200;
    let S = 40;   // pixels per world unit, fitted to the panel
    let ox = 0;   // offsets that centre the figure exactly
    let oy = 0;
    let raf = 0;
    let last = performance.now();

    /* Fit the whole scene (coil, floor, every orbit angle) into the panel once per resize,
       so it never clips and never breathes while the user orbits. */
    const fitScene = () => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 24; i++) {
        const cam = camAt((i / 24) * TAU, TILT_REF);
        const take = (theta: number, y: number, rad: number) => {
          const q = project(cam, theta, y, rad);
          const sx = q.x * q.k;
          const sy = q.y * q.k;
          minX = Math.min(minX, sx);
          maxX = Math.max(maxX, sx);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        };
        for (let k = 0; k < 36; k++) take((k / 36) * TAU, yGround, RING_R);
        for (let k = 0; k <= 48; k++) {
          const s = CHAIN_LO + ((CHAIN_HI - CHAIN_LO) * k) / 48;
          take((s / 12) * TAU, yOf(s), RADIUS);
        }
      }
      S = Math.min((w - 28) / Math.max(maxX - minX, 1e-3), (h - 22) / Math.max(maxY - minY, 1e-3));
      ox = -((minX + maxX) / 2) * S;
      oy = ((minY + maxY) / 2) * S;
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(180, r.width);
      h = Math.max(140, r.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fitScene();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const P = props.current;
      const root = P.keyRoot;
      const intervals = P.intervals ?? SCALE;
      if (!drag.current && !reduce) yaw.current += dt * 0.12;

      // ---- live events → pulses, and links that trace the melody along the coil
      if (!P.playing) {
        lastSemi.current = {};
      } else {
        const stamp = P.live.map((n) => `${n.bank}.${n.step}.${n.voice}.${n.degree}`).join("|");
        if (stamp !== lastStamp.current) {
          lastStamp.current = stamp;
          for (const n of P.live) {
            const s = intervals[n.degree % intervals.length];
            const prev = lastSemi.current[n.voice];
            if (prev !== undefined && prev !== s) {
              trails.current.push({ a: prev, b: s, t0: now, vel: n.vel, voice: n.voice });
            }
            lastSemi.current[n.voice] = s;
            pulses.current.push({ d: n.degree, t0: now, vel: n.vel });
          }
          if (trails.current.length > 16) trails.current.splice(0, trails.current.length - 16);
          if (pulses.current.length > 24) pulses.current.splice(0, pulses.current.length - 24);
        }
      }
      pulses.current = pulses.current.filter((p) => now - p.t0 < PULSE_MS);
      trails.current = trails.current.filter((t) => now - t.t0 < TRAIL_MS);

      // ---- camera
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + ox;
      const cy = h / 2 + oy;
      const cam = camAt(yaw.current, tilt.current);
      const screen = (theta: number, y: number, rad: number) => {
        const q = project(cam, theta, y, rad);
        return { x: cx + q.x * S * q.k, y: cy - q.y * S * q.k, z: q.z, k: q.k };
      };
      const angOf = (s: number) => ((root + s) / 12) * TAU; // absolute pitch class
      const at = (s: number) => screen(angOf(s), yOf(s), RADIUS);

      // ---- floor: the twelve pitch classes, with the scale's members lit
      const pcDeg: (number | undefined)[] = new Array(12).fill(undefined);
      for (let d = 0; d < intervals.length; d++) {
        const pc = (root + intervals[d]) % 12;
        if (pcDeg[pc] === undefined) pcDeg[pc] = d;
      }
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const q = screen((k / 72) * TAU, yGround, RING_R);
        if (k === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = "rgba(95,211,196,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let pc = 0; pc < 12; pc++) {
        const q = screen((pc / 12) * TAU, yGround, RING_R);
        const d = pcDeg[pc];
        const dot = d === undefined ? 1.4 : d === 0 ? 2.9 : 2.2;
        const color = d === undefined ? "rgba(139,146,158,0.6)" : d === 0 ? "#f2a03d" : pcColor(d);
        ctx.beginPath();
        ctx.arc(q.x, q.y, dot * q.k, 0, TAU);
        ctx.fillStyle = color;
        ctx.globalAlpha = d === undefined ? 0.7 : 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ---- central axis
      const axisLo = screen(0, yGround, 0);
      const axisHi = screen(0, yOf(CHAIN_HI) + 0.25, 0);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = "rgba(233,229,220,0.13)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisLo.x, axisLo.y);
      ctx.lineTo(axisHi.x, axisHi.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- depth-sorted scene: spine, links and beads interleave correctly
      const items: Drawable[] = [];
      let prev = at(CHAIN_LO);
      for (let i = 1; i <= SPINE_N; i++) {
        const s = CHAIN_LO + ((CHAIN_HI - CHAIN_LO) * i) / SPINE_N;
        const q = at(s);
        const mid = s - (CHAIN_HI - CHAIN_LO) / (2 * SPINE_N);
        const zm = (prev.z + q.z) / 2;
        items.push({
          kind: "spine",
          z: zm,
          x0: prev.x,
          y0: prev.y,
          x1: q.x,
          y1: q.y,
          f: clamp01((1.1 - zm) / 2.2), // 1 = nearest the viewer
          e: overhang(mid),
        });
        prev = q;
      }
      for (const t of trails.current) {
        const age = (now - t.t0) / TRAIL_MS;
        const fade = Math.pow(1 - age, 1.3) * (0.6 + 0.13 * t.vel);
        const col = VOICE_GLOW[t.voice] ?? "#ffffff";
        const seg = Math.max(2, Math.ceil(Math.abs(t.b - t.a) * 3));
        let q0 = at(t.a);
        for (let m = 1; m <= seg; m++) {
          const q1 = at(t.a + ((t.b - t.a) * m) / seg);
          items.push({
            kind: "trail",
            z: (q0.z + q1.z) / 2,
            x0: q0.x,
            y0: q0.y,
            x1: q1.x,
            y1: q1.y,
            a: fade,
            col,
          });
          q0 = q1;
        }
      }
      const hit = [0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of pulses.current) {
        const level = (1 - (now - p.t0) / PULSE_MS) * (0.6 + p.vel * 0.12);
        hit[p.d] = Math.max(hit[p.d], level);
      }
      const nodes = intervals.map((s, d) => {
        const q = at(s);
        const used = (P.usage[d] ?? 0) > 0;
        return { d, q, used, r: (used ? 4.4 : 3.1) * q.k };
      });
      for (const n of nodes) {
        items.push({
          kind: "node",
          z: n.q.z,
          x: n.q.x,
          y: n.q.y,
          r: n.r,
          d: n.d,
          used: n.used,
          col: pcColor(n.d, intervals),
          hit: hit[n.d],
        });
      }
      items.sort((a, b) => b.z - a.z);

      ctx.lineCap = "butt";
      const out: Hit[] = [];
      for (const it of items) {
        if (it.kind === "spine") {
          ctx.beginPath();
          ctx.moveTo(it.x0, it.y0);
          ctx.lineTo(it.x1, it.y1);
          ctx.strokeStyle = rgba("#5fd3c4", (0.03 + it.f * 0.17) * it.e);
          ctx.lineWidth = 3 + it.f * 2.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(it.x0, it.y0);
          ctx.lineTo(it.x1, it.y1);
          ctx.strokeStyle = rgba("#d6f4ee", (0.08 + it.f * 0.42) * it.e);
          ctx.lineWidth = 0.9 + it.f * 1.2;
          ctx.stroke();
        } else if (it.kind === "trail") {
          ctx.beginPath();
          ctx.moveTo(it.x0, it.y0);
          ctx.lineTo(it.x1, it.y1);
          ctx.strokeStyle = rgba(it.col, 0.22 * it.a);
          ctx.lineWidth = 8;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(it.x0, it.y0);
          ctx.lineTo(it.x1, it.y1);
          ctx.strokeStyle = rgba(it.col, 0.95 * it.a);
          ctx.lineWidth = 2.2;
          ctx.stroke();
        } else {
          const rr = it.r * (1 + it.hit * 0.18);
          const glow = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, rr * 3.1);
          glow.addColorStop(0, rgba(it.col, (it.used ? 0.34 : 0.1) + it.hit * 0.25));
          glow.addColorStop(1, rgba(it.col, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(it.x, it.y, rr * 3.1, 0, TAU);
          ctx.fill();
          const bead = ctx.createRadialGradient(it.x - rr * 0.35, it.y - rr * 0.4, rr * 0.1, it.x, it.y, rr);
          bead.addColorStop(0, "rgba(255,255,255,0.97)");
          bead.addColorStop(0.3, it.col);
          bead.addColorStop(1, rgba(it.col, 0.45));
          ctx.globalAlpha = it.used ? 1 : 0.45;
          ctx.fillStyle = bead;
          ctx.beginPath();
          ctx.arc(it.x, it.y, rr, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          out.push({ d: it.d, x: it.x, y: it.y, r: rr + 6 });
        }
      }
      hits.current = out;

      // ---- pulses bloom from the notes that just sounded
      for (const p of pulses.current) {
        const age = (now - p.t0) / PULSE_MS;
        const q = at(intervals[p.d % intervals.length]);
        ctx.beginPath();
        ctx.arc(q.x, q.y, (4 + age * (14 + p.vel * 4)) * q.k, 0, TAU);
        ctx.strokeStyle = rgba(pcColor(p.d, intervals), (1 - age) * 0.8);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // ---- armed and hovered beads
      for (const n of nodes) {
        const armedHere = P.armed === n.d;
        const hoverHere = hover.current === n.d;
        if (!armedHere && !hoverHere) continue;
        ctx.beginPath();
        ctx.arc(n.q.x, n.q.y, n.r + (armedHere ? 5.5 : 4), 0, TAU);
        ctx.strokeStyle = armedHere ? "#f2a03d" : "rgba(233,229,220,0.85)";
        ctx.lineWidth = armedHere ? 1.8 : 1.1;
        ctx.stroke();
      }

      // ---- labels: most important first (armed, hovered, sounding, nearest). Each tries its
      // radial side, then the other side, then above and below. It avoids other labels and other
      // beads, and only accepts a bead clash when nothing else is free. A dark outline keeps the
      // text readable over glows and the coil.
      ctx.font = '600 9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.5;
      const oct = degreeOctave(P.voice);
      const weight = (n: (typeof nodes)[number]) =>
        (P.armed === n.d ? 4 : hover.current === n.d ? 3 : 0) +
        (n.used ? 2 : 0) +
        (1 - clamp01((n.q.z + 1.1) / 2.2));
      const beads = nodes.map((n) => ({
        d: n.d, x0: n.q.x - n.r, y0: n.q.y - n.r, x1: n.q.x + n.r, y1: n.q.y + n.r,
      }));
      const placed: Box[] = [];
      for (const n of [...nodes].sort((a, b) => weight(b) - weight(a))) {
        const text = noteName(root, n.d, oct);
        const tw = text.length * 5.6;
        const dx = n.q.x - cx;
        const dy = n.q.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const off = n.r + 7;
        const spots: { x: number; y: number; align: CanvasTextAlign }[] = [
          { x: n.q.x + ux * off, y: n.q.y + uy * off, align: ux >= 0 ? "left" : "right" },
          { x: n.q.x - ux * off, y: n.q.y - uy * off, align: ux >= 0 ? "right" : "left" },
          { x: n.q.x, y: n.q.y - n.r - 8, align: "center" },
          { x: n.q.x, y: n.q.y + n.r + 8, align: "center" },
        ];
        const boxes = spots.map((s): Box => {
          const left = s.align === "left" ? s.x : s.align === "right" ? s.x - tw : s.x - tw / 2;
          return { x0: left - 2, y0: s.y - 6, x1: left + tw + 2, y1: s.y + 6 };
        });
        let choice = boxes.findIndex(
          (b) => !placed.some((p) => overlaps(b, p)) && !beads.some((o) => o.d !== n.d && overlaps(b, o)),
        );
        if (choice < 0) choice = boxes.findIndex((b) => !placed.some((p) => overlaps(b, p)));
        if (choice < 0) continue;
        placed.push(boxes[choice]);
        const s = spots[choice];
        const near = 1 - clamp01((n.q.z + 1.1) / 2.2);
        ctx.textAlign = s.align;
        ctx.strokeStyle = "rgba(6,9,12,0.9)";
        ctx.strokeText(text, s.x, s.y);
        ctx.fillStyle = rgba(pcColor(n.d, intervals), (n.used ? 0.5 : 0.3) + near * 0.4);
        ctx.fillText(text, s.x, s.y);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* the nearest bead under the pointer, if any */
  const pick = (clientX: number, clientY: number, el: HTMLCanvasElement) => {
    const r = el.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    let best = -1;
    let bestD2 = Infinity;
    for (const h of hits.current) {
      const d2 = (h.x - mx) ** 2 + (h.y - my) ** 2;
      const reach = Math.max(12, h.r);
      if (d2 < reach * reach && d2 < bestD2) {
        bestD2 = d2;
        best = h.d;
      }
    }
    return best;
  };

  return (
    <canvas
      ref={canvasRef}
      role="application"
      aria-label="3D pitch helix — drag to orbit and tilt, click a note to audition and arm it"
      className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, yaw: yaw.current, tilt: tilt.current, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 4) d.moved = true;
          yaw.current = d.yaw + dx * 0.011;
          tilt.current = Math.min(1.1, Math.max(0.08, d.tilt + dy * 0.005));
          return;
        }
        const found = pick(e.clientX, e.clientY, e.currentTarget);
        hover.current = found;
        e.currentTarget.style.cursor = found >= 0 ? "pointer" : "grab";
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        const found = pick(e.clientX, e.clientY, e.currentTarget);
        if (found >= 0) props.current.onPick(found);
      }}
      onPointerLeave={() => {
        if (!drag.current) hover.current = -1;
      }}
      onPointerCancel={() => {
        drag.current = null;
        hover.current = -1;
      }}
    />
  );
}
