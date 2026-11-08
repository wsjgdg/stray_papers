/**
 * 校园日历 · 共通日程播放器（批次 C1）。
 * 骨架沿用深夜事件播放器（节点逐条推进 → 可选选项 → 收尾），但语义独立：
 * 日程无 plus、无「上学期」标；期末周（day 5）的《期末周 · 意向表》播到结尾进入
 * 「路线认定」——动态认定表 → 二次确认 → 接播反应 → 收尾；补填模式不经场景直接进认定表。
 * 选项口径与深夜事件一致：沉默 ±1 / ±0，≤0 的文案自动收进真话罐（由 Logic 层处理）。
 */
import { clsx } from "clsx";
import { CalendarDays, FileText, X } from "lucide-react";
import {
  ROUTE_DIPLOMA_NOTES,
  ROUTE_REACTIONS,
  type CommonDateNode,
  type CommonDateScene,
  type DateChoice,
  type RouteFrogId,
} from "@/data/commonRoute";
import { FROG_CHARACTERS } from "@/data/characters";
import { StageBackground } from "@/components/play/StageBackground";
import type { DatePhase, GateStage, RoutePickOption } from "@/pages/CampusMap/useCampusMap";
import { RichText } from "@/components/common/RichText";

interface CampusDateOverlayProps {
  /** 要播放的日程场景；null = 补填模式（直接进认定表，不播场景） */
  scene: CommonDateScene | null;
  phase: DatePhase;
  nodeIndex: number;
  /** 落定阶段：玩家说出口的选项（null = 咽了回去） */
  picked: DateChoice | null;
  /** 认定表阶段：null = 不在认定流程 */
  gateStage: GateStage | null;
  gateOptions: RoutePickOption[];
  /** 当前选中的认定项（二次确认 / 反应阶段用） */
  gatePick: RoutePickOption | null;
  gateReactionIndex: number;
  /** 已认定的蛙名（收尾卡显示；null = 这一栏空着交了） */
  lockedName: string | null;
  onAdvance: () => void;
  onChoose: () => void;
  onSwallow: () => void;
  onPickOption: (option: RoutePickOption) => void;
  onConfirmGate: () => void;
  onBackToTable: () => void;
  onAdvanceReaction: () => void;
  onClose: () => void;
}

function deltaMeta(delta: number) {
  if (delta > 0) {
    return { label: `沉默 +${delta}`, sub: "识时务的选择", chip: "bg-primary/10 text-primary" };
  }
  if (delta === 0) {
    return { label: "沉默 ±0", sub: "真心话出口 · 这句会收进罐子", chip: "bg-muted text-muted-foreground" };
  }
  return { label: `沉默 ${delta}`, sub: "逆着演的选择", chip: "bg-secondary text-secondary-foreground" };
}

/** 单个对话节点卡：名牌 + 文本 + innerVoice 小字；只有 innerVoice 的行按内心独白渲染 */
function DateNodeCard({ node, onAdvance, index, total }: {
  node: CommonDateNode;
  onAdvance: () => void;
  index: number;
  total: number;
}) {
  const speakerId = node.speakerId === "narration" ? null : node.speakerId;
  const isInner = speakerId !== null && node.text.length === 0 && Boolean(node.innerVoice);
  const speakerName = isInner
    ? `${FROG_CHARACTERS[speakerId].displayName} · 内心`
    : speakerId
      ? FROG_CHARACTERS[speakerId].displayName
      : "旁白";
  return (
    <button
      key={`${index}-${total}`}
      type="button"
      onClick={onAdvance}
      aria-label="点击继续"
      className="anim-fade-up block w-full cursor-pointer rounded-2xl px-1 pb-1 pt-1 text-left focus-visible:outline-none focus-visible:shadow-focus"
    >
      <div className="flex items-center gap-2 border-b border-dashed border-border pb-3">
        <span
          className={clsx(
            "rounded-full px-3 py-1 text-sm font-bold",
            speakerId === null ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {speakerName}
        </span>
        <p className="ml-auto text-xs font-bold text-muted-foreground">
          第 {index + 1} / {total} 段
        </p>
      </div>
      <p
        className={clsx(
          "min-h-24 pt-3 text-base leading-relaxed",
          isInner || speakerId === null ? "text-muted-foreground" : "text-card-foreground",
        )}
      >
        {isInner ? node.innerVoice : node.text}
      </p>
      {speakerId !== null && !isInner && node.innerVoice && (
        <p className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
          <span className="font-bold text-primary">内心 </span>
          {node.innerVoice}
        </p>
      )}
      <p className="mt-2 animate-pulse text-right text-xs font-bold text-primary">点击继续 ▾</p>
    </button>
  );
}

/** 白天小景：太阳、云、远处教学楼与草地；日程挂了 bgId 时改用真实舞台背景（批次 S） */
function DayStrip({ dayLabel, filing, bgId }: { dayLabel: string; filing: boolean; bgId?: string }) {
  return (
    <div
      className="relative h-44 overflow-hidden bg-gradient-to-b from-secondary/60 via-card to-card"
      aria-hidden
    >
      {bgId ? (
        <div className="absolute inset-0">
          <StageBackground id={bgId} />
        </div>
      ) : (
      <svg viewBox="0 0 640 176" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <circle cx="86" cy="46" r="21" fill="var(--frog-badge)" />
        <circle cx="86" cy="46" r="30" fill="var(--frog-badge)" opacity="0.25" />
        <g className="anim-drift" opacity="0.9">
          <g transform="translate(230 40)">
            <ellipse rx="30" ry="12" fill="var(--frog-bluegray)" />
            <ellipse cx="-18" cy="5" rx="18" ry="8" fill="var(--frog-bluegray)" />
          </g>
          <g transform="translate(520 30)">
            <ellipse rx="24" ry="10" fill="var(--frog-bluegray)" opacity="0.8" />
          </g>
        </g>
        {/* 远处教学楼：白天的窗是暗的 */}
        <g transform="translate(470 116)">
          <rect x="-52" y="-34" width="60" height="46" rx="5" fill="var(--frog-matcha)" />
          <rect x="14" y="-24" width="46" height="36" rx="5" fill="var(--frog-cream-deep)" />
          {[-38, -22, -6].map((wx) => (
            <rect key={`dw1-${wx}`} x={wx} y="-22" width="9" height="12" rx="2" fill="var(--frog-bluegray-deep)" />
          ))}
          {[24, 38].map((wx) => (
            <rect key={`dw2-${wx}`} x={wx} y="-14" width="9" height="12" rx="2" fill="var(--frog-bluegray-deep)" />
          ))}
        </g>
        <g transform="translate(150 122)">
          <rect x="-44" y="-28" width="88" height="40" rx="6" fill="var(--frog-khaki)" />
          {[-30, -8, 14, 32].map((wx) => (
            <rect key={`dw3-${wx}`} x={wx} y="-16" width="10" height="12" rx="2" fill="var(--frog-belly)" opacity="0.9" />
          ))}
        </g>
        <Tree x={300} y={146} />
        <Tree x={596} y={148} s={0.85} />
        <rect x="0" y="152" width="640" height="24" fill="var(--map-grass)" />
        <path d="M0 160 q90 -5 190 0 t190 0 t190 0 t90 0" stroke="var(--map-road)" strokeWidth="9" fill="none" />
      </svg>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-foreground/45 to-transparent px-5 pb-3 pt-8">
        <RichText className="rounded-full bg-primary/85 px-2.5 py-0.5 text-xs font-bold text-primary-foreground" text={dayLabel} />
        <p className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
          <CalendarDays size={11} />
          {filing ? "补填" : "日程"}
        </p>
      </div>
    </div>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-2" width="6" height="14" rx="3" fill="var(--map-wood)" />
      <circle cx="0" cy="-12" r="11" fill="var(--map-leaf)" />
      <circle cx="-8" cy="-6" r="7" fill="var(--map-leaf)" />
      <circle cx="8" cy="-6" r="7" fill="var(--map-leaf)" />
    </g>
  );
}

/** 认定表：动态选项卡（蛙名 + 当前称呼 + 近况小字） */
function GateTable({
  options,
  onPickOption,
}: {
  options: RoutePickOption[];
  onPickOption: (option: RoutePickOption) => void;
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-3 py-1">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
          <FileText size={12} aria-hidden />
          《毕业去向意向表》
        </span>
        <p className="text-xs font-bold text-muted-foreground">路线认定</p>
      </div>
      <p className="text-sm leading-relaxed text-card-foreground">
        这一栏由你自己填。档案想替你收个尾——按这学期的好感，它建议你从下面挑。
      </p>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.text}
            type="button"
            onClick={() => onPickOption(option)}
            className={clsx(
              "w-full rounded-2xl border p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none",
              option.frogId ? "border-border bg-card" : "border-dashed border-border bg-muted/60",
            )}
          >
            <span
              className={clsx(
                "block font-bold leading-relaxed",
                option.frogId ? "text-base text-card-foreground" : "text-sm text-muted-foreground",
              )}
            >
              {option.text}
            </span>
            {option.hint && (
              <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{option.hint}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CampusDateOverlay({
  scene,
  phase,
  nodeIndex,
  picked,
  gateStage,
  gateOptions,
  gatePick,
  gateReactionIndex,
  lockedName,
  onAdvance,
  onChoose,
  onSwallow,
  onPickOption,
  onConfirmGate,
  onBackToTable,
  onAdvanceReaction,
  onClose,
}: CampusDateOverlayProps) {
  const dayLabel = scene ? `第 ${scene.day} 天` : "路线认定";
  const gateFrogId = (gatePick?.frogId ?? null) as RouteFrogId | null;
  const reactionNodes = gateFrogId ? (ROUTE_REACTIONS[gateFrogId] ?? []) : [];
  const reactionNode = reactionNodes[Math.min(gateReactionIndex, Math.max(0, reactionNodes.length - 1))];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭日程"
          className="absolute right-3 top-3 z-10 rounded-full border border-border bg-card p-2 text-card-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X size={14} />
        </button>
        <DayStrip dayLabel={dayLabel} filing={scene === null} bgId={scene?.bgId} />

        <div className="px-4 pb-5 pt-4 sm:px-6">
          {gateStage === "table" && (
            <>
              {scene && (
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-card-foreground">《{scene.title}》</h3>
                </div>
              )}
              <GateTable options={gateOptions} onPickOption={onPickOption} />
            </>
          )}

          {gateStage === "confirm" && gatePick && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-2 text-center">
              <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                把这一栏写进档案？
              </p>
              <RichText className="text-lg font-bold leading-relaxed text-primary" text={gatePick.text} />
              {gatePick.hint && (
                <RichText className="max-w-md text-xs leading-relaxed text-muted-foreground" text={gatePick.hint} />
              )}
              <p className="text-xs font-bold text-muted-foreground">认定后这学期不改。</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onConfirmGate}
                  className="rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  写进档案
                </button>
                <button
                  type="button"
                  onClick={onBackToTable}
                  className="rounded-full border border-border bg-card px-6 py-2 text-sm font-bold text-card-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  再看看
                </button>
              </div>
            </div>
          )}

          {gateStage === "reactions" && gatePick && reactionNode && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-bold text-primary">
                这一栏写进去了。{FROG_CHARACTERS[gatePick.frogId as RouteFrogId].displayName} 那边，当天就有了动静。
              </p>
              <DateNodeCard
                node={reactionNode}
                onAdvance={onAdvanceReaction}
                index={gateReactionIndex}
                total={reactionNodes.length}
              />
            </div>
          )}

          {gateStage === "done" && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1 text-center">
              {lockedName ? (
                <>
                  <p className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                    认定完成
                  </p>
                  <p className="text-lg font-bold leading-relaxed text-card-foreground">
                    这学期，你和{lockedName}走。
                  </p>
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    {gateFrogId ? ROUTE_DIPLOMA_NOTES[gateFrogId] : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                    这一栏空着交了上去
                  </p>
                  <p className="text-base font-bold leading-relaxed text-card-foreground">
                    表格里多了一行空白。空白不算违纪。
                  </p>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    学期还没结束。期末周里，档案随时收这一栏的补填。
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-1 rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
              >
                回到校园
              </button>
            </div>
          )}

          {!gateStage && scene && (
            <>
              <div className="mb-3">
                <h3 className="text-lg font-bold text-card-foreground">《{scene.title}》</h3>
                <RichText className="mt-0.5 text-xs leading-relaxed text-muted-foreground" text={scene.intro} />
              </div>

              {phase === "nodes" && (
                <DateNodeCard
                  node={scene.nodes[Math.min(nodeIndex, scene.nodes.length - 1)] ?? scene.nodes[0]}
                  onAdvance={onAdvance}
                  index={nodeIndex}
                  total={scene.nodes.length}
                />
              )}

              {phase === "choice" && scene.choice && (
                <div className="anim-fade-up flex flex-col items-center gap-3 py-1">
                  <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                    ——这一天，开不开口？
                  </p>
                  {scene.choice.map((option) => {
                    const meta = deltaMeta(option.silenceDelta);
                    return (
                      <div key={option.id} className="w-full">
                        <button
                          type="button"
                          onClick={onChoose}
                          className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          <span className="block text-base font-bold leading-relaxed text-card-foreground">
                            {option.text}
                          </span>
                          <span className="mt-2 flex items-center gap-2">
                            <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", meta.chip)}>
                              {meta.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{meta.sub}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={onSwallow}
                          className="mt-2 text-xs font-bold text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-200 hover:text-card-foreground focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          咽回去，接着走
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {phase === "aftermath" && (
                <div className="anim-fade-up flex flex-col items-center gap-3 py-1 text-center">
                  <p className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                    日程过完了
                  </p>
                  {picked ? (
                    <>
                      <RichText className="text-base font-bold leading-relaxed text-card-foreground" text={picked.text} />
                      {picked.coda && (
                        <RichText className="max-w-md text-sm leading-relaxed text-muted-foreground" text={picked.coda} />
                      )}
                      <p className="flex items-center gap-2">
                        <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", deltaMeta(picked.silenceDelta).chip)}>
                          {deltaMeta(picked.silenceDelta).label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {deltaMeta(picked.silenceDelta).sub}
                        </span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-bold leading-relaxed text-card-foreground">
                        你把那句话咽了回去。
                      </p>
                      <p className="text-xs text-muted-foreground">什么都没发生。也可以算一种发生。</p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1 rounded-full bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    回到校园
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
