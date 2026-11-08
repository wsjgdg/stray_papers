interface BootOverlayProps {
  bootVisibleLines: string[];
  bootProgress: number;
  bootDone: boolean;
}

export function BootOverlay({ bootVisibleLines, bootProgress, bootDone }: BootOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-700 ${
        bootDone ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={bootDone}
    >
      <div className="relative w-full max-w-xl px-6">
        <div className="mb-6 text-center">
          <p className="font-mono text-xs tracking-widest text-muted-foreground">SYSTEM POWER-ON SEQUENCE</p>
          <h2 className="font-display text-3xl font-bold text-foreground">
            系统<span className="text-primary">上电自检</span>
          </h2>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 font-mono text-sm shadow-lg">
          {bootVisibleLines.map((line) => (
            <p key={line} className="animate-in fade-in slide-in-from-bottom-2 duration-300 py-0.5 text-secondary-foreground">
              <span className="mr-2 text-primary">&gt;</span>
              {line}
            </p>
          ))}
          {!bootDone && (
            <p className="py-0.5 text-muted-foreground">
              <span className="mr-2 text-primary">&gt;</span>
              <span className="animate-pulse">INITIALIZING ...</span>
            </p>
          )}
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="relative h-full overflow-hidden rounded-full bg-primary transition-all duration-200"
            style={{ width: `${Math.round(bootProgress * 100)}%` }}
          >
            {/* 进度条掠光：一道亮带循环扫过, 充能感 */}
            <span className="boot-bar-shine absolute inset-y-0 left-0 w-1/3" aria-hidden="true" />
          </div>
        </div>
        <p className="mt-2 text-center font-mono text-xs tracking-widest text-muted-foreground">
          {Math.round(bootProgress * 100)}% · 遥测数据流即将建立
        </p>

        <div className="pointer-events-none absolute inset-x-0 -top-10 h-px animate-pulse bg-primary/40" />
      </div>
    </div>
  );
}
