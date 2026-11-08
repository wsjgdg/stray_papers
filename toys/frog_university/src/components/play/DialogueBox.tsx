/**
 * 对话框：角色名铭牌 + 打字机文本 + 内心吐槽 + 点击继续 + 快进/自动/存档
 * 真心话节点带「真心话」小徽标；二周目回响节点带「上学期」小徽标（低调描边风）。
 * 批次 CH「行政化」：文本推进像盖章——每行落下被压一下（音效按主题：咔/唰/嘀）；
 * 快进时档案纸上快速盖过一枚「已阅」红章。
 */
import { clsx } from "clsx";
import { loadTheme } from "@/lib/gameSave";
import { playSe, type PlaySeId } from "@/lib/audio";
import { useEffect, useRef, useState } from "react";
import { Eye, FastForward, FileText, Heart, History, Pause, Play, RotateCcw, Users } from "lucide-react";
import { RichInline, RichText, parseEmphasis } from "@/components/common/RichText";

export type DialogueLineKind = "narration" | "speech" | "inner";

/** 存在认定层级（批次 BS）："none" 在册 | "footnote" 非编目（文本降级为脚注）| "demoted" 自行申请降级 */
export type DialogueExistenceTier = "none" | "footnote" | "demoted";

interface DialogueBoxProps {
  speakerName: string;
  speakerRole: string;
  lineKind: DialogueLineKind;
  text: string;
  innerVoice: string;
  isTyping: boolean;
  /** 真心话节点：好感过阈值时插入的 mask-off 台词 */
  heartMark?: boolean;
  /** 二周目回响节点：这只蛙记得你上一学期做过的同一个选择 */
  rememberMark?: boolean;
  /** 新旧区分（批次 CY-30）：这一行到达时已读过——正文变淡，新内容一眼分得出 */
  readBefore?: boolean;
  /** 编目（批次 BS）：说话蛙被否认/自行降级后，铭牌空白、文本降级为脚注 */
  existenceTier?: DialogueExistenceTier;
  /** 停顿（批次 BS）：被否认的蛙第一次开口之前的那一下——话到嘴边，名字没说出来 */
  pauseNote?: string;
  /** 私档（批次 BV）：说话蛙的私档被调阅过——铭牌带痕，第一句台词前先认账 */
  traceMark?: boolean;
  /** 调阅痕角标文案（批次 BW）：补录过说明后从「调阅痕」换成「调阅痕 · 已备案」 */
  traceLabel?: string;
  /** 调阅痕首次出现的那一行（「你翻我东西了。」；一次性） */
  traceNote?: string;
  /** 撰写（批次 BZ）：说话蛙被写过报告——铭牌带这一枚（它不知道是谁写的） */
  reportMark?: boolean;
  /** 撰写痕角标文案（默认「被写过」） */
  reportLabel?: string;
  /** 撰写痕首次出现的那一行（「最近有人写了我一份报告。」；一次性） */
  reportNote?: string;
  /** 团体（批次 CA）：说话蛙所在团体你加入过——铭牌带这一枚 */
  factionMark?: boolean;
  /** 团体角标文案（默认「团体」——档案照写：该蛙所在团体） */
  factionLabel?: string;
  /** 团体信息首次出现的那一行（你比旁的蛙多知道的一件；一次性） */
  factionNote?: string;
  /** 离校（批次 CC）：说话蛙本学期不在了——脚注章与批语换学籍口径（缺省沿用编目口径） */
  degradedLabel?: string;
  /** 离校（批次 CC）：说话蛙上一学期走了、这一学期回来了——铭牌带这一枚（它不记得你） */
  departMark?: boolean;
  /** 「回来了」角标文案（默认） */
  departLabel?: string;
  /** 它回来的那一行（档案重置，你的没有；一次性） */
  departNote?: string;
  /** 消迹（批次 CF）：那一句从档案里没了——渗出一行「那一栏是空的」；一次性 */
  vanishNote?: string;
  onAdvance: () => void;
  autoMode: boolean;
  onToggleAuto: () => void;
  onSkip: () => void;
}

const controlIdle =
  "inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none sm:py-1";
const controlActive =
  "inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none sm:py-1";

export function DialogueBox({
  speakerName,
  speakerRole,
  lineKind,
  text,
  innerVoice,
  isTyping,
  heartMark = false,
  rememberMark = false,
  readBefore = false,
  existenceTier = "none",
  pauseNote = "",
  traceMark = false,
  traceLabel = "调阅痕",
  traceNote = "",
  reportMark = false,
  reportLabel = "被写过",
  reportNote = "",
  factionMark = false,
  factionLabel = "团体",
  factionNote = "",
  degradedLabel = "",
  departMark = false,
  departLabel = "回来了",
  departNote = "",
  vanishNote = "",
  onAdvance,
  autoMode,
  onToggleAuto,
  onSkip,
}: DialogueBoxProps) {
  /** 脚注（批次 BS）：被否认的蛙——原文降级了，点「※」才看得见原稿 */
  const [showOriginal, setShowOriginal] = useState(false);
  /* 盖章推进（批次 CH）：不是打字机，是盖章——每一行落下来的时候都被压了一下；
     快进时档案纸上会快速盖过一枚「已阅」红章 */
  const [readStamp, setReadStamp] = useState(false);
  const readStampTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (readStampTimerRef.current !== null) window.clearTimeout(readStampTimerRef.current);
    },
    [],
  );
  const skipWithStamp = () => {
    setReadStamp(true);
    if (readStampTimerRef.current !== null) window.clearTimeout(readStampTimerRef.current);
    readStampTimerRef.current = window.setTimeout(() => setReadStamp(false), 900);
    playSe("se-read-stamp");
    onSkip();
  };
  /* 行级盖章（批次 CH）：整行落定那一刻压一下——打字机逐字期间不盖章不响；
     盖章声按主题分：奶白咔 / 红头唰 / 深夜嘀（主题只在实例期间读一次） */
  const [themeId] = useState(() => loadTheme());
  useEffect(() => {
    if (isTyping || !text) return;
    const id: PlaySeId =
      themeId === "cream" ? "se-stamp-cream" : themeId === "candy" ? "se-stamp-candy" : "se-stamp-paper";
    playSe(id);
  }, [text, isTyping, themeId]);
  const degraded = existenceTier !== "none";
  const demoted = existenceTier === "demoted";
  const bodyText = demoted && !showOriginal ? "（该条目自行申请降级。）" : text;
  /* 逐字演出的字表：按加粗记号分段后摊平成「一个字 + 是否落点 + 延迟」 */
  const emphasisChars = (() => {
    const chars: { char: string; bold: boolean; delay: number }[] = [];
    let offset = 0;
    for (const segment of parseEmphasis(text)) {
      for (const char of Array.from(segment.text)) {
        chars.push({ char, bold: segment.bold, delay: Math.min(offset * 26, 900) });
        offset += 1;
      }
    }
    return chars;
  })();
  return (
    <div
      className={clsx(
        "rounded-3xl border shadow-xl backdrop-blur transition-colors duration-300",
        /* 底色分场（批次 CY-77）：旁白纸冷一档、对白纸暖一档——不用读名字也知道现在是谁在说话 */
        heartMark ? "border-primary/60 bg-card/95" : lineKind === "narration" ? "border-border bg-background/90" : "border-border bg-card/95",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-border px-4 pb-3 pt-4 sm:px-5">
        <span className="flex min-w-0 items-center gap-2">
          {lineKind === "narration" ? (
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
              旁白
            </span>
          ) : degraded ? (
            <span
              className={clsx(
                "shrink-0 rounded-full border border-dashed px-3 py-1 text-sm font-bold",
                demoted
                  ? "border-destructive/40 bg-destructive/5 text-destructive line-through decoration-destructive/50"
                  : "border-border bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
              )}
            >
              {demoted ? "该条目自行申请降级" : degradedLabel || "非编目"}
            </span>
          ) : (
            <>
              <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-extrabold text-primary">
                {speakerName}
              </span>
              {speakerRole && (
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">{speakerRole}</span>
              )}
            </>
          )}
          {heartMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
              <Heart size={11} className="fill-primary-foreground" />
              真心话
            </span>
          )}
          {rememberMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
              <History size={11} />
              上学期
            </span>
          )}
          {traceMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              <Eye size={11} />
              {traceLabel}
            </span>
          )}
          {reportMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary/80">
              <FileText size={11} />
              {reportLabel}
            </span>
          )}
          {factionMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              <Users size={11} />
              {factionLabel}
            </span>
          )}
          {departMark && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              <RotateCcw size={11} />
              {departLabel}
            </span>
          )}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={skipWithStamp}
            aria-label="快进到下一处抉择"
            title="快进到下一处抉择"
            className={controlIdle}
          >
            <FastForward size={13} />
            <span className="hidden sm:inline">快进</span>
          </button>
          <button
            type="button"
            onClick={onToggleAuto}
            aria-label={autoMode ? "关闭自动播放" : "开启自动播放：打完字自动往下走"}
            title="自动播放：打完字自动往下走"
            className={autoMode ? controlActive : controlIdle}
          >
            {autoMode ? <Pause size={13} /> : <Play size={13} />}
            <span className="hidden sm:inline">自动</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onAdvance}
        aria-label="点击继续剧情"
        className="block w-full cursor-pointer px-4 pb-4 pt-4 text-left focus-visible:outline-none focus-visible:shadow-focus sm:px-5"
      >
        {traceNote && !isTyping && (
          <RichText className="mb-2 border-l-2 border-primary/40 pl-3 font-mono text-[12px] font-bold leading-relaxed text-primary/90" text={traceNote} />
        )}
        {reportNote && !isTyping && (
          <RichText className="mb-2 border-l-2 border-primary/40 pl-3 font-mono text-[12px] font-bold leading-relaxed text-primary/90" text={reportNote} />
        )}
        {factionNote && !isTyping && (
          <RichText className="mb-2 border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground" text={factionNote} />
        )}
        {departNote && !isTyping && (
          <RichText className="mb-2 border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground" text={departNote} />
        )}
        {vanishNote && !isTyping && (
          <RichText className="mb-2 border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground" text={vanishNote} />
        )}
        {pauseNote && !isTyping && (
          <RichText className="mb-2 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground" text={pauseNote} />
        )}
        {heartMark && !isTyping && text ? (
          /* 真心话（批次 W 逐字演出）：打完字后逐字错位淡入——那句真话一个字一个字落地；加粗记号段加粗 */
          <p className="min-h-24 text-[17px] leading-[1.75] text-card-foreground">
            {emphasisChars.map((item, index) => (
              <span
                key={`${index}-${item.char}`}
                className={clsx("anim-char-in", item.bold && "font-bold")}
                style={{ animationDelay: `${item.delay}ms` }}
              >
                {item.char}
              </span>
            ))}
          </p>
        ) : (
          <div
            className={clsx(
              "relative",
              degraded && showOriginal && "rounded-xl border border-dashed border-border bg-background/60 p-3",
            )}
          >
            {readStamp && (
              <span
                className="anim-stamp pointer-events-none absolute right-1 top-0 z-10 inline-block -rotate-12 rounded border-2 border-destructive/70 px-2 py-0.5 text-[11px] font-bold tracking-widest text-destructive"
                aria-hidden
              >
                已阅
              </span>
            )}
            <p
              key={isTyping ? undefined : bodyText}
              className={clsx(
                "anim-stamp-line min-h-24 text-[17px] leading-[1.75] transition-opacity duration-300",
                degraded ? "text-muted-foreground" : lineKind === "narration" ? "text-muted-foreground" : "text-card-foreground",
                degraded && !showOriginal && "italic",
                /* 新旧区分（批次 CY-30）：读过的旧内容整段变淡，没读过的照常亮起 */
                readBefore && "opacity-55",
              )}
            >
              {bodyText ? <RichInline text={bodyText} /> : <span className="text-muted-foreground">……</span>}
            </p>
          </div>
        )}
        {degraded && !isTyping && (
          <p className="mt-1 flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
            <button
              type="button"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                setShowOriginal((prev) => !prev);
              }}
              className="inline-flex shrink-0 items-center rounded-full border border-dashed border-border bg-background px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors duration-200 hover:bg-muted focus-visible:shadow-focus focus-visible:outline-none"
            >
              ※ {showOriginal ? "收起原稿" : "查看原稿"}
            </button>
            <span className="font-mono text-[10px] tracking-widest">
              {demoted
                ? "该条目自行申请降级——原稿已降级为脚注。"
                : degradedLabel
                  ? `该条目${degradedLabel}——原稿还在，它没带走。`
                  : "该条目已降级为非编目——原稿以脚注保留。"}
            </span>
          </p>
        )}
        {lineKind === "speech" && innerVoice && !isTyping && (
          <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-bold text-primary">内心 </span>
            <RichInline text={innerVoice} />
          </p>
        )}
        <p className="mt-2 text-right text-xs font-bold text-primary">
          {isTyping ? (
            <span className="animate-pulse">…</span>
          ) : (
            <span className="animate-pulse">点击继续 ▾</span>
          )}
        </p>
      </button>
    </div>
  );
}
