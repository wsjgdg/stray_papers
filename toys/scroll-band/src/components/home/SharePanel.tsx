import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

export function SharePanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  return (
    <div ref={rootRef} className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div data-panel-card className="w-full max-w-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
        <h2 className="font-mono text-2xl font-bold">作品快照已生成</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          演奏事件和画布上画的乐句都压缩进了链接。别人打开会看到一幅自动演奏的可见乐谱，他还能在上面叠加自己的即兴或继续画。
        </p>
        <div className="mt-4 border border-border bg-background p-3">
          <input
            readOnly
            value={p.shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-background font-mono text-xs text-foreground outline-none focus-visible:shadow-[var(--focus-ring)]"
            aria-label="分享链接"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            type="button"
            aria-pressed={p.shareRo}
            onClick={p.onToggleShareRo}
            className={`border px-2 py-1 focus-visible:shadow-[var(--focus-ring)] ${
              p.shareRo
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
            }`}
          >
            {p.shareRo ? "✓ 只读模式已开" : "只读模式"}
          </button>
          <span className="text-muted-foreground">
            开了别人只能看和听、改不动你的画布；不开则可以直接接着画
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={p.onCopy}
            className="bg-primary px-4 py-2 font-mono text-xs text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {p.copied ? "已复制" : "复制链接"}
          </button>
          <button
            type="button"
            onClick={p.onReplayRecording}
            className="border border-border px-4 py-2 font-mono text-xs text-card-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            回放这段演奏
          </button>
          <button
            type="button"
            onClick={p.onCloseShare}
            className="ml-auto px-2 py-2 font-mono text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
          >
            关闭
          </button>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          空格 = 循环播放这段 · R = 再录一段
        </p>
      </div>
    </div>
  );
}
