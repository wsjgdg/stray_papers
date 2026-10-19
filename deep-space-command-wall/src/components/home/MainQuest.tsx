// 主线目标面板：当前任务「现在该干什么」一目了然——着陆前唯一目标是软着陆,
// 着陆后展开五步主线（软着陆 → 放巡视车 → 采样×3 → 化验×3 → 出具结算）, 逐步点亮带进度。
// 渲染在飞行阶段链之后（飞行中 + 着陆后常驻, 回放/影院模式隐藏）。颜色全部 token 类。
import { Check, Lock, Target } from "lucide-react";
import { MISSIONS, type MissionId, type PhaseId } from "@/lib/missions";

interface MainQuestProps {
  missionId: MissionId;
  phaseId: PhaseId;
  roverUnlocked: boolean;
  samplesCount: number;
  reportsCount: number;
  /** 本场结算单已出具过（debriefData 非空） */
  debriefDone: boolean;
}

interface QuestStep {
  label: string;
  done: boolean;
}

export function MainQuest({ missionId, phaseId, roverUnlocked, samplesCount, reportsCount, debriefDone }: MainQuestProps) {
  const m = MISSIONS[missionId];
  const landed = phaseId === "landed";
  const steps: QuestStep[] = [
    { label: `${m.planetWord}软着陆`, done: landed },
    { label: `放出${m.rover.roverName}`, done: roverUnlocked },
    { label: `采集样品 ${Math.min(samplesCount, 3)}/3`, done: samplesCount >= 3 },
    { label: `化验样品 ${Math.min(reportsCount, 3)}/3`, done: reportsCount >= 3 },
    { label: "出具任务结算", done: debriefDone },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  const current = currentIdx >= 0 ? steps[currentIdx] : null;

  return (
    <section
      aria-label="主线目标"
      className="mx-auto w-full max-w-screen-2xl px-4 pt-2 animate-in fade-in duration-700"
    >
      <div className="rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-md">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
            <Target className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            主线目标
            {current && (
              <span className="ml-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-px font-mono text-[10px] font-bold tracking-widest text-primary">
                当前 · {current.label}
              </span>
            )}
            {!current && (
              <span className="ml-1 rounded-sm border border-primary bg-primary px-1.5 py-px font-mono text-[10px] font-bold tracking-widest text-primary-foreground">
                主线完成 ✓
              </span>
            )}
          </h2>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">MAIN QUEST · {m.code}</p>
        </div>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {steps.map((step, i) => {
            const isCurrent = i === currentIdx;
            return (
              <li key={step.label} className="flex items-center gap-1">
                {i > 0 && (
                  <span className={`h-px w-4 lg:w-6 ${step.done || isCurrent ? "bg-primary" : "bg-border"}`} aria-hidden="true" />
                )}
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tracking-wider transition-colors duration-500 ${
                    step.done
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : isCurrent
                        ? "phase-node-glow border-primary bg-primary font-bold text-primary-foreground shadow-md"
                        : "border-border bg-background/50 text-muted-foreground/60"
                  }`}
                >
                  {step.done ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : isCurrent ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
                  ) : (
                    <Lock className="h-3 w-3" aria-hidden="true" />
                  )}
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
