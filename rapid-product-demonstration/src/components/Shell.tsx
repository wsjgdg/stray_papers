import { ReactNode, useEffect } from "react";
import { Power, X, Keyboard, MousePointerClick, Waves, Share2, Circle } from "lucide-react";
import { cn } from "@/utils/cn";

/* ------------------------------- backdrop ------------------------------- */

export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 8% -8%, rgba(242,160,61,0.14), transparent 62%)," +
            "radial-gradient(760px 520px at 96% 4%, rgba(95,211,196,0.11), transparent 60%)," +
            "radial-gradient(1100px 700px at 50% 118%, rgba(192,139,232,0.10), transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 30%, black, transparent 85%)",
        }}
      />
      <div className="breathe absolute left-1/2 top-[38%] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-amber/[0.05] blur-[120px]" />
      <div className="grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0,0,0,0.72) 100%)" }}
      />
    </div>
  );
}

/* -------------------------------- module -------------------------------- */

export function Module({
  title, right, children, className, tint = "#79808c",
}: {
  title: string; right?: ReactNode; children: ReactNode; className?: string; tint?: string;
}) {
  return (
    <section className={cn("module relative rounded-[6px] p-3", className)}>
      <header className="mb-3 flex items-center gap-2">
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: tint, boxShadow: `0 0 7px ${tint}` }} />
        <h2 className="label text-bone/70">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------ boot screen ------------------------------ */

export function BootScreen({ onPower, leaving }: { onPower: () => void; leaving: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-ink/80 px-4 pb-[6vh] backdrop-blur-[3px] transition-all duration-700 sm:items-center sm:pb-0",
        leaving && "pointer-events-none opacity-0 backdrop-blur-0",
      )}
    >
      <div className="chassis rise relative w-full max-w-4xl overflow-hidden rounded-[10px] p-6 sm:p-9">
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="sweep h-px w-1/3 bg-gradient-to-r from-transparent via-amber to-transparent" />
        </div>
        <div className="grid gap-8 sm:grid-cols-[1.5fr_auto] sm:items-end">
          <div>
            <p className="label mb-3 text-amber">system standby · v1.0</p>
            <h1 className="font-display text-[clamp(2.6rem,8vw,4.6rem)] font-bold leading-[0.9] tracking-[-0.02em]">
              VOLTA<span className="text-amber">·</span>8
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
              A drum machine that lives in your browser. Eight voices, sixteen steps, four patterns —
              every sound is <span className="text-bone">synthesised in real time</span>. No samples, no loading screen.
            </p>
            <dl className="mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 border-t border-edge/70 pt-4 text-[11px] sm:grid-cols-2">
              {[
                ["VOICES", "8 analogue-modelled"],
                ["SEQUENCER", "16/32 steps · 4 banks"],
                ["HARMONY", "7 scales · 3D pitch helix"],
                ["EXPORT", "WAV loop · 8-track stems"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="mt-0.5 text-bone/85">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <button
            onClick={onPower}
            autoFocus
            className="btn group mx-auto flex h-[132px] w-[104px] flex-col items-center justify-between rounded-[8px] px-3 py-4 sm:mx-0"
            aria-label="Power on the drum machine"
          >
            <span className="label text-muted group-hover:text-amber">on</span>
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-edge-2 bg-gradient-to-b from-[#333b46] to-[#1a1e25] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-all group-hover:border-amber/70 group-hover:shadow-[0_0_26px_rgba(242,160,61,0.35)]">
              <Power className="h-6 w-6 text-amber transition-transform group-hover:scale-110" strokeWidth={2.2} />
            </span>
            <span className="font-display text-[11px] font-semibold tracking-[0.2em] text-bone/80 group-hover:text-amber">
              POWER
            </span>
          </button>
        </div>
        <p className="mt-7 text-[11px] text-muted/70">
          Click power to unlock audio — headphones or speakers recommended.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ help dialog ------------------------------ */

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / stop"],
  ["1 – 4", "Jump live to pattern bank A–D"],
  ["Q W E R T Y U I", "Audition + select voice 1–8"],
  ["M / S / L", "Mute / solo / lock selected voice"],
  ["G", "Generate a new pattern (locked tracks survive)"],
  ["X", "Stutter FX on/off"],
  [". (hold)", "Tape stop — release to roll again"],
  ["← / → / ↑ / ↓", "Tempo ±5 BPM (hold Shift = ±1)"],
  ["[ / ]", "Transpose selected row down / up"],
  ["Ctrl+C / Ctrl+V", "Copy / paste the selected row"],
  ["Backspace", "Clear selected row (Shift = whole bank)"],
  ["⌘/Ctrl + Z", "Undo · add Shift to redo"],
  ["?", "Toggle this panel"],
];

const TIPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Circle className="h-4 w-4" />,
    title: "Play it like a kit",
    body: "The eight trigger pads above the grid map to Q W E R T Y U I. Turn on REC OVERDUB and taps land on the step currently playing, so you can play fills over the loop live.",
  },
  {
    icon: <Waves className="h-4 w-4" />,
    title: "Shape each track",
    body: "Each strip flips between SYNTH (tune, decay, level) and MIX (stereo pan, reverb send, delay send). The tool bar nudges a row by a step, builds Euclidean rhythms, or inverts and reverses it.",
  },
  {
    icon: <MousePointerClick className="h-4 w-4" />,
    title: "Program the grid",
    body: "Click a step to cycle accent → ghost → off. Drag across cells to paint a whole run. Shift-click erases. Alt-click nudges the pitch of BASS and STAB steps.",
  },
  {
    icon: <Waves className="h-4 w-4" />,
    title: "Draw inside the scale",
    body: "The harmony panel draws the pentatonic scale as a 3D helix — vertical is pitch, hue is the note itself, and live notes pulse as they play. Click a degree to arm it, then draw that pitch into the grid; [ and ] transpose the row.",
  },
  {
    icon: <Waves className="h-4 w-4" />,
    title: "Shape the voices",
    body: "Every knob is live: drag vertically, hold Shift for fine control, double-click to reset. Nothing is a sample — you are editing the synthesis itself.",
  },
  {
    icon: <Circle className="h-4 w-4" />,
    title: "Perform & export",
    body: "Chain banks A→D for a full arrangement, then hit RECORD to capture the master bus to an audio file. SHARE copies a link containing your entire pattern.",
  },
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="chassis rise max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[10px] p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="How to use VOLTA-8"
      >
        <div className="mb-5 flex items-start gap-3">
          <div>
            <p className="label text-amber">operator manual</p>
            <h2 className="font-display text-2xl font-bold tracking-tight">How to play it</h2>
          </div>
          <button onClick={onClose} className="btn ml-auto flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[11px] text-muted hover:text-bone">
            <X className="h-3.5 w-3.5" /> ESC
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TIPS.map((t) => (
            <div key={t.title} className="module rounded-[6px] p-3">
              <div className="mb-2 flex items-center gap-2 text-amber">
                {t.icon}
                <h3 className="font-display text-[13px] font-semibold tracking-wide text-bone">{t.title}</h3>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">{t.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="label mb-2 flex items-center gap-2 text-bone/70">
              <Keyboard className="h-3.5 w-3.5" /> keyboard
            </h3>
            <ul className="divide-y divide-edge/50 rounded-[5px] border border-edge/60">
              {SHORTCUTS.map(([k, v]) => (
                <li key={k} className="flex items-center gap-3 px-3 py-[7px] text-[12px]">
                  <kbd className="digits min-w-[104px] rounded-[3px] border border-edge bg-[#1a1e25] px-1.5 py-0.5 text-[10px] text-amber">
                    {k}
                  </kbd>
                  <span className="text-muted">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="label mb-2 flex items-center gap-2 text-bone/70">
              <Share2 className="h-3.5 w-3.5" /> signal path
            </h3>
            <div className="space-y-2 rounded-[5px] border border-edge/60 p-3 text-[12px] leading-relaxed text-muted">
              <p>
                <span className="text-bone">8 voices</span> → per-voice level &amp; pan → reverb / delay sends →
                master saturation → glue compressor → analyser → output.
              </p>
              <p>
                The scheduler runs <span className="text-bone">120 ms ahead</span> of the audio clock, so timing stays
                sample-accurate even when the browser drops frames. Swing delays every off-beat 16th.
              </p>
              <p>
                <span className="text-bone">STEMS</span> renders all eight tracks through the same synthesis into
                separate 44.1 kHz WAVs, zipped for your DAW. <span className="text-bone">KITS</span> stores four
                grooves in browser memory slots and imports or exports the whole machine as JSON.
              </p>
              <p className="text-muted/70">
                Patterns autosave to this browser. Recorded takes and stems are encoded locally — nothing is uploaded.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- toast --------------------------------- */

export function Toast({ message }: { message: string | null }) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300",
        message ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="chassis flex items-center gap-2.5 rounded-full px-4 py-2 text-[12px]">
        <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_8px_#5fd3c4]" />
        {message}
      </div>
    </div>
  );
}
