/**
 * 《存档损坏说明》（优化批次）：上次存档读取异常被清档重开时，回到标题界面弹一次——
 * 不再静默重置；原文副本已留在本地备查，玩家有权知道自己的进度发生了什么。
 */
export function CorruptSaveOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="存档损坏说明"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
    >
      <div className="anim-fade-up w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-lg">
        <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground">
          档案室 · 事故报告
        </p>
        <h2 className="mt-2 text-lg font-bold text-card-foreground">《存档损坏说明》</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          上次的存档读取时出了异常，记录员把档案清掉重做了。
          <br />
          原文已复印一份，收在档案柜最里层备查。本学期从空白页开始。
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-5 rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
