// 表面作业链（增强 N）：着陆后渲染在飞行阶段链下方——触地整备 → 巡视作业 →
// 天体专属事件节点（空闲可点击, 确认后立即排程触发, 过境后回到空闲可再次触发）→
// （金星追加生存窗口倒计时 + 紧急上升撤离）→ 任务结算 → 重新部署（归档回待发射, 可切下一任务）。
// 确认框文案按节点类型区分（触发 / 撤离 / 结算 / 部署, 不再统一叫「迁跃」）。颜色全部 token 类。
import { useState } from "react";
import { ClipboardCheck, Rocket } from "lucide-react";
import type { MissionId } from "@/lib/missions";
import { JumpConfirmDialog } from "@/components/home/JumpConfirmDialog";

interface SurfaceChainProps {
  missionId: MissionId;
  missionCode: string;
  /** 各表面事件进行中标志（消费 Logic 层已暴露 state） */
  meteorActive: boolean;
  stormActive: boolean;
  geyserActive: boolean;
  fogActiveNow: boolean;
  /** 金星生存窗口剩余秒（null = 窗口未启动或已关闭） */
  venusSurvivalRemainS: number | null;
  venusEvacuating: boolean;
  onTriggerEvent: () => void;
  onTriggerEvac: () => void;
  onOpenDebrief: () => void;
  /** 重新部署：归档本场出击, 回到待发射（之后可自由切换任务） */
  onRedeploy: () => void;
}

interface SurfNode {
  id: string;
  label: string;
  state: "done" | "active" | "pending";
  clickable: boolean;
  question?: string;
  confirmText?: string;
  hint?: string;
  note?: string;
  action?: () => void;
}

function fmtRemain(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `T-${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function SurfaceChain({
  missionId,
  missionCode,
  meteorActive,
  stormActive,
  geyserActive,
  fogActiveNow,
  venusSurvivalRemainS,
  venusEvacuating,
  onTriggerEvent,
  onTriggerEvac,
  onOpenDebrief,
  onRedeploy,
}: SurfaceChainProps) {
  const [pending, setPending] = useState<SurfNode | null>(null);

  // 天体专属事件节点定义
  const eventNode: { id: string; label: string; active: boolean } =
    missionId === "luna9"
      ? { id: "meteor", label: "微陨石雨", active: meteorActive }
      : missionId === "ares1"
        ? { id: "storm", label: "沙尘暴过境", active: stormActive }
        : missionId === "europa1"
          ? { id: "geyser", label: "冰裂隙喷发", active: geyserActive }
          : missionId === "venus1"
            ? { id: "acidstorm", label: "酸雾风暴", active: stormActive }
            : { id: "fog", label: "甲烷浓雾", active: fogActiveNow };

  const windowOpen = venusSurvivalRemainS !== null && !venusEvacuating;

  const nodes: SurfNode[] = [
    { id: "touchdown", label: "触地整备", state: "done", clickable: false },
    { id: "rover", label: "巡视作业", state: "done", clickable: false },
    {
      id: eventNode.id,
      label: eventNode.label,
      state: eventNode.active ? "active" : "pending",
      clickable: !eventNode.active,
      question: `是否立即触发「${eventNode.label}」？`,
      confirmText: "确认触发",
      hint: `确认后立即排程上演「${eventNode.label}」; 过境后节点回到空闲, 可再次触发`,
      note: eventNode.active ? "上演中" : "空闲可触发",
      action: onTriggerEvent,
    },
    // 金星专属：生存窗口倒计时 + 紧急上升撤离
    ...(missionId === "venus1"
      ? ([
          {
            id: "window",
            label: "生存窗口",
            state: windowOpen ? "active" : venusEvacuating ? "done" : "pending",
            clickable: false,
            note: windowOpen ? fmtRemain(venusSurvivalRemainS ?? 0) : venusEvacuating ? "已关闭" : undefined,
          },
          {
            id: "evac",
            label: "紧急上升撤离",
            state: venusEvacuating ? "active" : "pending",
            clickable: windowOpen,
            question: "是否立即执行紧急上升撤离？",
            confirmText: "确认撤离",
            hint: "生存窗口将立即关闭, 执行紧急上升撤离全流程并自动出具结算",
            action: onTriggerEvac,
          },
        ] as SurfNode[])
      : []),
    {
      id: "debrief",
      label: "任务结算",
      state: "pending",
      clickable: true,
      question: "是否立即出具本场任务结算单？",
      confirmText: "出具结算",
      hint: "结算单随时可看, 出具后仍可继续表面作业",
      action: onOpenDebrief,
      note: "DEBRIEF",
    },
    {
      id: "redeploy",
      label: "重新部署",
      state: "pending",
      clickable: true,
      question: "是否重新部署返回待发射？",
      confirmText: "确认部署",
      hint: "归档结束本场出击, 回到待发射状态——顶栏即可切换下一颗天体的任务",
      action: onRedeploy,
      note: "NEXT",
    },
  ];

  return (
    <section
      aria-label="表面作业链"
      className="mx-auto w-full max-w-screen-2xl px-4 pt-2 animate-in fade-in duration-700"
    >
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-md">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-card-foreground">
            表面作业链 <span className="ml-1 font-mono text-[10px] tracking-widest text-muted-foreground">点击空闲节点触发 / 跳转</span>
          </h2>
          <p className="font-mono text-xs tracking-widest text-muted-foreground">SURFACE OPS · {missionCode}</p>
        </div>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {nodes.map((node, i) => (
            <li key={node.id} className="flex items-center gap-1">
              {i > 0 && (
                <span
                  className={`h-px w-4 lg:w-6 ${node.state === "pending" ? "bg-border" : "bg-primary"}`}
                  aria-hidden="true"
                />
              )}
              {node.clickable && node.action ? (
                <button
                  type="button"
                  onClick={() => setPending(node)}
                  aria-label={`迁跃至${node.label}阶段`}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background/50 px-2.5 py-1 font-mono text-xs tracking-wider text-muted-foreground transition-colors duration-300 hover:border-primary hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                >
                  {node.id === "debrief" ? (
                    <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
                  ) : node.id === "redeploy" ? (
                    <Rocket className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                  {node.label}
                </button>
              ) : (
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs tracking-wider transition-colors duration-500 ${
                    node.state === "active"
                      ? "phase-node-glow border-primary bg-primary font-bold text-primary-foreground shadow-md"
                      : node.state === "done"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-background/50 text-muted-foreground"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      node.state === "active"
                        ? "bg-primary-foreground animate-pulse"
                        : node.state === "done"
                          ? "bg-primary"
                          : "bg-muted-foreground/40"
                    }`}
                  />
                  {node.label}
                  {node.note && (
                    <span
                      className={`ml-0.5 tabular-nums ${
                        node.state === "active" ? "text-primary-foreground/80" : "text-muted-foreground/70"
                      }`}
                    >
                      {node.note}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
      {pending && pending.action && (
        <JumpConfirmDialog
          label={pending.label}
          question={pending.question}
          confirmText={pending.confirmText}
          hint={pending.hint}
          onConfirm={() => {
            pending.action?.();
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
