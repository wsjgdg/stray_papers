import { RichText } from "@/components/common/RichText";
/**
 * 舞台耳语（批次 AH）：蛙的生物学——鸣叫的回声 / 冷血的关心。
 * 一行浮在舞台上方的档案腔小字，几秒后自行收起（由 usePlay 控制清空，这里不设计时器）。
 * 它不进对话流、不进回想、不进数值——它只是空气里的一句。
 */
export function BiologyWhisper({ text, stamp }: { text: string; stamp: number }) {
  return (
    <div
      key={stamp}
      className="anim-fade-up pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-6"
    >
      <RichText className="max-w-md rounded-full border border-border bg-background/85 px-4 py-1.5 text-center text-[11px] leading-relaxed text-muted-foreground shadow-sm backdrop-blur" text={text} />
    </div>
  );
}
