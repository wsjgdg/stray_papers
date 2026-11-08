import { Archive, Blend, BookOpenCheck, ChevronRight, RefreshCcwDot } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { loadLockedSeed, persistLockedSeed, persistPlayerDisplayName } from "@/lib/gameSave";
import { mixSeeds, parseSeedCode, seedCodeOf } from "@/lib/seedCode";

interface TitleHeroProps {
  hasSave: boolean;
  onStartNewGame: () => void;
  /** 用种子码开新局（批次 X / AM）：贴回某一局的号码重走那一局；带谱系 = 混出来的种子 */
  onStartWithSeed: (code: string, parents?: [number, number]) => boolean;
  /** 「继续」：有自动档时接着上次那一幕；没有则置灰 */
  onContinueGame: () => void;
  /** 自动档标签（第 N 学期 · 线名 · 幕名）；空串 = 档案还没有记录 */
  autoSlotLabel: string;
  onOpenSaveLoad: () => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  /** 打开结局图鉴 */
  onOpenEndings: () => void;
  /** 已收集进度文案，如「3/18」；一个都没收集时为空串 */
  endingsBadge: string;
  /** 多周目计数：第几个学期（≥ 2 时标题画面出现学期标记） */
  playthrough: number;
}

const menuItem =
  "group flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none active:scale-[0.99]";

/**
 * 全屏标题区：不是菜单，是一张《入学登记表》（批次 CH「行政化」）。
 * UI 即档案：玩家不是在「开始游戏」，是在递交入学申请——
 * 勾了《沉默条款》才能提交；姓名可以留空（档案会替你写「该蛙未登记姓名」）；
 * 没有设置按钮（行政规定藏在右下角一行小字里）；退出叫申请离校。
 */
export function TitleHero({
  hasSave,
  onStartNewGame,
  onStartWithSeed,
  onContinueGame,
  autoSlotLabel,
  onOpenSaveLoad,
  onOpenSettings,
  onOpenCredits,
  onOpenEndings,
  endingsBadge,
  playthrough,
}: TitleHeroProps) {
  const isRepeatYear = playthrough >= 2;
  const canContinue = autoSlotLabel.length > 0;
  /* 沉默条款（批次 CH）：不勾，提交按钮就是灰的——玩家必须先同意沉默，才能开始 */
  const [clauseAgreed, setClauseAgreed] = useState(false);
  /* 登记姓名（批次 CH）：留空 → 档案上写「该蛙未登记姓名」 */
  const [displayName, setDisplayName] = useState("");
  const lockedSeed = loadLockedSeed();

  const submitEnrollment = () => {
    if (!clauseAgreed) return;
    persistPlayerDisplayName(displayName);
    onStartNewGame();
  };

  return (
    <section className="relative flex flex-col items-center px-4 pt-14 pb-10 text-center md:pt-20 md:pb-14">
      <p className="anim-fade-up rounded-full border border-border bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
        {isRepeatYear ? (
          <>
            校园视觉小说 ·{" "}
            <span className="font-bold text-primary">第 {playthrough} 学期</span>
          </>
        ) : (
          "校园视觉小说 · 开学第一天"
        )}
      </p>
      {/* 主标题逐字进场（批次 W 同款演出）：四个字一个一个落地，「大学」压着制度色 */}
      <h1 className="ds-display mt-6 text-5xl font-black tracking-tight text-foreground md:text-7xl">
        {"奶蛙".split("").map((ch, i) => (
          <span key={i} className="anim-char-in inline-block" style={{ animationDelay: `${80 + i * 110}ms` }}>
            {ch}
          </span>
        ))}
        <span className="text-primary">
          {"大学".split("").map((ch, i) => (
            <span key={i} className="anim-char-in inline-block" style={{ animationDelay: `${300 + i * 110}ms` }}>
              {ch}
            </span>
          ))}
        </span>
      </h1>
      <p className="anim-fade-up mt-4 text-lg text-muted-foreground md:text-xl" style={{ animationDelay: "560ms" }}>
        {isRepeatYear ? "已老实，但你还回来了" : "已老实，但还想上学"}
      </p>

      {/* 入学登记表（批次 CH）：不是开始按钮，是递交申请 */}
      {/* 双边框（批次 CY-84）：外实内虚——和毕业证同一个证书做法，入学登记与毕业证书首尾呼应 */}
      <div
        className="anim-fade-up mt-8 w-full max-w-sm rounded-3xl border border-border bg-card/90 p-2.5 text-left shadow-lg"
        style={{ animationDelay: "660ms" }}
        aria-label="入学登记表"
      >
        <div className="rounded-2xl border border-dashed border-primary/25 p-4">
        <p className="flex items-baseline justify-between border-b border-dashed border-border pb-2 font-mono text-[11px] font-bold tracking-widest text-primary">
          奶蛙大学 · 入学登记表
          <span className="text-[10px] font-medium text-muted-foreground">未归档</span>
        </p>
        <dl className="mt-3 space-y-2">
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">编号</dt>
            <dd className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-card-foreground">
              {lockedSeed !== null ? (
                `NAIWA-${String(lockedSeed).padStart(6, "0")}`
              ) : (
                <span className="text-muted-foreground/60">NAIWA-______（编号在下面填）</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">姓名</dt>
            <dd className="min-w-0 flex-1">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={12}
                aria-label="登记姓名（留空则档案上写该蛙未登记姓名）"
                placeholder="（可留空）"
                className="w-full border-b border-dashed border-border bg-transparent px-1 py-0.5 text-sm font-bold text-card-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">物种</dt>
            <dd className="text-sm text-card-foreground">奶蛙（不可更改）</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">学期</dt>
            <dd className="text-sm text-card-foreground">{isRepeatYear ? `第 ${playthrough} 学期` : "第一学期"}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-12 shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">状态</dt>
            <dd className="text-sm text-card-foreground">
              {canContinue ? <span className="text-primary">已归档 · {autoSlotLabel}</span> : "未归档"}
            </dd>
          </div>
        </dl>

        {/* 沉默条款：不勾，提交就是灰的——先同意沉默，才能开始 */}
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-dashed border-border bg-background/60 p-3">
          <input
            type="checkbox"
            checked={clauseAgreed}
            onChange={(event) => setClauseAgreed(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
            aria-label="本人已阅读并同意《沉默条款》"
          />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            本人已阅读并同意<span className="font-bold text-card-foreground">《沉默条款》</span>
            ：本校默认该蛙识时务。不表态的事项由系统代为沉默处理。
          </span>
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submitEnrollment}
            disabled={!clauseAgreed}
            className={clsx(
              "flex-1 rounded-full px-4 py-2.5 text-sm font-bold shadow-md transition-transform duration-200 focus-visible:shadow-focus focus-visible:outline-none",
              clauseAgreed
                ? "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.99]"
                : "cursor-not-allowed bg-muted text-muted-foreground/60 shadow-none",
            )}
          >
            提交
          </button>
          <button
            type="button"
            onClick={onOpenSaveLoad}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/40 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <Archive size={14} className="text-primary" aria-hidden />
            调阅旧档
          </button>
        </div>
        {canContinue && (
          <button
            type="button"
            onClick={onContinueGame}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-xs font-bold text-primary transition-colors duration-200 hover:bg-primary/10 focus-visible:shadow-focus focus-visible:outline-none"
          >
            <ChevronRight size={13} aria-hidden />
            调阅上次档案 · {autoSlotLabel}
          </button>
        )}
        </div>
      </div>

      {/* 档案柜（批次 CH）：图鉴也是档案柜的一格 */}
      <div className="anim-fade-up mt-3 flex w-full max-w-sm gap-2" style={{ animationDelay: "240ms" }}>
        <button type="button" onClick={onOpenEndings} className={menuItem + " flex-1"}>
          <span className="inline-flex items-center gap-2">
            <BookOpenCheck size={15} className="text-primary" aria-hidden />
            <span className="text-sm font-bold text-card-foreground">档案柜</span>
          </span>
          {endingsBadge ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{endingsBadge}</span>
          ) : (
            <span className="text-xs text-muted-foreground">还没编目</span>
          )}
        </button>
      </div>

      {/* 种子码入口（批次 X）：把某一局的号码贴回来，重走那一局的天气、脾气、深夜与日程顺序 */}
      <SeedCodeEntry onStartWithSeed={onStartWithSeed} hasSave={hasSave} />

      {/* 行政规定不设按钮：藏在右下角一行小字里（批次 CH） */}
      <div className="anim-fade-up mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1" style={{ animationDelay: "320ms" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-full px-2 py-1 text-[11px] text-muted-foreground/70 underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none"
        >
          行政规定
        </button>
        <button
          type="button"
          onClick={onOpenCredits}
          className="rounded-full px-2 py-1 text-[11px] text-muted-foreground/70 underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none"
        >
          制作名单
        </button>
        <p className="w-full text-center text-[10px] leading-relaxed text-muted-foreground/60" aria-live="polite">
          {canContinue
            ? "档案柜里还有上次的进度，随时接上"
            : hasSave
              ? "检测到这学期的进度，去地图选一条线接着走"
              : ""}
        </p>
      </div>
    </section>
  );
}

/** 种子码入口（批次 X / AE / AM）：默认收起一行说明；点开可贴号码开新局、锁住那颗种子，
 *  也可以把两颗种子放进同一台机器——混出来的第三颗在档案里留两行来历 */
function SeedCodeEntry({
  onStartWithSeed,
  hasSave,
}: {
  onStartWithSeed: (code: string, parents?: [number, number]) => boolean;
  hasSave: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [mixOn, setMixOn] = useState(false);
  const [secondDraft, setSecondDraft] = useState("");
  const [hint, setHint] = useState<null | string>(null);
  const [lockedSeed, setLockedSeed] = useState<number | null>(() => loadLockedSeed());
  const parseDraftSeed = (code: string) => parseSeedCode(code);
  const firstSeed = parseDraftSeed(draft);
  const secondSeed = mixOn ? parseDraftSeed(secondDraft) : null;
  const mixPreview = mixOn && firstSeed !== null && secondSeed !== null ? mixSeeds(firstSeed, secondSeed) : null;
  const submit = () => {
    if (mixOn) {
      if (firstSeed === null || secondSeed === null) {
        setHint("混种要两颗都认得出来——把两串号码都贴全。");
        return;
      }
      if (onStartWithSeed(seedCodeOf(mixSeeds(firstSeed, secondSeed)), [firstSeed, secondSeed])) {
        setHint(null);
        setDraft("");
        setSecondDraft("");
        return;
      }
      setHint("这一局没开成——再试一次。");
      return;
    }
    const code = draft.trim();
    if (!code) {
      setHint("先把那一局的号码贴进来——档案页的「局号」那行就是。");
      return;
    }
    if (onStartWithSeed(code)) {
      setHint(null);
      return;
    }
    setHint("认不出这串号码——数字段至少四位。再看看抄没抄全。");
  };
  return (
    <div className="anim-fade-up mt-2 w-full max-w-sm" style={{ animationDelay: "260ms" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-full px-4 py-2 text-left text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
      >
        <RefreshCcwDot size={13} aria-hidden />
        {open ? "收起编号补填" : "编号待填——贴回某一局的号码，重走那一局"}
      </button>
      {open && (
        <div className="anim-fade-up mt-1 rounded-2xl border border-border bg-card/80 p-3 shadow-sm">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="NAIWA-042317-雨多-晴天"
            aria-label="种子码"
            className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-card-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
          />
          {/* 混种（批次 AM）：两颗种子放进同一台机器，出来的是第三颗 */}
          <button
            type="button"
            onClick={() => setMixOn((prev) => !prev)}
            aria-pressed={mixOn}
            className={clsx(
              "mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold transition-colors duration-200",
              mixOn
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/60",
            )}
          >
            <Blend size={12} aria-hidden />
            {mixOn ? "混种模式 · 开着" : "把两颗种子混成一颗"}
          </button>
          {mixOn && (
            <div className="anim-fade-up mt-2 space-y-2">
              <input
                value={secondDraft}
                onChange={(event) => setSecondDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                placeholder="NAIWA-118823-风起-雾天（第二颗）"
                aria-label="第二颗种子码"
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-card-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
              />
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                {mixPreview !== null
                  ? `混成：${seedCodeOf(mixPreview)} ——同两颗永远混出同一颗；它不属于谁，但档案会记下它属于谁。`
                  : "两颗都贴上，就能混出第三颗。天气、脾气、深夜与日程的顺序，全由这颗新的决定。"}
              </p>
            </div>
          )}
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={firstSeed !== null && lockedSeed !== null && lockedSeed === firstSeed}
              onChange={(event) => {
                const parsed = firstSeed;
                if (parsed === null) {
                  setHint("先贴上号码再锁——锁不住认不出来的东西。");
                  return;
                }
                const nextLocked = event.target.checked ? parsed : null;
                persistLockedSeed(nextLocked);
                setLockedSeed(nextLocked);
              }}
              className="h-3.5 w-3.5 accent-primary"
              aria-label="锁住这颗种子：之后每次开新档都重走这一局"
            />
            <span className="text-[10px] leading-relaxed text-muted-foreground">
              锁住这颗种子——之后每次开新档都重走这一局。档案会数你进来了几遍。
            </span>
          </label>
          {lockedSeed !== null && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
              <p className="min-w-0 flex-1 font-mono text-[10px] font-bold tracking-widest text-primary">
                已锁定：NAIWA-{String(lockedSeed).padStart(6, "0")}
              </p>
              <button
                type="button"
                onClick={() => {
                  persistLockedSeed(null);
                  setLockedSeed(null);
                }}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                解除锁定
              </button>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-muted-foreground">
              {hint ??
                (mixPreview !== null
                  ? "混出来的这局会照常开局——档案里多两行来历。"
                  : hasSave
                    ? "有档时会先问你一次——同一学期只装一个世界。"
                    : "贴上号码，这局的世界就和你上次一模一样。")}
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={submit}
                className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                {mixOn ? "混合开局" : "开新局"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
