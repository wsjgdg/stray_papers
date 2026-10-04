/**
 * 结局图鉴 · 未编目（全收集限定）
 * 档案柜最里面那页没有编号的纸：把 30 种结局全部见过后翻开。
 * 只是个图鉴入口，不写存档——解锁状态由「全收集」派生，全文在结局详情弹层里读。
 * 批次 AN：全收集后档案室有两条终点——把那页纸写了，或者把柜子合上（两步确认）。
 */
import { useState } from "react";
import { BookLock, BookOpen, DoorClosed, PenLine } from "lucide-react";

interface SecretEndingSectionProps {
  unlocked: boolean;
  collected: number;
  total: number;
  onOpen: () => void;
  /** 到那页上去写（第四面）：写下的话独立存档，跨学期保留 */
  onWrite: () => void;
  /** 这一页已经有字了：按钮文案换成「回看那一页」 */
  pageFilled?: boolean;
  /** 合上档案柜（批次 AN）：闭柜不在流程里——确认后落档并盖上卷终浮层 */
  onCloseCabinet?: () => void;
}

export function SecretEndingSection({
  unlocked,
  collected,
  total,
  onOpen,
  onWrite,
  pageFilled = false,
  onCloseCabinet,
}: SecretEndingSectionProps) {
  const [closeArmed, setCloseArmed] = useState(false);
  if (unlocked) {
    return (
      <section
        aria-label="未编目"
        className="anim-fade-up relative overflow-hidden rounded-3xl border border-primary/40 bg-primary/10 p-6 shadow-md md:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
        />
        <header className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            <BookOpen size={13} aria-hidden />
            档案室 · 未编目
          </span>
          <span className="rounded-full border border-primary/40 bg-card px-3 py-1 text-xs font-bold text-card-foreground">
            全收集限定
          </span>
        </header>
        <h3 className="mt-3 text-2xl font-bold text-foreground md:text-3xl">未编目</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-card-foreground/90">
          第二十五页。不编目，不归还——内容以你的版本为准。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onWrite}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <PenLine size={14} aria-hidden />
            {pageFilled ? "回看那一页" : "到那页上去写"}
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
          >
            档案室的说明
          </button>
        </div>
        {/* 合上档案柜（批次 AN）：不写，把柜子合上——两条终点的另一条；两步确认 */}
        {onCloseCabinet && (
          <div className="mt-4 border-t border-dashed border-border pt-4">
            {closeArmed ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                  合上就到这了。那页纸还空着——合上等于决定不写。
                </p>
                <button
                  type="button"
                  onClick={() => setCloseArmed(false)}
                  className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再想想
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCloseArmed(false);
                    onCloseCabinet();
                  }}
                  className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  确认合上
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCloseArmed(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                <DoorClosed size={13} aria-hidden />
                合上档案柜——不写那页纸的另一条终点
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="未编目"
      className="anim-fade-up rounded-3xl border border-dashed border-border bg-card p-6 shadow-sm md:p-8"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          <BookLock size={13} aria-hidden />
          档案室
        </span>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
          已见 {collected}/{total} 种结局
        </span>
      </header>
      <h3 className="mt-3 text-xl font-bold text-foreground md:text-2xl">有一页没有编号</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        柜子最里面有一页没有编号的纸。前三十页它都写得动：沉默值、岔路、公示栏评语，格式规范。这一页它写不动——不是漏了，是栏目里没有格子。
      </p>
      <p className="mt-3 text-xs font-bold text-primary">把 {total} 种结局全部见过之后揭晓。</p>
    </section>
  );
}
