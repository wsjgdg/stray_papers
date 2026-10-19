import { useEffect, useRef, useState } from "react";
import { Radio, X } from "lucide-react";
import type { CommSubtitleState } from "@/pages/Home/useHome";

interface CommSubtitleProps {
  line: CommSubtitleState | null;
  visible: boolean;
  cinemaMode: boolean;
  onClose: () => void;
  onReopen: () => void;
}

const TYPE_MS = 45;

export function CommSubtitle({ line, visible, cinemaMode, onClose, onReopen }: CommSubtitleProps) {
  const [shownChars, setShownChars] = useState(0);
  const [exiting, setExiting] = useState(false);
  const lastLineRef = useRef<CommSubtitleState | null>(null);

  useEffect(() => {
    if (!line) {
      if (lastLineRef.current) {
        setExiting(true);
        const fadeTimer = window.setTimeout(() => {
          setExiting(false);
          lastLineRef.current = null;
        }, 600);
        return () => window.clearTimeout(fadeTimer);
      }
      return;
    }
    lastLineRef.current = line;
    setExiting(false);
    setShownChars(0);
    const typeTimer = window.setInterval(() => {
      setShownChars((prev) => {
        if (prev >= line.text.length) {
          window.clearInterval(typeTimer);
          return prev;
        }
        return prev + 1;
      });
    }, TYPE_MS);
    return () => window.clearInterval(typeTimer);
  }, [line]);

  if (!visible) {
    return (
      <div className="flex min-h-10 justify-center pt-2">
        <button
          type="button"
          onClick={onReopen}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          地面通话字幕已关闭 · 点击恢复
        </button>
      </div>
    );
  }

  const active = line ?? (exiting ? lastLineRef.current : null);

  return (
    <div className="flex min-h-10 justify-center pt-2">
      {active && (
        <div
          className={`flex max-w-full items-start gap-3 rounded-lg border border-primary/40 bg-background/85 px-4 py-2.5 shadow-lg backdrop-blur transition-opacity duration-500 ${
            exiting ? "opacity-0" : "animate-in fade-in slide-in-from-bottom-2 duration-300 opacity-100"
          }`}
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10">
            <Radio className="h-3 w-3 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-xs tracking-widest text-primary">
              {active.speaker}
              {/* 说话中：三根竖条错峰跳动的语音波形 */}
              {!exiting && (
                <span className="flex h-3 items-end gap-px" aria-hidden="true">
                  <span className="comm-wave cw-1 h-1.5 w-0.5 rounded-sm bg-primary" />
                  <span className="comm-wave cw-2 h-3 w-0.5 rounded-sm bg-primary" />
                  <span className="comm-wave cw-3 h-2 w-0.5 rounded-sm bg-primary" />
                </span>
              )}
            </p>
            <p className={`mt-0.5 font-sans leading-relaxed text-foreground ${cinemaMode ? "text-base" : "text-sm"}`}>
              {active.text.slice(0, shownChars)}
              {!exiting && shownChars < active.text.length && (
                <span className="animate-pulse text-primary">▌</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭通话字幕"
            title="关闭字幕"
            className="ml-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
