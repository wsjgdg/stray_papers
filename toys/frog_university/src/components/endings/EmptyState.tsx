import { FrogNaiBai } from "@/components/frog/Frog";

interface EmptyStateProps {
  onGoToMap: () => void;
}

/** 空状态（0/18）：图鉴还空着，引导先去校园走一条线 */
export function EmptyState({ onGoToMap }: EmptyStateProps) {
  return (
    <section
      aria-label="图鉴还是空的"
      className="anim-fade-up rounded-3xl border border-dashed border-border bg-card/80 px-6 py-14 text-center shadow-md"
    >
      <span className="mx-auto block w-fit saturate-0 opacity-50" aria-hidden>
        <FrogNaiBai size={84} expression="silent" />
      </span>
      <h2 className="mt-6 text-xl font-bold text-card-foreground md:text-2xl">还没有结局落进图鉴。</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
        去过一次校园再说。
      </p>
      <button
        type="button"
        onClick={onGoToMap}
        className="mt-7 rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-foreground shadow-md transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none active:scale-[0.98]"
      >
        去校园地图
      </button>
    </section>
  );
}
