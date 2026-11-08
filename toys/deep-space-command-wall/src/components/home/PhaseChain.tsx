// 飞行阶段链：阶段节点进度展示 + 可点击迁跃（增强 N）——
// 飞行中点击非当前节点弹「是否迁跃至「X」阶段？」确认框, 确认后时间轴直接跳转（可前可后）;
// 头部「跳过本阶段」按钮一键迁跃到下一阶段起点。standby 节点与已着陆后不可点击。
// 颜色全部 token 类。
import { useState } from "react";
import { SkipForward } from "lucide-react";
import type { PhaseId, PhaseMetaItem } from "@/lib/missions";
import { JumpConfirmDialog } from "@/components/home/JumpConfirmDialog";

interface PhaseChainProps {
  phaseIndex: number;
  phases: PhaseMetaItem[];
  missionCode: string;
  /** 飞行中允许点击迁跃（手动挑战 / 回放 / 已着陆 / 待发射时为 false） */
  canJump?: boolean;
  /** 确认后执行迁跃 */
  onJumpPhase?: (id: PhaseId) => void;
  /** 跳过本阶段（直接迁跃到下一阶段起点, 无需确认） */
  onSkipPhase?: () => void;
}

export function PhaseChain({ phaseIndex, phases, missionCode, canJump = false, onJumpPhase, onSkipPhase }: PhaseChainProps) {
  const [pendingJump, setPendingJump] = useState<PhaseMetaItem | null>(null);
  const jumpable = canJump && !!onJumpPhase;
  const skippable = canJump && !!onSkipPhase && phaseIndex < phases.length - 1;

  return (
    <section
      aria-label="飞行阶段链"
      className="mx-auto w-full max-w-screen-2xl px-4 pt-4 animate-in fade-in duration-700"
    >
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-card-foreground">飞行阶段链</h2>
          <div className="flex items-center gap-3">
            {skippable && (
              <button
                type="button"
                onClick={onSkipPhase}
                className="flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
              >
                <SkipForward className="h-3 w-3" aria-hidden="true" />
                跳过本阶段
              </button>
            )}
            <p className="font-mono text-xs tracking-widest text-muted-foreground">FLIGHT PHASE CHAIN · {missionCode}</p>
          </div>
        </div>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {phases.map((meta, i) => {
            const done = i < phaseIndex;
            const current = i === phaseIndex;
            const clickable = jumpable && !current && meta.id !== "standby";
            return (
              <li key={meta.id} className="flex items-center gap-1">
                {i > 0 && <span className={`h-px w-4 lg:w-6 ${done || current ? "bg-primary" : "bg-border"}`} aria-hidden="true" />}
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => setPendingJump(meta)}
                    aria-label={`迁跃至${meta.label}阶段`}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tracking-wider transition-colors duration-300 hover:border-primary hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                      done
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-background/50 text-muted-foreground"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-primary" : "bg-muted-foreground/40"}`} />
                    {meta.label}
                  </button>
                ) : (
                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tracking-wider transition-colors duration-500 ${
                      current
                        ? "phase-node-glow border-primary bg-primary font-bold text-primary-foreground shadow-md"
                        : done
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border bg-background/50 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        current ? "bg-primary-foreground animate-pulse" : done ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                    {meta.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {pendingJump && onJumpPhase && (
        <JumpConfirmDialog
          label={pendingJump.label}
          hint="飞行时间轴将直接跳转至该阶段起点, 可向前也可向后"
          onConfirm={() => {
            onJumpPhase(pendingJump.id);
            setPendingJump(null);
          }}
          onCancel={() => setPendingJump(null)}
        />
      )}
    </section>
  );
}
