import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { useEndings } from "./useEndings";
import { FROG_CHARACTERS } from "@/data/characters";
import { FileWarning, GraduationCap, ImageDown, Lock, ShieldCheck } from "lucide-react";
import { ACHIEVEMENTS, getUnlockedAchievements, unlockAchievement } from "@/lib/achievements";
import { CG_SCENE_TOTAL } from "@/data/cg";
import { EARLY_CEREMONY_FLAG, loadUnwrittenPage } from "@/lib/gameSave";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { CollectionStats } from "@/components/endings/CollectionStats";
import { LineGroupCard } from "@/components/endings/LineGroupCard";
import { EndingDetailDialog } from "@/components/endings/EndingDetailDialog";
import { EmptyState } from "@/components/endings/EmptyState";
import { TruthJarSection } from "@/components/endings/TruthJarSection";
import { TruthCardsSection } from "@/components/endings/TruthCardsSection";
import { WordSection } from "@/components/endings/WordSection";
import { NightLinesSection } from "@/components/endings/NightLinesSection";
import { SurveyOverlay } from "@/components/endings/SurveyOverlay";
import { BorrowLogOverlay } from "@/components/endings/BorrowLogOverlay";
import { BranchSection } from "@/components/endings/BranchSection";
import { GalleryFilterBar } from "@/components/endings/GalleryFilterBar";
import { PinnedEndingsStrip } from "@/components/endings/PinnedEndingsStrip";
import { MarginaliaStrip } from "@/components/endings/MarginaliaStrip";
import { MemorabiliaSection } from "@/components/endings/MemorabiliaSection";
import { MusicBoxSection } from "@/components/endings/MusicBoxSection";
import { CgGallerySection } from "@/components/endings/CgGallerySection";
import { SideStoryShelfSection } from "@/components/endings/SideStoryShelfSection";
import { SecretEndingSection } from "@/components/endings/SecretEndingSection";
import { HiddenArchiveSection } from "@/components/endings/HiddenArchiveSection";
import { UnwrittenPageOverlay } from "@/components/endings/UnwrittenPageOverlay";
import { GraduationCeremony } from "@/components/endings/GraduationCeremony";
import { CabinetClosedOverlay, CabinetClosedPanel } from "@/components/endings/CabinetClosedOverlay";
import { DossierSection } from "@/components/endings/DossierSection";
import { ExistenceOverlay } from "@/components/endings/ExistenceOverlay";
import { SideStoryOverlay } from "@/components/campus-map/SideStoryOverlay";
import { NightBingeOverlay } from "@/components/endings/NightBingeOverlay";
import { WEATHER_NIGHT_LABEL } from "@/components/endings/NightLinesSection";
import { SettlementAlbumStage } from "@/components/endings/SettlementAlbumStage";
import { SideStoryAlbumStage } from "@/components/endings/SideStoryAlbumStage";

/** 岔路全走成就表（批次 K 泛化）：线 id → 成就 id；某线岔路全部走过时解锁 */
const LINE_ACHIEVEMENT_BRANCH: Record<string, string> = {
  "lights-out": "ach-branch-dorm",
  "roll-king": "ach-branch-library",
  canteen: "ach-branch-canteen",
  club: "ach-branch-club",
  lawn: "ach-branch-fl",
  "self-study": "ach-branch-zz",
  administration: "ach-branch-xg",
  "first-class": "ach-branch-fc",
  lake: "ach-branch-lk",
  "sick-note": "ach-branch-yj",
};

/** 结局图鉴：各条线结局的收集册（总数随剧本注册表自动扩） */
export function EndingsPage(p: ReturnType<typeof useEndings>) {
  /* 档案成就（批次 J 起，批次 K 泛化）：岔路成就在此解锁（图鉴里有岔路数据）；走完线成就在剧情页结局相位解锁 */
  const [achvIds, setAchvIds] = useState<string[]>(() => getUnlockedAchievements());
  const [unwrittenOpen, setUnwrittenOpen] = useState(false);
  const [unwrittenFilled, setUnwrittenFilled] = useState(() => loadUnwrittenPage().trim().length > 0);
  useEffect(() => {
    let changed = false;
    for (const [lineId, achId] of Object.entries(LINE_ACHIEVEMENT_BRANCH)) {
      const group = p.branchGroups.find((item) => item.lineId === lineId);
      if (group && group.total > 0 && group.walked >= group.total && unlockAchievement(achId)) changed = true;
    }
    /* 定格册（成就扩容批次）：CG 全收集在图鉴页结算（收集册就在这页） */
    if (p.save.seenCg.length >= CG_SCENE_TOTAL && unlockAchievement("ach-cg-all")) changed = true;
    if (changed) setAchvIds(getUnlockedAchievements());
  }, [p.branchGroups, p.save.seenCg]);

  /* 提前毕业（批次 AP）：从地图递交申请跳过来——典礼已经布置好了，落进图鉴直接开 */
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(EARLY_CEREMONY_FLAG) !== "1") return;
      window.sessionStorage.removeItem(EARLY_CEREMONY_FLAG);
    } catch {
      return;
    }
    if (p.earlyGraduated && p.graduation) p.openCeremony();
    /* 只在挂载时消费一次标记：进页面就开，不追踪后续状态变化 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-gradient-to-br from-background via-secondary to-card">
      {/* 背景装饰光斑 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 top-1/2 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
            <button
              type="button"
              onClick={p.goBack}
              aria-label="返回上一页"
              className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none sm:px-4"
            >
              ←<span className="hidden sm:inline">返回</span>
            </button>
            <h1 className="hidden text-lg font-bold text-foreground md:block">奶蛙大学 · 结局图鉴</h1>
            <ThemeSwitcher theme={p.activeTheme} onSwitch={p.switchTheme} compact />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 md:pt-10">
          <section className="anim-fade-up" aria-label="结局图鉴说明">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              结局<span className="text-primary">图鉴</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
              {p.groups.length} 条线，每线按沉默分档，一共 {p.totalCount}
              种结局。见过的会留在这里；没见过的，只给条件。
            </p>
          </section>

          {/* 毕业典礼入口：十条线全通谢幕（批次 AP：提前毕业的学期也直接亮着——只是成绩单不完整） */}
          {(p.graduateReady || (p.earlyGraduated && p.graduation)) && !p.ceremonyOpen && (
            <section aria-label="毕业典礼入口" className="mt-8">
              <div className="anim-fade-up relative overflow-hidden rounded-3xl border border-primary/40 bg-primary/10 p-6 shadow-md md:p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
                />
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                      <GraduationCap size={13} aria-hidden />
                      {p.graduateReady ? "全通谢幕" : "提前毕业 · 受理完毕"}
                    </p>
                    <h3 className="mt-3 text-2xl font-bold text-foreground">
                      毕业<span className="text-primary">典礼</span>已经布置好了
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {p.graduateReady
                        ? "十条线都走完了。礼堂的灯亮着，八只蛙已经上台——结业致辞、毕业证成绩单和制作名单，都在里面。"
                        : "申请受理之后不需要再等任何一节课。礼堂的灯亮着，八只蛙已经上台——成绩单上会写：该蛙未完成全部课程。毕业证上会写：准予毕业。"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={p.openCeremony}
                    className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    进入毕业典礼
                  </button>
                </div>
              </div>
            </section>
          )}

          <div className="mt-7">
            <CollectionStats
              collectedCount={p.collectedCount}
              totalCount={p.totalCount}
              lineSummaries={p.lineSummaries}
              allCollected={p.allCollected}
              pinnedCount={p.favoriteEndingCount}
              noteCount={Object.keys(p.endingNotes).length}
            />
          </div>

          {/* 一键直达（批次 CY-102）：异常卷宗压在整页最底下——柜子不想让人看全，但你想 */}
          {!p.cabinetClosed && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("hidden-archive")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-destructive/40 bg-card px-4 py-2 text-xs font-bold text-destructive transition-colors duration-200 hover:bg-destructive/5 focus-visible:shadow-focus focus-visible:outline-none"
              >
                <FileWarning size={13} aria-hidden />
                去异常卷宗（已翻到 {p.hiddenEndings.filter((item) => item.unlocked).length}/{p.hiddenEndings.length}）
              </button>
            </div>
          )}

          {/* 编目（批次 BS）：确认或否认一个角色——玩家决定什么算存在。柜子有档之后开放 */}
          {p.dossiers.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed border-border bg-card/60 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-card-foreground">编目</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  新增权限：认定一个角色是否真实。在册 {p.existenceSummary.confirmed} 只 · 非编目{" "}
                  {p.existenceSummary.denied} 只。否认不是删除——是「从来没存在过，但文本里留下了痕迹」。
                </p>
              </div>
              <button
                type="button"
                onClick={p.openExistence}
                className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                打开编目
              </button>
            </div>
          )}

          {/* 档案柜（批次 V / AN）：每学期的自我观察快照——柜子被合上时整区收进一扇门 */}
          <div className="mt-8">
            {p.cabinetClosed ? (
              <CabinetClosedPanel closes={p.cabinetCloses} opens={p.cabinetOpens} onReopen={p.reopenCabinet} />
            ) : (
              <>
              <DossierSection
                dossiers={p.dossiers}
                tornEndings={p.tornEndings}
                shedSkins={p.shedSkins}
                onWearSkin={p.wearSkinBy}
                awayLog={p.awayLog}
                voiceStats={{
                  broadcast: p.broadcastPlayed,
                  answered: p.rollcallAnswered,
                  misses: p.rollcallMisses,
                  notices: p.noticeSemesters.length,
                }}
                nameStats={{ surrogate: p.surrogateEver, signings: p.signings, postings: p.postings }}
                dayStats={{ holidays: p.holidays, inventories: p.inventories, sightings: p.sightings }}
                timeStats={{ paused: p.pausedTotal, rewinds: p.rewinds, forwards: p.forwards, stays: p.stays }}
                textStats={{ struck: p.struckCount, fullReads: p.fullReads }}
                colludeStats={{
                  collusions: p.collusions,
                  shields: p.shields,
                  reports: p.reports,
                  reportedByName: p.reportedByName,
                }}
                meetStats={{
                  lists: p.meetings.filter((item) => item.role === "list").length,
                  spoke: p.meetings.filter((item) => item.role === "list" && item.spoke).length,
                  recorder: p.meetings.filter((item) => item.role === "recorder").length,
                  kept: p.meetings.filter((item) => item.role === "recorder" && item.objection === "kept").length,
                  dropped: p.meetings.filter((item) => item.role === "recorder" && item.objection === "dropped").length,
                  recusals: p.recusalSeen ? 1 : 0,
                }}
                meetings={p.meetings}
                handStats={{
                  confirmed: p.handovers.filter((item) => item.verdict === "confirmed").length,
                  denied: p.handovers.filter((item) => item.verdict === "denied").length,
                }}
                handovers={p.handovers}
                windowStats={{
                  shifts: p.windowShifts.length,
                  returned: p.windowShifts.filter((item) => item.returned).length,
                }}
                windowShifts={p.windowShifts}
                mentoringList={p.mentorings}
                auditStats={{
                  audits: p.audits.length,
                  noted: p.audits.filter((item) => item.note).length,
                }}
                auditLog={p.audits}
                inspectionStats={{
                  checks: p.inspections.length,
                  applied: p.inspections.filter((item) => item.applied).length,
                }}
                inspectionLog={p.inspections}
                archiveDutyList={p.archiveDuties}
                baselineList={p.baselines}
                misalignList={p.misalignments}
                volumeList={p.volumes}
                registerList={p.registrations}
                budgetList={p.budgets}
                orientationList={p.orientations}
                vanishList={p.vanishes}
              />
              {/* 编目（批次 BS）：没有名字的档案 +《独角戏》/《群像》——你决定什么算存在 */}
              {(p.nonCatalogPages.length > 0 || p.existenceSpecial) && (
                <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground">编目</p>
                  {p.nonCatalogPages.length > 0 && (
                    <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
                      {p.nonCatalogPages.map((page) => `第 ${page.index} 号`).join(" · ")}——档案已降级为非编目
                    </p>
                  )}
                  {p.nonCatalogPages.length > 0 && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
                      档案柜里多出没有名字的一页，上面只有一行：该条目已降级为非编目。
                      编号还在，名字不在——你只能从空白里推测自己否认过谁。
                    </p>
                  )}
                  {p.existenceSpecial === "solo" && (
                    <div className="mt-2 rounded-xl border border-dashed border-border bg-card/60 p-3">
                      <p className="text-sm font-bold text-card-foreground">《独角戏》</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        所有场景都是空的，所有对话都是独白。它一个人上课、吃饭、躺草坪。
                        档案上写：该蛙所在学期无其他记录。
                      </p>
                    </div>
                  )}
                  {p.existenceSpecial === "ensemble" && (
                    <div className="mt-2 rounded-xl border border-dashed border-border bg-card/60 p-3">
                      <p className="text-sm font-bold text-card-foreground">《群像》</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        场景变得拥挤，对话变得嘈杂，每个选择都有人看着。好感、印象、被注意全部同时生效。
                        档案上写：该蛙所在学期记录过载。
                      </p>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </div>

          {/* 档案成就（批次 J）：三条可解锁的档案记录，跨周目保留；steamId 为发布预留映射 */}
          <div className="mt-8" aria-label="档案成就">
            {/* 天气夜专区（批次 CY-105）：观夜员的五夜进度——集齐那晚，音乐盒里会亮出一首藏起来的歌 */}
            {(() => {
              const seen = new Set(p.save.seenNightEvents ?? []);
              const done = [
                "night-rain-door",
                "night-rain-thunder",
                "night-fog-figure",
                "night-cloudy-gray",
                "night-sunny-moon",
              ].filter((id) => seen.has(id)).length;
              if (done === 0) return null;
              return (
                <div className="mb-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-card-foreground">
                    <span>天气夜 · 观夜员收藏</span>
                    <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{done} / 5</span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(done / 5) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {done >= 5
                      ? "五夜到齐——音乐盒里亮起了一首藏起来的歌。"
                      : "伞、雷、雾、阴天、晴天：每遇上一夜，这格就往前进一点。"}
                  </p>
                </div>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-3">
              {ACHIEVEMENTS.map((item) => {
                const unlocked = achvIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={clsx(
                      "rounded-2xl border p-4 transition-colors duration-200",
                      unlocked
                        ? "border-primary/40 bg-primary/10"
                        : "border-dashed border-border bg-card/60",
                    )}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
                      {unlocked ? (
                        <ShieldCheck size={15} className="text-primary" aria-hidden />
                      ) : (
                        <Lock size={14} className="text-muted-foreground" aria-hidden />
                      )}
                      {unlocked ? item.name : "未编目成就"}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {unlocked ? "档案已记：属实。" : item.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <TruthJarSection
              groups={p.truthGroups}
              collected={p.truthCollected}
              total={p.truthTotal}
              complete={p.truthComplete}
              taken={p.truthTaken}
              seed={p.save.weatherSeed}
            />
          </div>

          {/* 医务室四张卡（批次 CY-133）：四条真话各一张收藏卡，数据从剧本现解析，收藏态读真话罐 */}
          <div className="mt-8">
            <TruthCardsSection jar={p.save.truthJar ?? []} />
          </div>

          {/* 深夜台词书架（批次 CY-102）：熬过的夜各成一册，翻开重读那一夜 */}
          <div className="mt-8">
            <NightLinesSection save={p.save} onBinge={p.startNightBinge} />
          </div>

          {/* 词义册（批次 AV「语言本身」）：同一个词在不同场合的不同释义——收集够了可以说一次 */}
          <div className="mt-8">
            <WordSection collected={p.wordDefs} wordSaid={p.wordSaid} onSay={p.sayTheWord} />
          </div>

          <div className="mt-8">
            <BranchSection
              groups={p.filteredBranchGroups}
              walked={p.branchWalked}
              total={p.branchTotal}
              complete={p.branchComplete}
              next={p.branchNext}
              isTextbook={p.isTextbook}
              onGo={p.goBranch}
              onGoAt={p.goBranchAt}
            />
          </div>

          {/* 学期纪念册（批次 CY-37；CY-42 出档登记）：结档瞬间自动收的一页页纪念，跨过门槛就有；册子空着但存过图，柜子照样开 */}
          {(p.memorabilia.length > 0 || p.exportLog.length > 0) && (
            <div className="mt-8">
              <MemorabiliaSection pages={p.memorabilia} exportLog={p.exportLog} newStamp={p.newMemoStamp} />
            </div>
          )}

          {/* 音乐鉴赏：12 首合成 BGM 的试听卡，不锁进度，离开本页自动停曲 */}
          <div className="mt-8">
            <MusicBoxSection />
          </div>

          {/* CG 画集（批次 B2）：九张定格的收集册，未解锁只留剪影与出处 */}
          <div className="mt-8">
            <CgGallerySection />
          </div>

          {/* 名册附页 · 番外合集（批次 CY-134；CY-135 重读）：六集树洞档 + 四集专属档，开场定格当封面，
              收档读「讲过的番外」；收过档的给「重读」按钮——图鉴里是纯重读，不计数、不写档 */}
          <div className="mt-8">
            <SideStoryShelfSection
              save={p.save}
              onReplay={p.openReplay}
              onAlbum={p.startSideAlbum}
              albumState={p.sideAlbumState}
              onBinge={p.startBinge}
              freshStamp={p.replayStamp}
            />
          </div>

          {p.collectedCount === 0 ? (
            <div className="mt-8">
              <EmptyState onGoToMap={p.goToMap} />
            </div>
          ) : (
            <>
              {/* 结算册 · 整册打包（批次 CY-140）：已收的结算处置单拼进同一页图，一次下载 */}
              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  data-export-ui="1"
                  onClick={p.startSettlementExport}
                  disabled={p.settlementExportState === "busy"}
                  title="已收的结算处置单拼进同一页，一本结算册一次下载"
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-wait",
                    p.settlementExportState === "done"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary",
                  )}
                >
                  <ImageDown size={12} aria-hidden />
                  {p.settlementExportState === "busy"
                    ? "正在装册…"
                    : p.settlementExportState === "done"
                      ? "装好了"
                      : p.settlementExportState === "failed"
                        ? "没装上"
                        : "结算册 · 存图"}
                </button>
              </div>
              {/* 图鉴筛选（内容扩容批次）：按线过滤 + 只看没集齐——同时作用于上方岔路册 */}
              <div className="mt-4">
                <GalleryFilterBar
                  value={p.filterLineId}
                  onChange={p.setFilterLineId}
                  incompleteOnly={p.incompleteOnly}
                  onToggleIncompleteOnly={p.toggleIncompleteOnly}
                  favoritesOnly={p.favoritesOnly}
                  onToggleFavoritesOnly={p.toggleFavoritesOnly}
                  favoriteCount={p.favoriteEndingCount}
                  query={p.endingsQuery}
                  onQueryChange={p.setEndingsQuery}
                  queryHits={p.filteredGroups.reduce((sum, group) => sum + group.slots.length, 0)}
                  tierFilter={p.tierFilter}
                  onTierChange={p.setTierFilter}
                  tornOnly={p.tornOnly}
                  onToggleTornOnly={p.toggleTornOnly}
                  tornCount={p.tornEndingCount}
                  presets={p.galleryPresets}
                  activePresetId={p.activePresetId}
                  onSavePreset={p.saveGalleryPreset}
                  onApplyPreset={p.applyGalleryPreset}
                  onDeletePreset={p.deleteGalleryPreset}
                  onImportPreset={p.importPresetLine}
                  presetRecalls={p.presetRecalls}
                />
              </div>
              {/* 你钉过的（批次 CY-35）：跨线一排；本轮新钉的心入场高亮一次（CY-135 收藏动效） */}
              {!p.favoritesOnly && (
                <PinnedEndingsStrip
                  pinned={p.pinnedEndings}
                  freshIds={p.freshPinned}
                  onOpen={p.openDetail}
                  onUnpin={p.toggleFavoriteEnding}
                />
              )}
              {/* 页边手迹合集（批次 CY-36）：写过字的页跨线汇总，可整页抄走 */}
              <MarginaliaStrip notes={p.marginalNotes} onOpen={p.openDetail} />
              <section aria-label="各条线的结局分组" className="mt-4 grid gap-5 lg:grid-cols-2">
                {p.filteredGroups.map((group, groupIndex) => (
                  <LineGroupCard
                    key={group.meta.id}
                    group={group}
                    thirdVisit={p.isThirdVisit}
                    degradedFrogs={p.degradedFrogs}
                    enterDelay={Math.min(groupIndex * 90, 720)}
                    favorites={p.endingFavorites}
                    onToggleFavorite={p.toggleFavoriteEnding}
                    notes={p.endingNotes}
                    onOpenEnding={(endingId) => p.openDetail(group.meta.id, endingId)}
                  />
                ))}
              </section>
              {p.filteredGroups.length === 0 && (
                <p className="anim-fade-up mt-4 rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
                  {p.favoritesOnly
                    ? "没有一页结局钉过心。回到全部，在喜欢的结局页上钉一颗——以后它永远排在最前。"
                    : "这个筛选条件下没有线。换句话说：都集齐了，或者你筛的那条已经收完了。"}
                </p>
              )}
            </>
          )}

          {/* 异常卷宗（批次 AC 起，现一百三十一格）：档案柜里不该有的记录——柜子合上时一并收进门里 */}
          {!p.cabinetClosed && (
            <div className="mt-8 scroll-mt-20" id="hidden-archive">
              <HiddenArchiveSection hiddenEndings={p.hiddenEndings} onOpen={p.openHidden} />
            </div>
          )}

          {/* 未编目：档案柜最里面那页没有编号的纸，30 种结局全见过后翻开；柜子合上时也收进门里 */}
          {!p.cabinetClosed && (
            <div className="mt-8">
              <SecretEndingSection
                unlocked={p.allCollected}
                collected={p.collectedCount}
                total={p.totalCount}
                onOpen={p.openSecret}
                onWrite={() => setUnwrittenOpen(true)}
                pageFilled={unwrittenFilled}
                onCloseCabinet={p.requestCloseCabinet}
              />
            </div>
          )}
        </main>

        <footer className="mx-auto max-w-5xl px-4 pb-10">
          <p className="border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            图鉴记在本地存档里，已经见过的结局不会因为开新档消失。
          </p>
        </footer>
      </div>

      {/* 深夜台词连播（批次 CY-137）：书架当前的册序一册一册翻——纯阅读，不计数、不写档 */}
      {p.nightBook && (
        <NightBingeOverlay
          key={p.nightBook.id}
          book={p.nightBook}
          badge={WEATHER_NIGHT_LABEL[p.nightBook.id]}
          queueLabel={p.nightLabel}
          thirdNote={p.save.playthrough >= 3 ? (p.nightBook.thirdNote ?? undefined) : undefined}
          onNext={p.advanceNightBinge}
          nextLabel={p.nightHasNext ? "下一夜 ▸" : "合上书架"}
          onClose={p.closeNightBinge}
          auto={p.nightAuto}
          onToggleAuto={p.toggleNightAuto}
        />
      )}

      {/* 附页合集舞台（批次 CY-141）：屏幕外渲染带开场定格封面的合集，渲染完交回统一盖章导出通道 */}
      {p.sideAlbumOpen && (
        <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0">
          <SideStoryAlbumStage save={p.save} onCapture={p.captureSideAlbum} />
        </div>
      )}

      {/* 结算册舞台（批次 CY-140）：屏幕外渲染已收处置单，渲染完交回统一盖章导出通道 */}
      {p.settlementExportOpen && (
        <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0">
          <SettlementAlbumStage
            items={p.settlementItems}
            collected={p.collectedCount}
            total={p.totalCount}
            onCapture={p.captureSettlementAlbum}
          />
        </div>
      )}

      {/* 番外重读 / 连播（批次 CY-135 / CY-136）：已收档的那几集从图鉴里再过一遍——纯重读，不计数、不写档；
          连播按「树洞档 → 专属档、名册蛙序」一集接一集，中途点右上角关掉整串停 */}
      {p.replayStory && (
        <SideStoryOverlay
          key={p.replayStory.id}
          story={p.replayStory}
          tierLabel="名册附页 · 重读"
          seen={p.replaySeen}
          queueLabel={p.bingeLabel}
          onFinish={(storyId) => p.finishReplay(storyId)}
          onClose={p.closeReplay}
          closeLabel="合上附页"
          onNext={p.advanceBinge}
          nextLabel={p.bingeHasNext ? "下一集 ▸" : "合上附页"}
        />
      )}

      {p.ceremonyOpen && p.graduation && (
        <GraduationCeremony data={p.graduation} onClose={p.closeCeremony} onReviewBranch={p.goBranch} branchLeft={p.branchTotal - p.branchWalked} />
      )}

      <EndingDetailDialog detail={p.detail} onClose={p.closeDetail} onTear={p.tearEnding} onNoteSaved={p.refreshNotes} />

      {/* 编目（批次 BS）：确认或否认一个角色——没有确认弹窗，没有撤销按钮；翻三次自行降级 */}
      {p.existenceOpen && (
        <ExistenceOverlay
          rows={p.existenceRows}
          summary={p.existenceSummary}
          introSeen={p.existenceIntroSeen}
          onIntroAck={p.ackExistenceIntro}
          onSet={p.applyExistence}
          onClose={p.closeExistence}
        />
      )}
      {p.existenceNote && !p.existenceOpen && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-dashed border-border bg-card px-4 py-2 font-mono text-[11px] tracking-widest text-muted-foreground shadow-lg"
        >
          {p.existenceNote}
        </div>
      )}

      {/* 未编目的一页（第四面）：写下的话独立存档，跨学期保留；合上后回读，按钮文案跟着换 */}
      {unwrittenOpen && (
        <UnwrittenPageOverlay
          onClose={() => {
            setUnwrittenOpen(false);
            setUnwrittenFilled(loadUnwrittenPage().trim().length > 0);
          }}
        />
      )}

      {/* 卷终（批次 AN）：合上档案柜之后的那一页——闭柜不在流程里，只有灯知道 */}
      {p.cabinetOverlayOpen && <CabinetClosedOverlay onClose={p.closeCabinetOverlay} />}

      {/* 满意度调查（批次 AX「同届」）：五格只有一个选项——现在有了你填的那一份 */}
      {p.surveyOpen && <SurveyOverlay playthrough={p.save.playthrough} onSubmit={p.acceptSurvey} />}

      {/* 借阅记录（批次 BE「关于你」）：有人借走了你的档案——理由栏空白，你不会知道它读出了什么 */}
      {p.borrowOpen &&
        (() => {
          const fresh = p.save;
          const frog = (fresh.borrowers ?? []).slice(-1)[0]?.frog;
          if (!frog) return null;
          const history = (fresh.borrowers ?? []).map((item) => ({
            semester: item.semester,
            name: FROG_CHARACTERS[item.frog]?.displayName ?? "某只蛙",
          }));
          return <BorrowLogOverlay frog={frog} history={history} onClose={p.closeBorrow} />;
        })()}
    </div>
  );
}
