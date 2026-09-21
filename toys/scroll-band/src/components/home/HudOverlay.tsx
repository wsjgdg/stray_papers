import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import { useHudEntrance } from "./usePanelMotion";
import { RecHistoryMenu } from "./RecHistoryMenu";
import { SoundPanel } from "./SoundPanel";
import { PerfChip } from "./PerfChip";
import { AccessPanel } from "./AccessPanel";
import { JamPanel } from "./JamPanel";
import { DeformMenu } from "./DeformMenu";
import { RhAccountMenu } from "@/components/rh/RhAccountMenu";
import { ThemeChip } from "./ThemeChip";
import { VOICES } from "@/lib/audio/scales";

// 音色菜单：chip 点开浮层直选（预设 + 「自造」），末尾「造音色…」打开音色编辑器。
// 快捷键 T 仍只循环预设（自造不进循环，防误切）
function VoiceMenu({
  voiceId,
  voiceName,
  onPick,
  onOpenSynth,
}: {
  voiceId: string;
  voiceName: string;
  onPick: (id: string) => void;
  onOpenSynth: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`音色：${voiceName}，点击打开音色菜单，快捷键 T 循环预设`}
        className="min-w-[7.5rem] border border-border px-2 py-0.5 text-center hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
      >
        音色·{voiceName}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-1 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:min-w-[8.5rem]"
        >
          {VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              aria-checked={v.id === voiceId}
              onClick={() => {
                onPick(v.id);
                setOpen(false);
              }}
              className={
                v.id === voiceId
                  ? "block w-full bg-primary/10 px-2 py-1 text-left text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "block w-full px-2 py-1 text-left hover:bg-muted focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {v.name}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            title="打开音色编辑器：双振荡器 + 滤波 + 效果链现场拧一个自己的音色"
            onClick={() => {
              setOpen(false);
              onOpenSynth();
            }}
            className="block w-full px-2 py-1 text-left text-primary hover:bg-muted focus-visible:shadow-[var(--focus-ring)]"
          >
            造音色…
          </button>
        </div>
      )}
    </span>
  );
}

function ClearCanvasButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const onClick = () => {
    if (confirming) {
      window.clearTimeout(timerRef.current);
      setConfirming(false);
      onClear();
      return;
    }
    setConfirming(true);
    timerRef.current = window.setTimeout(() => setConfirming(false), 3000);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={confirming ? "再次点击确认清空画布" : "清空画布"}
      className={
        confirming
          ? "border border-destructive px-2 py-0.5 text-card-foreground hover:bg-destructive/10 focus-visible:shadow-[var(--focus-ring)]"
          : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
      }
    >
      {confirming ? "确认清空？" : "清空画布"}
    </button>
  );
}

// 动态音色档位菜单：chip 点开浮层直选（关 / 自动按速度 / 锁定 玻璃·拨弦·锯齿Lead）
type TimbreMode = "off" | "auto" | "glass" | "pluck" | "lead";
const TIMBRE_OPTIONS: { mode: TimbreMode; label: string }[] = [
  { mode: "off", label: "关" },
  { mode: "auto", label: "自动 · 按速度" },
  { mode: "glass", label: "玻璃" },
  { mode: "pluck", label: "拨弦" },
  { mode: "lead", label: "锯齿Lead" },
];

function TimbreMenu({ mode, label, onSet }: { mode: TimbreMode; label: string; onSet: (m: TimbreMode) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`动态音色：${mode === "off" ? "关" : mode === "auto" ? "自动按速度" : `锁定 ${label.replace("动色·", "")}`}，点击选择档位`}
        className={
          mode === "off"
            ? "min-w-[5.75rem] border border-border px-2 py-0.5 text-center hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "min-w-[5.75rem] border border-primary bg-primary/10 px-2 py-0.5 text-center text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-1 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:min-w-[7.5rem]"
        >
          {TIMBRE_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              role="menuitemradio"
              aria-checked={o.mode === mode}
              onClick={() => {
                onSet(o.mode);
                setOpen(false);
              }}
              className={
                o.mode === mode
                  ? "block w-full bg-primary/10 px-2 py-1 text-left text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "block w-full px-2 py-1 text-left hover:bg-muted focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// 曲线自动化画笔菜单：关 = 画笔迹；选参数后落笔画该参数随时间的变化（虚线曲线）
type CurveMode = "off" | "vol" | "cutoff" | "pan" | "reverb";
const CURVE_OPTIONS: { mode: CurveMode; label: string }[] = [
  { mode: "off", label: "关（画笔迹）" },
  { mode: "vol", label: "音量" },
  { mode: "cutoff", label: "滤波" },
  { mode: "pan", label: "声像" },
  { mode: "reverb", label: "混响" },
];

function CurveMenu({ mode, label, onSet }: { mode: CurveMode; label: string; onSet: (m: CurveMode) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`曲线自动化：${mode === "off" ? "关，画笔迹" : `正在画${CURVE_OPTIONS.find((o) => o.mode === mode)?.label ?? ""}曲线`}，点击选择参数`}
        className={
          mode === "off"
            ? "min-w-[5.75rem] border border-border px-2 py-0.5 text-center hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "min-w-[5.75rem] border border-primary bg-primary/10 px-2 py-0.5 text-center text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-1 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:min-w-[7.5rem]"
        >
          {CURVE_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              role="menuitemradio"
              aria-checked={o.mode === mode}
              onClick={() => {
                onSet(o.mode);
                setOpen(false);
              }}
              className={
                o.mode === mode
                  ? "block w-full bg-primary/10 px-2 py-1 text-left text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "block w-full px-2 py-1 text-left hover:bg-muted focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// BPM 面板：画布循环速度滑杆 + ±2 步进 + 打拍定速（连点「打拍」取最近 5 次间隔均值）
function BpmMenu({ bpm, onSet }: { bpm: number; onSet: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tapsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t)) {
        setOpen(false);
        return;
      }
      const tag = (t as HTMLElement).tagName;
      if (tag !== "BUTTON" && tag !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) taps.length = 0; // 停顿即重开
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length < 2) return;
    let sum = 0;
    for (let i = 1; i < taps.length; i += 1) sum += taps[i] - taps[i - 1];
    onSet(Math.round(60000 / (sum / (taps.length - 1))));
  };

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`速度 ${bpm} BPM，点击打开速度面板`}
        className="min-w-[4.25rem] border border-border px-2 py-0.5 text-center hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
      >
        BPM {bpm}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="速度调节"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-3 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-56"
        >
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => onSet(bpm - 2)}
              aria-label="减速 2"
              className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              −
            </button>
            <input
              type="range"
              min={40}
              max={200}
              step={1}
              value={bpm}
              onChange={(e) => onSet(Number(e.target.value))}
              aria-label={`速度滑杆，当前 ${bpm} BPM`}
              className="flex-1 accent-primary"
            />
            <button
              type="button"
              onClick={() => onSet(bpm + 2)}
              aria-label="加速 2"
              className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              ＋
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={tap}
              className="flex-1 border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              打拍定速
            </button>
            <span className="font-mono text-[10px] text-muted-foreground">{bpm} BPM</span>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            画布循环与 MIDI 导出共用此速度；打字鼓组仍按你的手速自动定速
          </p>
        </div>
      )}
    </span>
  );
}

// 多存档位面板：命名快照 存/载入/覆写/删 + 复制到当前画布（localStorage，≤12 档；载入前 Logic 自动压撤销栈）
function SlotsMenu({
  metas,
  onSave,
  onLoad,
  onRemove,
  copyPick,
  onStartCopy,
  onCancelCopy,
  onConfirmCopy,
}: {
  metas: { name: string; savedAt: number; count: number }[];
  onSave: (name: string) => boolean;
  onLoad: (name: string) => void;
  onRemove: (name: string) => void;
  copyPick: { name: string; objs: { id: string; type: "stroke" | "anchor" | "curve" }[] } | null;
  onStartCopy: (name: string) => void;
  onCancelCopy: () => void;
  onConfirmCopy: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  // 复制选对象：进入挑选时默认整档全选，可逐个取消
  const [selIds, setSelIds] = useState<string[]>([]);
  useEffect(() => {
    setSelIds(copyPick ? copyPick.objs.map((o) => o.id) : []);
  }, [copyPick]);
  const toggleSel = (id: string) =>
    setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // 点向画布时吞掉这次按下，避免收起面板顺手起一条草稿线；按钮/输入框放行
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const fmt = (t: number) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const save = () => {
    if (onSave(saveName)) {
      setSaveName("");
      setConfirmDel(null);
    }
  };

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="作曲存档位：保存与载入命名快照"
        className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
      >
        存档{metas.length > 0 ? ` ${metas.length}` : ""}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-2 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-64"
        >
          <div className="flex gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              placeholder="存档名（留空自动编号）"
              aria-label="存档名"
              className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 text-card-foreground placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)]"
            />
            <button
              type="button"
              onClick={save}
              className="shrink-0 border border-primary px-2 py-1 text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
            >
              存这里
            </button>
          </div>
          {copyPick && (
            <div className="mt-2 border border-primary/50 p-1.5">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs" title={copyPick.name}>
                  复制「{copyPick.name}」→ 当前画布（勾选要带的对象）
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelIds(
                      selIds.length === copyPick.objs.length ? [] : copyPick.objs.map((o) => o.id),
                    )
                  }
                  className="shrink-0 border border-border px-1.5 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  {selIds.length === copyPick.objs.length ? "全不选" : "全选"}
                </button>
              </div>
              <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
                {copyPick.objs.map((o, i) => {
                  const on = selIds.includes(o.id);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => toggleSel(o.id)}
                        aria-pressed={on}
                        className={
                          on
                            ? "w-full border border-primary bg-primary/10 px-1.5 py-0.5 text-left hover:border-primary focus-visible:shadow-[var(--focus-ring)]"
                            : "w-full border border-border px-1.5 py-0.5 text-left text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                        }
                      >
                        {on ? "✓" : "○"}{" "}
                        {o.type === "stroke" ? `线 ${i + 1}` : o.type === "curve" ? `曲线 ${i + 1}` : `锚点 ${i + 1}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={selIds.length === 0}
                  onClick={() => onConfirmCopy(selIds)}
                  className="flex-1 border border-primary bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
                >
                  复制 {selIds.length} 个进画布
                </button>
                <button
                  type="button"
                  onClick={onCancelCopy}
                  className="shrink-0 border border-border px-2 py-1 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {metas.length === 0 ? (
            <div className="px-1 py-2 text-muted-foreground">还没有存档，画好一段试试存一档</div>
          ) : (
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {metas.map((m) => (
                <li key={m.name} className="flex items-center gap-1.5 border border-border px-1.5 py-1">
                  <span className="min-w-0 flex-1 truncate" title={m.name}>
                    {m.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {m.count} 段 · {fmt(m.savedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(m.name);
                      setOpen(false);
                    }}
                    className="shrink-0 border border-border px-1.5 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    载入
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(m.name)}
                    className="shrink-0 border border-border px-1.5 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    覆写
                  </button>
                  <button
                    type="button"
                    title="把这份存档里的对象复制进当前画布（原存档不动，可撤销）"
                    onClick={() => onStartCopy(m.name)}
                    className="shrink-0 border border-border px-1.5 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmDel === m.name) {
                        onRemove(m.name);
                        setConfirmDel(null);
                      } else {
                        setConfirmDel(m.name);
                      }
                    }}
                    className={
                      confirmDel === m.name
                        ? "shrink-0 border border-destructive px-1.5 py-0.5 text-destructive focus-visible:shadow-[var(--focus-ring)]"
                        : "shrink-0 border border-border px-1.5 py-0.5 hover:border-destructive/60 hover:text-destructive focus-visible:shadow-[var(--focus-ring)]"
                    }
                  >
                    {confirmDel === m.name ? "确认删" : "删"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            载入与复制都留一步撤销，点错了按 ↶ 回来；复制不改原存档
          </div>
        </div>
      )}
    </span>
  );
}

// 空间效果面板：主音量 + 混响 + 回声三条滑杆（引擎 FX 发送链，湿量封顶防爆音；持久化）
function FxPanel({
  fx,
  onSet,
}: {
  fx: { vol: number; rev: number; dly: number };
  onSet: (k: "vol" | "rev" | "dly", v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const wet = fx.rev > 0.02 || fx.dly > 0.02;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const rows: { k: "vol" | "rev" | "dly"; label: string; hint: string }[] = [
    { k: "vol", label: "音量", hint: "总输出" },
    { k: "rev", label: "混响", hint: "大厅空间感" },
    { k: "dly", label: "回声", hint: "延迟重复" },
  ];

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`空间效果：音量 ${Math.round(fx.vol * 100)}%，混响 ${Math.round(fx.rev * 100)}%，回声 ${Math.round(fx.dly * 100)}%，点击调节`}
        className={
          wet
            ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
            : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
        }
      >
        空间
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="空间效果调节"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-3 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-60"
        >
          {rows.map((r) => (
            <label key={r.k} className="mb-2.5 block last:mb-0">
              <span className="flex items-baseline justify-between">
                <span>
                  {r.label} <span className="text-[10px] text-muted-foreground">{r.hint}</span>
                </span>
                <span className="text-muted-foreground">{Math.round(fx[r.k] * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(fx[r.k] * 100)}
                onChange={(e) => onSet(r.k, Number(e.target.value) / 100)}
                aria-label={`${r.label}滑杆`}
                className="mt-1 w-full accent-primary"
              />
            </label>
          ))}
          <div className="text-[10px] text-muted-foreground">调一点混响，整个乐团就像进了音乐厅</div>
        </div>
      )}
    </span>
  );
}

// MIDI 导出：菜单选遍数（窗口 = 最长循环 × N 遍，各层按自身周期铺满）
function MidiMenu({ onExport }: { onExport: (repeats: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="导出 MIDI 文件：选择循环遍数"
        className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
      >
        MIDI
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-1 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-44"
        >
          {[1, 2, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="menuitem"
              onClick={() => {
                onExport(n);
                setOpen(false);
              }}
              className="block w-full px-2 py-1 text-left hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
            >
              导出 {n} 遍
            </button>
          ))}
          <div className="px-2 py-1 text-[10px] text-muted-foreground">.mid 可拖进任何音乐软件续编</div>
        </div>
      )}
    </span>
  );
}

// 音频导出：菜单选遍数（录的是此刻听见的所有声音：循环 / 鼓 / 钢琴 / 垫音），转成 WAV 下载
function AudioMenu({ onExport, busy }: { onExport: (repeats: number) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON" && t.tagName !== "INPUT") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="导出音频文件：选择循环遍数"
        title="把听到的演奏存成通用音频文件"
        className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
      >
        {busy ? "录音中" : "音频"}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-1 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-44"
        >
          {[1, 2, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="menuitem"
              onClick={() => {
                onExport(n);
                setOpen(false);
              }}
              className="block w-full px-2 py-1 text-left hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
            >
              录 {n} 遍
            </button>
          ))}
          <div className="px-2 py-1 text-[10px] text-muted-foreground">录你听到的全部声音，存成 .wav</div>
        </div>
      )}
    </span>
  );
}

function HelpButton({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="显示使用说明与快捷键"
      className="border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
    >
      ?
    </button>
  );
}

// 生存 HUD 时长显示（mm:ss，秒位补零；恒定宽度避免内容变化挤压 chip）
function fmtMmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function HudOverlay(p: ReturnType<typeof useHome>) {
  const compose = p.mode === "compose";
  const challenge = p.mode === "challenge";
  const modeLabel = challenge ? "挑战" : compose ? "作曲" : "演奏";
  // 次级控制折叠：宽屏默认展开、手机默认收起（一行装不下时优先保证舞台高度）；
  // 收起态下若有次级功能处于活跃（动色/宏/循环台/空间/触屏键盘/垫音），「更多」chip 亮起提示
  const [more, setMore] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  const moreActive =
    p.timbreMode !== "off" ||
    p.macro !== "off" ||
    p.lsState !== "off" ||
    p.touchKeys ||
    p.padOn ||
    p.fx.rev > 0.01 ||
    p.fx.dly > 0.01;
  // 进入舞台的那一刻顶栏从上方滑入一次
  const headerRef = useHudEntrance<HTMLElement>(p.stage !== "intro");
  return (
    <header ref={headerRef} className="sticky top-0 z-30 w-full border-b border-border/30 bg-background/50 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="hidden tracking-widest text-card-foreground sm:inline">
            SCROLL ORCHESTRA
          </span>
          <span
            className={
              compose || challenge
                ? "bg-primary px-2 py-0.5 text-primary-foreground"
                : "border border-border px-2 py-0.5"
            }
            aria-label={`当前模式：${modeLabel}`}
          >
            {modeLabel}
          </span>
          {/* 音级名（宫商角徵羽等）固定宽位居顶部左侧：文案长短变化只在预留位内浮动，不挤右侧按钮行 */}
          <span
            className="hidden w-44 truncate text-card-foreground md:inline-block"
            aria-label={`当前音高：${p.pitchLabel}`}
          >
            {p.pitchLabel}
          </span>
        </div>
        {challenge ? (
          // 挑战态精简 HUD：关卡名 / 分数 / 连击（combo≥5 primary 亮）/ 帮助；
          // 对象计数、音阶、音色、鼓包、打字模式、背景开关、踏板、弱音、录音 chip 全部隐藏
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* 关卡位恒定占位：min-w 保下限，max-w + truncate 让 UGC 长曲名（「曲名 ★N」）不撑破 HUD */}
            <span
              className="min-w-[7.5rem] max-w-56 truncate border border-border px-2 py-0.5 text-center"
              aria-label={`当前关卡 ${p.challengeLevelName}`}
            >
              关卡 {p.challengeLevelName}
            </span>
            {p.challengeMode === "survival" ? (
              // 生存态：坚持时长 / 生命（扣一格变暗）/ 速度 % / 双倍 chip（亮时 primary）——
              // 全部恒定占位宽 + text-center，内容变化不抖动；计分链路复用常规关
              <>
                <span
                  aria-label={`已坚持 ${p.survivalSeconds} 秒`}
                  className="inline-block min-w-24 border border-border px-2 py-0.5 text-center"
                >
                  坚持 {fmtMmss(p.survivalSeconds)}
                </span>
                <span
                  aria-label={`生命剩余 ${p.survivalLives} 格`}
                  className="inline-block min-w-20 border border-border px-2 py-0.5 text-center tracking-widest"
                >
                  {"●".repeat(Math.max(0, p.survivalLives))}
                  <span className="text-muted-foreground/50">
                    {"●".repeat(Math.max(0, 3 - p.survivalLives))}
                  </span>
                </span>
                <span
                  aria-label={`当前速度 ${p.survivalSpeedPct}%`}
                  className="inline-block min-w-20 border border-border px-2 py-0.5 text-center"
                >
                  速度 {p.survivalSpeedPct}%
                </span>
                <span
                  aria-label={p.survivalDouble ? "双倍分数段进行中" : "双倍分数段未激活"}
                  className={
                    p.survivalDouble
                      ? "inline-block min-w-16 border border-primary bg-primary/10 px-2 py-0.5 text-center text-primary"
                      : "inline-block min-w-16 border border-border px-2 py-0.5 text-center"
                  }
                >
                  双倍
                </span>
                <span aria-label={`当前分数 ${p.challengeScore}`} className="inline-block min-w-[5.5rem] text-center">
                  得分 {p.challengeScore}
                </span>
                <span
                  aria-label={`当前连击 ${p.comboCount}`}
                  className={
                    p.comboCount >= 5
                      ? "min-w-[5rem] border border-primary px-2 py-0.5 text-center text-primary"
                      : "min-w-[5rem] border border-border px-2 py-0.5 text-center"
                  }
                >
                  连击 {p.comboCount}
                </span>
              </>
            ) : p.challengeMode === "practice" ? (
              // 练习中：不计分不显示分数/连击，改显当前小节；操作收进画面底部练习控制条
              <span
                className="min-w-[9.5rem] border border-primary px-2 py-0.5 text-center text-primary"
                aria-label={`慢速练习中，第 ${p.challengeDemoBar} 小节，共 ${p.challengeDemoBars} 小节`}
              >
                练习 · 第 {p.challengeDemoBar} / {p.challengeDemoBars} 小节
              </span>
            ) : p.challengeMode === "demo" ? (
              // 演示中：不展示分数/连击（不计分）；操作收进画面底部演示控制条
              <span className="border border-primary px-2 py-0.5 text-primary" aria-label="正在自动演示">
                演示中
              </span>
            ) : (
              <>
                <span aria-label={`当前分数 ${p.challengeScore}`} className="inline-block min-w-[5.5rem] text-center">
                  得分 {p.challengeScore}
                </span>
                <span
                  aria-label={`当前连击 ${p.comboCount}`}
                  className={
                    p.comboCount >= 5
                      ? "min-w-[5rem] border border-primary px-2 py-0.5 text-center text-primary"
                      : "min-w-[5rem] border border-border px-2 py-0.5 text-center"
                  }
                >
                  连击 {p.comboCount}
                </span>
              </>
            )}
            <HelpButton onToggle={p.onToggleHelp} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {p.guestCanvas && (
              <span className="text-primary">
                画布乐谱循环中 · 音阶 {p.scaleName} · 鼓 {p.drumKitName}
                {p.typingMode === "piano" ? " · 打字钢琴" : ""} · 可叠加即兴
              </span>
            )}
            {p.autoScore && <span className="text-primary">正在演奏你的乐谱</span>}
            <span
              aria-hidden={!p.loopPlaying}
              className={p.loopPlaying ? "inline-block w-[2.5em] text-center text-primary" : "inline-block w-[2.5em]"}
            >
              {p.loopPlaying ? "LOOP" : ""}
            </span>
            <button
              type="button"
              onClick={p.onToggleAllMuted}
              aria-pressed={p.allMuted}
              aria-label={p.allMuted ? "全局静音中，点击恢复声音" : "一键静音全部声音，点击恢复"}
              title="一键静音：所有声音暂时安静，再点恢复当前音量"
              className={p.allMuted ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]" : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"}
            >
              静音 {p.allMuted ? "开" : "关"}
            </button>
            <ThemeChip />
            {p.objectCount > 0 && (
              <button
                type="button"
                onClick={p.onToggleAccompPause}
                aria-pressed={p.accompPaused}
                aria-label={p.accompPaused ? "伴奏已暂停，点击从暂停处继续" : "暂停画布循环伴奏"}
                title="暂停伴奏：循环停在现在这句，再点从这刻继续；不影响你弹琴发声"
                className={p.accompPaused ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]" : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"}
              >
                伴奏 {p.accompPaused ? "暂停" : "播放"}
              </button>
            )}
            {compose && (
              <span aria-label={`画布对象数 ${p.objectCount}，上限 ${p.maxObjects}`} className="inline-block w-[3rem] text-center">
                {p.objectCount}/{p.maxObjects}
              </span>
            )}
            <BpmMenu bpm={p.bpm} onSet={p.onSetBpm} />
            <button
              type="button"
              onClick={p.onCycleScale}
              aria-label={`音阶：${p.scaleName}，点击切换下一套，快捷键 1 到 6 直达`}
              className="min-w-[6.75rem] border border-border px-2 py-0.5 text-center hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
            >
              音阶·{p.scaleName}
            </button>
            <VoiceMenu
              voiceId={p.voiceId}
              voiceName={p.voiceName}
              onPick={p.onPickVoice}
              onOpenSynth={p.onOpenSynth}
            />
            <button
              type="button"
              onClick={p.onCycleDrum}
              aria-label={`鼓组：${p.drumKitName}，点击切换下一套，快捷键 G`}
              className="min-w-[5.25rem] border border-border px-2 py-0.5 text-center hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
            >
              鼓·{p.drumKitName}
            </button>
            <button
              type="button"
              onClick={p.onCycleTyping}
              aria-label={`打字玩法：${p.typingModeName}，点击在鼓和钢琴之间切换`}
              className={
                p.typingMode === "piano"
                  ? "min-w-[4.75rem] border border-primary/60 px-2 py-0.5 text-center text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "min-w-[4.75rem] border border-border px-2 py-0.5 text-center hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              打·{p.typingModeName}
            </button>
            {p.typingMode === "piano" && (
              <button
                type="button"
                onClick={p.onToggleKeymap}
                aria-label={
                  p.keymap === "piano"
                    ? "键位：钢琴布局（中排白键、上排直按黑键），点击切回横向布局"
                    : "键位：横向布局（字母横排 26 白键），点击切到钢琴布局"
                }
                title={
                  p.keymap === "piano"
                    ? "中排 A S D F G H J K L = 白键，上排 W E T Y U O P = 直按黑键"
                    : "26 个字母从左到右排开 = 26 个白键，Shift 或黑键模式弹右邻黑键"
                }
                className={
                  p.keymap === "piano"
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                键位·{p.keymap === "piano" ? "钢琴" : "横向"}
              </button>
            )}
            {p.typingMode === "piano" && p.keymap === "qwerty" && (
              <button
                type="button"
                onClick={p.onToggleBlackMode}
                aria-pressed={p.blackMode}
                aria-label={
                  p.blackMode
                    ? "黑键模式开启，全部字母弹黑键，点击关闭"
                    : "黑键模式关闭，点击开启（等效常驻 Shift），也可按 Caps Lock 切换"
                }
                title="按 Caps Lock 也能切换；Shift+字母仍可随时临时弹黑键"
                className={
                  p.blackMode
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                黑键 {p.blackMode ? "开" : "关"}
              </button>
            )}
            {p.typingMode === "piano" && (
              <button
                type="button"
                onClick={p.onTogglePianoBg}
                aria-pressed={p.pianoBgOn}
                aria-label={p.pianoBgOn ? "背景切回深海粒子" : "背景切到钢琴键盘"}
                className={
                  p.pianoBgOn
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                背景·{p.pianoBgOn ? "钢琴" : "深海"}
              </button>
            )}
            {p.typingMode === "piano" && (
              <button
                type="button"
                onClick={p.onToggleSustain}
                aria-pressed={p.sustainOn}
                aria-label={
                  p.sustainOn
                    ? "延音踏板踩下中，点击松开"
                    : "延音踏板松开，点击踩下，钢琴模式下长按 0"
                }
                title="长按 0 踩延音踏板"
                className={
                  p.sustainOn
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                踏板 {p.sustainOn ? "踩" : "松"}
              </button>
            )}
            {p.typingMode === "piano" && (
              <button
                type="button"
                onClick={p.onToggleSoft}
                aria-pressed={p.softOn}
                aria-label={
                  p.softOn
                    ? "弱音器踩下中，点击松开"
                    : "弱音器松开，点击踩下，钢琴模式下长按 9"
                }
                title="长按 9 踩弱音器踏板"
                className={
                  p.softOn
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                弱音 {p.softOn ? "踩" : "松"}
              </button>
            )}
            {more && (
              <button
                type="button"
                onClick={p.onTogglePad}
                aria-pressed={p.padOn}
                aria-label={p.padOn ? "关闭环境垫音" : "开启环境垫音"}
                className={
                  p.padOn
                    ? "border border-primary/60 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                垫音 {p.padOn ? "开" : "关"}
              </button>
            )}
            {compose && (
              <>
                <button
                  type="button"
                  onClick={p.onUndo}
                  disabled={!p.canUndo}
                  aria-label="撤销上一步作曲改动"
                  title="Ctrl+Z"
                  className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
                >
                  ↶
                </button>
                <button
                  type="button"
                  onClick={p.onRedo}
                  disabled={!p.canRedo}
                  aria-label="重做作曲改动"
                  title="Ctrl+Y"
                  className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:shadow-[var(--focus-ring)]"
                >
                  ↷
                </button>
                <CurveMenu mode={p.autoParam} label={p.curveLabel} onSet={p.onSetCurveParam} />
                <button
                  type="button"
                  onClick={p.onOpenRoll}
                  aria-label="钢琴卷帘：选中一条线后逐个音符编辑"
                  title="选中一条线后打开：拖方块改音高/时间，双击删音，点空加音"
                  className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    p.rollOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/60 hover:text-primary"
                  }`}
                >
                  卷帘
                </button>
                <DeformMenu {...p} />
                <button
                  type="button"
                  onClick={p.onOpenHum}
                  aria-label="哼唱转音符：对着话筒哼一段旋律，编译成画布上的循环乐句"
                  title="哼一段旋律落进画布（戴耳机更准）"
                  className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    p.humOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/60 hover:text-primary"
                  }`}
                >
                  哼
                </button>
                <button
                  type="button"
                  onClick={p.onToggleAi}
                  aria-label="AI 指挥台：混音建议、编曲建议、风格迁移、歌词生成"
                  title="AI 指挥台：混音 / 编曲 / 风格迁移 / 歌词（选中旋律线可配词）"
                  className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    p.aiOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/60 hover:text-primary"
                  }`}
                >
                  AI
                </button>
                <button
                  type="button"
                  onClick={p.onToggleHist}
                  aria-label="作曲历史：列出全部编辑步骤，点任意一步时间旅行"
                  title="撤销栈可视化：点任意步骤跳到那时的画布，可再前进回未来状态"
                  className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    p.histOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/60 hover:text-primary"
                  }`}
                >
                  历史{p.canUndo ? ` ${p.histPos}` : ""}
                </button>
                {p.relayInfo && (
                  <span
                    className="inline-block min-w-[11rem] truncate border border-primary/60 bg-primary/10 px-2 py-0.5 text-center text-primary"
                    aria-label={`接龙进行中：第 ${p.relayInfo.myLegNo} 棒，上棒 ${p.relayInfo.prevNick ?? "无"}`}
                  >
                    接龙 · 第 {p.relayInfo.myLegNo} 棒 · 上棒：{p.relayInfo.prevNick ?? "—"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={p.onToggleRelay}
                  aria-pressed={p.relayOpen}
                  aria-label={p.relayLedger ? "打开接龙面板：棒次列表与传给下一位" : "接龙作曲：画一段发给下一个人的异步协作玩法"}
                  title={p.relayLedger ? "接龙进行中：看每一棒是谁、单听某段、传给下一位" : "接龙作曲：每人画一段（4 小节），传链接接力成曲"}
                  className={`border px-2 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                    p.relayOpen || p.relayLedger
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/60 hover:text-primary"
                  }`}
                >
                  接龙
                </button>
                <SlotsMenu
                  metas={p.slotMetas}
                  onSave={p.onSaveSlot}
                  onLoad={p.onLoadSlot}
                  onRemove={p.onRemoveSlot}
                  copyPick={p.copyPick}
                  onStartCopy={p.onStartCopySlot}
                  onCancelCopy={p.onCancelCopySlot}
                  onConfirmCopy={p.onConfirmCopySlot}
                />
                <MidiMenu onExport={p.onExportMidi} />
                <AudioMenu onExport={p.onExportAudio} busy={p.audioBusy} />
                <button
                  type="button"
                  onClick={p.onOpenMix}
                  aria-label="打开分轨混音台：每条线独立音量、声像、静音独奏"
                  title="分轨混音：音量 / 声像 / 静音 / 独奏"
                  className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  混音
                </button>
                <button
                  type="button"
                  onClick={p.onExportCover}
                  aria-label="把当前画布作品导出成封面分享图"
                  title="把画布作品渲染成一张分享图，配音频一起发"
                  className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                >
                  封面图
                </button>
                <ClearCanvasButton onClear={p.onClearCanvas} />
              </>
            )}
            {more && (
              <button
                type="button"
                onClick={p.onToggleGallery}
                aria-label="打开公共画廊：发布作品与查看天梯榜"
                className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                画廊
              </button>
            )}
            {more && (
              <button
                type="button"
                onClick={p.onToggleConductor}
                aria-pressed={p.conductorOpen}
                aria-label="打开乐团指挥：聊乐理、帮你出编曲主意的常驻角色"
                className={
                  p.conductorOpen
                    ? "border border-primary bg-primary px-2 py-0.5 text-primary-foreground focus-visible:shadow-[var(--focus-ring)]"
                    : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                }
              >
                指挥
              </button>
            )}
            <button
              type="button"
              onClick={p.onEnterChallenge}
              aria-label="直接进入挑战模式"
              title="Tab 三态循环也能进：演奏 → 作曲 → 挑战"
              className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              挑战
            </button>
            <HelpButton onToggle={p.onToggleHelp} />
            <button
              type="button"
              onClick={p.onToggleRecord}
              aria-pressed={p.recActive}
              aria-label={p.recActive ? "停止录音" : "开始录音"}
              className={
                p.recActive
                  ? "border border-destructive px-2 py-0.5 text-card-foreground hover:bg-destructive/10 focus-visible:shadow-[var(--focus-ring)]"
                  : "border border-border px-2 py-0.5 hover:border-foreground/60 hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {p.recActive ? "■ 停止" : "● 录音"}
            </button>
            {p.recActive && (
              <span className="flex items-center gap-1.5 text-card-foreground">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                REC {p.recClock}
              </span>
            )}
            {p.replayActive && (
              <span className="flex items-center gap-1.5 border border-primary px-2 py-0.5 text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                重放中
              </span>
            )}
            <RecHistoryMenu
              entries={p.recHistory}
              open={p.recHistoryOpen}
              onOpen={p.onOpenRecHistory}
              onClose={p.onCloseRecHistory}
              onPlay={p.onPlayRecHistory}
              onShare={p.onShareRecHistory}
              onStar={p.onStarRecHistory}
              onRemove={p.onRemoveRecHistory}
            />
            {more && (
              <>
            <FxPanel fx={p.fx} onSet={p.onSetFx} />
            <SoundPanel {...p} />
            <PerfChip {...p} />
            <AccessPanel {...p} />
            <JamPanel {...p} />
            <button
              type="button"
              onClick={p.onToggleTouchKeys}
              aria-pressed={p.touchKeys}
              aria-label="触屏键盘：屏幕底部浮出可点按的琴键"
              className={
                p.touchKeys
                  ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              琴键
            </button>
            <button
              type="button"
              onClick={() => void p.onToggleMidiIn()}
              aria-pressed={p.midiIn}
              aria-label="MIDI 键盘输入：外接键盘弹琴与挑战判定共用"
              title={
                p.midiIn
                  ? p.midiDevs.length > 0
                    ? `已连接：${p.midiDevs.join("、")}`
                    : "MIDI 已连接，等待设备"
                  : "点击连接外接 MIDI 键盘"
              }
              className={
                p.midiIn
                  ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {p.midiIn && p.midiDevs.length > 0 ? `MIDI·${p.midiDevs.length}` : "MIDI"}
            </button>
            <TimbreMenu mode={p.timbreMode} label={p.timbreLabel} onSet={p.onSetTimbre} />
            <button
              type="button"
              onClick={p.onToggleMacro}
              aria-label={
                p.macro === "off" ? "乐句宏：关闭，点击开启琶音" : p.macro === "arp" ? "乐句宏：琶音，点击切音阶" : "乐句宏：音阶，点击关闭"
              }
              aria-pressed={p.macro !== "off"}
              className={
                p.macro === "off"
                  ? "min-w-[4.75rem] border border-border px-2 py-0.5 text-center hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "min-w-[4.75rem] border border-primary bg-primary/10 px-2 py-0.5 text-center text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {p.macro === "off" ? "宏·关" : p.macro === "arp" ? "宏·琶音" : "宏·音阶"}
            </button>
            <button
              type="button"
              onClick={p.onLsToggle}
              aria-label={
                p.lsState === "off"
                  ? "循环台：开始录制第一层"
                  : p.lsState === "rec"
                    ? "循环台：停止录制并开始循环"
                    : p.lsState === "play"
                      ? "循环台：叠加新层"
                      : "循环台：合并当前叠录层"
              }
              className={
                p.lsState === "rec" || p.lsState === "dub"
                  ? "min-w-[7rem] border border-destructive px-2 py-0.5 text-center text-card-foreground hover:bg-destructive/10 focus-visible:shadow-[var(--focus-ring)]"
                  : p.lsState === "play"
                    ? "min-w-[7rem] border border-primary bg-primary/10 px-2 py-0.5 text-center text-primary focus-visible:shadow-[var(--focus-ring)]"
                    : "min-w-[7rem] border border-border px-2 py-0.5 text-center hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {p.lsState === "off"
                ? "↻ 循环台"
                : p.lsState === "rec"
                  ? "● 录循环"
                  : p.lsState === "play"
                    ? `▶ 循环·${p.lsLayerCount}层`
                    : "● 叠录中"}
            </button>
            {p.lsState !== "off" && p.lsLayerCount > 0 && (
              <button
                type="button"
                onClick={p.onLsUndoLayer}
                aria-label="撤销循环台最上层"
                title="撤销最上层"
                className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                －1层
              </button>
            )}
            {p.lsState === "dub" && (
              <button
                type="button"
                onClick={p.onLsUndoLayer}
                aria-label="取消本次叠录"
                title="取消本次叠录"
                className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/70 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              >
                撤销叠录
              </button>
            )}
            {p.lsState !== "off" && (
              <button
                type="button"
                onClick={p.onLsClear}
                aria-label="清空循环台全部层"
                className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-destructive hover:text-destructive focus-visible:shadow-[var(--focus-ring)]"
              >
                ×
              </button>
            )}
              </>
            )}
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              aria-label={more ? "收起次级控制条" : "展开次级控制（垫音/画廊/空间/琴键/动色/宏/循环台）"}
              className={
                !more && moreActive
                  ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
                  : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {more ? "收起" : "更多"}
            </button>
          </div>
        )}
        {/* RH 账号入口：文本生成等 AI 能力按登录态计费，顶部 chrome 常驻（未登录即「RunningHub 登录」按钮） */}
        <span className="flex items-center">
          <RhAccountMenu />
        </span>
      </div>
      {p.capToast && (
        <div className="absolute left-1/2 top-full z-30 -translate-x-1/2 border border-border bg-card px-3 py-1.5 font-mono text-xs text-card-foreground shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
          已达 {p.maxObjects} 个对象上限，先删掉一些再画
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {p.announce}
      </div>
    </header>
  );
}
