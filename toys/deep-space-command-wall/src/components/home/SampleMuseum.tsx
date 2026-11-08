// 样品博物馆陈列厅：全屏暗色展馆弹层，跨任务陈列两条任务采集的全部样品。
// 每任务预留 6 格展柜位（空格为「待采集」暗态占位），点击已化验展柜卡打开化验报告。
import { useState } from "react";
import { Droplets, Gem, Landmark } from "lucide-react";
import { MISSIONS, MISSION_ORDER } from "@/lib/missions";
import type { SampleGrade } from "@/lib/sampleAnalysis";
import type { MuseumSampleEntry } from "@/pages/Home/useHome";
import { Button } from "@/components/ui/button";

interface SampleMuseumProps {
  open: boolean;
  entries: MuseumSampleEntry[];
  /** 本次进厅需要播放入馆光柱仪式的 S 级藏品 key（会话级一次性） */
  celebrateKeys?: string[];
  onClose: () => void;
  onOpenReport: (entry: MuseumSampleEntry) => void;
}

const SLOTS_PER_MISSION = 6;

const GRADE_BADGE: Record<SampleGrade, string> = {
  S: "border-primary bg-primary text-primary-foreground shadow-md",
  A: "border-primary/60 bg-primary/10 text-primary",
  B: "border-border bg-secondary text-secondary-foreground",
  C: "border-border bg-muted text-muted-foreground",
};

/* 稀有度光效：S 脉冲辉光+掠光 / A 常亮辉光 / B 悬停微光 / C 无光（动画样式见 index.css） */
const GRADE_GLOW: Record<SampleGrade, string> = {
  S: "museum-rarity-s border-primary/70",
  A: "museum-rarity-a",
  B: "museum-rarity-b",
  C: "",
};

/* 展柜顶部聚光条亮度按稀有度分层 */
const GRADE_SPOT: Record<SampleGrade, string> = {
  S: "via-primary",
  A: "via-primary/70",
  B: "via-primary/50",
  C: "via-primary/35",
};

/* 稀有度筛选：只影响展区陈列, 顶部统计条保持全量口径 */
type MuseumFilter = "ALL" | SampleGrade | "UNANALYZED";

const FILTER_CHIPS: { id: MuseumFilter; label: string }[] = [
  { id: "ALL", label: "全部" },
  { id: "S", label: "S 级" },
  { id: "A", label: "A 级" },
  { id: "B", label: "B 级" },
  { id: "C", label: "C 级" },
  { id: "UNANALYZED", label: "未化验" },
];

function StatTile({ label, labelEn, value }: { label: string; labelEn: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center shadow-md">
      <p className="font-mono text-3xl font-bold tabular-nums text-primary">{value}</p>
      <p className="mt-1 text-xs text-foreground">{label}</p>
      <p className="font-mono text-xs tracking-widest text-muted-foreground">{labelEn}</p>
    </div>
  );
}

function CaseCard({
  entry,
  celebrate,
  onOpenReport,
}: {
  entry: MuseumSampleEntry;
  celebrate: boolean;
  onOpenReport: (e: MuseumSampleEntry) => void;
}) {
  const report = entry.report;
  return (
    <button
      type="button"
      onClick={() => {
        if (report) onOpenReport(entry);
      }}
      aria-label={`样品 ${entry.code} 展柜${report ? "，查看化验报告" : "，待化验"}`}
      title={report ? `查看样品 ${entry.code} 的化验报告` : "该样品尚未化验，回分析舱完成化验后徽章点亮"}
      className={`group relative flex h-full flex-col items-center gap-2 overflow-hidden rounded-lg border p-3 text-center transition duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
        report
          ? `border-primary/40 bg-gradient-to-b from-primary/15 via-card to-card shadow-lg hover:-translate-y-1.5 hover:scale-105 hover:shadow-xl ${GRADE_GLOW[report.grade]}`
          : "cursor-default border-border bg-card/60"
      }`}
    >
      {/* S 级藏品入馆光柱仪式：光柱 + 中心亮核 + 三颗上浮星芒 + 底部扩散光环, 一次性 ~2.8s 后淡出 */}
      {celebrate && (
        <>
          <span className="museum-pillar-beam pointer-events-none absolute inset-0 z-20" aria-hidden="true" />
          <span
            className="museum-pillar-core pointer-events-none absolute inset-y-0 left-1/2 z-20 w-1/4 -translate-x-1/2"
            aria-hidden="true"
          />
          <span className="museum-pillar-spark mps-1 pointer-events-none absolute bottom-8 z-20" aria-hidden="true" />
          <span className="museum-pillar-spark mps-2 pointer-events-none absolute bottom-6 z-20" aria-hidden="true" />
          <span className="museum-pillar-spark mps-3 pointer-events-none absolute bottom-10 z-20" aria-hidden="true" />
          <span
            className="museum-pillar-ring pointer-events-none absolute inset-x-1 bottom-1 z-20 h-6 rounded-full"
            aria-hidden="true"
          />
        </>
      )}
      {/* 展柜聚光条：亮度按稀有度分层 */}
      <span
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent to-transparent ${
          report ? GRADE_SPOT[report.grade] : "via-primary/40"
        }`}
        aria-hidden="true"
      />
      {/* S 级藏品：周期掠光带 */}
      {report?.grade === "S" && (
        <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
      )}
      <span className="flex items-center gap-1.5">
        <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
          {entry.missionBadge}
        </span>
        {report ? (
          <span className={`rounded-full border px-2 py-0.5 font-display text-xs font-bold ${GRADE_BADGE[report.grade]}`}>
            {report.grade} 级
          </span>
        ) : (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            待化验
          </span>
        )}
      </span>
      <span className="font-mono text-sm font-bold tracking-widest text-card-foreground">{entry.code}</span>
      <span className="w-full truncate text-xs text-muted-foreground" title={entry.siteName}>
        {entry.siteName}
      </span>
      {report?.waterSignal && (
        <span className="mt-auto flex items-center gap-1 font-mono text-xs text-primary">
          <Droplets className="h-3 w-3" aria-hidden="true" />
          含水信号
        </span>
      )}
    </button>
  );
}

function EmptySlot({ slotIndex }: { slotIndex: number }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center">
      <Gem className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
      <p className="font-mono text-xs tracking-widest text-muted-foreground/60">待采集</p>
      <p className="font-mono text-xs text-muted-foreground/40">SLOT {String(slotIndex + 1).padStart(2, "0")}</p>
    </div>
  );
}

/* 稀有度图例：微缩光效样点复用展柜的 museum-rarity-s/a 光效，B 用静态弱化版，C 无光（纯展示不可点击） */
const RARITY_LEGEND: { grade: SampleGrade; desc: string; swatch: string }[] = [
  { grade: "S", desc: "脉冲光 · 镇馆之宝", swatch: "museum-rarity-s border-primary bg-primary/30" },
  { grade: "A", desc: "常亮辉光", swatch: "museum-rarity-a border-primary/50 bg-primary/15" },
  { grade: "B", desc: "悬停微光", swatch: "border-border bg-secondary" },
  { grade: "C", desc: "静默收藏", swatch: "border-border bg-muted" },
];

function RarityLegend() {
  return (
    <section
      aria-label="稀有度图例"
      className="rounded-lg border border-border bg-card/70 px-4 py-3 shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <p className="mb-2 font-mono text-xs tracking-widest text-muted-foreground">RARITY LEGEND · 稀有度图例</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {RARITY_LEGEND.map((item) => (
          <span key={item.grade} className="flex items-center gap-2">
            <span className={`h-4 w-4 shrink-0 rounded border ${item.swatch}`} aria-hidden="true" />
            <span className="font-display text-xs font-bold text-primary">{item.grade} 级</span>
            <span className="text-xs text-muted-foreground">{item.desc}</span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary/50 bg-primary/10"
            aria-hidden="true"
          >
            <Droplets className="h-3 w-3 text-primary" />
          </span>
          <span className="font-display text-xs font-bold text-primary">含水信号</span>
          <span className="text-xs text-muted-foreground">检出水的踪迹 · 展柜卡点亮水滴标记</span>
        </span>
      </div>
    </section>
  );
}

export function SampleMuseum({ open, entries, celebrateKeys, onClose, onOpenReport }: SampleMuseumProps) {
  const [gradeFilter, setGradeFilter] = useState<MuseumFilter>("ALL");
  if (!open) return null;
  const analyzedCount = entries.filter((e) => e.report !== null).length;
  const gradeSCount = entries.filter((e) => e.report?.grade === "S").length;
  const waterCount = entries.filter((e) => e.report?.waterSignal === true).length;
  const countByMission = (mid: (typeof MISSION_ORDER)[number]) => entries.filter((e) => e.missionId === mid).length;
  const celebrateSet = new Set(celebrateKeys ?? []);
  const matchFilter = (e: MuseumSampleEntry) =>
    gradeFilter === "ALL"
      ? true
      : gradeFilter === "UNANALYZED"
        ? e.report === null
        : e.report?.grade === gradeFilter;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-label="样品博物馆陈列厅"
    >
      {/* 展馆氛围层：扫描线 + 顶部聚光渐变 */}
      <div className="museum-scanlines pointer-events-none fixed inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-lg">
              <Landmark className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">
                样品博物馆 <span className="text-primary">陈列厅</span>
              </h2>
              <p className="mt-1 font-mono text-xs tracking-widest text-muted-foreground">
                SAMPLE MUSEUM · DEEP SPACE COLLECTIONS
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
        </header>

        <section
          aria-label="馆藏统计"
          className="rounded-lg border border-border bg-card p-4 shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="样品总数" labelEn="TOTAL" value={entries.length} />
            <StatTile label="已化验" labelEn="ANALYZED" value={analyzedCount} />
            <StatTile label="S 级样品" labelEn="GRADE S" value={gradeSCount} />
            <StatTile label="含水信号样品" labelEn="H2O SIGNAL" value={waterCount} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {MISSION_ORDER.map((mid) => {
              const n = countByMission(mid);
              return (
                <div key={mid} className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
                  <span className="rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                    {MISSIONS[mid].badge}
                  </span>
                  <span className="font-mono text-xs tracking-widest text-secondary-foreground">{MISSIONS[mid].code}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(100, (n / SLOTS_PER_MISSION) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-primary">
                    {n}/{SLOTS_PER_MISSION}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <RarityLegend />

        {/* 稀有度筛选 chips：选中态 primary 填充, 只过滤展区陈列 */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="按稀有度筛选藏品">
          <span className="font-mono text-xs tracking-widest text-muted-foreground">FILTER · 稀有度筛选</span>
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setGradeFilter(chip.id)}
              aria-pressed={gradeFilter === chip.id}
              className={`rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-widest transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                gradeFilter === chip.id
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* key 随筛选变化重挂载, 让切换筛选时整个展区重播淡入过渡 */}
        <main key={gradeFilter} className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {MISSION_ORDER.map((mid) => {
            const m = MISSIONS[mid];
            const all = entries.filter((e) => e.missionId === mid);
            const list = gradeFilter === "ALL" ? all : all.filter(matchFilter);
            const slotCount = gradeFilter === "ALL" ? Math.max(SLOTS_PER_MISSION, all.length) : list.length;
            return (
              <section
                key={mid}
                aria-label={`${m.code} 展区`}
                className="animate-in fade-in slide-in-from-bottom-4 duration-500"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 font-mono text-sm font-bold text-primary shadow-md">
                    {m.badge}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg font-bold text-foreground">
                      {m.code} <span className="text-primary">·</span> {m.title}
                    </h3>
                    <p className="font-mono text-xs tracking-widest text-muted-foreground">
                      EXHIBITION ROW · COLLECTED {all.length}/{SLOTS_PER_MISSION}
                      {gradeFilter !== "ALL" && ` · MATCH ${list.length}`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {gradeFilter !== "ALL" && list.length === 0 ? (
                    <p className="col-span-full rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                      无符合筛选的藏品 —— 换个级别看看, 或回火面/月面继续采集化验
                    </p>
                  ) : (
                    Array.from({ length: slotCount }, (_, i) => {
                      const entry = list[i];
                      return entry ? (
                        <CaseCard
                          key={entry.key}
                          entry={entry}
                          celebrate={celebrateSet.has(entry.key)}
                          onOpenReport={onOpenReport}
                        />
                      ) : (
                        <EmptySlot key={`empty-${mid}-${i}`} slotIndex={i} />
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </main>

        <footer className="border-t border-border pt-4 text-center font-mono text-xs tracking-widest text-muted-foreground">
          EXHIBITION DATA · 本次会话有效 · 点击已化验的展柜卡可查看化验报告
        </footer>
      </div>
    </div>
  );
}
