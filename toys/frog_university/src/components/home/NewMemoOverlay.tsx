/**
 * 《册子添了新页》（批次 CY-47）：学期结档（开新学期 / 冬眠 / 蜕皮）的瞬间，纪念册自动收进一页——
 * 回到标题界面时柜子主动递出这一页的收页回执：数字与线名摊开在眼前，翻不翻册子由你。
 * 判词不落在这里（那是图鉴柜里的话）；签收一次即落档，不弹第二次。
 */
import { BookOpenCheck } from "lucide-react";
import { clsx } from "clsx";
import { formatCnDate, type SemesterMemo } from "@/lib/gameSave";
import { WeatherGlyph } from "@/components/common/WeatherGlyph";
import { WEATHER_META } from "@/lib/calendar";

/** 涨跌小箭头（批次 CY-52）：与图鉴柜同款口径，此处独立实现 */
function DeltaTag({ diff }: { diff: number }) {
  if (diff === 0) return <span className="font-bold text-muted-foreground">— 持平</span>;
  return (
    <span className={clsx("font-bold", diff > 0 ? "text-primary" : "text-muted-foreground")}>
      {diff > 0 ? `▲ +${diff}` : `▼ ${diff}`}
    </span>
  );
}

/** 数字小格（与图鉴柜同款口径，此处独立实现——标题页不背图鉴柜的包） */
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-center">
      <span className="block text-[10px] font-bold text-muted-foreground">{label}</span>
      <span className="mt-1 block text-lg leading-tight font-black text-card-foreground">{value}</span>
    </span>
  );
}

export function NewMemoOverlay({
  memo,
  prev,
  sealedCount,
  onOpenBook,
  onDefer,
}: {
  memo: SemesterMemo;
  prev: SemesterMemo | null;
  sealedCount: number;
  onOpenBook: () => void;
  onDefer: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="册子添了新页"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
    >
      <div className="anim-fade-up w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-2xl">
        <p className="text-center font-mono text-xs font-bold tracking-widest text-muted-foreground">
          档案室 · 收页回执
        </p>
        <h2 className="mt-2 text-center text-xl font-black text-card-foreground">册子添了一页</h2>
        <p className="mt-1.5 text-center text-[10px] font-bold text-muted-foreground">
          第 {memo.semester} 学期 · 结档于 {formatCnDate(memo.stamp)}
          {memo.weather && (
            <>
              {" · 那日"}
              <WeatherGlyph label={memo.weather} />
              {memo.weather}
            </>
          )}
        </p>
        {memo.lines.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            走完的线：{memo.lines.map((title) => `《${title}》`).join("、")}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label="本学期真话" value={memo.truths} />
          <MiniStat label="本学期沉默" value={memo.silence} />
          <MiniStat label="图鉴累计" value={memo.endings} />
        </div>
        {/* 那日天气的一句话（批次 CY-59）：口径与校园顶栏同源 */}
        {(() => {
          const meta = memo.weather ? Object.values(WEATHER_META).find((entry) => entry.label === memo.weather) : undefined;
          if (!meta) return null;
          return (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              <WeatherGlyph label={meta.label} size={10} />
              {` 那日${meta.label}——${meta.hint}`}
            </p>
          );
        })()}
        {prev && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] leading-relaxed text-muted-foreground">
            <span>和上学期对账：</span>
            <span>真话 <DeltaTag diff={memo.truths - prev.truths} /></span>
            <span>沉默 <DeltaTag diff={memo.silence - prev.silence} /></span>
            <span>图鉴累计 <DeltaTag diff={memo.endings - prev.endings} /></span>
          </p>
        )}
        {sealedCount > 0 && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            册子里另有 {sealedCount} 页盖着你自带的章——章边上记着盖讫的日子。
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-primary">
          门槛替你记下了这一学期。这一页已经在柜子里了——要不要现在翻给蛙看一眼？
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            autoFocus
            onClick={onOpenBook}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
          >
            <BookOpenCheck size={14} aria-hidden />
            翻翻册子
          </button>
          <button
            type="button"
            onClick={onDefer}
            className="rounded-full border border-border bg-background px-5 py-2 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
          >
            先收进柜子
          </button>
        </div>
      </div>
    </div>
  );
}
