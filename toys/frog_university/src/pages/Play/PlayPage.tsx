import type { usePlay } from "./usePlay";
import { buildingById } from "@/data/storylines";
import { FrogHuiHui } from "@/components/frog/Frog";
import { Hourglass, Pause, Rewind } from "lucide-react";
import { PlayBackground } from "@/components/play/PlayBackground";
import { StageBackground } from "@/components/play/StageBackground";
import { CgArt } from "@/components/play/CgArt";
import { PlayTopBar } from "@/components/play/PlayTopBar";
import { DialogueStage } from "@/components/play/DialogueStage";
import { DialogueBox } from "@/components/play/DialogueBox";
import { ChoiceOverlay } from "@/components/play/ChoiceOverlay";
import { SilenceMeter } from "@/components/play/SilenceMeter";
import { ActSummaryCard } from "@/components/play/ActSummaryCard";
import { EndingCard } from "@/components/play/EndingCard";
import { AffinityToast } from "@/components/play/AffinityToast";
import { CgOverlay } from "@/components/play/CgOverlay";
import { BiologyWhisper } from "@/components/play/BiologyWhisper";
import { BiologyLeaveOverlay, type BiologyLeaveKind } from "@/components/play/BiologyLeaveOverlay";
import { SilenceVeil } from "@/components/play/SilenceVeil";
import { SilenceHeardOverlay } from "@/components/play/SilenceHeardOverlay";
import { PauseOverlay } from "@/components/play/PauseOverlay";
import { RewindEchoOverlay } from "@/components/play/RewindEchoOverlay";
import { FileCardOverlay } from "@/components/play/FileCardOverlay";
import { InstinctOverlay } from "@/components/campus-map/InstinctOverlay";
import { BlankResumeOverlay } from "@/components/system/BlankResumeOverlay";
import { SaveLoadDialog } from "@/components/system/SaveLoadDialog";
import { SettingsDialog } from "@/components/system/SettingsDialog";
import { HistoryOverlay } from "@/components/system/HistoryOverlay";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { addSilence, hibernateNow, loadGameSave, shedSkinNow } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

/** 剧情对话页：舞台背景 + 立绘 + 对话框 + 选项/幕结算/结局浮层 + 好感提示 */
export function PlayPage(p: ReturnType<typeof usePlay>) {
  /* 震动演出（批次 B2）：silenceDelta ≥ 3 的选项确认后舞台轻晃 120ms（内部展示态，不碰存档） */
  const [quakeOn, setQuakeOn] = useState(false);
  useEffect(() => {
    if (!p.shakeStamp) return;
    setQuakeOn(true);
    const timer = window.setTimeout(() => setQuakeOn(false), 160);
    return () => window.clearTimeout(timer);
  }, [p.shakeStamp]);

  /* 二周目档案费（批次 AE）：存/读弹层每次打开花 1 点沉默值——档案柜这学期要收费；
     余额不足也放行打开，但弹层里挂出欠费说明 */
  const archiveToll = p.playthrough >= 2;
  const tollBalance = loadGameSave().silenceValue;
  const openSaveDialog = () => {
    if (archiveToll) {
      if (tollBalance >= 1) addSilence(-1);
    }
    p.manualSave();
  };
  const openLoadDialog = () => {
    if (archiveToll) {
      if (tollBalance >= 1) addSilence(-1);
    }
    p.openOverlay("load");
  };
  const [blankSlot, setBlankSlot] = useState<string | null>(null);
  const costNotice = archiveToll
    ? tollBalance >= 1
      ? "第二学期起，抽档案要花沉默值：本次打开已收 1 点。花得越多，结局档位越低。"
      : "余额不足：这一学期沉默值已归零，档案柜不再受理——读得动，存不进。"
    : undefined;

  /* 蛙的生物学（批次 AH）：结局相位的两个出口——冬眠 / 蜕一层皮（先问再动，两步确认） */
  const [biologyAsk, setBiologyAsk] = useState<BiologyLeaveKind | null>(null);
  const confirmBiology = (kind: BiologyLeaveKind) => {
    if (kind === "hibernate") {
      hibernateNow();
    } else {
      shedSkinNow();
    }
    setBiologyAsk(null);
    p.backToMap();
  };

  /* 鸣叫（批次 AH）：顶栏按钮 / K 键——没有理由的发声；弹层与结局相位里不叫。
     时间机器（批次 AT）：P 键切换暂停——暂停里世界不跟你停。
     跳到没读过（批次 CY-29）：N 键——一键越过这一幕里的已读段 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "p" || event.key === "P") {
        if (p.paused) {
          p.togglePause();
          return;
        }
        if (p.overlay !== "none" || biologyAsk) return;
        p.togglePause();
        return;
      }
      if (event.code === "Space") {
        /* 空格推进（批次 CY-32）：打字中先补完整句，再按推进——和点击舞台同一条路。
           焦点在输入框/按钮上时不抢键（免得起泡与推进双触发）；长按不连发，一次按键一句 */
        if (event.repeat) return;
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "BUTTON" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        )
          return;
        if (p.overlay !== "none" || biologyAsk || p.paused) return;
        event.preventDefault();
        p.advance();
        return;
      }
      if (event.key === "n" || event.key === "N") {
        /* 跳到没读过（批次 CY-27 的键盘化，批次 CY-29）：N 一键越过这一幕里的已读段 */
        if (p.overlay !== "none" || biologyAsk || p.paused) return;
        p.jumpToUnread();
        return;
      }
      if (event.key !== "k" && event.key !== "K") return;
      if (p.overlay !== "none" || biologyAsk || p.paused) return;
      p.handleCroak();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.overlay, p.handleCroak, p.paused, p.togglePause, p.jumpToUnread, p.advance, biologyAsk]);

  if (p.phase === "invalid" || !p.storyline) {
    const found = Boolean(p.storyline);
    return (
      <div className="relative min-h-dvh overflow-x-clip bg-gradient-to-b from-background via-secondary/60 to-background">
        <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
          <div className="anim-float">
            <FrogHuiHui size={110} />
          </div>

          <div className="w-full rounded-3xl border border-border bg-card p-8 shadow-md">
            {p.storyline ? (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {buildingById(p.storyline.building)?.label}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">迷路的蛙</span>
            )}

            <h1 className="mt-4 text-3xl font-bold text-card-foreground">
              {p.storyline ? `《${p.storyline.title}》` : "这条剧情线还在湖里泡着"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {found
                ? "这一章的剧本还在食堂蒸笼里保温，等下一班蛙把它送来。先回地图逛逛别处吧。"
                : "湖面雾太大，没找到这条剧情线。从校园地图重新出发吧。"}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={p.backToMap}
                className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                回校园地图
              </button>
              <button
                type="button"
                onClick={p.backHome}
                className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
              >
                回标题画面
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* 纸起毛（批次 AF）：读档 = 调阅档案。同一页翻的次数多了，纸的边角起毛——
     角色不打破第四面墙，是纸先开口 */
  const loadCount = (loadGameSave().loadCounts ?? {})[p.storyline?.id ?? ""] ?? 0;
  const frayedText =
    loadCount >= 10
      ? "你已经看过这段了。还要再看一遍吗？"
      : loadCount >= 5
        ? "纸的边角起了毛。"
        : loadCount >= 3
          ? "这一页被翻回来的次数变多了。"
          : null;

  const finished = p.phase === "ending" || p.phase === "finale";

  /* 蛙的生物学（批次 AH）：结局卡台账——「声音」/ 冬眠 / 蜕皮（跨学期保留，不随数值清零） */
  const bioSave = loadGameSave();
  const biologyLedger = {
    calls: bioSave.calls ?? 0,
    hibernations: bioSave.hibernations ?? 0,
    molts: bioSave.molts ?? 0,
  };
  /* 冬眠次数（批次 AH）：醒来的次数越多，角色越淡——立绘整体降不透明度（不消失，只是淡） */
  const stageFade =
    biologyLedger.hibernations >= 4
      ? 0.82
      : biologyLedger.hibernations === 3
        ? 0.85
        : biologyLedger.hibernations === 2
          ? 0.9
          : biologyLedger.hibernations === 1
            ? 0.94
            : 1;

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-gradient-to-b from-background via-secondary/60 to-background">
      <PlayTopBar
        lineTitle={p.storyline.title}
        actLabel={`第 ${p.actIndex}/${p.actTotal} 幕 · ${p.actTitle}`}
        silenceValue={p.silenceValue}
        silenceExpression={p.silenceExpression}
        hideValues={p.playthrough >= 2}
        canSave={p.playthrough < 3}
        activeTheme={p.activeTheme}
        onSwitchTheme={p.switchTheme}
        soundOn={p.soundOn}
        onToggleSound={p.toggleSound}
        skipRead={p.skipReadMode}
        onToggleSkipRead={p.toggleSkipRead}
        onJumpUnread={p.jumpToUnread}
        actRead={p.actRead}
        onOpenSave={openSaveDialog}
        onOpenLoad={openLoadDialog}
        onOpenHistory={() => p.openOverlay("history")}
        onOpenSettings={() => p.openOverlay("settings")}
        onCroak={p.handleCroak}
        savedFlash={p.savedFlash}
        onBackMap={p.backToMap}
      />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <p className="text-xs font-bold text-primary">
          {p.buildingLabel} · 第 {p.actIndex}/{p.actTotal} 幕
        </p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">《{p.storyline.title}》</h1>
      </div>

      <main className="relative mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[7fr_3fr]">
        <section
          aria-label="剧情舞台"
          onClick={p.blinkOnStageClick}
          className={clsx("overflow-hidden rounded-3xl border border-border bg-card shadow-md", quakeOn && "nw-quake")}
        >
          <div className="relative h-[380px] sm:h-[440px]">
            {/* 真心话段落（批次 B2）：背景降饱和；停留（批次 AT）：待得越久，这里越暗——背景在变 */}
            <div
              className={clsx(
                "absolute inset-0 transition-[filter] duration-700 ease-out",
                p.staying
                  ? "saturate-[.35] brightness-[.72]"
                  : p.isHeartLine
                    ? "saturate-[.55]"
                    : "saturate-100",
              )}
            >
              {/* 批次 J：宿舍线按行切舞台背景场景（含夜/断电差分）；其他线维持既有建筑场景背景 */}
              {p.activeBg ? <StageBackground id={p.activeBg} /> : <PlayBackground buildingId={p.storyline.building} />}
              {/* 沉默的物理空间（批次 AK）：沉默值越高，背景越空——食堂人少 / 图书馆灯暗 / 操场风大 / 湖边水响 */}
              <SilenceVeil buildingId={p.storyline.building} stage={p.silenceVeilStage} />
              <div
                className="absolute inset-x-0 bottom-4 flex justify-center px-4 transition-opacity duration-700"
                style={{ opacity: stageFade }}
              >
                <DialogueStage
                  castIds={p.castIds}
                  activeSpeakerId={p.stageSpeakerId}
                  heartActive={p.isHeartLine}
                  speakerExpression={p.speakerExpression}
                  activePose={p.activePose}
                  activeGear={p.activeGear}
                  gaze={p.gazeOn ? p.gaze : null}
                  blinkStamp={p.blinkNotice?.stamp ?? 0}
                  staringId={p.staring}
                  onStare={p.toggleStare}
                  blanks={p.stageBlanks}
                />
              </div>
            </div>

            {/* 蛙的生物学（批次 AH）：鸣叫的回声 / 冷血的关心——浮在舞台上空，几秒后自行收起；
                鸣叫时舞台中央荡开一圈水纹（零资产演出，纯 CSS）。
                时间机器（批次 AT）：停留的分段旁白按秒切换；停留与暂停的渗出行走同一耳语通道 */}
            {p.croakNotice && <BiologyWhisper text={p.croakNotice.text} stamp={p.croakNotice.stamp} />}
            {p.frozenNotice && <BiologyWhisper text={p.frozenNotice.text} stamp={p.frozenNotice.stamp} />}
            {p.glimpseNotice && <BiologyWhisper text={p.glimpseNotice.text} stamp={p.glimpseNotice.stamp} />}
            {p.staying && p.stayLine && <BiologyWhisper text={p.stayLine} stamp={p.staySeconds} />}
            {p.stayNotice && <BiologyWhisper text={p.stayNotice.text} stamp={p.stayNotice.stamp} />}
            {p.pauseReturnNotice && (
              <BiologyWhisper
                text={`（你在暂停里待了 ${p.pauseReturnNotice.seconds} 秒。你不在的时候，世界自己走了一段。）`}
                stamp={p.pauseReturnNotice.stamp}
              />
            )}
            {/* 注视（批次 AY）：第四面墙本来就不存在——眨眼与注视的分段话走同一耳语通道 */}
            {p.blinkNotice && <BiologyWhisper text={p.blinkNotice.text} stamp={p.blinkNotice.stamp} />}
            {p.staring && p.stareLine && <BiologyWhisper text={p.stareLine} stamp={p.stareSeconds} />}
            {p.colludeNotice && <BiologyWhisper text={p.colludeNotice.text} stamp={p.colludeNotice.stamp} />}

            {/* 挡开（批次 AY）：行政楼的窗口不看脸——你被允许看什么，是被规定的 */}
            {p.fileCardOpen && <FileCardOverlay onClose={p.closeFileCard} />}

            {/* 时间机器（批次 AT）：舞台左下角的三枚时间工具——暂停 / 倒带 / 停留；快进在对话框旁 */}
            {!finished && (
              <div className="absolute bottom-4 left-4 z-[40] flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={p.togglePause}
                  aria-label="暂停"
                  title="暂停：背景不变，音乐继续——暂停里可以查看数值、档案与快进记录。但你不在的时候，世界自己走。"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <Pause size={12} aria-hidden />
                  暂停
                </button>
                <button
                  type="button"
                  onClick={p.rewind}
                  disabled={!p.canRewind}
                  aria-label="倒带"
                  title="倒带：不是读档——场景回到本幕开头，数值不回退（发生过的事都记着），但角色记得原来的版本。"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground shadow-sm backdrop-blur transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-40"
                >
                  <Rewind size={12} aria-hidden />
                  倒带
                </button>
                <button
                  type="button"
                  onClick={p.staying ? p.leaveStay : p.enterStay}
                  disabled={!p.staying && (p.phase !== "dialogue" || p.cgOpen)}
                  aria-label={p.staying ? "不待了" : "停留"}
                  title="停留：不推进，不跳过，不存档，就是待在那里。待久了——它会问你，它沉默，背景变，场景自己结束。"
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] font-bold shadow-sm backdrop-blur transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-40",
                    p.staying
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-background/85 text-muted-foreground hover:text-card-foreground",
                  )}
                >
                  <Hourglass size={12} aria-hidden />
                  {p.staying ? `不待了 · ${p.staySeconds}s` : "停留"}
                </button>
              </div>
            )}
            {/* 成就盖章（批次 CY-29）：新解锁的成就在舞台中央当场点名，与小乐句同刻 */}
            {p.achToast && (
              <span
                key={p.achToast.stamp}
                className="pointer-events-none absolute inset-x-0 top-1/3 z-[7] flex justify-center px-4"
              >
                <span className="anim-fade-up rounded-2xl border border-primary bg-card px-5 py-3 text-center shadow-lg">
                  <p className="text-[10px] font-bold tracking-widest text-primary">档案记入</p>
                  <p className="mt-0.5 text-sm font-bold text-card-foreground">成就《{p.achToast.name}》解锁</p>
                </span>
              </span>
            )}
            {/* 跳到没读过的回话（批次 CY-27）：这一幕全是读过的，浮一句就收 */}
            {p.jumpNotice && (
              <span
                key={p.jumpNotice.stamp}
                className="pointer-events-none absolute inset-x-0 top-8 z-[6] flex justify-center px-4"
              >
                <span className="anim-fade-up rounded-full border border-primary/40 bg-background/90 px-4 py-2 text-xs font-bold text-primary shadow-md backdrop-blur">
                  {p.jumpNotice.text}
                </span>
              </span>
            )}
            {p.croakNotice && (
              <span
                key={p.croakNotice.stamp}
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
              >
                <span className="nw-croak-ring" />
                <span className="nw-croak-ring nw-croak-ring-late" />
              </span>
            )}

            {/* 三学期玩法规则（批次 AA）：第三学期选项延迟 3 秒出现——像档案翻页，不能催 */}
            {p.phase === "choice" && (
              <ChoiceOverlay
                choices={p.choices}
                onChoose={p.chooseOption}
                onHesitate={p.onHesitate}
                idleEnabled={p.idleEnabled}
                delayMs={p.playthrough >= 3 ? 3000 : 0}
                silenceStage={p.silenceStage}
                onDefer={p.deferChoice}
                answeredIds={p.answeredChoiceIds}
              />
            )}
            {p.phase === "actSummary" && p.summary && (
              <ActSummaryCard
                summary={p.summary}
                impressionPercent={p.impressionPercent}
                onContinue={p.goNextAct}
                onBackMap={p.backToMap}
              />
            )}
            {finished && p.ending && (
              <EndingCard
                ending={p.ending}
                endingTier={p.endingTier}
                isFinale={p.phase === "finale"}
                totalSilence={p.silenceValue}
                doneCount={p.doneCount}
                lakeUnlocked={p.lakeUnlocked}
                finaleCoda={p.finaleCoda}
                closestFrog={p.closestFrog}
                impressionPercent={p.impressionPercent}
                attention={p.attention}
                endingCg={p.endingCg}
                endingPlate={p.endingPlate ?? undefined}
                playthrough={p.playthrough}
                plusText={p.isPlusPlaythrough ? (p.ending.plus ?? undefined) : undefined}
                thirdNoteText={p.isThirdPlaythrough ? (p.ending.thirdNote ?? undefined) : undefined}
                branchCodas={p.branchCodas}
                biologyLedger={biologyLedger}
                repeatSeen={p.repeatEnding}
                substituteName={p.substituteName}
                onHibernate={() => setBiologyAsk("hibernate")}
                onShedSkin={() => setBiologyAsk("molt")}
                onBackMap={p.backToMap}
                onBackHome={p.backHome}
              />
            )}
          </div>

          <div className="relative border-t border-border p-4 md:p-5">
            {frayedText && !finished && (
          <RichText className="mb-2 text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground/70" text={frayedText} />
        )}

        <DialogueBox
              speakerName={p.speakerName}
              speakerRole={p.speakerRole}
              lineKind={p.lineKind}
              text={p.displayedText}
              innerVoice={p.innerVoice}
              isTyping={p.isTyping}
              heartMark={p.isHeartLine}
              rememberMark={p.isRememberLine}
              readBefore={p.lineReadBefore}
              existenceTier={p.speakerTier}
              degradedLabel={p.degradedLabel}
              pauseNote={p.pauseNote}
              traceMark={p.traceMark}
              traceLabel={p.traceLabel}
              traceNote={p.traceNote}
              reportMark={p.reportMark}
              reportLabel={p.reportLabel}
              reportNote={p.reportNote}
              factionMark={p.factionMark}
              factionNote={p.factionNote}
              departMark={p.departMark}
              departLabel={p.departLabel}
              departNote={p.departNote}
              vanishNote={p.vanishNote}
              onAdvance={p.advance}
              autoMode={p.autoMode}
              onToggleAuto={p.toggleAuto}
              onSkip={p.skipForward}
            />
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <SilenceMeter
            value={p.silenceValue}
            expression={p.silenceExpression}
            gainFlash={p.gainFlash}
            hideValues={p.playthrough >= 2}
          />

          <section aria-label="幕次进度" className="rounded-2xl border border-border bg-card p-4 shadow-md">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground">幕次进度</h3>
            <ol className="mt-3 flex flex-col gap-2">
              {p.actProgress.map((act) => (
                <li key={act.index} className="flex items-center gap-2 text-sm">
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      act.state === "done" && "bg-primary text-primary-foreground",
                      act.state === "current" && "border border-primary bg-primary/10 text-primary",
                      act.state === "todo" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {act.index}
                  </span>
                  <span
                    className={clsx(
                      "truncate font-bold",
                      act.state === "todo" ? "text-muted-foreground" : "text-card-foreground",
                    )}
                  >
                    {act.title}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {p.collectedQuotes.length > 0 && (
            <section
              aria-label="蛙言蛙语"
              className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-md"
            >
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground">蛙言蛙语</h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {p.collectedQuotes.map((item, i) => (
                  <li key={`${i}-${item.quote}`} className="text-sm leading-relaxed">
                    <span className="font-bold text-card-foreground">「{item.quote}」</span>
                    {item.byName && (
                      <span className="ml-1 text-xs text-muted-foreground">—— {item.byName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>

      <AffinityToast flash={p.affinityFlash} />

      {/* 系统层弹层：存读档 / 设置 / 回想（互斥，同一时间只开一个） */}
      {(p.overlay === "save" || p.overlay === "load") && (
        <SaveLoadDialog
          mode={p.overlay === "save" ? "save" : "load"}
          saveLabel={`第 ${p.playthrough} 学期 · ${p.storyline.title} · ${p.actTitle}`}
          saveLineId={p.storyline.id}
          costNotice={costNotice}
          onOpenBlank={(slotId) => {
            p.closeOverlay();
            setBlankSlot(slotId);
          }}
          onClose={p.closeOverlay}
        />
      )}
      {blankSlot && <BlankResumeOverlay slotId={blankSlot} onClose={() => setBlankSlot(null)} />}
      {/* 沉默可以被听见（批次 AK）：沉默值第一次进入中档——灰灰隔着一段距离说了三句话（每学期一次） */}
      {p.heardOpen && <SilenceHeardOverlay onDismiss={p.dismissHeard} />}
      {/* 暂停（批次 AT「时间机器」）：背景不变，音乐继续——你不在的时候，世界自己走 */}
      {p.paused && (
        <PauseOverlay
          seconds={p.pauseSeconds}
          hideValues={p.playthrough >= 2}
          lineTitle={p.storyline.title}
          actLabel={`第 ${p.actIndex}/${p.actTotal} 幕`}
          onResume={p.togglePause}
          onGoMap={p.backToMap}
          onGoEndings={p.goToEndings}
        />
      )}
      {/* 倒带回响（批次 AT「时间机器」）：你改了剧情，但角色记得原来的版本 */}
      {p.rewindNotice && <RewindEchoOverlay onClose={p.dismissRewind} />}
      {/* 本能（批次 CE「发作」）：安静下来的那一幕结束之后，你叫了一声——没有预警，叫了之后怎么办 */}
      {p.instinct === "croak" && (
        <InstinctOverlay
          mode="croak"
          missed={[]}
          moltNote=""
          onCroakAck={p.ackInstinct}
          onSleepAck={() => undefined}
          onClose={p.closeInstinct}
        />
      )}
      {/* 蛙的生物学（批次 AH）：冬眠 / 蜕皮的确认浮层（档案腔的两步出口） */}
      {biologyAsk && (
        <BiologyLeaveOverlay
          kind={biologyAsk}
          onConfirm={confirmBiology}
          onClose={() => setBiologyAsk(null)}
        />
      )}
      {p.overlay === "settings" && (
        <SettingsDialog
          playthrough={p.playthrough}
          settings={p.settings}
          onUpdateSettings={p.updateSettings}
          theme={p.activeTheme}
          onSwitchTheme={p.switchTheme}
          soundOn={p.soundOn}
          onToggleSound={p.toggleSound}
          onLeaveSchool={p.backHome}
          onClose={p.closeOverlay}
        />
      )}
      {p.overlay === "history" && (
        <HistoryOverlay backlog={p.backlog} onShred={p.shredBacklog} shredCount={p.shredCount} onClose={p.closeOverlay} />
      )}

      {/* CG 定格（批次 B2）：当前节点带 cg 且未收起 → 全屏定格；展开期间快进/自动由 Logic 层停摆 */}
      {p.cgOpen && p.activeCg && (
        <CgOverlay key={p.activeCg.id} scene={p.activeCg} onClose={p.closeCg} />
      )}

      {/* 转场演出（批次 B2）：进线黑场揭示 / 幕间过渡 / 结局白闪 / 返回地图淡黑；不阻塞点击 */}
      {p.transition && (
        <div
          key={p.transition.stamp}
          aria-hidden
          className={clsx(
            "pointer-events-none fixed inset-0 z-[60]",
            p.transition.kind === "ending" ? "bg-primary-foreground" : "bg-foreground",
            p.transition.kind === "enter" && "nw-veil-out",
            p.transition.kind === "act" && "nw-veil-act",
            p.transition.kind === "ending" && "nw-flash-white",
            p.transition.kind === "map" && "nw-veil-in",
          )}
        />
      )}

      {/* 片头（批次 J 起，批次 K 按线查表）：本学期第一次进线自动播；任意点击跳过，跳过/播完都标记 */}
      {p.opOpen && p.opPlate && (
        <button
          type="button"
          onClick={p.closeOp}
          aria-label="跳过片头"
          className="fixed inset-0 z-[70] cursor-pointer bg-foreground/95 text-left"
        >
          <div className="absolute inset-0 opacity-70 transition-opacity duration-1000">
            <StageBackground id={p.opPlate.bgId} />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 anim-fade-up">
            <RichText className="text-xs font-bold tracking-[0.4em] text-background/70" text={p.opPlate.place} />
            <h2 className="text-4xl font-bold text-background sm:text-5xl">
              {p.opPlate.title}
              {p.opPlate.titleTail && <span className="text-primary">{p.opPlate.titleTail}</span>}
            </h2>
            <RichText className="mt-2 text-xs leading-relaxed text-background/70" text={p.opPlate.quote} />
            <p className="mt-6 text-[11px] text-background/60">点击任意处跳过</p>
          </div>
          <div className="absolute bottom-6 left-1/2 h-24 w-36 -translate-x-1/2 opacity-80">
            <CgArt id={p.opPlate.cgId} />
          </div>
        </button>
      )}
    </div>
  );
}
