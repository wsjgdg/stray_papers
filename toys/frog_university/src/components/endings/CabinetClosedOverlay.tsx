/**
 * 结局图鉴 · 合上档案柜（批次 AN）
 * 全收集后的另一条终点：不写那一页，把柜子合上。
 * 闭柜不在流程里，所以没有人记录这件事——只有灯知道。
 * 这个动作可以撤销（「再开一次」），柜子不问为什么，但每一次都数。
 */
export function CabinetClosedOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="卷终"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl bg-card p-6 shadow-2xl sm:p-10">
          <p className="text-center text-[10px] font-bold tracking-widest text-muted-foreground">档案室 · 卷终</p>
          <h2 className="mt-2 text-center text-xl font-black tracking-tight text-card-foreground">柜子合上了</h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-card-foreground">
            <p>
              没有上锁——这栋楼不用锁，它用流程。合上的柜子每年照例清点，清点单上照旧写「在柜」：
              闭柜不在流程里，所以没有人记录这件事。
            </p>
            <p className="border-l-2 border-border pl-4 text-muted-foreground">
              那页纸还空在最里面。你没有写——不是忘了写，是决定让它空着。
              空着也算一种写法：档案室把它归成「当事人留存」。
            </p>
            <p>
              值班室的灯今天早关了十分钟。<span className="font-bold">是你关的。</span>
            </p>
          </div>
          <p className="mt-6 text-center text-[10px] leading-relaxed text-muted-foreground">
            之后想看还在——柜子可以再打开；每一次打开，它都数着。
          </p>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              出去
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 柜子合上之后的档案柜区块：整页收进一扇门——每一页都在，只是不再翻它 */
export function CabinetClosedPanel({
  closes,
  opens,
  onReopen,
}: {
  closes: number;
  opens: number;
  onReopen: () => void;
}) {
  return (
    <section
      aria-label="档案柜 · 已合上"
      className="mt-8 rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
        <span aria-hidden className="inline-block h-3 w-3 rounded-sm border border-border bg-background/70" />
        档案柜 · 合着
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        柜子合上了。里面的每一页都在——你只是不再翻它。清点单上照旧写「在柜」：闭柜不在流程里。
      </p>
      <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground/80">
        合上 {closes} 次 · 再打开 {opens} 次 · 柜子不问为什么
      </p>
      <button
        type="button"
        onClick={onReopen}
        className="mt-4 rounded-full border border-border bg-card px-5 py-2.5 text-xs font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
      >
        再开一次
      </button>
    </section>
  );
}
