/**
 * 校园日历 · 白日小事件「校园角落」全屏播放器（批次 I）。
 * 骨架照 NightEventOverlay：日景小景 + 名牌 + 文本 + 点击推进 + 单支选项。
 * 选项口径与正片一致：沉默 ±1 / ±0，≤0 的文案自动收进真话罐（由 Logic 层处理）。
 */
import { clsx } from "clsx";
import { Sun, X } from "lucide-react";
import type { DayChoice, DayEvent } from "@/data/dayEvents";
import { StageBackground } from "@/components/play/StageBackground";
import { FROG_CHARACTERS } from "@/data/characters";
import type { NightPhase } from "@/pages/CampusMap/useCampusMap";
import { RichText } from "@/components/common/RichText";

interface DayEventOverlayProps {
  scene: DayEvent;
  phase: NightPhase;
  nodeIndex: number;
  /** 落定阶段：玩家说出口的选项（null = 咽了回去） */
  picked: DayChoice | null;
  /** 三周目免检批注（playthrough ≥ 3 且事件有 thirdNote 时传入；落定页追加一行档案腔） */
  thirdNote?: string;
  onAdvance: () => void;
  onChoose: (choice: DayChoice) => void;
  onSwallow: () => void;
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

/** 日景小景：太阳、云、远处开窗的楼、树、草地；事件挂了 bgId 时改用真实舞台背景（批次 S） */
function DayCorner({ place, bgId }: { place: string; bgId?: string }) {
  return (
    <div className="relative h-44 bg-gradient-to-b from-secondary via-secondary/55 to-card" aria-hidden>
      {bgId ? (
        <div className="absolute inset-0">
          <StageBackground id={bgId} />
        </div>
      ) : (
      <svg viewBox="0 0 640 176" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        {/* 太阳与云 */}
        <circle cx="508" cy="52" r="44" fill="var(--frog-badge)" opacity="0.28" />
        <circle cx="508" cy="52" r="27" fill="var(--frog-badge)" opacity="0.95" />
        <ellipse cx="150" cy="46" rx="52" ry="13" fill="var(--map-cloud)" opacity="0.9" />
        <ellipse cx="196" cy="56" rx="38" ry="10" fill="var(--map-cloud)" opacity="0.75" />
        <ellipse cx="356" cy="32" rx="44" ry="11" fill="var(--map-cloud)" opacity="0.8" />
        {/* 远处教学楼：白天里开着的窗 */}
        <rect x="46" y="84" width="168" height="92" rx="6" fill="var(--frog-bluegray)" opacity="0.55" />
        <rect x="70" y="100" width="14" height="18" rx="2" fill="var(--frog-badge)" />
        <rect x="106" y="100" width="14" height="18" rx="2" fill="var(--frog-bag)" opacity="0.6" />
        <rect x="142" y="100" width="14" height="18" rx="2" fill="var(--frog-badge)" opacity="0.85" />
        <rect x="70" y="130" width="14" height="18" rx="2" fill="var(--frog-bag)" opacity="0.6" />
        <rect x="142" y="130" width="14" height="18" rx="2" fill="var(--frog-badge)" opacity="0.85" />
        {/* 树 */}
        <circle cx="298" cy="112" r="26" fill="var(--map-leaf)" opacity="0.9" />
        <circle cx="322" cy="124" r="18" fill="var(--map-leaf)" opacity="0.7" />
        <rect x="294" y="128" width="8" height="42" rx="3" fill="var(--map-wood)" opacity="0.9" />
        {/* 草地与砖缝小路 */}
        <rect x="0" y="158" width="640" height="18" fill="var(--map-grass)" opacity="0.9" />
        <rect x="392" y="150" width="248" height="26" rx="6" fill="var(--map-road)" opacity="0.8" />
        <path d="M414 176 v-20 M458 176 v-16 M502 176 v-14 M546 176 v-14 M590 176 v-16" stroke="var(--map-wood)" strokeWidth="2" opacity="0.55" />
      </svg>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-foreground/40 to-transparent px-5 pb-3 pt-8">
        <RichText className="rounded-full bg-primary/85 px-2.5 py-0.5 text-xs font-bold text-primary-foreground" text={place} />
        <p className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
          <Sun size={11} />
          白日
        </p>
      </div>
    </div>
  );
}

export function DayEventOverlay({
  scene,
  phase,
  nodeIndex,
  picked,
  thirdNote,
  onAdvance,
  onChoose,
  onSwallow,
  onClose,
}: DayEventOverlayProps) {
  const node = scene.nodes[Math.min(nodeIndex, scene.nodes.length - 1)];
  if (!node) return null;
  const speakerId = node.speakerId === "narration" ? null : node.speakerId;
  const speakerName = speakerId ? FROG_CHARACTERS[speakerId].displayName : "旁白";
  const isNarration = speakerId === null;
  const meta = picked ? deltaMeta(picked.silenceDelta) : null;
  const choice = scene.choice ?? null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭白日小事件"
          className="absolute right-3 top-3 z-10 rounded-full border border-border bg-card p-2 text-card-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X size={14} />
        </button>
        <DayCorner place={scene.place} bgId={scene.bgId} />

        <div className="px-4 pb-5 pt-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold tracking-widest text-primary">校园角落</p>
              <h3 className="mt-0.5 text-lg font-bold text-card-foreground">《{scene.title}》</h3>
            </div>
            {phase === "nodes" && (
              <p className="text-xs font-bold text-muted-foreground">
                第 {nodeIndex + 1} / {scene.nodes.length} 段
              </p>
            )}
          </div>

          {phase === "nodes" && (
            <button
              key={node.id}
              type="button"
              onClick={onAdvance}
              aria-label="点击继续"
              className="anim-fade-up block w-full cursor-pointer rounded-2xl px-1 pb-1 pt-1 text-left focus-visible:outline-none focus-visible:shadow-focus"
            >
              <div className="flex items-center gap-2 border-b border-dashed border-border pb-3">
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-sm font-bold",
                    isNarration ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {speakerName}
                </span>
                {node.remember && (
                  <span className="rounded-full border border-dashed border-primary/40 bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    上学期
                  </span>
                )}
              </div>
              <p
                className={clsx(
                  "min-h-24 pt-3 text-base leading-relaxed",
                  isNarration ? "text-muted-foreground" : "text-card-foreground",
                )}
              >
                {node.text}
              </p>
              {speakerId && node.innerVoice && (
                <p className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-primary">内心 </span>
                  {node.innerVoice}
                </p>
              )}
              <p className="mt-2 animate-pulse text-right text-xs font-bold text-primary">
                点击继续 ▾
              </p>
            </button>
          )}

          {phase === "choice" && choice && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1">
              <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                ——路过这件小事，开不开口？
              </p>
              <button
                type="button"
                onClick={() => onChoose(choice)}
                className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
              >
                <span className="block text-base font-bold leading-relaxed text-card-foreground">
                  {choice.text}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      deltaMeta(choice.silenceDelta).chip,
                    )}
                  >
                    {deltaMeta(choice.silenceDelta).label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {deltaMeta(choice.silenceDelta).sub}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={onSwallow}
                className="text-xs font-bold text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors duration-200 hover:text-card-foreground focus-visible:outline-none focus-visible:shadow-focus"
              >
                咽回去，接着走
              </button>
            </div>
          )}

          {phase === "aftermath" && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1 text-center">
              <p className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
                小事过完了
              </p>
              <p className="text-base font-bold leading-relaxed text-card-foreground">
                {picked ? picked.text : "你什么都没说，接着走了。"}
              </p>
              {picked && meta && (
                <p className="flex items-center gap-2">
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", meta.chip)}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{meta.sub}</span>
                </p>
              )}
              {!picked && (
                <p className="text-xs text-muted-foreground">
                  什么都没发生。也可以算一种发生。
                </p>
              )}
              {thirdNote && (
                <div className="mt-1 w-full rounded-2xl border border-border bg-background/60 p-4 text-left">
                  <p className="text-xs font-bold tracking-widest text-muted-foreground">
                    第三学期 · 免检批注
                  </p>
                  <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={thirdNote} />
                </div>
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
        </div>
      </div>
    </div>
  );
}
