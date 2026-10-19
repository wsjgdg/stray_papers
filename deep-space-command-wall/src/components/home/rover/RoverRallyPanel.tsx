// 越野拉力赛面板（从 RoverControl 拆出）：正序/倒序/夜航三航线发起 + 赛中 HUD（检查点进度/罚时/倒计时）+
// 完赛评级卡（S 级流光庆祝 / DNF 提示）。折叠分组头带「最佳 x/3」徽标。
import { ColumnGroup } from "@/components/home/rover/ColumnGroup";
import type { IceProbeProgress, RallyResult, RallyVariant, RoverSnapshot } from "@/pages/Home/useRover";

interface RoverRallyPanelProps {
  snap: RoverSnapshot;
  armBusy: boolean;
  stormHalt: boolean;
  iceProbe?: IceProbeProgress | null;
  crackProbe?: { progress: number } | null;
  oceanSample?: { progress: number } | null;
  rallyHud?: { remainS: number; got: number; total: number; penaltyS: number; variant: RallyVariant } | null;
  rallyResult?: RallyResult | null;
  rallyBestS?: number | null;
  rallyBestRevS?: number | null;
  rallyBestNightS?: number | null;
  onStartRally?: (variant: RallyVariant) => void;
}

export function RoverRallyPanel({
  snap,
  armBusy,
  stormHalt,
  iceProbe,
  crackProbe,
  oceanSample,
  rallyHud,
  rallyResult,
  rallyBestS,
  rallyBestRevS,
  rallyBestNightS,
  onStartRally,
}: RoverRallyPanelProps) {
  return (
            <ColumnGroup
              title="越野拉力赛"
              en="RALLY"
              badge={`最佳 ${[rallyBestS, rallyBestRevS, rallyBestNightS].filter((v) => v != null).length}/3`}
              badgeTitle="正序 / 倒序 / 夜航三条航线中已刷新最佳纪录的条数——跑完一条即计入"
            >
            <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-mono text-xs tracking-widest text-muted-foreground">RALLY · 越野拉力赛</p>
                {rallyHud ? (
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
                      rallyHud.remainS <= 15
                        ? "countdown-urgent border-destructive bg-destructive text-destructive-foreground"
                        : "border-primary/50 bg-primary/10 text-primary"
                    }`}
                  >
                    {rallyHud.variant === "reverse" ? "倒序 · " : rallyHud.variant === "night" ? "夜航 · " : ""}T-{rallyHud.remainS}s · 检查点 {rallyHud.got}/{rallyHud.total}
                    {rallyHud.penaltyS > 0 ? ` · 罚时 +${rallyHud.penaltyS}s` : ""}
                  </span>
                ) : (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {rallyBestS != null || rallyBestRevS != null || rallyBestNightS != null
                      ? `最佳${rallyBestS != null ? ` 正 ${rallyBestS}s` : ""}${rallyBestRevS != null ? ` 倒 ${rallyBestRevS}s` : ""}${rallyBestNightS != null ? ` 夜 ${rallyBestNightS}s` : ""}`
                      : "待挑战"}
                  </span>
                )}
              </div>
              {!rallyHud ? (
                <>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onStartRally?.("normal")}
                      disabled={stormHalt || snap.batteryDead || armBusy || !!iceProbe || !!crackProbe || !!oceanSample}
                      aria-label="开始拉力赛正序航线"
                      title="90 秒内按 1→2→3 依次通过由近及远的检查点旗标, 完赛按总用时评级"
                      className="flex-1 rounded-md border border-primary bg-primary/10 min-h-11 px-1.5 py-2 text-xs font-medium lg:min-h-0 text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      正序航线
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartRally?.("reverse")}
                      disabled={stormHalt || snap.batteryDead || armBusy || !!iceProbe || !!crackProbe || !!oceanSample}
                      aria-label="开始拉力赛倒序航线"
                      title="90 秒内先冲最远的旗标再依次折返（3→2→1）, 更长的冲刺路线, 独立最佳纪录"
                      className="flex-1 rounded-md border border-border bg-secondary/60 min-h-11 px-1.5 py-2 text-xs font-medium lg:min-h-0 text-card-foreground shadow-sm transition hover:border-primary/60 hover:text-primary active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      倒序 REVERSE
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartRally?.("night")}
                      disabled={stormHalt || snap.batteryDead || armBusy || !!iceProbe || !!crackProbe || !!oceanSample}
                      aria-label="开始拉力赛夜航无灯模式"
                      title="场地熄灯——只有头灯光晕与发光信标旗, 正序路线但视野受限, 独立最佳纪录"
                      className="flex-1 rounded-md border border-border bg-background min-h-11 px-1.5 py-2 text-xs font-medium lg:min-h-0 text-muted-foreground shadow-sm transition hover:border-primary/60 hover:text-primary active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      夜航 NIGHT
                    </button>
                  </div>
                  <p className="mt-1 text-center font-mono text-[10px] tracking-widest text-muted-foreground">
                    90s 过 3 检查点 · 撞坑罚时 +3s · 三航线分记最佳
                  </p>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {rallyHud.variant === "reverse"
                    ? "倒序航线——先冲编号 1 的最远旗标, 再依次折返（5m 内判定通过）, 擦撞坑沿每次罚时 +3s"
                    : rallyHud.variant === "night"
                      ? "夜航无灯——全场熄灯, 借头灯光晕循发光信标旗依次过点, 暗处坑沿看不清, 稳一点"
                      : "沿编号旗标依次冲过检查点（5m 内判定通过）——擦撞坑沿每次罚时 +3s, 剩余 15s 红色告急"}
                </p>
              )}
              {rallyResult && !rallyHud && (
                <p
                  className={`mt-1 rounded-sm border px-2 py-1 text-center font-mono text-xs font-bold ${
                    rallyResult.grade === "DNF"
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : rallyResult.grade === "S"
                        ? "museum-rarity-s relative overflow-hidden border-primary bg-primary text-primary-foreground"
                        : "border-primary/40 bg-primary/10 text-primary"
                  }`}
                >
                  {rallyResult.grade === "S" && (
                    <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                  )}
                  {rallyResult.grade === "DNF"
                    ? `${rallyResult.variant === "reverse" ? "倒序航线" : rallyResult.variant === "night" ? "夜航无灯" : ""}超时未完赛 DNF · 再接再厉`
                    : `${rallyResult.variant === "reverse" ? "倒序" : rallyResult.variant === "night" ? "夜航" : "正序"}完赛 ${rallyResult.timeS}s · 评级 ${rallyResult.grade}${rallyResult.penaltyS > 0 ? ` · 罚时 +${rallyResult.penaltyS}s` : ""}${rallyResult.best ? " ★ 新纪录!" : ""}`}
                </p>
              )}
            </div>
          </ColumnGroup>
  );
}
