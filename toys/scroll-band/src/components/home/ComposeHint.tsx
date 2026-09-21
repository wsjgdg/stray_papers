export function ComposeHint() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-24 z-30 max-w-[calc(100vw-2rem)] -translate-x-1/2 whitespace-nowrap border border-border bg-card/90 px-4 py-2 text-center font-mono text-xs text-card-foreground shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div>上高下低，画一条线试试</div>
      <div className="mt-1 text-muted-foreground">切「曲线」还能画音量/滤波/声像/混响变化</div>
    </div>
  );
}
