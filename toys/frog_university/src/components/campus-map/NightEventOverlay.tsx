/**
 * 校园日历 · 深夜事件全屏播放器。
 * 复用正片对话框的视觉语言但更轻：夜空小景 + 名牌 + 文本 + 点击推进 + 选项（单支或三支）。
 * 选项口径与正片一致：沉默 ±1 / ±0，≤0 的文案自动收进真话罐（由 Logic 层处理）。
 */
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Moon, Volume2, X } from "lucide-react";
import type { NightChoice, NightEvent } from "@/data/nightEvents";
import { RichInline, RichText } from "@/components/common/RichText";
import { playSe } from "@/lib/audio";
import { StageBackground } from "@/components/play/StageBackground";
import { FROG_CHARACTERS } from "@/data/characters";
import type { NightPhase } from "@/pages/CampusMap/useCampusMap";
import type { WeatherId } from "@/lib/calendar";

/** 天气联动开场小注（批次 CY-98）：白天的天气带进夜里，先说一句当晚的「天时」 */
const WEATHER_NIGHT_LINES: Record<WeatherId, string> = {
  sunny: "今晚天晴，月亮标比平时亮。",
  rain: "雨声盖过一切——包括该被听见的。",
  fog: "雾把校园收小了一半，今晚的事发生在另一半里。",
  wind: "风把白天吹散了，夜里反而干净。",
  cloudy: "阴天没有影子，夜里说的话没人作证。",
};

interface NightEventOverlayProps {
  scene: NightEvent;
  /** 今天的天气（批次 CY-98）：决定开场那句天时小注 */
  weather?: WeatherId;
  /** 逐条对质（批次 V）：对质节点渲染承认/否认两按钮 */
  interrogationCopy?: NightEvent["interrogationCopy"];
  phase: NightPhase;
  nodeIndex: number;
  /** 落定阶段：玩家说出口的选项（null = 咽了回去） */
  picked: NightChoice | null;
  /** 三周目免检批注（playthrough ≥ 3 且事件有 thirdNote 时传入；落定页追加一行档案腔） */
  thirdNote?: string;
  onAdvance: () => void;
  onChoose: (choice: NightChoice) => void;
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

/** 夜空小景：月亮、远处亮着一扇窗的楼、地面；事件挂了 bgId 时改用真实舞台背景（批次 S） */
function NightSky({ place, bgId }: { place: string; bgId?: string }) {
  return (
    <div className="night-sky relative h-44" aria-hidden>
      {bgId ? (
        <div className="absolute inset-0">
          <StageBackground id={bgId} />
        </div>
      ) : (
      <svg viewBox="0 0 640 176" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        {[
          [64, 34, 2], [148, 66, 1.5], [238, 28, 1.8], [330, 58, 1.4], [420, 24, 2.2],
          [500, 62, 1.5], [596, 32, 1.8],
        ].map(([cx, cy, r], i) => (
          <circle key={`star-${i}`} cx={cx} cy={cy} r={r} fill="var(--frog-belly)" opacity="0.85" />
        ))}
        <circle cx="512" cy="58" r="40" fill="var(--frog-belly)" opacity="0.12" />
        <circle cx="512" cy="58" r="26" fill="var(--frog-belly)" opacity="0.9" />
        {/* 远处教学楼：一扇不肯灭的灯 */}
        <rect x="40" y="88" width="150" height="88" rx="6" fill="var(--frog-ink)" opacity="0.9" />
        <rect x="150" y="106" width="14" height="18" rx="2" fill="var(--frog-badge)" />
        <rect x="66" y="112" width="14" height="18" rx="2" fill="var(--frog-bluegray)" opacity="0.7" />
        <rect x="0" y="158" width="640" height="18" fill="var(--frog-bluegray-deep)" opacity="0.75" />
        <path d="M90 158 q5 -30 -3 -46 M118 158 q3 -26 12 -40" stroke="var(--map-wood)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      </svg>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-foreground/45 to-transparent px-5 pb-3 pt-8">
        <RichText className="rounded-full bg-primary/85 px-2.5 py-0.5 text-xs font-bold text-primary-foreground" text={place} />
        <p className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
          <Moon size={11} />
          深夜
        </p>
      </div>
    </div>
  );
}

export function NightEventOverlay({
  scene,
  weather,
  phase,
  nodeIndex,
  picked,
  thirdNote,
  interrogationCopy,
  onAdvance,
  onChoose,
  onSwallow,
  onClose,
}: NightEventOverlayProps) {
  const node = scene.nodes[Math.min(nodeIndex, scene.nodes.length - 1)];
  /* 对质盖章（批次 CI）：承认 → 盖「已确认」；否认 → 盖「已否认」——落章之后才推进（照审批栏同一套）。
     全部 hooks 必须在空节点早退之前声明（rules-of-hooks：hook 调用顺序不能随渲染变化） */
  const [qStamp, setQStamp] = useState<null | { choiceId: string; text: string; silenceDelta: number }>(null);
  const qTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (qTimerRef.current !== null) window.clearTimeout(qTimerRef.current);
    },
    [],
  );
  useEffect(() => setQStamp(null), [nodeIndex]);
  /* 打字机音（批次 CY-97）：每落一段，纸上沙沙响一声——夜里有人在替你记录 */
  useEffect(() => {
    if (phase === "nodes" && node) playSe("se-pen-scratch");
  }, [phase, node?.id]);
  /* 朗读（批次 CY-102）：系统自带的人声念这一页——旁白念得沉、蛙声念得亮；翻页换句，合上收声 */
  const speechOn = typeof window !== "undefined" && "speechSynthesis" in window;
  const [reading, setReading] = useState(false);
  /* 语速三档（批次 CY-105）：念快了像赶早八，念慢了像查档案 */
  const SPEECH_RATES = [0.8, 1, 1.2];
  const [rateIdx, setRateIdx] = useState(1);
  useEffect(() => {
    if (!speechOn) return;
    if (!reading || phase !== "nodes") {
      window.speechSynthesis.cancel();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(node?.text ?? "");
    utterance.lang = "zh-CN";
    utterance.rate = SPEECH_RATES[rateIdx];
    utterance.pitch = node?.speakerId === "narration" ? 0.85 : 1.15;
    window.speechSynthesis.speak(utterance);
  }, [reading, rateIdx, node?.id, phase, speechOn]);
  useEffect(
    () => () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );
  if (!node) return null;
  /* 对质节点（批次 V）：id 形如 night-talk-qN——玩家说过的真话原文 + 承认/否认两支 */
  const isInterrogation = Boolean(interrogationCopy) && /^night-talk-q\d+$/.test(node.id);
  /* 转写腔（批次 W）：对质链路的全部节点按录音转写排版——页眉时间戳 + 等宽字距收紧，像念记录 */
  const stampMatch = node.id.match(/^night-talk-(?:q|a|d)(\d+)$/);
  const isTranscription =
    Boolean(stampMatch) || node.id === "night-talk-end-admit" || node.id === "night-talk-end-empty";
  const transcriptStamp = stampMatch ? `21:3${Math.min(9, Number(stampMatch[1]))}` : "21:40";
  const speakerId = node.speakerId === "narration" ? null : node.speakerId;
  const speakerName = speakerId ? FROG_CHARACTERS[speakerId].displayName : "旁白";
  const isNarration = speakerId === null;
  const meta = picked ? deltaMeta(picked.silenceDelta) : null;
  const decideQ = (choiceId: string, text: string, silenceDelta: number) => {
    if (qStamp) return;
    setQStamp({ choiceId, text, silenceDelta });
    qTimerRef.current = window.setTimeout(() => onChoose({ id: choiceId, text, silenceDelta }), 450);
  };
  /* 今晚的选项：多支（如《约谈》三支）优先，回落到既有单支 */
  const choiceList = scene.choices ?? (scene.choice ? [scene.choice] : []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭深夜事件"
          className="absolute right-3 top-3 z-10 rounded-full border border-border bg-card p-2 text-card-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
        >
          <X size={14} />
        </button>
        <NightSky place={scene.place} bgId={scene.bgId} />

        <div className="px-4 pb-5 pt-4 sm:px-6">
          {weather && (
            <p className="anim-fade-up mb-2 font-mono text-xs font-bold text-muted-foreground">
              天时 · {WEATHER_NIGHT_LINES[weather]}
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black tracking-tight text-card-foreground">《{scene.title}》</h3>
            {phase === "nodes" && (
              <div className="flex items-center gap-2">
                {speechOn && (
                  <button
                    type="button"
                    onClick={() => {
                      if (reading) window.speechSynthesis.cancel();
                      setReading(!reading);
                    }}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                      reading
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                    )}
                  >
                    <Volume2 size={11} aria-hidden />
                    {reading ? "停" : "朗读"}
                  </button>
                )}
                {reading && (
                  <button
                    type="button"
                    onClick={() => setRateIdx((prev) => (prev + 1) % SPEECH_RATES.length)}
                    className="rounded-full border border-border px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    {SPEECH_RATES[rateIdx]}×
                  </button>
                )}
                <p className="text-xs font-bold text-muted-foreground">
                  第 {nodeIndex + 1} / {scene.nodes.length} 段
                </p>
              </div>
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
              {isTranscription && (
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                  转写 {transcriptStamp}
                </p>
              )}
              <p
                className={clsx(
                  "min-h-24 pt-3",
                  isTranscription
                    ? "rounded-xl border border-border bg-background/80 p-3 font-mono text-sm leading-snug"
                    : "text-base leading-relaxed",
                  isNarration ? "text-muted-foreground" : "text-card-foreground",
                )}
              >
                <RichInline text={node.text} />
              </p>
              {speakerId && node.innerVoice && (
                <p className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-primary">内心 </span>
                  <RichInline text={node.innerVoice} />
                </p>
              )}
              {isInterrogation ? (
                <div className="relative flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => decideQ("night-talk-tamper", node.text.split("\n").pop() ?? "", 0)}
                    className="rounded-full border border-primary/50 bg-card px-4 py-2 text-sm font-bold text-primary shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    title="把档案上这条记录改成假话：印象分上升，但档案会记住这一笔"
                  >
                    {interrogationCopy?.tamper ?? "修改记录。"}
                  </button>
                  <button
                    type="button"
                    onClick={() => decideQ("night-talk-deny", interrogationCopy?.deny ?? "", 1)}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-card-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    记不清了。
                  </button>
                  <button
                    type="button"
                    onClick={() => decideQ("night-talk-admit", "", 0)}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    承认。
                  </button>
                  {qStamp && (
                    <span
                      className="anim-stamp pointer-events-none absolute right-0 top-0 inline-block -rotate-12 rounded border-2 border-primary/70 bg-card/90 px-2.5 py-1 text-xs font-bold tracking-widest text-primary"
                      aria-hidden
                    >
                      {qStamp.choiceId === "night-talk-admit" ? "已确认" : qStamp.choiceId === "night-talk-deny" ? "已否认" : "已修改"}
                    </span>
                  )}
                </div>
              ) : (
                <p className="animate-pulse text-right text-xs font-bold text-primary">点击继续 ▾</p>
              )}
            </button>
          )}

          {phase === "choice" && (
            <div className="anim-fade-up flex flex-col items-center gap-3 py-1">
              <p className="rounded-full bg-muted px-4 py-1.5 text-sm font-bold text-card-foreground">
                ——这个夜里，开不开口？
              </p>
              {choiceList.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChoose(item)}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="block text-base font-bold leading-relaxed text-card-foreground">
                    <RichInline text={item.text} />
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        deltaMeta(item.silenceDelta).chip,
                      )}
                    >
                      {deltaMeta(item.silenceDelta).label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {deltaMeta(item.silenceDelta).sub}
                    </span>
                  </span>
                </button>
              ))}
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
                夜过完了
              </p>
              <p className="text-base font-bold leading-relaxed text-card-foreground">
                {picked ? picked.text : "你把那句话咽了回去。"}
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
