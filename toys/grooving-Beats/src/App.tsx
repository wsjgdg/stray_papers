import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Square, Circle, Link2, Keyboard, Download, X, Copy, Trash2, Dices,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Repeat, Check, Undo2, Redo2,
  Zap, Rewind, FileAudio, FolderArchive, HardDrive,
} from "lucide-react";
import { Engine, filterHz } from "@/audio/engine";
import { renderLoopToWav, renderStemsToZip } from "@/audio/render";
import {
  Bank, BANK_LABELS, BANK_ROLES, KEYS, MachineState, NOTE_NAMES, PRESETS, Step, TRACKS, TrackId, TrackState,
  cloneBank, decodeState, emptyBank, encodeState, initialState, noteName, randomBank, resizeBank,
  getScale,
} from "@/audio/model";
import { Knob } from "@/components/Knob";
import { DbReadout, Meter, Scope, ScopeMode } from "@/components/Scope";
import { Sequencer } from "@/components/Sequencer";
import { Harmony, LiveNote, degreeOctave } from "@/components/Harmony";
import { ProjectModal } from "@/components/ProjectModal";
import { Backdrop, BootScreen, HelpDialog, Module, Toast } from "@/components/Shell";
import { cn } from "@/utils/cn";

const STORAGE_KEY = "volta8.pattern.v1";

function loadInitial(): MachineState {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash.startsWith("p=")) {
      const s = decodeState(decodeURIComponent(hash.slice(2)));
      if (s) return s;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = decodeState(raw);
      if (s) return s;
    }
  } catch {
    /* storage unavailable — fall through */
  }
  return initialState();
}

function ClipboardPasteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState<MachineState>(loadInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const engineRef = useRef<Engine | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [booted, setBooted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ step: -1, bank: 0 });
  const [selected, setSelected] = useState<TrackId>("kick");
  const [presetName, setPresetName] = useState(PRESETS[0].name);
  const [density, setDensity] = useState(0.8);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [take, setTake] = useState<{ url: string; name: string; size: number } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderingStems, setRenderingStems] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("hybrid");
  const [stutterOn, setStutterOn] = useState(false);
  const [armedDegree, setArmedDegree] = useState<number | null>(null);
  const [tapeOn, setTapeOn] = useState(false);
  const rowClip = useRef<{ id: TrackId; row: Step[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const toastTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const activeBank = state.chain && playing ? pos.bank : state.bankIndex;

  /* ------------------------------- engine ------------------------------- */

  const power = useCallback(async () => {
    if (engineRef.current) return;
    const eng = new Engine(() => stateRef.current);
    await eng.resume();
    eng.onRecorded = (blob, ext) => {
      const name = `volta8-${Math.round(stateRef.current.bpm)}bpm-${new Date()
        .toISOString()
        .slice(11, 19)
        .replace(/:/g, "")}.${ext}`;
      setTake((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name, size: blob.size };
      });
      flash("Take captured — ready to download");
    };
    engineRef.current = eng;
    setEngine(eng);
    setLeaving(true);
    window.setTimeout(() => setBooted(true), 620);
    eng.start();
    setPlaying(true);
  }, [flash]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  const toggle = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) { void power(); return; }
    if (eng.playing) {
      eng.stop();
      setPlaying(false);
      setPos({ step: -1, bank: stateRef.current.bankIndex });
    } else {
      void eng.resume();
      eng.start();
      setPlaying(true);
    }
  }, [power]);

  // live master level (also applies while stopped)
  useEffect(() => {
    engine?.setMaster(state.master);
  }, [engine, state.master]);

  // playhead sync
  useEffect(() => {
    if (!engine || !playing) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = engine.current();
      setPos((p) => (p.step === c.step && p.bank === c.bank ? p : { step: c.step, bank: c.bank }));
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [engine, playing]);

  // drive the ambient backdrop glow from the live output level
  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const l = engine.readLevel().rms;
      document.documentElement.style.setProperty("--lvl", String(Math.min(1, l * 4)));
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // pressing 1–4 mid-performance jumps the machine to that bank's downbeat
  useEffect(() => {
    engineRef.current?.jumpTo(state.bankIndex);
  }, [state.bankIndex]);

  /* ----------------------------- persistence ----------------------------- */

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, encodeState(state));
        setSavedAt(Date.now());
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [state]);

  /* -------------------------------- edits -------------------------------- */

  const patch = useCallback((p: Partial<MachineState>) => setState((s) => ({ ...s, ...p })), []);

  /* ------------------------------- history ------------------------------- */

  const hist = useRef<{ past: Bank[][]; future: Bank[][]; kind: string; at: number }>({
    past: [], future: [], kind: "", at: 0,
  });
  const [histSize, setHistSize] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHistSize({ undo: hist.current.past.length, redo: hist.current.future.length });

  const snapshot = useCallback((kind: string) => {
    const h = hist.current;
    const now = performance.now();
    // coalesce rapid edits of the same kind (drag-painting) into one undo step
    if (kind === "step" && h.kind === "step" && now - h.at < 450) { h.at = now; return; }
    h.past.push(stateRef.current.banks);
    if (h.past.length > 40) h.past.shift();
    h.future = [];
    h.kind = kind;
    h.at = now;
    setHistSize({ undo: h.past.length, redo: 0 });
  }, []);

  const undo = useCallback(() => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(stateRef.current.banks);
    h.kind = "";
    setState((s) => ({ ...s, banks: prev }));
    syncHist();
    flash("Undo");
  }, [flash]);

  const redo = useCallback(() => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(stateRef.current.banks);
    h.kind = "";
    setState((s) => ({ ...s, banks: next }));
    syncHist();
    flash("Redo");
  }, [flash]);

  const setStep = useCallback(
    (id: TrackId, i: number, next: Step) => {
      snapshot("step");
      setState((s) => {
        const bi = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
        const banks = s.banks.slice();
        const bank = cloneBank(banks[bi]);
        bank[id][i] = next;
        banks[bi] = bank;
        return { ...s, banks };
      });
    },
    [pos.bank, snapshot],
  );

  const setTrack = useCallback((id: TrackId, p: Partial<TrackState>) => {
    setState((s) => ({ ...s, tracks: { ...s.tracks, [id]: { ...s.tracks[id], ...p } } }));
  }, []);

  const audition = useCallback((id: TrackId, n = 0) => {
    engineRef.current?.audition(id, n);
  }, []);

  const mutateBank = useCallback(
    (fn: (b: ReturnType<typeof cloneBank>) => ReturnType<typeof cloneBank>, bi?: number) => {
      setState((s) => {
        const idx = bi ?? s.bankIndex;
        const banks = s.banks.slice();
        banks[idx] = fn(cloneBank(banks[idx]));
        return { ...s, banks };
      });
    },
    [],
  );

  const clearBank = useCallback(() => {
    snapshot("clear");
    mutateBank(() => emptyBank(), activeBank);
    flash(`Bank ${BANK_LABELS[activeBank]} cleared — ⌘Z to undo`);
  }, [activeBank, mutateBank, flash, snapshot]);

  const generate = useCallback(() => {
    snapshot("dice");
    setState((s) => {
      const idx = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
      const steps = s.steps || 16;
      const fresh = randomBank(density, Date.now(), steps);
      const banks = s.banks.slice();
      const bank = cloneBank(banks[idx]);
      for (const def of TRACKS) {
        // locked tracks keep their pattern
        if (!s.tracks[def.id].lock) bank[def.id] = fresh[def.id].map((x) => ({ ...x }));
      }
      banks[idx] = bank;
      return { ...s, banks };
    });
    flash(`New pattern generated in bank ${BANK_LABELS[activeBank]}`);
  }, [activeBank, density, flash, snapshot, pos.bank]);

  const copyBank = useCallback(() => {
    snapshot("copy");
    const target = (activeBank + 1) % 4;
    setState((s) => {
      const banks = s.banks.slice();
      banks[target] = cloneBank(banks[activeBank]);
      return { ...s, banks, bankIndex: target };
    });
    flash(`Bank ${BANK_LABELS[activeBank]} copied to ${BANK_LABELS[target]}`);
  }, [activeBank, flash, snapshot]);

  const setSteps = useCallback(
    (n: 16 | 32) => {
      setState((s) => {
        if ((s.steps || 16) === n) return s;
        return { ...s, steps: n, banks: s.banks.map((b) => resizeBank(b, n)) };
      });
      flash(`Pattern length ${n} steps`);
    },
    [flash],
  );

  const copyRow = useCallback(() => {
    rowClip.current = { id: selected, row: stateRef.current.banks[activeBank][selected].map((x) => ({ ...x })) };
    flash(`${TRACKS.find((t) => t.id === selected)?.name} row copied (Ctrl+V to paste)`);
  }, [selected, activeBank, flash]);

  const pasteRow = useCallback(() => {
    const clip = rowClip.current;
    if (!clip) { flash("Nothing copied yet — Ctrl+C on a selected row first"); return; }
    snapshot("paste");
    setState((s) => {
      const idx = activeBank;
      const steps = s.steps || 16;
      const banks = s.banks.slice();
      const bank = cloneBank(banks[idx]);
      const row = clip.row.slice(0, steps);
      while (row.length < steps) row.push({ ...clip.row[row.length % clip.row.length] });
      bank[selected] = row;
      banks[idx] = bank;
      return { ...s, banks };
    });
    flash(`Pasted ${TRACKS.find((t) => t.id === clip.id)?.name} row into ${TRACKS.find((t) => t.id === selected)?.name}`);
  }, [selected, activeBank, flash, snapshot]);

  const clearRow = useCallback(() => {
    const name = TRACKS.find((t) => t.id === selected)?.name ?? "row";
    snapshot("rowclear");
    setState((s) => {
      const idx = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
      const banks = s.banks.slice();
      const bank = cloneBank(banks[idx]);
      bank[selected] = bank[selected].map((st) => ({ ...st, v: 0 }));
      banks[idx] = bank;
      return { ...s, banks };
    });
    flash(`${name} row cleared — ⌘Z to undo`);
  }, [selected, pos.bank, flash, snapshot]);

  /** whole-row replacement used by nudge / euclidean / invert / reverse */
  const replaceRow = useCallback(
    (id: TrackId, newRow: Step[]) => {
      snapshot("rowtool");
      setState((s) => {
        const idx = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
        const banks = s.banks.slice();
        const bank = cloneBank(banks[idx]);
        bank[id] = newRow.map((x) => ({ ...x }));
        banks[idx] = bank;
        return { ...s, banks };
      });
    },
    [pos.bank, snapshot],
  );

  const transposeRow = useCallback(
    (dir: number) => {
      const def = TRACKS.find((t) => t.id === selected);
      if (!def?.melodic) { flash("Transpose only works on BASS / STAB"); return; }
      snapshot("transpose");
      setState((s) => {
        const idx = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
        const banks = s.banks.slice();
        const bank = cloneBank(banks[idx]);
        bank[selected] = bank[selected].map((st) => ({
          ...st,
          n: st.v ? (st.n + dir + 8) % 8 : st.n,
        }));
        banks[idx] = bank;
        return { ...s, banks };
      });
      flash(`${def.name} row transposed ${dir > 0 ? "up" : "down"}`);
    },
    [selected, pos.bank, flash, snapshot],
  );

  const shiftKey = useCallback((dir: number) => {
    setState((s) => ({
      ...s,
      keyRoot: KEYS[(KEYS.indexOf(s.keyRoot) + dir + KEYS.length) % KEYS.length],
    }));
  }, []);

  const setScale = useCallback(
    (id: MachineState["scaleId"]) => {
      patch({ scaleId: id });
      const sc = getScale(id);
      flash(`${sc.name} — ${sc.tag}`);
    },
    [patch, flash],
  );

  const armDegree = useCallback((d: number) => {
    setArmedDegree((prev) => (prev === d ? null : d));
  }, []);

  const melodyDice = useCallback(() => {
    snapshot("melody");
    setState((s) => {
      const idx = s.chain && engineRef.current?.playing ? pos.bank : s.bankIndex;
      const banks = s.banks.slice();
      const bank = cloneBank(banks[idx]);
      for (const id of ["bass", "stab"] as const) {
        if (s.tracks[id].lock) continue;
        let last = 0;
        bank[id] = bank[id].map((st, i) => {
          if (st.v === 0) return st;
          const r = Math.random();
          let n: number;
          if (i % 8 === 0 && r < 0.5) n = 0;                       // land on the root
          else if (r < 0.16) n = 0;
          else if (r < 0.52) n = Math.max(0, last - 1);             // step down
          else if (r < 0.86) n = Math.min(7, last + 1);             // step up
          else n = Math.floor(Math.random() * 8);                   // leap
          last = n;
          return { ...st, n };
        });
      }
      banks[idx] = bank;
      return { ...s, banks };
    });
    const s = stateRef.current;
    flash(`New melody in ${NOTE_NAMES[s.keyRoot]} ${getScale(s.scaleId).name.toLowerCase()}`);
  }, [pos.bank, flash, snapshot]);

  const exportWav = useCallback(async () => {
    if (rendering) return;
    setRendering(true);
    flash("Rendering loop to WAV…");
    try {
      const s = stateRef.current;
      const bars = s.chain ? 4 : 4;
      const blob = await renderLoopToWav(s, bars);
      const name = `volta8-loop-${Math.round(s.bpm)}bpm-${s.steps || 16}st.wav`;
      setTake((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name, size: blob.size };
      });
      flash("WAV loop rendered — check the take panel");
    } catch {
      flash("Offline rendering unavailable — use Record instead");
    }
    setRendering(false);
  }, [rendering, flash]);

  const exportStems = useCallback(async () => {
    if (renderingStems) return;
    setRenderingStems(true);
    flash("Rendering 8 audio stems to ZIP…");
    try {
      const s = stateRef.current;
      const blob = await renderStemsToZip(s, 4);
      const name = `volta8-stems-${Math.round(s.bpm)}bpm-${s.steps || 16}st.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      flash("8 studio stems exported to ZIP!");
    } catch {
      flash("Stem export unavailable — try WAV loop instead");
    }
    setRenderingStems(false);
  }, [renderingStems, flash]);

  const toggleStutter = useCallback(() => {
    setStutterOn((v) => {
      engineRef.current?.setStutter(!v);
      return !v;
    });
  }, []);

  const tape = useCallback((on: boolean) => {
    setTapeOn(on);
    engineRef.current?.setTape(on);
  }, []);

  const loadPreset = useCallback(
    (i: number) => {
      const p = PRESETS[i];
      snapshot("preset");
      setState((s) => ({
        ...s,
        bpm: p.state.bpm,
        swing: p.state.swing,
        keyRoot: p.state.keyRoot,
        banks: p.state.banks.map((b) => resizeBank(cloneBank(b), s.steps || 16)),
        tracks: Object.fromEntries(
          TRACKS.map((t) => [t.id, { ...p.state.tracks[t.id], mute: false, solo: false }]),
        ) as Record<TrackId, TrackState>,
        bankIndex: 0,
      }));
      setPresetName(p.name);
      flash(`${p.name} loaded · ${p.state.bpm} BPM`);
    },
    [flash, snapshot],
  );

  const setBpm = useCallback((v: number) => {
    patch({ bpm: Math.max(50, Math.min(200, Math.round(v))) });
  }, [patch]);

  /* ------------------------------ tap tempo ------------------------------ */

  const taps = useRef<number[]>([]);
  const tapTempo = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2600), now];
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      setBpm(60000 / avg);
    }
    if (taps.current.length > 5) taps.current.shift();
  };

  /* -------------------------------- share -------------------------------- */

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#p=${encodeState(stateRef.current)}`;
    try {
      window.history.replaceState(null, "", `#p=${encodeState(stateRef.current)}`);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      flash("Pattern link copied to clipboard");
    } catch {
      flash("Link is in the address bar — copy it from there");
    }
  }, [flash]);

  /* ------------------------------- recording ------------------------------- */

  const toggleRecord = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) { void power(); return; }
    if (recording) {
      eng.stopRecording();
      setRecording(false);
    } else {
      const ok = eng.startRecording();
      if (!ok) { flash("Recording is not supported in this browser"); return; }
      setRecSec(0);
      setRecording(true);
      if (!eng.playing) { eng.start(); setPlaying(true); }
      flash("Recording master output…");
    }
  }, [recording, power, flash]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  // keep takes to a sane size
  useEffect(() => {
    if (recording && recSec >= 120) {
      engineRef.current?.stopRecording();
      setRecording(false);
      flash("Take capped at 2 minutes");
    }
  }, [recSec, recording, flash]);

  /* ------------------------------- shortcuts ------------------------------- */

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

    // holding a key must never flood actions — arrows repeat on purpose (tempo)
    const isArrow = e.key.startsWith("Arrow");
    if (e.repeat && !isArrow) return;

    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === "c") { e.preventDefault(); copyRow(); return; }
    if ((e.metaKey || e.ctrlKey) && k === "v") { e.preventDefault(); pasteRow(); return; }
    if ((e.metaKey || e.ctrlKey) && k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && k === "y") { e.preventDefault(); redo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === " ") { e.preventDefault(); toggle(); return; }
    if (e.key === "?" || (k === "/" && e.shiftKey)) { e.preventDefault(); setHelp((h) => !h); return; }
    if (e.key === "Escape") { setHelp(false); return; }
    if (!booted) return;

    if (["1", "2", "3", "4"].includes(e.key)) { patch({ bankIndex: Number(e.key) - 1 }); return; }
    if (k === ".") { e.preventDefault(); tape(true); return; }

    const voice = TRACKS.find((t) => t.key.toLowerCase() === k);
    if (voice) { setSelected(voice.id); audition(voice.id); return; }

    switch (k) {
      case "m": setTrack(selected, { mute: !stateRef.current.tracks[selected].mute }); return;
      case "s": setTrack(selected, { solo: !stateRef.current.tracks[selected].solo }); return;
      case "l": setTrack(selected, { lock: !stateRef.current.tracks[selected].lock }); return;
      case "g": generate(); return;
      case "x": toggleStutter(); return;
      case "[": e.preventDefault(); transposeRow(-1); return;
      case "]": e.preventDefault(); transposeRow(1); return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      // plain backspace clears the selected row; the whole bank needs Shift
      if (e.shiftKey) clearBank();
      else clearRow();
      return;
    }
    // tempo: ±5 by default, Shift for ±1 fine
    if (isArrow) {
      const d = e.shiftKey ? 1 : 5;
      if (e.key === "ArrowLeft") { e.preventDefault(); setBpm(stateRef.current.bpm - d); }
      if (e.key === "ArrowRight") { e.preventDefault(); setBpm(stateRef.current.bpm + d); }
      if (e.key === "ArrowUp") { e.preventDefault(); setBpm(stateRef.current.bpm + d); }
      if (e.key === "ArrowDown") { e.preventDefault(); setBpm(stateRef.current.bpm - d); }
    }
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => keyHandler.current(e);
    // tape-stop is a hold gesture: press to stop, release to roll again
    const ku = (e: KeyboardEvent) => { if (e.key === "." || e.key === ">") tape(false); };
    const blur = () => tape(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, [tape]);

  /* ------------------------------ bpm dragging ------------------------------ */

  const bpmDrag = useRef<{ y: number; v: number } | null>(null);
  const onBpmDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    bpmDrag.current = { y: e.clientY, v: state.bpm };
  };
  const onBpmMove = (e: React.PointerEvent) => {
    if (!bpmDrag.current) return;
    setBpm(bpmDrag.current.v + (bpmDrag.current.y - e.clientY) * 0.28);
  };
  const onBpmUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    bpmDrag.current = null;
  };

  /* --------------------------------- derived --------------------------------- */

  const bankCounts = useMemo(
    () => state.banks.map((b) => TRACKS.reduce((n, t) => n + b[t.id].filter((s) => s.v > 0).length, 0)),
    [state.banks],
  );
  const activeVoices = useMemo(
    () => TRACKS.filter((t) => !state.tracks[t.id].mute && (!TRACKS.some((x) => state.tracks[x.id].solo) || state.tracks[t.id].solo)).length,
    [state.tracks],
  );
  const steps = state.steps || 16;
  const scale = getScale(state.scaleId);
  const intervals = scale.intervals;
  const melodicVoice: "bass" | "stab" = selected === "stab" ? "stab" : "bass";
  const liveNotes = useMemo<LiveNote[]>(() => {
    if (!playing || pos.step < 0) return [];
    const b = state.banks[activeBank] ?? state.banks[0];
    const out: LiveNote[] = [];
    for (const id of ["bass", "stab"] as const) {
      const st = b[id][pos.step];
      if (st && st.v > 0) out.push({ degree: st.n, vel: st.v, voice: id, step: pos.step, bank: activeBank });
    }
    return out;
  }, [playing, pos.step, activeBank, state.banks]);
  const beat = pos.step >= 0 ? Math.floor(pos.step / 4) % 4 : -1;
  const kickHit =
    playing && pos.step >= 0 && !state.tracks.kick.mute && state.banks[activeBank].kick[pos.step]?.v > 0;
  const mmss = `${String(Math.floor(recSec / 60)).padStart(2, "0")}:${String(recSec % 60).padStart(2, "0")}`;

  return (
    <div className="relative min-h-full pb-14">
      <Backdrop />

      {/* ------------------------------- header ------------------------------- */}
      <header className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-4 pb-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="shrink-0">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const heights = [10, 18, 26, 14, 22, 30, 16, 8];
              const on = playing && pos.step >= 0 && i === pos.step % 8;
              return (
                <rect
                  key={i}
                  x={i * 3.6 + 1}
                  y={30 - heights[i]}
                  width="2.4"
                  height={heights[i]}
                  rx="1.2"
                  fill={on ? "#f2a03d" : i % 2 ? "#5fd3c4" : "#4b5563"}
                  opacity={on ? 1 : 0.75}
                  style={{ transition: "fill 90ms linear" }}
                />
              );
            })}
          </svg>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-none tracking-[0.06em]">
              VOLTA<span className="text-amber">·</span>8
            </h1>
            <p className="label mt-1">web audio groovebox</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-edge/70 px-3 py-1.5 md:flex">
            <span className={cn("h-1.5 w-1.5 rounded-full", engine ? "bg-teal shadow-[0_0_8px_#5fd3c4]" : "bg-muted/50")} />
            <span className="digits text-[10px] text-muted">
              {engine ? `${(engine.sampleRate / 1000).toFixed(1)} kHz · ${activeVoices}/8 VOICES` : "STANDBY"}
            </span>
          </div>
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-full border border-edge/70 px-3 py-1.5 transition-opacity duration-500 lg:flex",
              savedAt ? "opacity-100" : "opacity-40",
            )}
            title="Patterns autosave to this browser"
          >
            <Check className="h-3 w-3 text-lime" />
            <span className="label text-muted">autosaved</span>
          </div>

          <button
            onClick={() => setProjectOpen(true)}
            title="Open Project Manager: save/load kit slots, import/export project JSON"
            className="btn flex h-9 items-center gap-1.5 rounded-[5px] px-3 text-[12px] text-bone/85"
          >
            <HardDrive className="h-3.5 w-3.5 text-amber" />
            KITS
          </button>
          <button onClick={share} className="btn flex h-9 items-center gap-2 rounded-[5px] px-3 text-[12px] text-bone/85">
            {copied ? <Check className="h-3.5 w-3.5 text-lime" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Share"}
          </button>
          <button
            onClick={exportWav}
            disabled={rendering}
            title="Render the loop offline to a WAV file (uses the same synthesis as live playback)"
            className="btn flex h-9 items-center gap-2 rounded-[5px] px-3 text-[12px] text-bone/85 disabled:opacity-50"
          >
            <FileAudio className={cn("h-3.5 w-3.5 text-teal", rendering && "animate-pulse")} />
            {rendering ? "Rendering…" : "WAV"}
          </button>
          <button
            onClick={exportStems}
            disabled={renderingStems}
            title="Render all 8 separate track stems into a DAW-ready ZIP archive"
            className="btn flex h-9 items-center gap-2 rounded-[5px] px-3 text-[12px] text-bone/85 disabled:opacity-50"
          >
            <FolderArchive className={cn("h-3.5 w-3.5 text-violet", renderingStems && "animate-pulse")} />
            {renderingStems ? "Stems…" : "STEMS"}
          </button>
          <button
            onClick={toggleRecord}
            data-on={recording}
            className={cn(
              "btn flex h-9 items-center gap-2 rounded-[5px] px-3 text-[12px]",
              recording ? "border-coral/70 text-coral" : "text-bone/85",
            )}
          >
            <Circle className={cn("h-3.5 w-3.5", recording ? "recpulse fill-coral text-coral" : "text-coral")} />
            {recording ? <span className="digits">{mmss}</span> : "Record"}
          </button>
          <button onClick={() => setHelp(true)} className="btn flex h-9 items-center gap-2 rounded-[5px] px-3 text-[12px] text-bone/85">
            <Keyboard className="h-3.5 w-3.5" />
            Manual
          </button>
        </div>
      </header>

      {/* ------------------------------- machine ------------------------------- */}
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <div className="chassis rise relative rounded-[12px] p-3 sm:p-5">
          <span className="screw absolute left-2.5 top-2.5" />
          <span className="screw absolute right-2.5 top-2.5" />
          <span className="screw absolute bottom-2.5 left-2.5" />
          <span className="screw absolute bottom-2.5 right-2.5" />
          {kickHit && (
            <div key={`k${pos.step}`} className="kickpulse pointer-events-none absolute inset-0 rounded-[12px]" />
          )}

          {/* faceplate strip */}
          <div className="mb-4 flex items-center gap-3 border-b border-edge/60 px-3 pb-3">
            <span className="font-display text-[11px] font-semibold tracking-[0.34em] text-bone/55">
              RHYTHM ENGINE
            </span>
            <div className="flex flex-1 items-center gap-[3px] overflow-hidden">
              {Array.from({ length: 32 }, (_, i) => {
                const on = playing && pos.step >= 0 && i % steps === pos.step;
                return (
                  <span
                    key={i}
                    className="h-[6px] flex-1 rounded-[1px] transition-all duration-100"
                    style={{
                      background: on ? "#f2a03d" : i % 4 === 0 ? "#39414d" : "#242a33",
                      boxShadow: on ? "0 0 8px #f2a03d" : "none",
                    }}
                  />
                );
              })}
            </div>
            <span className="digits hidden text-[10px] text-muted/70 sm:block">SER. 000-808</span>
          </div>

          {/* module row */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,1.05fr)]">
            {/* ---------------- transport ---------------- */}
            <Module title="transport" tint="#f2a03d">
              <div className="flex flex-wrap items-stretch gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={toggle}
                    aria-label={playing ? "Stop" : "Play"}
                    className={cn(
                      "btn flex h-[74px] w-[74px] flex-col items-center justify-center gap-1.5 rounded-[6px]",
                      playing && "border-lime/60 text-lime",
                    )}
                    style={playing ? { boxShadow: "inset 0 0 22px rgba(143,209,79,0.18), 0 2px 0 rgba(0,0,0,0.45)" } : undefined}
                  >
                    {playing ? <Square className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current text-lime" />}
                    <span className="label text-current">{playing ? "stop" : "play"}</span>
                  </button>
                  <div className="flex flex-col justify-between gap-2">
                    <button
                      onClick={tapTempo}
                      className="btn flex h-[34px] w-[64px] items-center justify-center rounded-[5px] text-[11px] tracking-[0.14em] text-bone/80"
                    >
                      TAP
                    </button>
                    <button
                      onClick={() => patch({ chain: !state.chain })}
                      data-on={state.chain}
                      aria-pressed={state.chain}
                      className={cn(
                        "btn flex h-[34px] w-[64px] items-center justify-center gap-1 rounded-[5px] text-[10px] tracking-[0.12em]",
                        state.chain ? "text-amber" : "text-bone/70",
                      )}
                      title="Chain banks A → B → C → D"
                    >
                      <Repeat className="h-3 w-3" /> CHAIN
                    </button>
                  </div>
                </div>

                {/* tempo lcd */}
                <div className="lcd min-w-[190px] flex-1 rounded-[6px] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="label text-teal/70">tempo</span>
                    <span className="label text-teal/70">
                      {state.chain ? "chain a→d" : `bank ${BANK_LABELS[activeBank]}`}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div
                      onPointerDown={onBpmDown}
                      onPointerMove={onBpmMove}
                      onPointerUp={onBpmUp}
                      onPointerCancel={onBpmUp}
                      title="Drag vertically to change tempo"
                      className="digits cursor-ns-resize touch-none text-[46px] font-medium leading-[1.05] text-amber no-native-drag"
                      style={{ textShadow: "0 0 22px rgba(242,160,61,0.45)" }}
                    >
                      {String(state.bpm).padStart(3, "0")}
                    </div>
                    <span className="label mb-2 text-teal/60">bpm</span>
                    <div className="mb-1 ml-auto flex flex-col gap-1">
                      <button
                        onClick={() => setBpm(state.bpm + 1)}
                        aria-label="Increase tempo"
                        className="btn flex h-[19px] w-[24px] items-center justify-center rounded-[3px] text-muted hover:text-amber"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setBpm(state.bpm - 1)}
                        aria-label="Decrease tempo"
                        className="btn flex h-[19px] w-[24px] items-center justify-center rounded-[3px] text-muted hover:text-amber"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="h-[6px] w-[6px] rounded-full transition-all duration-75"
                          style={{
                            background: beat === i ? "#f2a03d" : "#1f3330",
                            boxShadow: beat === i ? "0 0 9px #f2a03d" : "none",
                          }}
                        />
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="label text-teal/60">key</span>
                      <button
                        onClick={() => shiftKey(-1)}
                        aria-label="Previous key"
                        className="text-teal/60 transition-colors hover:text-amber"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="digits w-[42px] text-center text-[12px] text-teal">
                        {NOTE_NAMES[state.keyRoot]}min
                      </span>
                      <button
                        onClick={() => shiftKey(1)}
                        aria-label="Next key"
                        className="text-teal/60 transition-colors hover:text-amber"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-1">
                  <Knob
                    label="SWING" size={46} color="#5fd3c4" value={state.swing}
                    defaultValue={0} format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => patch({ swing: v })}
                  />
                  <Knob
                    label="MASTER" size={46} value={state.master} defaultValue={0.82}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => patch({ master: v })}
                  />
                </div>
              </div>

              {/* performance FX strip */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge/60 pt-3">
                <span className="label text-violet/80">perf fx</span>
                <Knob
                  label="FILTER" size={34} color="#c08be8" value={state.fx.filter} defaultValue={1}
                  format={(v) => `${filterHz(v) >= 1000 ? (filterHz(v) / 1000).toFixed(1) + "k" : Math.round(filterHz(v))} Hz`}
                  onChange={(v) => patch({ fx: { ...state.fx, filter: v } })}
                />
                <Knob
                  label="ECHO FB" size={34} color="#5fd3c4" value={state.fx.echo} defaultValue={0.36}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => patch({ fx: { ...state.fx, echo: v } })}
                />
                <button
                  onClick={toggleStutter}
                  data-on={stutterOn}
                  title="Stutter — chops the master bus every step (X)"
                  className={cn(
                    "btn flex h-[34px] items-center gap-1.5 rounded-[5px] px-3 text-[10px] tracking-[0.14em]",
                    stutterOn ? "border-violet/70 text-violet" : "text-bone/75",
                  )}
                >
                  <Zap className="h-3.5 w-3.5" /> STUTTER
                </button>
                <button
                  onPointerDown={() => tape(true)}
                  onPointerUp={() => tape(false)}
                  onPointerLeave={() => tape(false)}
                  onPointerCancel={() => tape(false)}
                  data-on={tapeOn}
                  title="Hold to tape-stop — press and hold, release on the one (hold .)"
                  className={cn(
                    "btn flex h-[34px] items-center gap-1.5 rounded-[5px] px-3 text-[10px] tracking-[0.14em] no-native-drag",
                    tapeOn ? "border-coral/70 text-coral" : "text-bone/75",
                  )}
                >
                  <Rewind className="h-3.5 w-3.5" /> TAPE STOP
                </button>
                <span className="ml-auto hidden text-[10px] text-muted/70 lg:block">
                  hold TAPE STOP, then release on the one
                </span>
              </div>
            </Module>

            {/* ---------------- patterns ---------------- */}
            <Module
              title="pattern banks"
              tint="#c08be8"
              right={
                state.chain && playing ? (
                  <span className="label text-amber">following</span>
                ) : (
                  <span className="label">{bankCounts[activeBank]} hits</span>
                )
              }
            >
              <div className="grid grid-cols-4 gap-2">
                {BANK_LABELS.map((l, i) => {
                  const on = activeBank === i;
                  return (
                    <button
                      key={l}
                      onClick={() => patch({ bankIndex: i })}
                      title={`Pattern bank ${l} — key ${i + 1}${l === "A" ? "" : `, or ${l} via chain`}`}
                      data-on={on}
                      className={cn(
                        "btn flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-[5px]",
                        on && "border-amber/70 text-amber",
                      )}
                      style={on ? { boxShadow: "inset 0 0 18px rgba(242,160,61,0.16), 0 2px 0 rgba(0,0,0,0.45)" } : undefined}
                    >
                      <span className="font-display text-[20px] font-bold leading-none">{l}</span>
                      <span className="label text-[8px]">{BANK_ROLES[i]}</span>
                      <span className="mt-0.5 flex gap-[2px]">
                        {[0, 1, 2].map((d) => (
                          <span
                            key={d}
                            className="h-[3px] w-[3px] rounded-full"
                            style={{
                              background: bankCounts[i] > d * 14 ? (on ? "#f2a03d" : "#6b7482") : "#2b323b",
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={copyBank} className="btn flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[11px] text-bone/80">
                  <Copy className="h-3.5 w-3.5" /> COPY
                  <ChevronRight className="h-3 w-3 opacity-60" />
                  {BANK_LABELS[(activeBank + 1) % 4]}
                </button>
                <button
                  onClick={clearBank}
                  title="Clear the whole bank (Shift + Backspace)"
                  className="btn flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[11px] text-bone/80 hover:text-coral"
                >
                  <Trash2 className="h-3.5 w-3.5" /> CLEAR
                </button>
                <button
                  onClick={generate}
                  className="btn flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[5px] border-teal/40 text-[11px] text-teal"
                  title="Generate a musically-weighted random pattern (G)"
                >
                  <Dices className="h-3.5 w-3.5" /> DICE
                </button>
                <Knob
                  label="DENSITY" size={30} color="#5fd3c4" value={density} defaultValue={0.8}
                  format={(v) => `${Math.round(v * 100)}%`} onChange={setDensity}
                />
              </div>
            </Module>

            {/* ---------------- scope ---------------- */}
            <Module
              title="master bus"
              tint="#5fd3c4"
              right={
                <div className="flex items-center gap-2">
                  <div className="flex overflow-hidden rounded-[3px] border border-edge/80">
                    {(["hybrid", "wave", "vector"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setScopeMode(m)}
                        data-on={scopeMode === m}
                        title={
                          m === "hybrid"
                            ? "Spectrum + waveform"
                            : m === "wave"
                              ? "Triggered CRT oscilloscope"
                              : "Lissajous stereo phase plot"
                        }
                        className={cn(
                          "btn h-[18px] rounded-none border-0 border-r border-edge/80 px-1.5 text-[8px] tracking-[0.12em] last:border-r-0",
                          scopeMode === m ? "bg-teal/20 text-teal" : "text-muted",
                        )}
                      >
                        {m === "hybrid" ? "SP/WV" : m === "wave" ? "CRT" : "XY"}
                      </button>
                    ))}
                  </div>
                  <DbReadout engine={engine} recording={recording} />
                </div>
              }
            >
              <div className="flex gap-3">
                <div className="lcd relative h-[104px] flex-1 overflow-hidden rounded-[5px]">
                  <Scope analyser={engine?.analyser ?? null} playing={playing} mode={scopeMode} />
                  {!engine && (
                    <span className="label absolute bottom-2 left-3 text-teal/60">standby</span>
                  )}
                  <span className="label absolute right-3 top-2 text-teal/50">
                    {scopeMode === "hybrid" ? "spectrum / wave" : scopeMode === "wave" ? "oscilloscope" : "stereo vector"}
                  </span>
                </div>
                <Meter engine={engine} label="out" />
              </div>
            </Module>
          </div>

          {/* ---------------- harmony / scale ---------------- */}
          <div className="mt-3">
            <Harmony
              keyRoot={state.keyRoot}
              scaleId={state.scaleId}
              bank={state.banks[activeBank]}
              voice={melodicVoice}
              armed={armedDegree}
              live={liveNotes}
              playing={playing}
              onArm={armDegree}
              onAudition={(d) => audition(melodicVoice, d)}
              onVoice={(v) => setSelected(v)}
              onKey={shiftKey}
              onScaleChange={setScale}
              onMelody={melodyDice}
            />
          </div>

          {/* ---------------- preset rail ---------------- */}
          <div className="mt-3 flex items-center gap-3 rounded-[6px] border border-edge/60 bg-black/15 px-3 py-2.5">
            <span className="label hidden shrink-0 sm:block">factory patterns</span>
            <div className="flex flex-1 gap-2 overflow-x-auto pb-0.5">
              {PRESETS.map((p, i) => {
                const on = presetName === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => loadPreset(i)}
                    className={cn(
                      "btn group flex shrink-0 flex-col items-start gap-0.5 rounded-[5px] px-3 py-1.5 text-left",
                      on && "border-amber/70",
                    )}
                  >
                    <span className={cn("font-display text-[12px] font-semibold tracking-[0.08em]", on ? "text-amber" : "text-bone/85")}>
                      {p.name}
                    </span>
                    <span className="digits text-[9px] text-muted">{p.tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- sequencer ---------------- */}
          <div className="mt-3 rounded-[6px] border border-edge/60 bg-black/20 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge/50 pb-2.5">
              <span className="font-display text-[12px] font-semibold tracking-[0.18em] text-bone/80">
                STEP SEQUENCER
              </span>
              <span className="digits rounded-[3px] border border-amber/40 bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">
                BANK {BANK_LABELS[activeBank]} · {BANK_ROLES[activeBank]}
              </span>
              <span className="label hidden sm:block">
                1/16 notes{state.swing > 0.01 ? ` · swing ${Math.round(state.swing * 100)}%` : " · straight"}
              </span>
              {armedDegree !== null && (
                <span className="flex items-center gap-1.5 rounded-[3px] border border-teal/50 bg-teal/10 px-1.5 py-0.5">
                  <span className="h-1 w-1 rounded-full bg-teal shadow-[0_0_6px_#5fd3c4]" />
                  <span className="digits text-[10px] text-teal">
                    PITCH {noteName(state.keyRoot, armedDegree, degreeOctave(melodicVoice))} ARMED
                  </span>
                  <button
                    onClick={() => setArmedDegree(null)}
                    aria-label="Disarm pitch"
                    className="text-teal/70 transition-colors hover:text-coral"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <div className="flex overflow-hidden rounded-[4px] border border-edge">
                  {([16, 32] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setSteps(n)}
                      data-on={steps === n}
                      title={`Pattern length ${n} steps`}
                      className={cn(
                        "btn h-[26px] rounded-none border-0 border-r border-edge px-2.5 text-[10px] digits last:border-r-0",
                        steps === n ? "bg-amber/15 text-amber" : "text-bone/60",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={copyRow}
                  title="Copy selected row (Ctrl+C)"
                  className="btn flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-[10px] tracking-[0.1em] text-bone/75"
                >
                  <Copy className="h-3 w-3" /> ROW
                </button>
                <button
                  onClick={pasteRow}
                  disabled={!rowClip.current}
                  title="Paste copied row into selected track (Ctrl+V)"
                  className="btn flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-[10px] tracking-[0.1em] text-bone/75 disabled:opacity-30"
                >
                  <ClipboardPasteIcon /> PASTE
                </button>
                <button
                  onClick={undo}
                  disabled={!histSize.undo}
                  title="Undo (⌘/Ctrl + Z)"
                  className="btn flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-[10px] tracking-[0.1em] text-bone/75 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Undo2 className="h-3 w-3" /> UNDO
                  {histSize.undo > 0 && <span className="digits text-muted">{histSize.undo}</span>}
                </button>
                <button
                  onClick={redo}
                  disabled={!histSize.redo}
                  title="Redo (⌘/Ctrl + Shift + Z)"
                  className="btn flex h-[26px] items-center gap-1.5 rounded-[4px] px-2 text-[10px] tracking-[0.1em] text-bone/75 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Redo2 className="h-3 w-3" /> REDO
                </button>
              </div>
            </div>
            <div className="overflow-x-auto pb-1">
              <Sequencer
                bank={state.banks[activeBank]}
                tracks={state.tracks}
                playStep={pos.step}
                playing={playing}
                selected={selected}
                keyRoot={state.keyRoot}
                intervals={intervals}
                onSelect={setSelected}
                onAudition={audition}
                onStep={setStep}
                onTrack={setTrack}
                onRowChange={replaceRow}
                armedDegree={armedDegree}
              />
            </div>
          </div>
        </div>

        {/* ------------------------------- footer ------------------------------- */}
        <footer className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-[11px] text-muted">
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">Space</kbd>
            play
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">Q–I</kbd>
            audition voices
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">G</kbd>
            generate
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">1–4</kbd>
            banks
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">X / .</kbd>
            stutter / tape stop
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">← →</kbd>
            tempo ±5
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">[ ]</kbd>
            transpose row
          </span>
          <span className="flex items-center gap-2">
            <kbd className="digits rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">Del</kbd>
            clear row
          </span>
          <button onClick={() => setHelp(true)} className="text-teal underline-offset-4 transition-colors hover:text-amber hover:underline">
            full manual →
          </button>
          <span className="ml-auto text-muted/60">
            Built with the Web Audio API — every sound generated live, no samples.
          </span>
        </footer>
      </main>

      {/* ------------------------------- take panel ------------------------------- */}
      {take && (
        <div className="chassis rise fixed bottom-5 right-5 z-40 w-[300px] rounded-[8px] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-coral shadow-[0_0_8px_#ff6f59]" />
            <span className="label text-bone/80">captured take</span>
            <button
              onClick={() => { URL.revokeObjectURL(take.url); setTake(null); }}
              className="ml-auto text-muted transition-colors hover:text-coral"
              aria-label="Dismiss take"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <audio src={take.url} controls className="h-8 w-full" />
          <div className="mt-2 flex items-center gap-2">
            <span className="digits truncate text-[10px] text-muted">{(take.size / 1024).toFixed(0)} KB</span>
            <a
              href={take.url}
              download={take.name}
              className="btn ml-auto flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-[11px] text-amber"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
        </div>
      )}

      {!booted && <BootScreen onPower={() => void power()} leaving={leaving} />}
      <ProjectModal
        open={projectOpen}
        state={state}
        onClose={() => setProjectOpen(false)}
        onLoadState={(s, label) => {
          snapshot("import");
          setState(s);
          setPresetName(label);
          setArmedDegree(null);
          flash(`${label} loaded`);
        }}
        onExportStems={() => void exportStems()}
        renderingStems={renderingStems}
      />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
      <Toast message={toast} />
    </div>
  );
}