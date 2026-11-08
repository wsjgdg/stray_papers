// 成就墙弹层：顶部进度统计区（总解锁率环形图 + 分类条形图 + 双任务对比, 纯内联 SVG）
// + 解锁时间轴（节点可点击定位到成就卡）+ 成就卡片网格（已解锁点亮 / 未解锁暗色剪影）。
import { useEffect, useRef, useState } from "react";
import { Compass, Award, Trophy } from "lucide-react";
import { ACHIEVEMENT_CATEGORIES, achievementById, type AchievementDef } from "@/lib/achievements";
import { MISSIONS, MISSION_ORDER } from "@/lib/missions";
import type { UnlockedAchievement } from "@/pages/Home/useHome";
import { Button } from "@/components/ui/button";

interface AchievementWallProps {
  open: boolean;
  list: AchievementDef[];
  unlockedMap: Record<string, UnlockedAchievement>;
  onClose: () => void;
}

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/** 驾驶荣誉陈列柜展位：冰原车手 / 王牌驾驶员 */
const DRIVING_HONOR_IDS = ["crack_evade_3", "ace_driver"];

/** 成就网格筛选：全部 / 稀有 / 已解锁 / 未解锁 */
type AchFilter = "all" | "rare" | "unlocked" | "locked";

const ACH_FILTERS: { id: AchFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "rare", label: "稀有 RARE" },
  { id: "unlocked", label: "已解锁" },
  { id: "locked", label: "未解锁" },
];

/** 横向进度条（内联 SVG, token 色经 currentColor 注入） */
function BarSvg({ ratio }: { ratio: number }) {
  const pctW = Math.max(0, Math.min(100, ratio * 100));
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 flex-1" aria-hidden="true">
      <rect x="0" y="0" width="100" height="10" rx="5" className="text-muted" fill="currentColor" />
      {pctW > 0 && (
        <rect x="0" y="0" width={pctW} height="10" rx="5" className="text-primary" fill="currentColor" />
      )}
    </svg>
  );
}

export function AchievementWall({ open, list, unlockedMap, onClose }: AchievementWallProps) {
  // 时间轴节点 → 成就卡定位：点击节点平滑滚动到对应卡片并 primary 高亮约 2.4s
  const [focusAchId, setFocusAchId] = useState<string | null>(null);
  // 成就卡筛选（只影响下方网格, 统计区与陈列柜保持全量口径）
  const [achFilter, setAchFilter] = useState<AchFilter>("all");
  const focusTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    };
  }, []);
  if (!open) return null;

  const focusAchievement = (id: string) => {
    setFocusAchId(id);
    document.getElementById(`ach-card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => setFocusAchId(null), 2400);
  };

  const unlockedRecords = Object.values(unlockedMap);
  const unlockedCount = unlockedRecords.length;
  const total = list.length;
  const ringRatio = total > 0 ? unlockedCount / total : 0;
  const categoryRows = ACHIEVEMENT_CATEGORIES.map((cat) => {
    const defs = list.filter((a) => a.category === cat.id);
    const got = defs.filter((d) => unlockedMap[d.id]).length;
    return { id: cat.id, label: cat.label, total: defs.length, got };
  }).filter((row) => row.total > 0);
  // 按任务归类（MISSION_ORDER 派生, 自动容纳第三任务）
  const missionRows = MISSION_ORDER.map((mid) => ({
    code: MISSIONS[mid].code,
    got: unlockedRecords.filter((r) => r.missionId === mid).length,
  }));
  const missionMax = Math.max(1, ...missionRows.map((r) => r.got));
  // 网格筛选（统计区/陈列柜不随筛选变化）
  const filteredList = list.filter((a) =>
    achFilter === "all"
      ? true
      : achFilter === "rare"
        ? !!a.rare
        : achFilter === "unlocked"
          ? !!unlockedMap[a.id]
          : !unlockedMap[a.id],
  );

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
        aria-label="成就墙"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-card-foreground">
                成就墙 <span className="text-primary">·</span> ACHIEVEMENTS
              </h2>
              <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
                全任务通用 · {MISSION_ORDER.map((mid) => MISSIONS[mid].code).join(" / ")} · 已解锁{" "}
                <span className="font-bold tabular-nums text-primary">
                  {unlockedCount}/{total}
                </span>
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
          {/* 进度统计区：环形图 + 分类条形图 + 双任务对比（小屏纵向堆叠） */}
          <section
            aria-label="解锁进度统计"
            className="grid gap-4 rounded-lg border border-border bg-background/50 p-4 shadow-sm md:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                  <circle
                    cx="60"
                    cy="60"
                    r={RING_R}
                    fill="none"
                    strokeWidth="10"
                    className="text-muted"
                    stroke="currentColor"
                  />
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
                    {unlockedCount}
                    <span className="text-base text-muted-foreground">/{total}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">解锁率 {Math.round(ringRatio * 100)}%</p>
                </div>
              </div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground">TOTAL PROGRESS</p>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">分类解锁率 · BY CATEGORY</p>
                <div className="space-y-1.5">
                  {categoryRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-xs text-card-foreground">{row.label}</span>
                      <BarSvg ratio={row.total > 0 ? row.got / row.total : 0} />
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {row.got}/{row.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">多任务对比 · BY MISSION</p>
                <div className="space-y-1.5">
                  {missionRows.map((row) => (
                    <div key={row.code} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 font-mono text-xs font-bold tracking-widest text-card-foreground">
                        {row.code}
                      </span>
                      <BarSvg ratio={row.got / missionMax} />
                      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-primary">
                        {row.got} 枚
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 解锁时间轴：按成就解锁先后排成横向节点条带（unlockedMap 插入顺序即解锁顺序） */}
          <section
            aria-label="成就解锁时间轴"
            className="mt-4 rounded-lg border border-border bg-background/50 p-4 shadow-sm"
          >
            <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">
              解锁时间轴 · UNLOCK TIMELINE ·{" "}
              <span className="tabular-nums text-primary">{unlockedCount}</span> 枚
            </p>
            {unlockedRecords.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground/70">
                暂无解锁记录 —— 点火、着陆、巡视采样，赢下第一枚成就。
              </p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max items-start">
                  {unlockedRecords.map((record, i) => {
                    const def = achievementById(record.id);
                    if (!def) return null;
                    const Icon = def.icon;
                    const latest = i === unlockedRecords.length - 1;
                    return (
                      <div key={record.id} className="flex items-start">
                        <button
                          type="button"
                          onClick={() => focusAchievement(record.id)}
                          aria-label={`查看成就「${def.name}」详情`}
                          title="点击查看该成就详情"
                          className="flex w-24 flex-col items-center gap-1 rounded-md text-center transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                              latest
                                ? "border-primary bg-primary/15 text-primary shadow-md"
                                : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span
                            className={`w-full truncate text-xs font-bold ${
                              latest ? "text-primary" : "text-card-foreground"
                            }`}
                          >
                            {def.name}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">{record.clockText}</span>
                          <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                            {record.missionBadge}
                          </span>
                        </button>
                        {!latest && <span className="mt-4 h-0.5 w-4 shrink-0 bg-border" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 冰原驾驶荣誉陈列柜：冰原车手 / 王牌驾驶员 专属聚光展位 */}
          <section
            aria-label="冰原驾驶荣誉陈列柜"
            className="mt-4 rounded-lg border border-primary/30 bg-background/50 p-4 shadow-sm"
          >
            <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">
              驾驶荣誉陈列柜 · DRIVING HONORS ·{" "}
              <span className="tabular-nums text-primary">
                {DRIVING_HONOR_IDS.filter((id) => unlockedMap[id]).length}/{DRIVING_HONOR_IDS.length}
              </span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {DRIVING_HONOR_IDS.map((id) => {
                const def = achievementById(id);
                if (!def) return null;
                const record = unlockedMap[id];
                const Icon = id === "ace_driver" ? Award : Compass;
                return (
                  <div
                    key={id}
                    id={`ach-honor-${id}`}
                    className={`relative flex items-center gap-3 overflow-hidden rounded-md border p-3 ${
                      record
                        ? "museum-rarity-s border-primary bg-primary/10"
                        : "border-dashed border-border bg-muted/30"
                    }`}
                  >
                    {record && (
                      <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                    )}
                    {/* 聚光底座上的奖杯位 */}
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-md ${
                        record
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground/40"
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-bold ${record ? "text-primary" : "font-mono tracking-widest text-muted-foreground/60"}`}>
                        {record ? def.name : "??? ???"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {record ? `${def.desc} · ${record.clockText}` : "冰原疾驰, 赢下这尊驾驶奖杯"}
                      </p>
                    </div>
                    {record && (
                      <span className="ml-auto shrink-0 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                        {record.missionBadge}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 筛选 chips：只过滤下方成就网格, 统计区与陈列柜保持全量口径 */}
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="成就筛选">
            <span className="font-mono text-xs tracking-widest text-muted-foreground">筛选 · FILTER</span>
            {ACH_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAchFilter(f.id)}
                aria-pressed={achFilter === f.id}
                className={`rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-widest transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                  achFilter === f.id
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              {filteredList.length}/{list.length} 枚
            </span>
          </div>

          {filteredList.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-background/50 py-8 text-center text-sm text-muted-foreground/70">
              没有符合筛选条件的成就 —— 换一个筛选, 或回到任务里赢下它。
            </p>
          ) : (
          <div key={achFilter} className="mt-4 grid animate-in fade-in gap-3 duration-300 sm:grid-cols-2 lg:grid-cols-3">
            {filteredList.map((ach, i) => {
              const record = unlockedMap[ach.id];
              const Icon = ach.icon;
              // 开墙时全部卡片按索引错峰弹入
              const enterDelay = { animationDelay: `${i * 45}ms` };
              if (record) {
                return (
                  <div
                    key={ach.id}
                    id={`ach-card-${ach.id}`}
                    style={enterDelay}
                    className={`ach-card-in relative flex flex-col overflow-hidden rounded-lg border border-primary/40 bg-background p-3 shadow-md transition-transform duration-300 hover:-translate-y-1 ${
                      focusAchId === ach.id ? "ach-focus-flash" : ""
                    }`}
                  >
                    {/* 稀有成就：周期流光扫过 + RARE 角标 */}
                    {ach.rare && (
                      <>
                        <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                        <span className="absolute right-0 top-0 rounded-bl-md border-b border-l border-primary/50 bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary">
                          RARE
                        </span>
                      </>
                    )}
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className="min-w-0 truncate text-sm font-bold text-card-foreground">{ach.name}</p>
                    </div>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{ach.desc}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 font-mono text-xs">
                      <span className="tabular-nums text-primary">{record.clockText}</span>
                      <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-bold text-primary">
                        {record.missionBadge}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={ach.id}
                  style={enterDelay}
                  className="ach-card-in flex flex-col rounded-lg border border-dashed border-border bg-background/60 p-3"
                  title="尚未解锁"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground/50">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="font-mono text-sm font-bold tracking-widest text-muted-foreground/60">??? ???</p>
                  </div>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground/50">
                    继续在任务中探索，解锁这枚成就。
                  </p>
                  <div className="mt-2 font-mono text-xs text-muted-foreground/40">LOCKED</div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
