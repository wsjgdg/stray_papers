/**
 * 新手引导（一次性）：第一次进校园时弹一次，讲清玩法与三个数值的口径。
 * 「知道了」和「跳过」都写进存档；标记跨周目保留，看过一个学期就不再弹。
 */
import { Map, Moon, Waves } from "lucide-react";
import { FrogNaiBai } from "@/components/frog/Frog";

/** 三个数值的人话口径：与好感面板、沉默值侧栏的说明保持同一套语义 */
const STAT_ROWS = [
  { label: "沉默值", meaning: "私下的你。越配合表演，它涨得越快。" },
  { label: "好感度", meaning: "关系中的你。离每只蛙面具背后的真话有多近。" },
  { label: "印象分", meaning: "表演的你。公开场合里，你演得有多像样。" },
];

interface TutorialOverlayProps {
  /** 收起引导：跳过和看完都算看过 */
  onDismiss: () => void;
}

export function TutorialOverlay({ onDismiss }: TutorialOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/45 p-4 backdrop-blur-sm"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="新生引导"
        className="mx-auto my-auto flex min-h-full w-full max-w-lg animate-in items-center py-4 fade-in zoom-in-95 duration-300"
      >
        <div
          className="w-full rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-7"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <span className="shrink-0">
              <FrogNaiBai size={56} />
            </span>
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-card-foreground">入学须知</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                没有教程。只有几件开学第一周就会知道的事。
              </p>
            </div>
          </div>

          <section
            aria-label="怎么玩"
            className="mt-5 rounded-2xl bg-background/60 px-4 py-3.5"
          >
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-primary">
              <Map size={14} aria-hidden />
              怎么玩
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">
              点地图上的建筑，进入那条剧情线；点对话框往下推进。遇到选项就选——每一次选择都会被记在账上。
            </p>
          </section>

          <section
            aria-label="三个数值"
            className="mt-3 rounded-2xl bg-background/60 px-4 py-3.5"
          >
            <h3 className="text-sm font-bold text-primary">三个数值，各记一本账</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {STAT_ROWS.map((row) => (
                <li key={row.label} className="text-sm leading-relaxed">
                  <span className="font-bold text-card-foreground">{row.label}</span>
                  <span className="text-muted-foreground">　{row.meaning}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section aria-label="深夜事件" className="rounded-2xl bg-background/60 px-4 py-3.5">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-primary">
                <Moon size={14} aria-hidden />
                月亮灯
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                地图上那盏月亮灯是深夜事件。天黑之后，它才会叫你。
              </p>
            </section>
            <section aria-label="湖边夜谈" className="rounded-2xl bg-background/60 px-4 py-3.5">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-primary">
                <Waves size={14} aria-hidden />
                湖边
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                常规线全部走完，湖边夜谈会自己亮起来。整个故事在那里收尾。
              </p>
            </section>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              跳过
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full bg-primary px-7 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
