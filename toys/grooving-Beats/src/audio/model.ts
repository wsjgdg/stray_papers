/* ------------------------------------------------------------------
   VOLTA-8 · data model, kits, presets, pattern serialization
------------------------------------------------------------------ */

export type TrackId = "kick" | "snare" | "clap" | "chh" | "ohh" | "tom" | "bass" | "stab";

export interface Step {
  /** 0 = off, 1 = ghost, 2 = normal, 3 = accent */
  v: number;
  /** scale degree 0..7 (melodic tracks only) */
  n: number;
}

export type Bank = Record<TrackId, Step[]>;

export interface TrackState {
  gain: number;
  p1: number;
  p2: number;
  mute: boolean;
  solo: boolean;
  /** protected from the DICE randomizer */
  lock: boolean;
  /** stereo pan: -1 (full left) to +1 (full right), 0 = center */
  pan?: number;
  /** reverb send: 0 to 1 */
  rev?: number;
  /** delay send: 0 to 1 */
  dly?: number;
}

export interface FxState {
  /** master lowpass, 0..1 → 200 Hz..18 kHz */
  filter: number;
  /** master delay feedback 0..1 */
  echo: number;
}

export type ScaleId =
  | "pentatonic"
  | "dorian"
  | "aeolian"
  | "phrygian"
  | "major_pent"
  | "blues"
  | "hirajoshi";

export interface ScaleDef {
  id: ScaleId;
  name: string;
  tag: string;
  intervals: number[];
}

export const SCALES: ScaleDef[] = [
  { id: "pentatonic", name: "MINOR PENTATONIC", tag: "soulful · classic groove", intervals: [0, 3, 5, 7, 10, 12, 15, 17] },
  { id: "dorian", name: "DORIAN", tag: "deep house · techno modal", intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
  { id: "aeolian", name: "NATURAL MINOR", tag: "melodic · driving", intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "phrygian", name: "PHRYGIAN", tag: "dark tension · acid · trap", intervals: [0, 1, 3, 5, 7, 8, 10, 12] },
  { id: "major_pent", name: "MAJOR PENTATONIC", tag: "uplifting · bright disco", intervals: [0, 2, 4, 7, 9, 12, 14, 16] },
  { id: "blues", name: "BLUES", tag: "gritty · flat fifth", intervals: [0, 3, 5, 6, 7, 10, 12, 15] },
  { id: "hirajoshi", name: "HIRAJOSHI", tag: "japanese · moody cinematic", intervals: [0, 2, 3, 7, 8, 12, 14, 15] },
];

export const getScale = (id?: string): ScaleDef =>
  SCALES.find((s) => s.id === id) ?? SCALES[0];

export interface MachineState {
  bpm: number;
  swing: number;
  master: number;
  keyRoot: number;
  chain: boolean;
  bankIndex: number;
  steps: 16 | 32;
  scaleId?: ScaleId;
  fx: FxState;
  banks: Bank[];
  tracks: Record<TrackId, TrackState>;
}

export interface TrackDef {
  id: TrackId;
  name: string;
  code: string;
  color: string;
  melodic: boolean;
  key: string;
  p1Label: string;
  p2Label: string;
  p1Fmt: (v: number) => string;
  p2Fmt: (v: number) => string;
  defaults: { gain: number; p1: number; p2: number };
}

const pct = (v: number) => `${Math.round(v * 100)}`;
const hz = (lo: number, hi: number) => (v: number) =>
  `${Math.round(lo + (hi - lo) * v) >= 1000 ? ((lo + (hi - lo) * v) / 1000).toFixed(1) + "k" : Math.round(lo + (hi - lo) * v)}`;
const ms = (lo: number, hi: number) => (v: number) => `${Math.round(lo + (hi - lo) * v)}`;

export const TRACKS: TrackDef[] = [
  {
    id: "kick", name: "KICK", code: "BD", color: "#F2A03D", melodic: false, key: "Q",
    p1Label: "TUNE", p2Label: "DECAY", p1Fmt: hz(38, 74), p2Fmt: ms(180, 930),
    defaults: { gain: 0.9, p1: 0.32, p2: 0.44 },
  },
  {
    id: "snare", name: "SNARE", code: "SD", color: "#FF6F59", melodic: false, key: "W",
    p1Label: "TONE", p2Label: "SNAP", p1Fmt: hz(1100, 3600), p2Fmt: ms(80, 330),
    defaults: { gain: 0.72, p1: 0.42, p2: 0.38 },
  },
  {
    id: "clap", name: "CLAP", code: "CP", color: "#FF9AA2", melodic: false, key: "E",
    p1Label: "TONE", p2Label: "TAIL", p1Fmt: hz(800, 2100), p2Fmt: ms(120, 420),
    defaults: { gain: 0.66, p1: 0.45, p2: 0.34 },
  },
  {
    id: "chh", name: "CL HAT", code: "CH", color: "#5FD3C4", melodic: false, key: "R",
    p1Label: "TONE", p2Label: "DECAY", p1Fmt: hz(6000, 11000), p2Fmt: ms(20, 110),
    defaults: { gain: 0.5, p1: 0.5, p2: 0.28 },
  },
  {
    id: "ohh", name: "OP HAT", code: "OH", color: "#3FB8C9", melodic: false, key: "T",
    p1Label: "TONE", p2Label: "DECAY", p1Fmt: hz(5000, 9500), p2Fmt: ms(140, 640),
    defaults: { gain: 0.44, p1: 0.46, p2: 0.34 },
  },
  {
    id: "tom", name: "TOM", code: "LT", color: "#C08BE8", melodic: false, key: "Y",
    p1Label: "TUNE", p2Label: "DECAY", p1Fmt: hz(96, 260), p2Fmt: ms(180, 580),
    defaults: { gain: 0.5, p1: 0.36, p2: 0.4 },
  },
  {
    id: "bass", name: "BASS", code: "BA", color: "#8FD14F", melodic: true, key: "U",
    p1Label: "CUTOFF", p2Label: "GATE", p1Fmt: hz(220, 3000), p2Fmt: pct,
    defaults: { gain: 0.78, p1: 0.3, p2: 0.42 },
  },
  {
    id: "stab", name: "STAB", code: "ST", color: "#7FA8FF", melodic: true, key: "I",
    p1Label: "CUTOFF", p2Label: "SPACE", p1Fmt: hz(500, 5200), p2Fmt: pct,
    defaults: { gain: 0.44, p1: 0.46, p2: 0.4 },
  },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, TrackDef>;

export const VELOCITY = [0, 0.46, 0.78, 1];
/** Default minor pentatonic scale */
export const SCALE = SCALES[0].intervals;
export const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const KEYS = [0, 2, 3, 4, 5, 7, 8, 10];

export const DEFAULT_PAN: Record<TrackId, number> = {
  kick: 0,
  snare: -0.08,
  clap: 0.14,
  chh: 0.24,
  ohh: -0.26,
  tom: -0.34,
  bass: 0,
  stab: 0.2,
};

export const DEFAULT_REV: Record<TrackId, number> = {
  kick: 0,
  snare: 0.14,
  clap: 0.24,
  chh: 0.05,
  ohh: 0.08,
  tom: 0.16,
  bass: 0,
  stab: 0.28,
};

export const DEFAULT_DLY: Record<TrackId, number> = {
  kick: 0,
  snare: 0.04,
  clap: 0.08,
  chh: 0.02,
  ohh: 0.06,
  tom: 0.12,
  bass: 0,
  stab: 0.22,
};

export const noteName = (root: number, degree: number, octave = 2, intervals: number[] = SCALE) => {
  const midi = 12 * (octave + 1) + root + intervals[degree % intervals.length];
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
};

/* ------------------------ sequencer row transforms ------------------------ */

/** Standard Euclidean rhythm generator (Bjorklund algorithm) */
export function euclideanPattern(pulses: number, steps: number): boolean[] {
  if (pulses <= 0) return new Array(steps).fill(false);
  if (pulses >= steps) return new Array(steps).fill(true);
  const pattern = new Array(steps).fill(false);
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[i] = true;
    }
  }
  return pattern;
}

/** Rotate row left (< 0) or right (> 0) with wrap-around */
export function shiftRow(steps: Step[], offset: number): Step[] {
  const len = steps.length;
  if (len === 0) return [];
  const shift = ((offset % len) + len) % len;
  return Array.from({ length: len }, (_, i) => ({ ...steps[(i - shift + len) % len] }));
}

/** Invert hits (turn off active steps, turn on silent steps) */
export function invertRow(steps: Step[]): Step[] {
  return steps.map((s) => ({ ...s, v: s.v === 0 ? 2 : 0 }));
}

/** Reverse step order */
export function reverseRow(steps: Step[]): Step[] {
  return [...steps].reverse().map((s) => ({ ...s }));
}

export const emptyStep = (): Step => ({ v: 0, n: 0 });

export const emptyBank = (steps = 16): Bank =>
  Object.fromEntries(TRACK_IDS.map((id) => [id, Array.from({ length: steps }, emptyStep)])) as Bank;

export const cloneBank = (b: Bank): Bank =>
  Object.fromEntries(TRACK_IDS.map((id) => [id, b[id].map((s) => ({ ...s }))])) as Bank;

/** grow by tiling, shrink by truncating — used by the 16/32 length switch */
export const resizeBank = (b: Bank, steps: number): Bank =>
  Object.fromEntries(
    TRACK_IDS.map((id) => {
      const row = b[id];
      if (row.length === steps) return [id, row];
      if (row.length > steps) return [id, row.slice(0, steps)];
      const out = row.slice();
      while (out.length < steps) out.push({ ...row[out.length % row.length] });
      return [id, out];
    }),
  ) as Bank;

export const bankSteps = (b: Bank): number => b[TRACK_IDS[0]]?.length ?? 16;

/* ---------------------------- presets ---------------------------- */

interface PresetDef {
  name: string;
  tag: string;
  bpm: number;
  swing: number;
  keyRoot: number;
  rows: Partial<Record<TrackId, [string, string?]>>;
  tweaks?: Partial<Record<TrackId, Partial<{ gain: number; p1: number; p2: number }>>>;
}

const PRESET_DEFS: PresetDef[] = [
  {
    name: "DEEP HOUSE", tag: "124 · warm 4/4", bpm: 124, swing: 0.08, keyRoot: 5,
    rows: {
      kick: ["X---x---X---x---"],
      clap: ["----X-------X---"],
      chh: ["x.x.x.x.x.x.x.x."],
      ohh: ["--X---X---X---X-"],
      bass: ["--x--x-X--x--x-x", "--0--0-0--3--2-0"],
      stab: ["----x--x-----x--", "----0--2-----4--"],
    },
    tweaks: { bass: { p1: 0.26, p2: 0.36 }, stab: { p1: 0.4, p2: 0.5 } },
  },
  {
    name: "TRAP SOUL", tag: "140 · half-time", bpm: 140, swing: 0, keyRoot: 3,
    rows: {
      kick: ["X-----x--X------"],
      snare: ["--------X-------"],
      clap: ["--------X-------"],
      chh: ["x-x-xxx-x-x-xxxx"],
      ohh: ["----------X-----"],
      tom: ["-------------x--"],
      bass: ["X-----x--X------", "0-----0--3------"],
      stab: ["X-----------x---", "0-----------2---"],
    },
    tweaks: { kick: { p1: 0.18, p2: 0.66 }, chh: { gain: 0.4 }, stab: { p2: 0.62 } },
  },
  {
    name: "BOOM BAP", tag: "90 · dusty swing", bpm: 90, swing: 0.2, keyRoot: 5,
    rows: {
      kick: ["X------x--x-----"],
      snare: ["----X------.X---"],
      chh: ["x.x.x.xxx.x.x.xx"],
      ohh: ["------x-------x-"],
      bass: ["X------x--x-----", "0------3--2-----"],
      stab: ["----x-------x-x-", "----0-------3-2-"],
    },
    tweaks: { snare: { p1: 0.3, p2: 0.3 }, chh: { p1: 0.34 }, stab: { p1: 0.3, p2: 0.46 } },
  },
  {
    name: "ACID TECHNO", tag: "134 · driving", bpm: 134, swing: 0, keyRoot: 7,
    rows: {
      kick: ["X---X---X---X---"],
      clap: ["----x-------x---"],
      chh: ["--x---x---x---x-"],
      ohh: ["--------------X-"],
      tom: ["-----------x----"],
      bass: ["X-xxx-xx-x-xxx-x", "0-010-03-0-057-0"],
      stab: ["------x-------x-", "------0-------3-"],
    },
    tweaks: { kick: { p2: 0.34 }, bass: { p1: 0.44, p2: 0.2, gain: 0.84 }, stab: { p2: 0.55 } },
  },
  {
    name: "BROKEN BEAT", tag: "86 · syncopated", bpm: 86, swing: 0.12, keyRoot: 2,
    rows: {
      kick: ["X-----x------x--"],
      snare: ["----X------X----"],
      chh: ["x-xxx-x-xx-xx-x-"],
      ohh: ["--------x-------"],
      tom: ["----------x-----"],
      bass: ["X-----x------x--", "0-----4------2--"],
      stab: ["---x-----x------", "---0-----3------"],
    },
    tweaks: { bass: { p1: 0.34 }, stab: { p1: 0.52 } },
  },
  {
    name: "AFRO HOUSE", tag: "122 · polyrhythm", bpm: 122, swing: 0.12, keyRoot: 2,
    rows: {
      kick: ["X-----X---X-----"],
      snare: ["..x...x...x...x."],
      clap: ["----X-------X---"],
      chh: ["x.x.x.x.x.x.x.x."],
      ohh: ["--x---x---x---x-"],
      tom: ["-x--x--x-x--x--x"],
      bass: ["X--x--X---x--x--", "0--0--3---2--4--"],
      stab: ["--x---x---x---x-", "--0---2---4---2-"],
    },
    tweaks: { tom: { p1: 0.55, gain: 0.4 }, snare: { gain: 0.4 } },
  },
  {
    name: "LOFI CHILL", tag: "78 · laid back", bpm: 78, swing: 0.24, keyRoot: 4,
    rows: {
      kick: ["X------x--x-----"],
      snare: ["----X------.X---"],
      chh: ["x.-.x.-.x.-.x.-."],
      ohh: ["------------x---"],
      bass: ["X------x--x-----", "0------5--3-----"],
      stab: ["--------x-------", "--------1-------"],
    },
    tweaks: { kick: { p2: 0.56 }, chh: { p1: 0.24, gain: 0.4 }, stab: { p1: 0.24, p2: 0.6 } },
  },
];

const CHAR_TO_V: Record<string, number> = { "-": 0, ".": 1, x: 2, X: 3 };

function parseRow(pat: string, pitches?: string, steps = 16): Step[] {
  return Array.from({ length: steps }, (_, i) => {
    const j = i % 16;
    const v = CHAR_TO_V[pat[j] ?? "-"] ?? 0;
    const p = pitches?.[j] ?? "-";
    return { v, n: p === "-" ? 0 : Math.min(7, Math.max(0, parseInt(p, 10) || 0)) };
  });
}

/** deterministic PRNG so variations are stable between reloads */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function variation(base: Bank, mode: 1 | 2 | 3, seed: number, steps = 16): Bank {
  const r = rng(seed);
  const b = cloneBank(base);
  const fillFrom = steps - 4;
  for (const def of TRACKS) {
    const row = b[def.id];
    for (let i = 0; i < steps; i++) {
      const s = row[i];
      if (mode === 1) {
        // B · subtle variation
        if (s.v && r() < 0.12) s.v = s.v === 3 ? 2 : 3;
        if (!s.v && (def.id === "chh" || def.id === "tom") && r() < 0.1) s.v = 1;
        if (!s.v && def.id === "kick" && i >= fillFrom && r() < 0.22) s.v = 2;
      } else if (mode === 2) {
        // C · breakdown, drums thin out
        if (def.id === "kick" && i % 4 !== 0) s.v = 0;
        if (def.id === "kick" && i % 8 === 4) s.v = 0;
        if ((def.id === "chh" || def.id === "snare") && r() < 0.45) s.v = 0;
        if (def.id === "stab" && !s.v && i % 8 === 0) { s.v = 2; s.n = 2; }
        if (def.id === "ohh" && r() < 0.5) s.v = 0;
      } else {
        // D · fill
        if (i >= fillFrom && (def.id === "snare" || def.id === "tom") && r() < 0.7) s.v = r() < 0.5 ? 3 : 2;
        if (def.id === "chh" && i >= steps / 2) s.v = i % 2 === 0 ? 2 : 1;
        if (def.id === "kick" && i === steps - 2) s.v = 3;
      }
    }
  }
  return b;
}

export interface Preset {
  name: string;
  tag: string;
  state: Pick<MachineState, "bpm" | "swing" | "keyRoot" | "banks" | "tracks">;
}

export const defaultTracks = (): Record<TrackId, TrackState> =>
  Object.fromEntries(
    TRACKS.map((t) => [
      t.id,
      {
        ...t.defaults,
        mute: false,
        solo: false,
        lock: false,
        pan: DEFAULT_PAN[t.id],
        rev: DEFAULT_REV[t.id],
        dly: DEFAULT_DLY[t.id],
      },
    ]),
  ) as Record<TrackId, TrackState>;

export const PRESETS: Preset[] = PRESET_DEFS.map((p, pi) => {
  const a = emptyBank(16);
  for (const def of TRACKS) {
    const row = p.rows[def.id];
    if (row) a[def.id] = parseRow(row[0], row[1], 16);
  }
  const tracks = defaultTracks();
  if (p.tweaks) {
    for (const id of Object.keys(p.tweaks) as TrackId[]) Object.assign(tracks[id], p.tweaks[id]);
  }
  const seed = 1337 + pi * 977;
  return {
    name: p.name,
    tag: p.tag,
    state: {
      bpm: p.bpm,
      swing: p.swing,
      keyRoot: p.keyRoot,
      banks: [a, variation(a, 1, seed, 16), variation(a, 2, seed + 31, 16), variation(a, 3, seed + 71, 16)],
      tracks,
    },
  };
});

/* ------------------------- smart randomizer ------------------------- */

const WEIGHTS: Record<TrackId, number[]> = {
  kick: [1, 0.02, 0.05, 0.06, 0.14, 0.05, 0.22, 0.08, 0.5, 0.04, 0.1, 0.08, 0.14, 0.06, 0.16, 0.1],
  snare: [0.02, 0.03, 0.06, 0.04, 0.95, 0.04, 0.06, 0.08, 0.05, 0.04, 0.08, 0.06, 0.9, 0.05, 0.08, 0.12],
  clap: [0.02, 0.02, 0.04, 0.03, 0.7, 0.03, 0.04, 0.05, 0.04, 0.03, 0.05, 0.04, 0.7, 0.04, 0.06, 0.08],
  chh: [0.9, 0.25, 0.7, 0.3, 0.8, 0.28, 0.72, 0.34, 0.85, 0.25, 0.7, 0.32, 0.8, 0.3, 0.75, 0.4],
  ohh: [0.05, 0.04, 0.5, 0.05, 0.06, 0.05, 0.3, 0.06, 0.05, 0.05, 0.45, 0.06, 0.06, 0.06, 0.4, 0.1],
  tom: [0.05, 0.06, 0.1, 0.08, 0.05, 0.1, 0.12, 0.1, 0.05, 0.08, 0.12, 0.12, 0.06, 0.14, 0.16, 0.18],
  bass: [0.9, 0.06, 0.25, 0.14, 0.2, 0.16, 0.4, 0.12, 0.45, 0.08, 0.28, 0.14, 0.22, 0.16, 0.3, 0.16],
  stab: [0.2, 0.04, 0.18, 0.06, 0.35, 0.05, 0.2, 0.12, 0.15, 0.05, 0.25, 0.06, 0.3, 0.08, 0.18, 0.1],
};

const DEGREE_POOL = [0, 0, 0, 2, 3, 4, 1, 5];

export function randomBank(density: number, seed = Date.now(), steps = 16): Bank {
  const r = rng(seed);
  const b = emptyBank(steps);
  const root = 0;
  for (const def of TRACKS) {
    for (let i = 0; i < steps; i++) {
      const chance = WEIGHTS[def.id][i % 16] * density;
      if (r() < chance) {
        const roll = r();
        b[def.id][i] = {
          v: roll < 0.16 ? 1 : roll < 0.78 ? 2 : 3,
          n: def.melodic ? (i === 0 ? root : DEGREE_POOL[Math.floor(r() * DEGREE_POOL.length)]) : 0,
        };
      }
    }
  }
  return b;
}

/* --------------------------- serialization --------------------------- */

const A32 = "0123456789abcdefghijklmnopqrstuv";
const q32 = (v: number) => A32[Math.max(0, Math.min(31, Math.round(v * 31)))];
const unq32 = (c: string) => Math.max(0, A32.indexOf(c)) / 31;

export function encodeState(s: MachineState): string {
  const steps = s.steps || 16;
  const scaleIdx = Math.max(0, SCALES.findIndex((sc) => sc.id === s.scaleId));
  const head = [
    Math.round(s.bpm),
    Math.round(s.swing * 100),
    s.keyRoot,
    s.chain ? 1 : 0,
    s.bankIndex,
    Math.round(s.master * 100),
    steps,
    Math.round(s.fx.filter * 100),
    Math.round(s.fx.echo * 100),
    scaleIdx,
  ].join("-");
  let body = "";
  for (const id of TRACK_IDS) {
    const t = s.tracks[id];
    // 7 chars per track: gain, p1, p2, mute, then pan / reverb send / delay send
    const pan = t.pan !== undefined ? t.pan : DEFAULT_PAN[id];
    const rev = t.rev !== undefined ? t.rev : DEFAULT_REV[id];
    const dly = t.dly !== undefined ? t.dly : DEFAULT_DLY[id];
    body +=
      q32(t.gain) + q32(t.p1) + q32(t.p2) + (t.mute ? "1" : "0") +
      q32((pan + 1) / 2) + q32(rev) + q32(dly);
  }
  for (const bank of s.banks) {
    for (const id of TRACK_IDS) {
      for (let i = 0; i < steps; i++) {
        const st = bank[id][i] ?? { v: 0, n: 0 };
        body += A32[Math.min(31, st.v * 8 + st.n)];
      }
    }
  }
  return `${head}~${body}`;
}

export function decodeState(str: string): MachineState | null {
  try {
    const [head, body] = str.split("~");
    const h = head.split("-").map(Number);
    if (h.length < 6 || !body) return null;
    const steps = h.length > 6 && h[6] === 32 ? 32 : 16;
    // v2 track block carries pan/rev/dly (7 chars per track); v1 carried 4.
    // Decide by exact length so a truncated or padded string cannot be misread.
    const stepChars = 4 * 8 * steps;
    const perTrack = body.length === 56 + stepChars ? 7 : 4;
    if (body.length !== perTrack * 8 + stepChars) return null;
    const tracks = defaultTracks();
    let i = 0;
    for (const id of TRACK_IDS) {
      const base: TrackState = {
        gain: unq32(body[i++]), p1: unq32(body[i++]), p2: unq32(body[i++]),
        mute: body[i++] === "1", solo: false, lock: false,
        pan: DEFAULT_PAN[id], rev: DEFAULT_REV[id], dly: DEFAULT_DLY[id],
      };
      if (perTrack === 7) {
        base.pan = Math.max(-1, Math.min(1, unq32(body[i++]) * 2 - 1));
        base.rev = unq32(body[i++]);
        base.dly = unq32(body[i++]);
      }
      tracks[id] = base;
    }
    const banks: Bank[] = [];
    for (let b = 0; b < 4; b++) {
      const bank = emptyBank(steps);
      for (const id of TRACK_IDS) {
        for (let s = 0; s < steps; s++) {
          const code = Math.max(0, A32.indexOf(body[i++]));
          bank[id][s] = { v: Math.min(3, code >> 3), n: code & 7 };
        }
      }
      banks.push(bank);
    }
    return {
      bpm: Math.min(200, Math.max(50, h[0])),
      swing: Math.min(0.6, Math.max(0, h[1] / 100)),
      keyRoot: Math.min(11, Math.max(0, h[2])),
      chain: h[3] === 1,
      bankIndex: Math.min(3, Math.max(0, h[4])),
      master: Math.min(1, Math.max(0, h[5] / 100)),
      steps,
      scaleId: h.length > 9 && SCALES[h[9]] ? SCALES[h[9]].id : "pentatonic",
      fx: {
        filter: h.length > 7 ? Math.min(1, Math.max(0, h[7] / 100)) : 1,
        echo: h.length > 8 ? Math.min(1, Math.max(0, h[8] / 100)) : 0.36,
      },
      banks,
      tracks,
    };
  } catch {
    return null;
  }
}

export const initialState = (): MachineState => ({
  ...PRESETS[0].state,
  banks: PRESETS[0].state.banks.map(cloneBank),
  tracks: Object.fromEntries(
    TRACKS.map((t) => [t.id, { ...defaultTracks()[t.id], ...PRESETS[0].state.tracks[t.id] }]),
  ) as Record<TrackId, TrackState>,
  master: 0.82,
  chain: false,
  bankIndex: 0,
  steps: 16,
  scaleId: "pentatonic",
  fx: { filter: 1, echo: 0.36 },
});

export const BANK_LABELS = ["A", "B", "C", "D"];
export const BANK_ROLES = ["MAIN", "VAR", "BREAK", "FILL"];