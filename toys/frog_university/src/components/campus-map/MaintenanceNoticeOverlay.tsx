/**
 * 校园地图 · 维修告示（批次 AP「校园是活的系统」之二）
 * 某些场景随机关闭——不是 bug，是「维修中」。不提前通知：玩家到了门口，才看见门上的告示。
 * 维修期间这栋楼进不去，只能去别的地方。校园在告诉你：你不是唯一在使用它的人。
 */
import { DoorClosed } from "lucide-react";
import { buildingById, type BuildingId } from "@/data/storylinesMeta";
import { RichText } from "@/components/common/RichText";

interface MaintenanceNoticeOverlayProps {
  building: BuildingId;
  onClose: () => void;
}

/** 各楼的维修告示：落点都在那栋楼的核心物件上（物件缺席，就是这栋楼缺席） */
const MAINTENANCE_COPY: Record<Exclude<BuildingId, "lake">, string> = {
  teaching: "表没印出来——今天没有新表可以交。窗口里的蛙说，明天再来；表每天都会重新印一遍，内容不用改。",
  library: "灯全停了——今天没有卷王，也没有凌晨三点。计划表停在这一格，下一格空着。",
  canteen: "锅在修——今天没有「已老实」。打饭窗口拉着帘子，公示过的量一起停了。汤那边也是空的。",
  club: "舞台拆了——今天没有表演，也没有排班。招新的桌子都收进了储藏室，话术台账压在最底下。",
  field: "草皮在补——今天没有可以躺的地方，也没有辩论。报修单终于被收走了，填了第四回。",
  study: "储物柜在清点——今天没有座位。失物招领的抽屉锁着，里面的便利贴今天不数。",
  admin: "窗口后面没人——今天没有「温馨提示」，也没有坏消息需要翻译。满意度调查停发一天。",
  dorm: "电闸在换——今天十一点不断电，也没有查寝。签到表照印，只是没人来收。",
  infirmary: "体温计送去校准——今天连「体温正常」都开不出来。条子本收走了，白床拆了床单，计时器上那三十分钟没有走。",
};

export function MaintenanceNoticeOverlay({ building, onClose }: MaintenanceNoticeOverlayProps) {
  const info = buildingById(building);
  const label = info?.label ?? "这栋楼";
  const copy = building === "lake" ? "" : MAINTENANCE_COPY[building];

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="维修告示"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <DoorClosed size={13} aria-hidden />
            {label} · 门口
          </p>

          {/* 门上的告示：微微斜着——贴上去的时候没问任何人 */}
          <div className="mt-4 inline-block -rotate-2 rounded-lg border border-border bg-background/80 px-5 py-4 shadow-sm">
            <p className="text-center text-2xl font-bold tracking-[0.4em] text-card-foreground">维修中</p>
            <p className="mt-1 text-center font-mono text-[10px] tracking-widest text-muted-foreground">
              今日闭馆 · 不另通知
            </p>
          </div>

          {copy && (
            <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={copy} />
          )}
          <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            维修不会提前通知——你是到了门口才知道的。告示贴上去的时候没问任何人，包括你。校园在提醒你一件事：它不是只为你开的。
          </p>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              去别处
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
