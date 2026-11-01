import { useEffect, useState } from "react";
import { Download, Upload, Copy, Check, X, HardDrive, FileArchive } from "lucide-react";
import { MachineState, encodeState, decodeState } from "@/audio/model";

interface Props {
  open: boolean;
  state: MachineState;
  onClose: () => void;
  onLoadState: (state: MachineState, label: string) => void;
  onExportStems: () => void;
  renderingStems: boolean;
}

const SLOTS_KEY = "volta8.user_slots.v1";

interface UserSlot {
  name: string;
  savedAt: string;
  data: string;
}

export function ProjectModal({
  open,
  state,
  onClose,
  onLoadState,
  onExportStems,
  renderingStems,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<number, UserSlot>>({});

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(SLOTS_KEY);
      if (raw) setSlots(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const saveSlot = (idx: number) => {
    const next = {
      ...slots,
      [idx]: {
        name: `Kit ${idx + 1} (${Math.round(state.bpm)} BPM)`,
        savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        data: encodeState(state),
      },
    };
    setSlots(next);
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const loadSlot = (idx: number) => {
    const s = slots[idx];
    if (!s) return;
    const decoded = decodeState(s.data);
    if (decoded) {
      onLoadState(decoded, s.name);
      onClose();
    }
  };

  const copyJson = async () => {
    const str = JSON.stringify(state, null, 2);
    try {
      await navigator.clipboard.writeText(str);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const downloadJson = () => {
    const str = JSON.stringify(state, null, 2);
    const blob = new Blob([str], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `volta8-project-${Math.round(state.bpm)}bpm.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (text: string) => {
    setImportErr(null);
    try {
      // First try JSON parse
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.bpm === "number" && Array.isArray(parsed.banks)) {
        onLoadState(parsed as MachineState, "Imported Project");
        onClose();
        return;
      }
    } catch {
      // Maybe it's a URL hash or compact encoded string
      const clean = text.trim().replace(/^.*#p=/, "");
      const decoded = decodeState(clean);
      if (decoded) {
        onLoadState(decoded, "Imported Pattern");
        onClose();
        return;
      }
    }
    setImportErr("Invalid project format. Must be a valid Volta-8 JSON or share code.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="chassis rise max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[10px] p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Project and Kit Manager"
      >
        <div className="mb-5 flex items-start justify-between border-b border-edge/60 pb-3">
          <div>
            <p className="label text-teal">session management</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-bone">
              Project &amp; Stems Manager
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[11px] text-muted hover:text-bone"
          >
            <X className="h-3.5 w-3.5" /> ESC
          </button>
        </div>

        {/* ---------------- 4 User Memory Slots ---------------- */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-amber" />
            <h3 className="label !text-bone">browser kit memory slots</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((idx) => {
              const slot = slots[idx];
              return (
                <div
                  key={idx}
                  className="module flex flex-col justify-between rounded-[5px] p-2.5 text-center"
                >
                  <div className="mb-2">
                    <span className="digits text-[11px] font-bold text-amber">
                      SLOT {idx + 1}
                    </span>
                    <p className="truncate text-[10px] text-muted">
                      {slot ? slot.savedAt : "Empty"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => saveSlot(idx)}
                      title="Store current groove into this browser memory slot"
                      className="btn h-[24px] flex-1 rounded-[3px] text-[9px] font-bold text-bone/80 hover:text-amber"
                    >
                      STORE
                    </button>
                    <button
                      onClick={() => loadSlot(idx)}
                      disabled={!slot}
                      title="Recall groove from this slot"
                      className="btn h-[24px] flex-1 rounded-[3px] text-[9px] font-bold text-teal disabled:opacity-30"
                    >
                      RECALL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------- DAW Stems & File Export ---------------- */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="module flex flex-col justify-between rounded-[6px] p-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-teal">
                <FileArchive className="h-4 w-4" />
                <h4 className="font-display text-[13px] font-bold text-bone">DAW Stems ZIP</h4>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Renders all 8 tracks into separate, studio-grade 44.1kHz 16-bit WAV files bundled into a single ZIP file.
              </p>
            </div>
            <button
              onClick={onExportStems}
              disabled={renderingStems}
              className="btn mt-3 flex h-8 items-center justify-center gap-1.5 rounded-[4px] border-teal/40 text-[11px] font-semibold text-teal disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {renderingStems ? "Rendering Stems…" : "EXPORT 8 STEMS (ZIP)"}
            </button>
          </div>

          <div className="module flex flex-col justify-between rounded-[6px] p-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-amber">
                <Download className="h-4 w-4" />
                <h4 className="font-display text-[13px] font-bold text-bone">Project JSON</h4>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Download your complete arrangement, presets, and audio synthesis settings as a portable JSON file.
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={downloadJson}
                className="btn flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] text-[11px] text-bone/85"
              >
                <Download className="h-3.5 w-3.5" /> Save JSON
              </button>
              <button
                onClick={copyJson}
                className="btn flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[4px] text-[11px] text-bone/85"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-lime" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- Import Section ---------------- */}
        <div className="rounded-[6px] border border-edge/60 bg-black/20 p-3">
          <h4 className="label mb-2 text-bone/80">import project or share code</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder="Paste project JSON or share code (#p=...)"
              className="btn h-9 flex-1 rounded-[4px] bg-[#14181e] px-3 text-[12px] text-bone placeholder:text-muted/50 focus:border-amber"
            />
            <button
              onClick={() => importJson(jsonInput)}
              disabled={!jsonInput.trim()}
              className="btn flex h-9 items-center gap-1.5 rounded-[4px] border-amber/40 px-4 text-[11px] font-bold text-amber disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" /> LOAD
            </button>
          </div>
          {importErr && <p className="mt-1.5 text-[11px] text-coral">{importErr}</p>}
        </div>
      </div>
    </div>
  );
}
