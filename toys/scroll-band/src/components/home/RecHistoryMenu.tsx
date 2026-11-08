import { useEffect, useRef, useState } from "react";
import type { RecHistoryEntry } from "@/lib/audio/recHistory";

// 演奏历史：每次停止录音自动入档（≤6 条新在前）。回放=按快照原事件排一遍；星标收藏不被顶掉；删除两步确认防误删。
interface RecHistoryMenuProps {
  entries: RecHistoryEntry[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPlay: (savedAt: number, speed: number) => void;
  onShare: (savedAt: number) => void;
  onStar: (savedAt: number) => void;
  onRemove: (savedAt: number) => void;
}

export function RecHistoryMenu({
  entries,
  open,
  onOpen,
  onClose,
  onPlay,
  onShare,
  onStar,
  onRemove,
}: RecHistoryMenuProps) {
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      onClose();
      // 点向画布时吞掉这次按下，避免收起面板顺手起一条草稿线；按钮放行
      const t = e.target as HTMLElement | null;
      if (t && t.tagName !== "BUTTON") e.stopPropagation();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose]);

  const fmt = (t: number) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  return (
    <span ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="演奏历史：最近录的演奏可重放与删除"
        className="border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
      >
        历史{entries.length > 0 ? ` ${entries.length}` : ""}
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 bottom-3 z-40 border border-border bg-card p-2 text-card-foreground shadow-md sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:w-72"
        >
          {entries.length === 0 ? (
            <p className="p-2 text-center font-mono text-xs text-muted-foreground">
              还没有记录——点「● 录音」录一段再停止，演奏会自动存进这里
            </p>
          ) : (
            <ul className="space-y-1">
              {entries.map((e) => {
                const dur = e.events.reduce((m, ev) => Math.max(m, ev.t), 0);
                return (
                  <li
                    key={e.savedAt}
                    className="flex items-center gap-1.5 border border-border px-1.5 py-1 font-mono text-xs"
                  >
                    <button
                      type="button"
                      aria-pressed={e.starred === true}
                      aria-label={e.starred ? "取消收藏这段演奏" : "收藏这段演奏（不被新录音顶掉）"}
                      title={e.starred ? "已收藏：不会被新录音顶掉" : "收藏：不被新录音顶掉，排最前"}
                      onClick={() => onStar(e.savedAt)}
                      className={`px-1 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                        e.starred ? "text-primary" : "text-muted-foreground hover:text-primary"
                      }`}
                    >
                      {e.starred ? "★" : "☆"}
                    </button>
                    <span className="min-w-0 flex-1 truncate" title={`${fmt(e.savedAt)} · ${e.bpm}BPM`}>
                      {fmt(e.savedAt)} · {e.events.length} 音 · {Math.ceil(dur)}s
                    </span>
                    <button
                      type="button"
                      aria-label={`重放 ${fmt(e.savedAt)} 的演奏`}
                      onClick={() => onPlay(e.savedAt, speed)}
                      className="border border-primary bg-primary px-1.5 py-0.5 text-primary-foreground hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)]"
                    >
                      重放
                    </button>
                    <button
                      type="button"
                      aria-label={`分享 ${fmt(e.savedAt)} 的演奏`}
                      onClick={() => onShare(e.savedAt)}
                      className="border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
                    >
                      分享
                    </button>
                    <button
                      type="button"
                      aria-label={confirmDel === e.savedAt ? "再次点击确认删除这条历史演奏" : "删除这条历史演奏"}
                      onClick={() => {
                        if (confirmDel === e.savedAt) {
                          onRemove(e.savedAt);
                          setConfirmDel(null);
                        } else {
                          setConfirmDel(e.savedAt);
                        }
                      }}
                      className={`border px-1.5 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                        confirmDel === e.savedAt
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                      }`}
                    >
                      {confirmDel === e.savedAt ? "确认删" : "删"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-1.5 font-mono text-xs">
            <span className="text-muted-foreground">重放速度</span>
            {([0.5, 0.75, 1] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                aria-label={`重放速度 ${s} 倍`}
                onClick={() => setSpeed(s)}
                className={`border px-1.5 py-0.5 focus-visible:shadow-[var(--focus-ring)] ${
                  speed === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                }`}
              >
                {s === 1 ? "原速" : `${s}×`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted-foreground">
            自动留最近 6 段，新的顶掉最旧的；★ 收藏的不会被顶掉。只存在这台设备的本地
          </p>
        </div>
      )}
    </span>
  );
}
