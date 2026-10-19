// 生涯统计弹层：本地存档里的 career 持久计数总览——着陆次数（按任务分行）/ 生涯总里程 /
// 样品四统计 / 玩法十项累计 / 历史最佳结算与三航线拉力纪录 / 成就解锁率环形图 / 生涯称号,
// 底部带「清除存档」两段确认危险操作。视觉对齐成就墙（全屏弹层 + ach-card-in 错峰弹入）。
import { useEffect, useRef, useState } from "react";
import { BarChart3, Medal, Share2 } from "lucide-react";
import { MISSIONS, MISSION_ORDER } from "@/lib/missions";
import type { CareerSnapshot } from "@/lib/dscSave";
import { Button } from "@/components/ui/button";
import { CareerShareCard } from "@/components/home/CareerShareCard";

interface CareerStatsProps {
  open: boolean;
  /** 打开弹层瞬间由 Logic 层构建的生涯快照（关闭态为 null） */
  snap: CareerSnapshot | null;
  onClose: () => void;
  /** 清除存档（组件内两段确认后才会调用） */
  onClearSave: () => void;
}

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** 生涯称号池：与值班军衔同源派生的更高一档（按累计功勋门槛晋升） */
const CAREER_TITLES: { min: number; name: string; en: string }[] = [
  { min: 0, name: "星尘见习员", en: "STARDUST TRAINEE" },
  { min: 300, name: "深空瞭望员", en: "DEEP SPACE LOOKOUT" },
  { min: 800, name: "轨道领航员", en: "ORBIT NAVIGATOR" },
  { min: 1600, name: "月面拓荒者", en: "LUNAR PIONEER" },
  { min: 3000, name: "星际舵手", en: "INTERSTELLAR HELMSMAN" },
  { min: 5000, name: "深空大统帅", en: "GRAND FLEET MARSHAL" },
];

function careerTitleAt(merit: number): { min: number; name: string; en: string } {
  let title = CAREER_TITLES[0];
  for (const t of CAREER_TITLES) if (merit >= t.min) title = t;
  return title;
}

function nextCareerTitle(merit: number): { min: number; name: string; en: string } | null {
  return CAREER_TITLES.find((t) => t.min > merit) ?? null;
}

/** 生涯统计小格（错峰弹入, 数值 primary 强调） */
function StatTile({ label, value, sub, delayMs }: { label: string; value: string; sub?: string; delayMs: number }) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="ach-card-in flex flex-col gap-0.5 rounded-md border border-border bg-background p-3 shadow-sm"
    >
      <p className="font-mono text-xs tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-bold tabular-nums text-primary">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function CareerStats({ open, snap, onClose, onClearSave }: CareerStatsProps) {
  // 清除存档两段确认：首次点击进入「确认清除？」态, 4 秒内不二次点击自动回退
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  // 生涯分享卡预览层开关
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);
  if (!open || !snap) return null;

  const handleDangerClick = () => {
    if (!confirming) {
      setConfirming(true);
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirming(false);
    onClearSave();
  };

  const c = snap.career;
  const title = careerTitleAt(snap.merit);
  const next = nextCareerTitle(snap.merit);
  const titleProgress = next ? Math.min(1, Math.max(0, (snap.merit - title.min) / (next.min - title.min))) : 1;
  const ringRatio = snap.achTotal > 0 ? snap.achCount / snap.achTotal : 0;
  const landingRows = MISSION_ORDER.map((id) => ({
    id,
    code: MISSIONS[id].code,
    badge: MISSIONS[id].badge,
    count: c.landings[id] ?? 0,
  }));
  const landingsTotal = landingRows.reduce((s, r) => s + r.count, 0);
  const playRows = [
    { label: "流星记录", value: c.golds > 0 ? `${c.meteors}` : `${c.meteors}`, sub: c.golds > 0 ? `含金色 ×${c.golds}` : "累计捕获" },
    { label: "演练命中", value: `${c.drills}`, sub: "标靶快速响应" },
    { label: "握手校准", value: `${c.handshakes}`, sub: "中继长按完成" },
    { label: "诊断满序", value: `${c.diags}`, sub: "灯序全对次数" },
    { label: "抽问答对", value: `${c.quizzes}`, sub: "呼号应答正确" },
    { label: "最长连答链", value: `${c.chainBest} 连`, sub: "追问连答纪录" },
    { label: "天线全锁", value: `${c.antennas}`, sub: "三段对准接通" },
    { label: "极光光谱", value: `${c.auroras}`, sub: "累计记录段数" },
    { label: "漂移总秒数", value: `${c.spinSecs}s`, sub: "原地旋转累计" },
    { label: "纪念拍照", value: `${c.photos} 张`, sub: "巡视影像档案" },
    { label: "金星热管理", value: `${c.overheatCount} / ${c.coolingUsed}`, sub: "累计过热 / 应急散热" },
    { label: "泰坦雾情", value: `${Math.floor(c.fogTimeS / 60)} 分 ${c.fogTimeS % 60} 秒`, sub: `雾中采回样品 ${c.fogSamples} 件` },
    { label: "每日挑战", value: `${c.dailyCompletions} 完成`, sub: `连击 ${c.dailyStreak} · 最佳 ${c.dailyBestStreak}` },
  ];
  const rallyRows = [
    { label: "正序航线", best: snap.rally.std },
    { label: "倒序航线", best: snap.rally.rev },
    { label: "夜航无灯", best: snap.rally.night },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col animate-in fade-in zoom-in-95 rounded-lg border border-primary/40 bg-card p-6 shadow-xl duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="生涯统计"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-card-foreground">
                生涯统计 <span className="text-primary">·</span> CAREER
              </h2>
              <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
                本地存档持久计数 · 跨任务跨会话累计
                {snap.savedAt ? ` · 最近写档 ${snap.savedAt.slice(0, 16).replace("T", " ")}` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-border font-mono focus-visible:shadow-focus"
          >
            关闭 ESC
          </Button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {/* 生涯称号带：累计功勋派生称号 + 晋升进度条 + 值班处置数 */}
          <section
            aria-label="生涯称号"
            className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-background/50 p-4 shadow-sm md:flex-row md:items-center"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary shadow-md">
              <Medal className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-bold text-primary">{title.name}</p>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">{title.en}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.round(titleProgress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {next
                  ? `累计功勋 ${snap.merit} · 再获 ${next.min - snap.merit} 点晋升「${next.name}」`
                  : `累计功勋 ${snap.merit} · 已至生涯称号顶点`}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 md:w-56">
              <StatTile label="累计功勋" value={`${snap.merit}`} delayMs={0} />
              <StatTile label="指令完成" value={`${snap.dutyDone}`} delayMs={60} />
            </div>
          </section>

          {/* 着陆与里程：成就解锁率环形图 + 按任务着陆分行 + 生涯总里程 + 样品四统计 */}
          <section
            aria-label="着陆与里程统计"
            className="mt-4 grid gap-4 rounded-lg border border-border bg-background/50 p-4 shadow-sm md:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="60" cy="60" r={RING_R} fill="none" strokeWidth="10" className="text-muted" stroke="currentColor" />
                  <circle
                    cx="60"
                    cy="60"
                    r={RING_R}
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    className="text-primary"
                    stroke="currentColor"
                    strokeDasharray={`${(ringRatio * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`}
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-primary">
                    {snap.achCount}
                    <span className="text-base text-muted-foreground">/{snap.achTotal}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">解锁率 {Math.round(ringRatio * 100)}%</p>
                </div>
              </div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">ACHIEVEMENTS</p>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div>
                <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">
                  总着陆次数 · LANDINGS · <span className="tabular-nums text-primary">{landingsTotal}</span> 次
                </p>
                <div className="space-y-1.5">
                  {landingRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 font-mono text-xs font-bold tracking-widest text-card-foreground">
                        {row.code}
                      </span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, row.count * 20)}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-primary">
                        {row.count} 次
                      </span>
                      <span className="w-8 shrink-0 rounded-full border border-primary/50 bg-primary/10 px-1 text-center font-mono text-xs font-bold text-primary">
                        {row.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <StatTile label="生涯总里程" value={`${c.odometerM}m`} sub="巡视车累计" delayMs={40} />
                <StatTile label="样品总数" value={`${c.samples}`} sub="入舱登记" delayMs={80} />
                <StatTile label="已化验" value={`${c.analyzed}`} sub="出报告数" delayMs={120} />
                <StatTile label="S 级藏品" value={`${c.sGrade}`} sub="最高评级" delayMs={160} />
                <StatTile label="海洋水样" value={`${c.ocean}`} sub="冰下直取" delayMs={200} />
              </div>
            </div>
          </section>

          {/* 玩法累计十项 */}
          <section
            aria-label="玩法累计统计"
            className="mt-4 rounded-lg border border-border bg-background/50 p-4 shadow-sm"
          >
            <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">玩法累计 · DUTY PLAYS</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {playRows.map((row, i) => (
                <StatTile key={row.label} label={row.label} value={row.value} sub={row.sub} delayMs={i * 40} />
              ))}
            </div>
          </section>

          {/* 历史最佳结算 + 三航线拉力纪录 */}
          <section
            aria-label="历史最佳纪录"
            className="mt-4 grid gap-4 rounded-lg border border-border bg-background/50 p-4 shadow-sm md:grid-cols-2"
          >
            <div>
              <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">历史最佳结算 · BEST DEBRIEF</p>
              {c.bestTotal === null ? (
                <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground/70">
                  尚未出具过任务结算单 —— 完成一次软着陆即可留下纪录。
                </p>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 p-3 shadow-sm">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary font-display text-xl font-bold text-primary-foreground shadow-md">
                    {c.bestGrade}
                  </span>
                  <div>
                    <p className="font-mono text-2xl font-bold tabular-nums text-primary">{c.bestTotal} 分</p>
                    <p className="text-xs text-muted-foreground">生涯结算最高总分与评级</p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">拉力赛纪录 · RALLY BESTS</p>
              <div className="space-y-1.5">
                {rallyRows.map((row) => (
                  <div key={row.label} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <span className="flex-1 text-xs text-card-foreground">{row.label}</span>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${
                        row.best === null ? "text-muted-foreground/60" : "text-primary"
                      }`}
                    >
                      {row.best === null ? "未完赛" : `${row.best}s`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 生涯分享卡：一键生成 canvas 生涯总览图并下载 PNG */}
          <section aria-label="生涯分享卡" className="mt-4 flex justify-center">
            <Button
              size="sm"
              onClick={() => setShareOpen(true)}
              className="border border-primary/50 bg-primary/10 font-mono text-primary hover:bg-primary/20 hover:text-primary focus-visible:shadow-focus"
            >
              <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              保存生涯卡片
            </Button>
          </section>

          {/* 危险操作：清除存档（两段确认, 首次点击进入「确认清除？」态） */}
          <section
            aria-label="存档管理"
            className="mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 shadow-sm sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-card-foreground">清除本地存档</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                成就墙、样品登记册、历史最佳、功勋军衔与全部生涯统计将归零, 且无法恢复。
              </p>
            </div>
            <button
              type="button"
              onClick={handleDangerClick}
              aria-label={confirming ? "再次点击确认清除存档" : "清除本地存档"}
              className={`shrink-0 rounded-md border px-4 py-2 font-mono text-xs font-bold tracking-widest shadow-sm transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                confirming
                  ? "animate-pulse border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "border-destructive/60 bg-background text-destructive hover:bg-destructive/10"
              }`}
            >
              {confirming ? "确认清除？" : "清除存档"}
            </button>
          </section>
        </div>
        {shareOpen && <CareerShareCard snap={snap} title={title} onClose={() => setShareOpen(false)} />}
      </div>
    </div>
  );
}
