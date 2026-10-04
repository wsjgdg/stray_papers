import { useEffect, useRef, useState } from "react";
import type { useHome } from "./useHome";
import { FrogNaiBai } from "@/components/frog/Frog";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { TitleHero } from "@/components/home/TitleHero";
import { FrogCastRow } from "@/components/home/FrogCastRow";
import { StorylinePeek } from "@/components/home/StorylinePeek";
import { HomeDialogs } from "@/components/home/HomeDialogs";
import { HomeFooter } from "@/components/home/HomeFooter";
import { BlankResumeOverlay } from "@/components/system/BlankResumeOverlay";
import { SaveLoadDialog } from "@/components/system/SaveLoadDialog";
import { SettingsDialog } from "@/components/system/SettingsDialog";
import { hasEnrollSeen, loadGameSave, loadUnwrittenPage, recordBehavior } from "@/lib/gameSave";
import { EnrollLedger } from "@/components/home/EnrollLedger";
import { AbscondNoticeOverlay } from "@/components/home/AbscondNoticeOverlay";
import { CorruptSaveOverlay } from "@/components/home/CorruptSaveOverlay";
import { EnrollmentFixOverlay } from "@/components/home/EnrollmentFixOverlay";
import { NewMemoOverlay } from "@/components/home/NewMemoOverlay";
import { RichText } from "@/components/common/RichText";

/** 《奶蛙大学》标题画面 */
export function HomePage(p: ReturnType<typeof useHome>) {
  const [blankSlot, setBlankSlot] = useState<string | null>(null);
  /* 入学档案条（批次 AF）**必须是 state，不能是渲染期直接算的派生值**。
     之前写的是 `const enrollOpen = !hasEnrollSeen()`——看起来等价，实际是坏的：
     「开始被记录」只调 saveEnrollSeen() + recordBehavior()，两者都只写 localStorage，
     不触发任何 setState，于是没有任何重渲染，弹层永远不消失——表现为「点了没反应 / 卡死」。
     localStorage 是外部存储，不遵守 React 的渲染模型；要让它参与渲染就得放进 state。 */
  const [enrollOpen, setEnrollOpen] = useState(() => !hasEnrollSeen());
  /* 现实行为入档（批次 AF）：深夜打开这个游戏——记录员记下时刻；长时无操作自动归档 */
  const idleNotice = useIdleNotice();
  return (
    <>
      {enrollOpen && (
        <EnrollLedger
          onBegin={() => {
            recordBehavior({ kind: "night", at: Date.now() });
            /* EnrollLedger 内部已调 saveEnrollSeen() 落盘；这里只负责收起弹层。
               两者都要：localStorage 保证下次不再弹，state 保证这次真的关掉。 */
            setEnrollOpen(false);
          }}
        />
      )}
    <div className="relative min-h-dvh overflow-x-clip bg-gradient-to-br from-background via-secondary to-card">
      {/* 背景装饰光斑 */}
      <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">
        <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2">
              <FrogNaiBai size={34} />
              <span className="text-base font-bold text-foreground">奶蛙大学</span>
            </div>
            <ThemeSwitcher theme={p.activeTheme} onSwitch={p.switchTheme} compact />
          </div>
        </header>

        <main>
          <TitleHero
            hasSave={p.hasSave}
            playthrough={p.playthrough}
            onStartNewGame={p.startNewGame}
            onStartWithSeed={p.startWithSeed}
            onContinueGame={p.continueGame}
            autoSlotLabel={p.autoSlotLabel}
            onOpenSaveLoad={p.openSaveLoad}
            onOpenSettings={p.openSettings}
            onOpenCredits={p.openCredits}
            onOpenEndings={p.goToEndings}
            endingsBadge={p.endingsBadge}
          />
          {/* 不告而别（批次 CN）：没办过手续的，标题页多一行——它不怪你，它只是记录 */}
          {p.abscondCount > 0 && (
            <p className="anim-fade-up mt-6 text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
              上次离校：未办手续 · 累计 {p.abscondCount} 次
            </p>
          )}
          {/* 缺席提示（批次 AP）：现实时间 = 游戏时间——离校满三天，标题页多一行 */}
          {p.absentLabel && (
            <RichText className="mt-6 text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground" text={p.absentLabel} />
          )}
          {/* 记录员的话（批次 AU）：档案腔之外的第一人称——它只开口三次，之后把这一栏删了 */}
          {p.recorderLine && (
            <RichText className="anim-fade-up mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/70" text={p.recorderLine} />
          )}
          <FrogCastRow cast={p.cast} />
          <StorylinePeek storylines={p.storylines} onOpenMap={p.goToMap} />
          {(() => {
            /* 合上档案柜（批次 AN）：柜门闭着时，标题页只挂一行——那页纸还空着，你决定让它空着 */
            if (loadGameSave().cabinetClosed) {
              return (
                <p className="anim-fade-up mt-6 text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                  档案柜合着。那页纸还空着。
                </p>
              );
            }
            const page = loadUnwrittenPage();
            if (!page) return null;
            return (
              <p className="anim-fade-up mt-6 text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案柜最里面那页，写着：{page.trim().slice(0, 24)}
                {page.trim().length > 24 ? "……" : ""}
              </p>
            );
          })()}
        </main>

        {idleNotice && (
          <p className="anim-fade-up mx-auto mt-6 max-w-md text-center font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
            该蛙长时间未操作，已自动归档。
          </p>
        )}

        <HomeFooter />
      </div>

      <HomeDialogs
        seedInput={p.seedInput}
        onSeedInput={p.onSeedInput}
        creditsOpen={p.creditsOpen}
        freshConfirmOpen={p.freshConfirmOpen}
        onCloseCredits={p.closeCredits}
        onConfirmNewGame={p.confirmNewGame}
        onCancelNewGame={p.cancelNewGame}
      />

      {/* 系统层弹层：存读档（存/读可切）与设置 */}
      {p.saveLoadOpen && (
        <SaveLoadDialog
          mode="save"
          switchable
          saveLabel={`第 ${p.playthrough} 学期 · 标题画面`}
          saveLineId=""
          onOpenBlank={(slotId) => {
            p.closeSaveLoad();
            setBlankSlot(slotId);
          }}
          onClose={p.closeSaveLoad}
        />
      )}
      {blankSlot && <BlankResumeOverlay slotId={blankSlot} onClose={() => setBlankSlot(null)} />}
      {/* 姓名（批次 CO「姓名」）：学籍信息不全——有名字的才好被处理；补录不受理第二次 */}
      {/* 弹层互斥（2026-10-04 修复）：入学档案 / 学籍信息补全表 / 离校情况说明原本都是
          fixed inset-0 z-[90]，首次进入时三个会同时挂载。层级相同就靠 DOM 顺序决胜，
          而离校弹层在最后 -> 盖在最上面，把下面两层的按钮全挡住，点了没反应。
          这里按「谁必须先办完」排队：先看入学档案（首次且只有一次），
          再递补全表，最后才是攒够三次才出现的离校说明。 */}
      {p.enrollFixOpen && !enrollOpen && (
        <EnrollmentFixOverlay onConfirm={p.confirmEnrollFix} onClose={p.closeEnrollFix} />
      )}
      {p.abscondOpen && !enrollOpen && !p.enrollFixOpen && (
        <AbscondNoticeOverlay
          count={p.abscondCount}
          onRespond={p.ackAbscond}
          onClose={p.closeAbscond}
        />
      )}
      {/* 存档损坏说明（优化批次）：清档重开不再静默——如实告知，原文副本已留 */}
      {p.corruptNoticeOpen && <CorruptSaveOverlay onClose={p.closeCorruptNotice} />}
      {/* 册子添了新页（批次 CY-47）：结档收页后回到标题界面，柜子主动递一次收页回执 */}
      {p.newMemo && (
        <NewMemoOverlay
          memo={p.newMemo}
          prev={p.newMemoPrev}
          sealedCount={p.newMemoSealedCount}
          onOpenBook={p.openBookFromMemo}
          onDefer={p.deferNewMemo}
        />
      )}
      {p.settingsOpen && (
        <SettingsDialog
          playthrough={p.playthrough}
          settings={p.settings}
          onUpdateSettings={p.updateSettings}
          theme={p.activeTheme}
          onSwitchTheme={p.switchTheme}
          soundOn={p.soundOn}
          onToggleSound={p.toggleSound}
          onLeaveSchool={p.closeSettings}
          onClose={p.closeSettings}
        />
      )}
    </div>
    </>
  );
}

/** 标题页长时无操作（批次 AF）：60 秒不点任何东西，系统提示「已自动归档」——玩家什么都不做，也被记了一笔 */
function useIdleNotice(): boolean {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    const arm = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setIdle(false);
      timerRef.current = window.setTimeout(() => {
        setIdle(true);
        recordBehavior({ kind: "idle", seconds: 60, at: Date.now() });
      }, 60000);
    };
    arm();
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  return idle;
}
