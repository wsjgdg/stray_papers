/**
 * 校园日历 · 「今日日程」入口卡 + 路线认定公文入口（批次 C1）。
 * 日程是每学期重播的脊柱，不是收集品：未到的天数不显示，已播的显示「已读」，
 * 当期还有未播的更早里程碑时入口提示「有 n 段日程待看」。
 * 路线认定：期末周起且未锁定时给补填入口（意向表残页）；已锁定变只读标识「已认定 · 蛙名」。
 */
import { clsx } from "clsx";
import { CalendarCheck, CalendarDays, Cloud, CloudFog, CloudRain, FileText, Sun, Wind } from "lucide-react";
import type { CommonDateScene } from "@/data/commonRoute";
import type { DateEntry } from "@/pages/CampusMap/useCampusMap";
import type { WeatherId, WeatherMeta } from "@/lib/calendar";
import { RichText } from "@/components/common/RichText";

const WEATHER_ICONS: Record<WeatherId, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  fog: CloudFog,
  wind: Wind,
};

interface CampusDateCardProps {
  /** 今天的天气（批次 CY-98）：日记卡片头一栏把天也记上 */
  weatherId: WeatherId;
  weatherLabel: string;
  weatherHint: string;
  /** 明天的天气（批次 CY-102）：天气预报——提前一天说 */
  weatherTomorrow: WeatherMeta;
  /** 已到期（day ≤ 当前天数）的里程碑与状态 */
  entries: DateEntry[];
  /** 当期未播的日程段数（含今日） */
  dueCount: number;
  /** 今天的里程碑（未播）；day3 / day6 是普通的一天，为 null */
  todayScene: CommonDateScene | null;
  /** 今天的里程碑是否已播 */
  todayRead: boolean;
  /** 期末周起且未锁定：补填入口可见 */
  routeFilingAvailable: boolean;
  /** 已认定的蛙名（null = 未认定） */
  lockedRouteName: string | null;
  onOpenScene: (scene: CommonDateScene) => void;
  onOpenFiling: () => void;
  /** 进场错拍（批次 CH）：0 = 与页面同拍 */
  enterDelay?: number;
}

export function CampusDateCard({
  weatherId,
  weatherLabel,
  weatherHint,
  weatherTomorrow,
  entries,
  dueCount,
  todayScene,
  todayRead,
  routeFilingAvailable,
  lockedRouteName,
  onOpenScene,
  onOpenFiling,
  enterDelay = 0,
}: CampusDateCardProps) {
  /* 第 1 天没有里程碑（最早的在 day 2）：整个入口卡不出现 */
  if (entries.length === 0) return null;

  /** 待看里最早的一段（今日优先，其次补看） */
  const earliestDue = entries.find((entry) => entry.state === "due")?.scene ?? null;
  const headline = todayScene
    ? `今日日程 · ${todayScene.title}`
    : dueCount > 0
      ? `有 ${dueCount} 段日程待看`
      : todayRead
        ? "今日日程 · 已读"
        : "共通日程";

  return (
    <section
      aria-label="校园日历 · 共通日程"
      className="anim-fade-up mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]"
      style={{ animationDelay: `${enterDelay}ms` }}
    >
      {/* 日程卡 */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-lg sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              <CalendarDays size={12} aria-hidden />
              今日日程
            </span>
            <RichText className="text-base font-black tracking-tight text-card-foreground" text={headline} />
            {/* 天气记进日记（批次 CY-98）：这一天什么天，卡片自己也留底 */}
            <span
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
            title={`今日${weatherLabel} · ${weatherHint}`}
          >
            <span className="anim-float inline-flex">
              {(() => {
                const WeatherIcon = WEATHER_ICONS[weatherId];
                return <WeatherIcon key={weatherId} size={12} aria-hidden className="text-primary" />;
              })()}
            </span>
            今日{weatherLabel}
          </span>
          <span
            className={clsx(
              "font-mono text-[10px] tracking-widest",
              weatherTomorrow.id === "rain" ? "font-bold text-primary" : "text-muted-foreground",
            )}
            title={`明日${weatherTomorrow.label} · ${weatherTomorrow.hint}`}
          >
            预报 · 明日{weatherTomorrow.label}
            {weatherTomorrow.id === "rain" ? " · 记得带伞" : ""}
          </span>
          </div>
          {todayScene && (
            <button
              type="button"
              onClick={() => onOpenScene(todayScene)}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
            >
              开播
            </button>
          )}
          {!todayScene && earliestDue && (
            <button
              type="button"
              onClick={() => onOpenScene(earliestDue)}
              className="rounded-full border border-primary/50 bg-primary/10 px-5 py-2 text-xs font-bold text-primary shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
            >
              补看
            </button>
          )}
        </div>

        <ul className="mt-3 flex flex-col gap-1.5">
          {entries.map((entry) => {
            const due = entry.state === "due";
            const isToday = entry.scene.day === (todayScene?.day ?? -1);
            return (
              <li key={entry.scene.day}>
                <button
                  type="button"
                  disabled={!due}
                  onClick={() => due && onOpenScene(entry.scene)}
                  aria-label={due ? `播放日程：${entry.scene.title}` : `已读：${entry.scene.title}`}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition-all duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                    due
                      ? "cursor-pointer bg-background/60 hover:-translate-y-0.5 hover:shadow-md"
                      : "cursor-default",
                    due && "border border-primary/40",
                  )}
                >
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                      due ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    第 {entry.scene.day} 天
                  </span>
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate text-sm font-bold",
                      due ? "text-card-foreground" : "text-muted-foreground",
                    )}
                  >
                    {entry.scene.title}
                  </span>
                  {due ? (
                    <span className="shrink-0 text-xs font-bold text-primary">{isToday ? "今日" : "待看"}</span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
                      <CalendarCheck size={12} aria-hidden />
                      已读
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 路线认定：期末周起出现；已锁定变只读标识 */}
      {(routeFilingAvailable || lockedRouteName) && (
        <div
          className={clsx(
            "rounded-3xl border p-4 shadow-md sm:p-5",
            routeFilingAvailable
              ? "border-dashed border-primary/50 bg-primary/5"
              : "border-border bg-card",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={clsx(
                "shrink-0 rounded-2xl p-2.5",
                routeFilingAvailable ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-card-foreground">
                {routeFilingAvailable ? "路线认定 · 意向表残页" : `已认定 · ${lockedRouteName}`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {routeFilingAvailable
                  ? "《毕业去向意向表》最后一栏还空着。期末周里，档案随时收这一栏的补填。"
                  : `这学期你和${lockedRouteName}走。档案已收下这一栏，毕业证上会带一行认定。`}
              </p>
              {routeFilingAvailable ? (
                <button
                  type="button"
                  onClick={onOpenFiling}
                  className="mt-3 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  去填认定表
                </button>
              ) : (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                  路线认定 · 已归档
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
