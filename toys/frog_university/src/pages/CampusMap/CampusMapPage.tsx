import { unlockAchievement } from "@/lib/achievements";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { clsx } from "clsx";
import { duckAmbience } from "@/lib/audio";
import type { useCampusMap } from "./useCampusMap";
import { REGULAR_LINE_IDS } from "@/data/storylinesMeta";
import { CLASS_LABELS } from "@/lib/schedule";
import { CampusTopBar } from "@/components/campus-map/CampusTopBar";
import { CampusMapCanvas } from "@/components/campus-map/CampusMapCanvas";
import { LineListPanel } from "@/components/campus-map/LineListPanel";
import { CampusFooter } from "@/components/campus-map/CampusFooter";
import { KeptNotesPanel } from "@/components/campus-map/KeptNotesPanel";
import { AffinityPanel } from "@/components/campus-map/AffinityPanel";
import { sideStoryById, sideStoryOf } from "@/data/sideStories";
import { WeatherLayer } from "@/components/campus-map/WeatherLayer";
import { FinalWeekBanner } from "@/components/campus-map/FinalWeekBanner";
import { CampusDateCard } from "@/components/campus-map/CampusDateCard";

/** 地图页瘦身（批次 CY-108）：事件弹层全部按需加载——弹到哪个才拉哪块代码，首屏只背地图骨架 */
function lazyOverlay<P>(loader: () => Promise<ComponentType<P>>) {
  const Inner = lazy(() =>
    loader().then((Component) => ({ default: Component as ComponentType<Record<string, unknown>> })),
  );
  return function LazyOverlay(props: P) {
    return (
      <Suspense fallback={null}>
        <Inner {...(props as Record<string, unknown>)} />
      </Suspense>
    );
  };
}

const StorylineDialog = lazyOverlay(() => import("@/components/campus-map/StorylineDialog").then((m) => m.StorylineDialog));
const SideStoryOverlay = lazyOverlay(() => import("@/components/campus-map/SideStoryOverlay").then((m) => m.SideStoryOverlay));
const NightEventOverlay = lazyOverlay(() => import("@/components/campus-map/NightEventOverlay").then((m) => m.NightEventOverlay));
const PrivateDossierOverlay = lazyOverlay(() => import("@/components/campus-map/PrivateDossierOverlay").then((m) => m.PrivateDossierOverlay));
const DayEventOverlay = lazyOverlay(() => import("@/components/campus-map/DayEventOverlay").then((m) => m.DayEventOverlay));
const CampusDateOverlay = lazyOverlay(() => import("@/components/campus-map/CampusDateOverlay").then((m) => m.CampusDateOverlay));
const TutorialOverlay = lazyOverlay(() => import("@/components/campus-map/TutorialOverlay").then((m) => m.TutorialOverlay));
const LedgerDeskOverlay = lazyOverlay(() => import("@/components/campus-map/LedgerDeskOverlay").then((m) => m.LedgerDeskOverlay));
const ClassScheduleOverlay = lazyOverlay(() => import("@/components/campus-map/ClassScheduleOverlay").then((m) => m.ClassScheduleOverlay));
const MaintenanceNoticeOverlay = lazyOverlay(() => import("@/components/campus-map/MaintenanceNoticeOverlay").then((m) => m.MaintenanceNoticeOverlay));
const EarlyGraduationOverlay = lazyOverlay(() => import("@/components/campus-map/EarlyGraduationOverlay").then((m) => m.EarlyGraduationOverlay));
const ReturnVisitOverlay = lazyOverlay(() => import("@/components/campus-map/ReturnVisitOverlay").then((m) => m.ReturnVisitOverlay));
const NoticeOverlay = lazyOverlay(() => import("@/components/campus-map/NoticeOverlay").then((m) => m.NoticeOverlay));
const BroadcastOverlay = lazyOverlay(() => import("@/components/campus-map/BroadcastOverlay").then((m) => m.BroadcastOverlay));
const RollCallOverlay = lazyOverlay(() => import("@/components/campus-map/RollCallOverlay").then((m) => m.RollCallOverlay));
const PackageOverlay = lazyOverlay(() => import("@/components/campus-map/PackageOverlay").then((m) => m.PackageOverlay));
const PostedOverlay = lazyOverlay(() => import("@/components/campus-map/PostedOverlay").then((m) => m.PostedOverlay));
const ExplainOverlay = lazyOverlay(() => import("@/components/campus-map/ExplainOverlay").then((m) => m.ExplainOverlay));
const SignOffOverlay = lazyOverlay(() => import("@/components/campus-map/SignOffOverlay").then((m) => m.SignOffOverlay));
const SealOverlay = lazyOverlay(() => import("@/components/campus-map/SealOverlay").then((m) => m.SealOverlay));
const PlayerReportOverlay = lazyOverlay(() => import("@/components/campus-map/PlayerReportOverlay").then((m) => m.PlayerReportOverlay));
const FactionActionOverlay = lazyOverlay(() => import("@/components/campus-map/FactionActionOverlay").then((m) => m.FactionActionOverlay));
const FactionSplitOverlay = lazyOverlay(() => import("@/components/campus-map/FactionSplitOverlay").then((m) => m.FactionSplitOverlay));
const CourierOverlay = lazyOverlay(() => import("@/components/campus-map/CourierOverlay").then((m) => m.CourierOverlay));
const DepartureOverlay = lazyOverlay(() => import("@/components/campus-map/DepartureOverlay").then((m) => m.DepartureOverlay));
const VanishOverlay = lazyOverlay(() => import("@/components/campus-map/VanishOverlay").then((m) => m.VanishOverlay));
const FinishedOverlay = lazyOverlay(() => import("@/components/campus-map/FinishedOverlay").then((m) => m.FinishedOverlay));
const RecorderOverlay = lazyOverlay(() => import("@/components/campus-map/RecorderOverlay").then((m) => m.RecorderOverlay));
const QuietingOverlay = lazyOverlay(() => import("@/components/campus-map/QuietingOverlay").then((m) => m.QuietingOverlay));
const ShiftHandoverOverlay = lazyOverlay(() => import("@/components/campus-map/ShiftHandoverOverlay").then((m) => m.ShiftHandoverOverlay));
const TestimonyOverlay = lazyOverlay(() => import("@/components/campus-map/TestimonyOverlay").then((m) => m.TestimonyOverlay));
const SuccessionOverlay = lazyOverlay(() => import("@/components/campus-map/SuccessionOverlay").then((m) => m.SuccessionOverlay));
const MisdeliveryOverlay = lazyOverlay(() => import("@/components/campus-map/MisdeliveryOverlay").then((m) => m.MisdeliveryOverlay));
const LostPageOverlay = lazyOverlay(() => import("@/components/campus-map/LostPageOverlay").then((m) => m.LostPageOverlay));
const MergerOverlay = lazyOverlay(() => import("@/components/campus-map/MergerOverlay").then((m) => m.MergerOverlay));
const TransitOverlay = lazyOverlay(() => import("@/components/campus-map/TransitOverlay").then((m) => m.TransitOverlay));
const BereadOverlay = lazyOverlay(() => import("@/components/campus-map/BereadOverlay").then((m) => m.BereadOverlay));
const NoteOverlay = lazyOverlay(() => import("@/components/campus-map/NoteOverlay").then((m) => m.NoteOverlay));
const FinalizeOverlay = lazyOverlay(() => import("@/components/campus-map/FinalizeOverlay").then((m) => m.FinalizeOverlay));
const DestructionOverlay = lazyOverlay(() => import("@/components/campus-map/DestructionOverlay").then((m) => m.DestructionOverlay));
const RightsOverlay = lazyOverlay(() => import("@/components/campus-map/RightsOverlay").then((m) => m.RightsOverlay));
const ReconciliationOverlay = lazyOverlay(() => import("@/components/campus-map/ReconciliationOverlay").then((m) => m.ReconciliationOverlay));
const SelfEntryOverlay = lazyOverlay(() => import("@/components/campus-map/SelfEntryOverlay").then((m) => m.SelfEntryOverlay));
const OverdueOverlay = lazyOverlay(() => import("@/components/campus-map/OverdueOverlay").then((m) => m.OverdueOverlay));
const DeclarationOverlay = lazyOverlay(() => import("@/components/campus-map/DeclarationOverlay").then((m) => m.DeclarationOverlay));
const RegistryOverlay = lazyOverlay(() => import("@/components/campus-map/RegistryOverlay").then((m) => m.RegistryOverlay));
const FlyleafOverlay = lazyOverlay(() => import("@/components/campus-map/FlyleafOverlay").then((m) => m.FlyleafOverlay));
const ClaimOverlay = lazyOverlay(() => import("@/components/campus-map/ClaimOverlay").then((m) => m.ClaimOverlay));
const JointOverlay = lazyOverlay(() => import("@/components/campus-map/JointOverlay").then((m) => m.JointOverlay));
const LetterBoxOverlay = lazyOverlay(() => import("@/components/campus-map/LetterBoxOverlay").then((m) => m.LetterBoxOverlay));
const NamingOverlay = lazyOverlay(() => import("@/components/campus-map/NamingOverlay").then((m) => m.NamingOverlay));
const SameNameOverlay = lazyOverlay(() => import("@/components/campus-map/SameNameOverlay").then((m) => m.SameNameOverlay));
const CatalogOverlay = lazyOverlay(() => import("@/components/campus-map/CatalogOverlay").then((m) => m.CatalogOverlay));
const CarryoverOverlay = lazyOverlay(() => import("@/components/campus-map/CarryoverOverlay").then((m) => m.CarryoverOverlay));
const BlankOverlay = lazyOverlay(() => import("@/components/campus-map/BlankOverlay").then((m) => m.BlankOverlay));
const OpenDayOverlay = lazyOverlay(() => import("@/components/campus-map/OpenDayOverlay").then((m) => m.OpenDayOverlay));
const SubstituteOverlay = lazyOverlay(() => import("@/components/campus-map/SubstituteOverlay").then((m) => m.SubstituteOverlay));
const PageNoteOverlay = lazyOverlay(() => import("@/components/campus-map/PageNoteOverlay").then((m) => m.PageNoteOverlay));
const MemoryOverlay = lazyOverlay(() => import("@/components/campus-map/MemoryOverlay").then((m) => m.MemoryOverlay));
const UndergroundOverlay = lazyOverlay(() => import("@/components/campus-map/UndergroundOverlay").then((m) => m.UndergroundOverlay));
const InstinctOverlay = lazyOverlay(() => import("@/components/campus-map/InstinctOverlay").then((m) => m.InstinctOverlay));
const HolidayOverlay = lazyOverlay(() => import("@/components/campus-map/HolidayOverlay").then((m) => m.HolidayOverlay));
const InventoryOverlay = lazyOverlay(() => import("@/components/campus-map/InventoryOverlay").then((m) => m.InventoryOverlay));
const OfficeOverlay = lazyOverlay(() => import("@/components/campus-map/OfficeOverlay").then((m) => m.OfficeOverlay));
const MeetingOverlay = lazyOverlay(() => import("@/components/campus-map/MeetingOverlay").then((m) => m.MeetingOverlay));
const HandoverOverlay = lazyOverlay(() => import("@/components/campus-map/HandoverOverlay").then((m) => m.HandoverOverlay));
const WindowDutyOverlay = lazyOverlay(() => import("@/components/campus-map/WindowDutyOverlay").then((m) => m.WindowDutyOverlay));
const MentoringOverlay = lazyOverlay(() => import("@/components/campus-map/MentoringOverlay").then((m) => m.MentoringOverlay));
const AuditOverlay = lazyOverlay(() => import("@/components/campus-map/AuditOverlay").then((m) => m.AuditOverlay));
const InspectionOverlay = lazyOverlay(() => import("@/components/campus-map/InspectionOverlay").then((m) => m.InspectionOverlay));
const ArchiveRoomOverlay = lazyOverlay(() => import("@/components/campus-map/ArchiveRoomOverlay").then((m) => m.ArchiveRoomOverlay));
const BaselineOverlay = lazyOverlay(() => import("@/components/campus-map/BaselineOverlay").then((m) => m.BaselineOverlay));
const MisalignOverlay = lazyOverlay(() => import("@/components/campus-map/MisalignOverlay").then((m) => m.MisalignOverlay));
const VolumeOverlay = lazyOverlay(() => import("@/components/campus-map/VolumeOverlay").then((m) => m.VolumeOverlay));
const LakeRegisterOverlay = lazyOverlay(() => import("@/components/campus-map/LakeRegisterOverlay").then((m) => m.LakeRegisterOverlay));
const SilenceBudgetOverlay = lazyOverlay(() => import("@/components/campus-map/SilenceBudgetOverlay").then((m) => m.SilenceBudgetOverlay));
const OrientationOverlay = lazyOverlay(() => import("@/components/campus-map/OrientationOverlay").then((m) => m.OrientationOverlay));
const ZeroOverlay = lazyOverlay(() => import("@/components/campus-map/ZeroOverlay").then((m) => m.ZeroOverlay));

/** 地图区域的天气滤镜：雾天降饱和、阴天微压、期末周整体偏暗 */
function mapTintClass(weatherId: string, finalWeek: boolean): string {
  if (finalWeek) return "final-week-dim";
  if (weatherId === "fog") return "weather-fog";
  if (weatherId === "cloudy") return "weather-overcast";
  return "";
}

/** 校园地图大厅：地图点位 + 剧情线目录 + 卡片弹层 + 进度 + 校园日历 */
export function CampusMapPage(p: ReturnType<typeof useCampusMap>) {
  /* 深夜弹层压低氛围（批次 CY-96）：夜里谈话时雨声风声退到三成，合上即恢复；
     入夜渐弱（批次 CY-98）：今晚有事没看时蝉声雨声也先退一档——天还没黑，声音先知道 */
  /* 观夜员（批次 CY-102）：五个天气夜全部遇过——成就替柜子记着这件事 */
  useEffect(() => {
    const seen = new Set(p.save.seenNightEvents ?? []);
    if (
      ["night-rain-door", "night-rain-thunder", "night-fog-figure", "night-cloudy-gray", "night-sunny-moon"].every(
        (id) => seen.has(id),
      )
    )
      unlockAchievement("ach-night-weather");
  }, [p.save.seenNightEvents]);

  useEffect(() => {
    duckAmbience(p.nightActive !== null || p.nightState === "ready");
    return () => duckAmbience(false);
  }, [p.nightActive, p.nightState]);

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-gradient-to-b from-background via-secondary/60 to-background">
      <div className="pointer-events-none absolute inset-x-0 top-24 h-64 bg-primary/10 blur-3xl" aria-hidden />

      <CampusTopBar
        activeTheme={p.activeTheme}
        onSwitchTheme={p.switchTheme}
        onBackHome={p.backHome}
        silenceValue={p.save.silenceValue}
        silenceExpression={p.silenceExpression}
        onOpenAffinity={p.toggleAffinity}
        trueFrogCount={p.trueFrogCount}
        onOpenEndings={p.goToEndings}
        collectedEndings={p.collectedEndings}
        totalEndings={p.totalEndings}
        impressionPercent={p.impressionPercent}
        impressionTierLabel={p.impressionTierLabel}
        impressionTierBlurb={p.impressionTierBlurb}
        weatherId={p.weatherInfo.id}
        weatherLabel={p.weatherInfo.label}
        weatherHint={p.weatherInfo.hint}
        soundOn={p.soundOn}
        onToggleSound={p.toggleSound}
      />

      <main className="relative mx-auto max-w-6xl px-4 py-6 lg:py-8">
        <div className="anim-fade-up mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">
              {p.finalWeek
                ? `期末周 · 第 ${p.day} 天`
                : p.day === 1
                  ? "开学第一天 · 全场自由活动"
                  : `第 ${p.day} 天 · 全场自由活动`}
            </p>
            <h2 className="mt-1 text-3xl font-bold text-foreground">校园地图</h2>
          </div>
          <p className="hidden max-w-xs text-right text-xs leading-relaxed text-muted-foreground sm:block">
            每栋楼都有一条剧情线，点开看看今天要陪谁一起丢脸。
          </p>
        </div>

        {p.finalWeek && <FinalWeekBanner daysLeft={p.examCountdown} enterDelay={60} />}

        <CampusDateCard
          weatherId={p.weatherInfo.id}
          weatherLabel={p.weatherInfo.label}
          weatherHint={p.weatherInfo.hint}
          weatherTomorrow={p.weatherTomorrow}
          entries={p.dateEntries}
          dueCount={p.dateDueCount}
          todayScene={p.todayDateScene}
          todayRead={p.todayDateRead}
          routeFilingAvailable={p.routeFilingAvailable}
          lockedRouteName={p.lockedRouteName}
          onOpenScene={p.openDateScene}
          onOpenFiling={p.openRouteFiling}
          enterDelay={120}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[7fr_3fr]">
          <section
            aria-label="校园平面图"
            className="anim-fade-up relative overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-md md:p-5"
            style={{ animationDelay: "180ms" }}
          >
            {/* 小屏地图保持可读比例：窄屏横向滑动，其余断点整幅显示 */}
            <div className="overflow-x-auto">
              <div className={clsx("relative w-max min-w-full", mapTintClass(p.weatherInfo.id, p.finalWeek))}>
                <CampusMapCanvas
                  tiles={p.tiles}
                  hoverBuilding={p.hoverBuilding}
                  onHoverChange={p.setHoverBuilding}
                  onOpen={p.openLine}
                  nightState={p.nightState}
                  nightRemaining={p.nightRemaining}
                  tonightTitle={p.tonightEvent?.title ?? ""}
                  onOpenNight={p.openNight}
                  lockedBuilding={p.lockedRouteBuilding}
                  maintenanceBuilding={p.maintenanceBuilding}
                  decayOf={p.decayOf}
                  foggy={p.weatherInfo.id === "fog"}
                />
                <WeatherLayer
                  weather={p.weatherInfo.id}
                  finalWeek={p.finalWeek}
                  nightPending={p.nightState === "ready"}
                  dayCount={p.day}
                />
              </div>
            </div>
          </section>

          <LineListPanel
            tiles={p.tiles}
            onOpen={p.openLine}
            maintenanceBuilding={p.maintenanceBuilding}
            decayOf={p.decayOf}
            enterDelay={260}
          />
        </div>

        <KeptNotesPanel save={p.save} enterDelay={420} />
      </main>

      <CampusFooter
        doneCount={p.doneCount}
        total={REGULAR_LINE_IDS.length}
        lakeUnlocked={p.lakeUnlocked}
        graduateReady={p.graduateReady}
        attentionOnList={p.attention >= 8}
        bulletin={p.bulletin}
        weatherBiasHint={p.weatherBiasHint}
        loanOut={p.loanOut}
        carriedCount={p.carriedCount}
        resetsCount={p.resetsCount}
        spentCount={p.spentCount}
        onOpenBorrow={() => p.openLedger("borrow")}
        onOpenCarry={() => p.openLedger("carry")}
        onOpenReset={() => p.openLedger("reset")}
        onOpenSpend={() => p.openLedger("spend")}
        swapsCount={p.save.swaps ?? 0}
        onOpenSwap={() => p.openLedger("swap")}
        todayClassLabel={p.todayClassKind ? (p.isHolidayToday ? "停课" : CLASS_LABELS[p.todayClassKind]) : undefined}
        classHandled={p.classHandledToday}
        skipsCount={p.skipsCount}
        onOpenSchedule={p.openSchedule}
        canApplyGraduation={p.canApplyGraduation}
        onOpenGraduate={p.openGraduate}
        canSignPackage={p.canSignPackage}
        onOpenPackage={p.openPackage}
      />

      <StorylineDialog
        line={p.selectedLine}
        lockHint={p.selectedLockHint}
        state={p.selectedState}
        absenteeNote={p.absenteeNote}
        onSkipVisit={() => p.selectedLine && p.doSkipVisit(p.selectedLine.building)}
        onSubstitute={() => p.selectedLine !== null && p.doSubstitute(p.selectedLine.id)}
        onClose={p.closeLine}
        onStart={p.startLine}
        completed={p.selectedLine !== null && p.completedLineIds.includes(p.selectedLine.id)}
        onStartAtAct={p.startLineAtAct}
      />

      {p.affinityOpen && (
        <AffinityPanel
          rows={p.affinityList}
          sideStoriesSeen={p.sideStoriesSeen}
          onPlaySideStory={p.openSideStory}
          onClose={p.toggleAffinity}
        />
      )}

      {/* 角色番外（番外篇批次）：树洞档的那一集，名册里点开；专属番外（批次 CY-123）按 storyId 取件 */}
      {(() => {
        if (!p.sideStoryFrog) return null;
        const storyId = p.sideStoryId;
        const story = storyId ? sideStoryById(storyId) : sideStoryOf(p.sideStoryFrog);
        if (!story) return null;
        return (
          <SideStoryOverlay
            story={story}
            tierLabel={storyId ? "真心蛙友 · 专属番外" : undefined}
            seen={p.sideStoriesSeen.includes(story.id)}
            onFinish={p.finishSideStory}
            onClose={p.closeSideStory}
          />
        );
      })()}

      {p.nightActive && (
        <NightEventOverlay
          scene={p.nightActive}
          weather={p.weatherInfo.id}
          phase={p.nightPhase}
          nodeIndex={p.nightNodeIndex}
          picked={p.nightPicked}
          thirdNote={p.nightThirdNote}
          interrogationCopy={p.nightInterrogationCopy}
          onAdvance={p.advanceNight}
          onChoose={p.chooseNight}
          onSwallow={p.swallowNight}
          onClose={p.closeNight}
        />
      )}

      {/* 私档（批次 BV）：选「翻开」后盖在夜的落定之上的文书层 */}
      {p.dossierRecord && (
        <PrivateDossierOverlay dossier={p.dossierRecord} day={p.day} onClose={p.closeDossier} />
      )}

      {p.dayActive && (
        <DayEventOverlay
          scene={p.dayActive}
          phase={p.dayPhase}
          nodeIndex={p.dayNodeIndex}
          picked={p.dayPicked}
          thirdNote={p.dayThirdNote}
          onAdvance={p.advanceDayEvent}
          onChoose={p.chooseDayEvent}
          onSwallow={p.swallowDayEvent}
          onClose={p.closeDayEvent}
        />
      )}

      {p.dateOverlayOpen && (
        <CampusDateOverlay
          scene={p.dateActive}
          phase={p.datePhase}
          nodeIndex={p.dateNodeIndex}
          picked={p.datePicked}
          gateStage={p.gateStage}
          gateOptions={p.gateOptions}
          gatePick={p.gatePick}
          gateReactionIndex={p.gateReactionIndex}
          lockedName={p.lockedRouteName}
          onAdvance={p.advanceDate}
          onChoose={p.chooseDate}
          onSwallow={p.swallowDate}
          onPickOption={p.pickRouteOption}
          onConfirmGate={p.confirmGate}
          onBackToTable={p.backToGateTable}
          onAdvanceReaction={p.advanceGateReaction}
          onClose={p.closeDate}
        />
      )}

      {p.tutorialOpen && <TutorialOverlay onDismiss={p.dismissTutorial} />}

      {/* 本周课表（批次 AP）：课表是学校替你排的——你只能决定去不去；逃课满三次先看见替身（批次 AR） */}
      {p.scheduleOpen && (
        <ClassScheduleOverlay
          schedule={p.save.classSchedule ?? []}
          kind={p.todayClassKind}
          slot={p.classSlot}
          handled={p.classHandledToday}
          attended={p.attendedCount}
          skips={p.skipsCount}
          surrogateDue={p.surrogateDue}
          onSurrogateAck={p.ackSurrogate}
          holiday={p.isHolidayToday}
          onAttend={p.doAttend}
          onSkip={p.doSkip}
          onClose={p.closeSchedule}
        />
      )}

      {/* 维修告示（批次 AP）：门锁着——不提前通知，到了门口才知道 */}
      {p.maintenanceOpen && (
        <MaintenanceNoticeOverlay building={p.maintenanceOpen} onClose={p.closeMaintenance} />
      )}

      {/* 申请毕业（批次 AP）：提前毕业——学校照发证，成绩单写「未完成全部课程」 */}
      {p.graduateOpen && (
        <EarlyGraduationOverlay
          doneCount={p.doneCount}
          total={REGULAR_LINE_IDS.length}
          onConfirm={p.applyGraduation}
          onClose={p.closeGraduate}
        />
      )}

      {/* 「你回来了」（批次 AP）：现实时间 = 游戏时间——缺席的那段，档案替你补一行「无记录」；角色腐烂（BD） */}
      {p.returnOpen && p.returnRecord && (
        <ReturnVisitOverlay record={p.returnRecord} decayed={p.decayed} onClose={p.closeReturn} />
      )}

      {/* 期末公示（批次 AQ）：数字先于当事人被看见——公示无异议 */}
      {p.noticeOpen && (
        <NoticeOverlay
          playthrough={p.save.playthrough}
          silenceValue={p.save.silenceValue}
          reputation={p.save.reputation}
          attention={p.attention}
          impressionLabel={p.impressionTierLabel}
          onClose={p.closeNotice}
        />
      )}

      {/* 校园广播（批次 AQ）：你的真话上了广播——念的是公共版本，传过几手就剪得更短 */}
      {p.broadcastOpen && p.broadcastInfo && (
        <BroadcastOverlay
          trimmed={p.broadcastInfo.trimmed}
          relays={p.broadcastInfo.relays}
          onClose={p.closeBroadcast}
        />
      )}

      {/* 点名（批次 AQ）：应答与不应答都被记录；未应答攒满三，点名不再叫你的名字 */}
      {p.rollcallOpen && (
        <RollCallOverlay
          skipped={p.rollcallSkipped}
          remaining={p.rollcallRemaining}
          onAnswer={p.doAnswerRollcall}
          onMiss={p.doMissRollcall}
          onClose={p.dismissRollcall}
        />
      )}

      {/* 签收（批次 AR「你的位置」）：你不签的东西不会被扔掉，只会被处理——第三天起被替你签了 */}
      {p.packageOpen && (
        <PackageOverlay
          replaced={false}
          item={p.packageInfo.item}
          signings={p.signingsCount}
          onSign={p.doSignPackage}
          onClose={p.closePackage}
        />
      )}
      {p.packageReplacedOpen && (
        <PackageOverlay
          replaced
          item={p.packageInfo.item}
          signings={p.signingsCount}
          onAck={p.closePackageReplaced}
          onClose={p.closePackageReplaced}
        />
      )}

      {/* 署名启事（批次 AR「你的位置」）：这张启事署名是你——你没写过；档案里也没有这一行 */}
      {p.postedOpen && <PostedOverlay doc={p.postedInfo.doc} onAck={p.ackPosted} />}

      {/* 补录（批次 BW「补录」）：未经申请的调阅要补一份说明——制度不追问内容，只收下你写的那一行 */}
      {p.explainOpen && <ExplainOverlay day={p.day} minute={p.explainMinute} onAck={p.ackExplain} />}

      {/* 会签（批次 BX「会签」）：说明流转到各部门——每个部门加自己的评语，制度不核对内容，只核对有这份说明 */}
      {p.signOffOpen && <SignOffOverlay day={p.day} items={p.signOffItems} onAck={p.ackSignOff} />}

      {/* 归档（批次 BY「归档」）：说明装订成卷——封卷、铅封、编号、入柜，柜子不问内容 */}
      {p.sealOpen && (
        <SealOverlay day={p.day} volume={p.sealVolume} seal={p.sealColor} onAck={p.ackSeal} />
      )}

      {/* 撰写（批次 BZ「撰写」）：空白档案页——你第一次从被记录的人，变成记录别人的人 */}
      {p.reportOpen && (
        <PlayerReportOverlay
          day={p.day}
          log={p.reportLog}
          onSubmit={p.submitReport}
          onAck={p.closeReport}
        />
      )}

      {/* 团体（批次 CA「团体」）：它们在你不在的时候自己动了——加入或旁观，档案照写 */}
      {p.factionAction && (
        <FactionActionOverlay
          meta={p.factionAction}
          day={p.day}
          joinedAlready={p.factionJoinedAlready}
          exposed={p.factionExposed}
          onDecide={p.ackFactionAction}
          onClose={p.closeFaction}
        />
      )}

      {/* 团体（批次 CA「团体」）：它们自己裂了——两边都来找你，要你站队 */}
      {p.factionSplit && (
        <FactionSplitOverlay
          meta={p.factionSplit}
          day={p.day}
          joined={p.factionSplitJoined}
          onPick={p.ackFactionSplit}
          onClose={p.closeFaction}
        />
      )}

      {/* 递件（批次 CB「递件」）：团体要你办的第一件事——替它递那份写你的表 */}
      {p.courierScript && p.courierFact && (
        <CourierOverlay
          script={p.courierScript}
          day={p.day}
          repeat={p.courierRepeat}
          fact={p.courierFact}
          onDecide={p.ackCourier}
          onClose={p.closeCourier}
        />
      )}

      {/* 离校（批次 CC「离校」）：它不在了——没有预告，没有告别；三种回应，没有正确的 */}
      {p.departureMeta && (
        <DepartureOverlay
          meta={p.departureMeta}
          day={p.day}
          otherName={p.departureOtherName}
          onRespond={p.ackDeparture}
          onClose={p.closeDeparture}
        />
      )}

      {/* 消迹（批次 CF「消迹」）：你说过的一句真话，从档案里没了——计数还在，内容没了 */}
      {p.vanishText && (
        <VanishOverlay
          text={p.vanishText}
          day={p.day}
          jarCount={p.vanishJarCount}
          speakerName={p.vanishSpeakerName}
          onRespond={p.ackVanish}
          onClose={p.closeVanish}
        />
      )}

      {/* 已结（批次 CG「已结」）：那份提前归好的卷——档案比蛙先毕业，它还在上课 */}
      {p.finishedOpen && (
        <FinishedOverlay
          day={p.day}
          annotate={p.finishedAnnotate}
          onRespond={p.ackFinished}
          onClose={p.closeFinished}
        />
      )}

      {/* 批阅者（批次 CL「批阅者」）：页脚的落款——记录员 014，它知道你的一切，你知道它的编号 */}
      {p.recorderOpen && (
        <RecorderOverlay
          day={p.day}
          noteLeft={p.recorderNoteLeft}
          onRespond={p.ackRecorder}
          onClose={p.closeRecorder}
        />
      )}

      {/* 传染（批次 CM「传染」）：校园安静下来了——你不是最后一个沉默的，你是第一个 */}
      {p.quietingOpen && (
        <QuietingOverlay
          day={p.day}
          carried={p.quietCarried}
          onRespond={p.ackQuieting}
          onClose={p.closeQuieting}
        />
      )}

      {/* 交班（批次 CP「交班」）：学期末的经办交接——你不是毕业生，你是经办人 */}
      {p.shiftOpen && (
        <ShiftHandoverOverlay
          day={p.day}
          items={p.shiftItems}
          onRespond={p.ackShift}
          onClose={p.closeShift}
        />
      )}

      {/* 回单（批次 CQ「回单」）：你签过的单子回来了——照认 / 指单 / 补圆 */}
      {p.testimonyOpen && (
        <TestimonyOverlay
          day={p.day}
          about={p.testimonyAbout}
          onRespond={p.ackTestimony}
          onClose={p.closeTestimony}
        />
      )}

      {/* 接任（批次 CR「接任」）：接办人一栏归你管了——填名 / 交系统 / 填自己 */}
      {p.successionOpen && (
        <SuccessionOverlay
          day={p.day}
          candidate={p.successionCandidate}
          onRespond={p.ackSuccession}
          onClose={p.closeSuccession}
        />
      )}

      {/* 误投（批次 CS「误投」）：信格里有你的名字，事由里没有你的事 */}
      {p.misdeliveryOpen && (
        <MisdeliveryOverlay
          day={p.day}
          seed={p.save.weatherSeed}
          onRespond={p.ackMisdelivery}
          onClose={p.closeMisdelivery}
        />
      )}

      {/* 补页（批次 CT「补页」）：档案也会丢东西。丢了之后，它来找你——借的是你的记性 */}
      {p.lostPageOpen && (
        <LostPageOverlay day={p.day} onRespond={p.ackLostPage} onClose={p.closeLostPage} />
      )}

      {/* 合档（批次 CV「合档」）：一宗，两个名字——申请拆卷 / 不管它 / 去认识它 */}
      {p.mergerOpen && (
        <MergerOverlay
          day={p.day}
          counterpart={p.mergerCounterpart}
          onRespond={p.ackMerger}
          onClose={p.closeMerger}
        />
      )}

      {/* 转递（批次 CW「转递」）：你的纸出过一次门——让它们送 / 自己送 / 申请封缄 */}
      {p.transitOpen && (
        <TransitOverlay
          day={p.day}
          seed={p.save.weatherSeed}
          onRespond={p.ackTransit}
          onClose={p.closeTransit}
        />
      )}

      {/* 被读（批次 CY「被读」）：有人读了你的档案——签收回执 / 申请查明 / 装作没看见 */}
      {p.bereadOpen && (
        <BereadOverlay day={p.day} onRespond={p.ackBeread} onClose={p.closeBeread} />
      )}

      {/* 便条（批次 CZ「便条」）：一张没编号的纸——回一张 / 收着不回 / 去蹲信格 */}
      {p.noteOpen && <NoteOverlay day={p.day} onRespond={p.ackNote} onClose={p.closeNote} />}

      {/* 定稿（批次 DA「定稿」）：交班前的学期清点——逐行签字 / 指出一处 / 拒签 */}
      {p.finalizeOpen && (
        <FinalizeOverlay day={p.day} save={p.save} onRespond={p.ackFinalize} onClose={p.closeFinalize} />
      )}

      {/* 销毁（批次 DB「销毁」）：定稿之后，作废文书按清册焚化——照单焚化 / 申请留存 / 抄一遍再焚化 */}
      {p.destructionOpen && (
        <DestructionOverlay day={p.day} save={p.save} onRespond={p.ackDestruction} onClose={p.closeDestruction} />
      )}

      {/* 权利（批次 DC「权利」）：新学期的卷宗里夹着一页——签收 / 行使 / 不签 */}
      {p.rightsOpen && (
        <RightsOverlay day={p.day} save={p.save} onRespond={p.ackRights} onClose={p.closeRights} />
      )}

      {/* 对账（批次 DD「对账」）：台账日逐项核对——到场 / 问一句 / 不到场 */}
      {p.reconciliationOpen && (
        <ReconciliationOverlay day={p.day} save={p.save} onRespond={p.ackReconciliation} onClose={p.closeReconciliation} />
      )}

      {/* 自记（批次 DE「自记」）：当事人自行补记本人名下事项——照格式记 / 不照格式记 / 不记 */}
      {p.selfEntryOpen && (
        <SelfEntryOverlay day={p.day} save={p.save} onRespond={p.ackSelfEntry} onClose={p.closeSelfEntry} />
      )}

      {/* 催办（批次 DF「催办」）：挂账满一学期启动催办——办结 / 申请延期 / 逾期挂失 */}
      {p.overdueOpen && (
        <OverdueOverlay day={p.day} save={p.save} onRespond={p.ackOverdue} onClose={p.closeOverdue} />
      )}

      {/* 申报（批次 DG「申报」）：个人物品申报自愿——全报 / 少报一样 / 空报 */}
      {p.declarationOpen && (
        <DeclarationOverlay day={p.day} save={p.save} onRespond={p.ackDeclaration} onClose={p.closeDeclaration} />
      )}

      {/* 登记（批次 DL「登记」）：非在册文书登记簿——认领 / 不认领 / 抄进抽屉 */}
      {p.unregisteredOpen && (
        <RegistryOverlay day={p.day} save={p.save} onRespond={p.ackUnregistered} onClose={p.closeUnregistered} />
      )}

      {/* 扉页（批次 DM「扉页」）：卷宗封二的一行字——照读 / 折起来 / 撕掉 */}
      {p.flyleafOpen && (
        <FlyleafOverlay day={p.day} save={p.save} onRespond={p.ackFlyleaf} onClose={p.closeFlyleaf} />
      )}

      {/* 认领（批次 DN「认领」）：失物认领——领回 / 不领 / 让它们找 */}
      {p.claimOpen && (
        <ClaimOverlay day={p.day} save={p.save} onRespond={p.ackClaim} onClose={p.closeClaim} />
      )}

      {/* 联名（批次 DO「联名」）：联名说明——签 / 不签 / 改一处 */}
      {p.jointOpen && (
        <JointOverlay day={p.day} onRespond={p.ackJoint} onClose={p.closeJoint} />
      )}

      {/* 互通（批次 DP「互通」）：信格通道——通 / 不通 / 单向 */}
      {p.letterBoxOpen && (
        <LetterBoxOverlay day={p.day} save={p.save} onRespond={p.ackLetterBox} onClose={p.closeLetterBox} />
      )}

      {/* 命名（批次 DQ「命名」）：当事人自命名——起一个 / 不起 / 起一个像编号的 */}
      {p.namingOpen && (
        <NamingOverlay day={p.day} onRespond={p.ackNaming} onClose={p.closeNaming} />
      )}

      {/* 同名（批次 DR「同名」）：简称重名——认下 / 让给它 / 换个名 */}
      {p.sameNameOpen && (
        <SameNameOverlay day={p.day} seed={p.save.weatherSeed} onRespond={p.ackSameName} onClose={p.closeSameName} />
      )}

      {/* 总目（批次 DS「总目」）：非在册事项总目——装订 / 抽走一页 / 不装订 */}
      {p.catalogOpen && (
        <CatalogOverlay day={p.day} save={p.save} onRespond={p.ackCatalog} onClose={p.closeCatalog} />
      )}

      {/* 结转（批次 DT「结转」）：学期移交——照单 / 全带走 / 全交出 */}
      {p.carryoverOpen && (
        <CarryoverOverlay day={p.day} onRespond={p.ackCarryover} onClose={p.closeCarryover} />
      )}

      {/* 留白（批次 DU「留白」）：卷宗末页留白——照留 / 写一句 / 夹一张纸 */}
      {p.blankOpen && (
        <BlankOverlay day={p.day} save={p.save} onRespond={p.ackBlank} onClose={p.closeBlank} />
      )}

      {/* 开放日（批次 DH「开放日」）：全宗开放，免于登记——查本宗 / 查摘要 / 不去 */}
      {p.openDayOpen && (
        <OpenDayOverlay day={p.day} seed={p.save.weatherSeed} onRespond={p.ackOpenDay} onClose={p.closeOpenDay} />
      )}

      {/* 顶班（批次 DI「顶班」）：替别的蛙值班一日——照办 / 留名 / 不顶 */}
      {p.substituteOpen && (
        <SubstituteOverlay day={p.day} seed={p.save.weatherSeed} onRespond={p.ackSubstitute} onClose={p.closeSubstitute} />
      )}

      {/* 页边（批次 DJ「页边」）：规程之外的页边批注——回一个字 / 不动它 / 划掉 */}
      {p.pageNoteOpen && (
        <PageNoteOverlay day={p.day} save={p.save} onRespond={p.ackPageNote} onClose={p.closePageNote} />
      )}

      {/* 记性（批次 DK「记性」）：把你的记性跟档案对一遍——照实核 / 只说一件 / 不核 */}
      {p.memoryOpen && (
        <MemoryOverlay day={p.day} save={p.save} onRespond={p.ackMemory} onClose={p.closeMemory} />
      )}

      {/* 地下组织（批次 CD「地下」）：没有名字的门——加入 / 托付 / 被发现，三种形态 */}
      {p.undergroundMode === "join" && (
        <UndergroundOverlay mode="join" day={p.day} favor={null} jobs={p.undergroundJobs} onDecide={p.ackUnderground} onClose={p.closeUnderground} />
      )}
      {p.undergroundMode === "job" && p.undergroundFavor && (
        <UndergroundOverlay
          mode="job"
          day={p.day}
          favor={p.undergroundFavor}
          jobs={p.undergroundJobs}
          onDecide={p.ackUnderground}
          onClose={p.closeUnderground}
        />
      )}
      {p.undergroundMode === "expose" && (
        <UndergroundOverlay mode="expose" day={p.day} favor={null} jobs={p.undergroundJobs} onDecide={p.ackUnderground} onClose={p.closeUnderground} />
      )}

      {/* 本能（批次 CE「发作」）：不是你选的，是身体自己选的——睡去 / 醒来 / 蜕皮 */}
      {p.instinctMode === "sleep" && (
        <InstinctOverlay mode="sleep" missed={[]} moltNote="" onCroakAck={() => undefined} onSleepAck={p.ackInstinctSleep} onClose={p.closeInstinctMap} />
      )}
      {p.instinctMode === "wake" && (
        <InstinctOverlay
          mode="wake"
          missed={p.missedItems}
          moltNote=""
          onCroakAck={() => undefined}
          onSleepAck={p.ackInstinctSleep}
          onClose={p.closeInstinctMap}
        />
      )}
      {p.instinctMode === "molt" && (
        <InstinctOverlay
          mode="molt"
          missed={[]}
          moltNote={p.moltNote}
          onCroakAck={() => undefined}
          onSleepAck={p.ackInstinctSleep}
          onClose={p.closeInstinctMap}
        />
      )}

      {/* 停课日（批次 AS「另一些日子」）：课表是空的——没有安排的日子，档案不收 */}
      {p.holidayOpen && <HolidayOverlay onAck={p.ackHoliday} />}

      {/* 档案清点（批次 AS「另一些日子」）：你被数过了——看的是编号，不是你 */}
      {p.inventoryOpen && <InventoryOverlay onAck={p.ackInventory} />}

      {/* 教研室的门（批次 AS「另一些日子」）：这所学校里没有老师，只有文件 */}
      {p.officeOpen && <OfficeOverlay onAck={p.ackOffice} />}

      {/* 会议（批次 BG「会议」）：先给你一个座次（列席：一，没有名字），再给你一支笔（记录：你） */}
      {p.meetingRole && (
        <MeetingOverlay
          role={p.meetingRole}
          roster={p.meetingRoster}
          objectorName={p.meetingObjectorName}
          day={p.day}
          onAckList={p.ackMeetingList}
          onAckRecord={p.ackMeetingRecorder}
        />
      )}

      {/* 交接（批次 BH「交接」）：移交单签收了位置；抽屉里积压的档案等你按结论——属实或核销 */}
      {p.handoverOpen && (
        <HandoverOverlay items={p.handoverItems} day={p.day} onAck={p.ackHandover} />
      )}

      {/* 窗口（批次 BI「窗口」）：窗口不判断，窗口只负责收——第三份需要盖章，章在你手里 */}
      {p.windowOpen && (
        <WindowDutyOverlay
          plain={p.windowSheets}
          applicantName={p.meetingObjectorName}
          day={p.day}
          onAck={p.ackWindow}
        />
      )}

      {/* 帮带（批次 BJ「帮带」）：它抄你的格式，然后坐上窗口——移交单上空白的那一栏，这次是你 */}
      {p.mentoringOpen && (
        <MentoringOverlay apprenticeName={p.apprenticeName} day={p.day} onAck={p.ackMentoring} />
      )}

      {/* 互查（批次 BK「互查」）：数值三栏全部和你的档案一样——表格只有一张；第七份没有内容 */}
      {p.auditOpen && (
        <AuditOverlay
          pages={p.auditPages}
          stats={{ silence: p.save.silenceValue, reputation: p.save.reputation, attention: p.attention }}
          day={p.day}
          onAck={p.ackAudit}
        />
      )}

      {/* 迎检（批次 BL「迎检」）：互查名单倒着排——你翻过它的柜子，它翻你的；查阅本人档案属于越权 */}
      {p.inspectionOpen && (
        <InspectionOverlay
          checkerName={p.inspectorName}
          day={p.day}
          onAck={p.ackInspection}
        />
      )}

      {/* 门后（批次 BM「门后」）：那扇一直关着的门开了——门后是文件，文件后面是你 */}
      {p.archiveOpen && (
        <ArchiveRoomOverlay servedName={p.servedName} day={p.day} onAck={p.ackArchive} />
      )}

      {/* 基准（批次 BN「基准」）：你的数字被印成了「正常值」——偏差一栏写着 0 */}
      {p.baselineOpen && (
        <BaselineOverlay
          stats={{ silence: p.save.silenceValue, reputation: p.save.reputation, attention: p.attention }}
          day={p.day}
          onAck={p.ackBaseline}
        />
      )}

      {/* 不符（批次 BO「不符」）：最后一只不齐的由你去核——对不上的那一栏没有数字，叫态度 */}
      {p.misalignOpen && (
        <MisalignOverlay objectorName={p.meetingObjectorName} day={p.day} onAck={p.ackMisalign} />
      )}

      {/* 结卷（批次 BP「结卷」）：这一学期订成了一本——卷脊上只有编号，名字不参与检索 */}
      {p.volumeOpen && (
        <VolumeOverlay counts={p.volumeCounts} day={p.day} onAck={p.ackVolume} />
      )}

      {/* 登记（批次 BQ「登记」）：制度到了湖边——连唯一没有墙的地方都有一张签到表 */}
      {p.registerOpen && <LakeRegisterOverlay day={p.day} onAck={p.ackRegister} />}

      {/* 用途（批次 BR「用途」）：沉默要报用途——「无用途」不予受理，名目只有三个；你的沉默成了预算 */}
      {p.budgetOpen && (
        <SilenceBudgetOverlay
          silence={p.save.silenceValue}
          carry={Math.min(p.save.silenceValue, 10)}
          day={p.day}
          onAck={p.ackBudget}
        />
      )}

      {/* 迎新（批次 BT「迎新」）：新蛙来了——你替它写第一行，然后给它指了另一张表 */}
      {p.orientationOpen && <OrientationOverlay day={p.day} onAck={p.ackOrientation} />}

      {/* 零点（批次 AU「开口」）：沉默值第一次被交到 0——空白不是没有，是你把能说的都说完了 */}
      {p.zeroOpen && <ZeroOverlay onClose={p.closeZero} />}

      {/* 账台（批次 AJ / AL / AO）：借沉默（带利息）/ 替人背档案 / 申请重置 / 消耗沉默——流程里没有的那一栏 */}
      {p.ledgerOpen && (
        <LedgerDeskOverlay
          kind={p.ledgerOpen}
          seed={p.save.weatherSeed + p.day * 17}
          silenceValue={p.save.silenceValue}
          loanOut={p.loanOut}
          carriedCount={p.carriedCount}
          carriedToday={p.carriedToday}
          attention={p.attention}
          resetsCount={p.resetsCount}
          spentCount={p.spentCount}
          spentToday={p.spentToday}
          swapsCount={p.save.swaps ?? 0}
          onLend={p.doLend}
          onCarry={p.doCarry}
          onReset={p.doReset}
          onSpend={p.doSpend}
          onSwap={p.doSwap}
          onClose={p.closeLedger}
        />
      )}
    </div>
  );
}
