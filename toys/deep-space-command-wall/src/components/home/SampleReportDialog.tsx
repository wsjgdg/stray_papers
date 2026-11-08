import { Droplets, FlaskConical } from "lucide-react";
import type { SampleGrade, SampleReport } from "@/lib/sampleAnalysis";
import type { RoverSample } from "@/pages/Home/useRover";
import { Button } from "@/components/ui/button";

interface SampleReportDialogProps {
  sample: RoverSample | null;
  report: SampleReport | null;
  onClose: () => void;
}

const GRADE_BADGE: Record<SampleGrade, string> = {
  S: "border-primary bg-primary text-primary-foreground shadow-lg",
  A: "border-primary/60 bg-primary/10 text-primary",
  B: "border-border bg-secondary text-secondary-foreground",
  C: "border-border bg-muted text-muted-foreground",
};

const GRADE_WORD: Record<SampleGrade, string> = {
  S: "极高",
  A: "较高",
  B: "中等",
  C: "一般",
};

function statCell(label: string, labelEn: string, value: string) {
  return (
    <div className="rounded-md bg-secondary/60 px-3 py-2">
      <p className="font-mono text-xs text-muted-foreground">
        {label} <span className="tracking-widest">{labelEn}</span>
      </p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-card-foreground">{value}</p>
    </div>
  );
}

export function SampleReportDialog({ sample, report, onClose }: SampleReportDialogProps) {
  if (!sample || !report) return null;
  const soilWord = report.oceanWater
    ? "冰下海洋液态水体"
    : report.missionId === "luna9"
      ? "月壤"
      : report.missionId === "ares1"
        ? "火星壤"
        : "冰壤";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto animate-in fade-in zoom-in-95 rounded-lg border border-primary/40 bg-card p-6 shadow-xl duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`样品 ${sample.code} 化验报告`}
      >
        {/* 报告各区块打开时按序错峰揭示（复用 ach-card-in 上浮淡入） */}
        <div className="ach-card-in flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-card-foreground">
                样品化验报告
                <span className="ml-2 font-mono text-sm font-normal tracking-widest text-muted-foreground">
                  SAMPLE LAB REPORT
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono font-bold text-primary">{sample.code}</span> · 采集点位 {sample.siteName} ·{" "}
                {soilWord}样品
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

        {/* 冰下海洋直取水样：专属报告横幅（金色流光 + 脉冲辉光） */}
        {report.oceanWater && (
          <div
            className="ach-card-in museum-rarity-s relative mt-4 flex items-center gap-2 overflow-hidden rounded-md border border-primary bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-md"
            style={{ animationDelay: "60ms" }}
          >
            <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
            <Droplets className="h-4 w-4 shrink-0" aria-hidden="true" />
            ★ 冰下海洋直取水样 · 人类首次外星海洋水体化验
          </div>
        )}

        <div className="ach-card-in mt-4 flex items-stretch gap-3" style={{ animationDelay: "90ms" }}>
          {/* 评级大徽章翻牌揭晓（延迟 0.4s rotateY 翻转入场）；S 级翻牌后三颗星芒粒子上浮庆祝 */}
          <div
            className={`grade-flip relative flex w-24 shrink-0 flex-col items-center justify-center rounded-lg border p-3 ${GRADE_BADGE[report.grade]}`}
          >
            {report.grade === "S" && (
              <>
                <span className="grade-sparkle gsf-1 pointer-events-none absolute top-1" aria-hidden="true" />
                <span className="grade-sparkle gsf-2 pointer-events-none absolute top-0" aria-hidden="true" />
                <span className="grade-sparkle gsf-3 pointer-events-none absolute top-2" aria-hidden="true" />
              </>
            )}
            <p className="font-display text-4xl font-bold leading-none">{report.grade}</p>
            <p className="mt-1 font-mono text-xs tracking-widest opacity-80">科学价值</p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {report.oceanWater ? (
              <>
                {statCell("样品形态", "FORM", "液态水体")}
                {statCell("含水占比", "H₂O", `${(report.waterPpm / 10000).toFixed(1)}%`)}
                {statCell("盐度区间", "SALT", "咸水海洋")}
                {statCell("价值评价", "VALUE", GRADE_WORD[report.grade])}
              </>
            ) : (
              <>
                {statCell("含水信号", "H₂O", report.waterSignal ? `检出 ${report.waterPpm} ppm` : "未检出")}
                {statCell("平均粒径", "GRAIN", `${report.grainSizeUm} μm`)}
                {statCell("莫氏硬度", "HARD", report.hardnessMohs.toFixed(1))}
                {statCell("价值评价", "VALUE", GRADE_WORD[report.grade])}
              </>
            )}
          </div>
        </div>

        {/* 海洋水样专属：宜居度评分（大数字 + 进度条 + 评级词） */}
        {report.oceanWater && report.habitability !== undefined && (
          <div
            className="ach-card-in mt-3 rounded-md border border-primary/50 bg-primary/5 px-4 py-3 shadow-sm"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs tracking-widest text-muted-foreground">
                  宜居度评分 · HABITABILITY INDEX
                </p>
                <p className="mt-0.5 font-display text-3xl font-bold tabular-nums leading-none text-primary">
                  {report.habitability}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ 100</span>
                </p>
              </div>
              <p className="rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-primary">
                {report.habitability >= 90
                  ? "极高宜居潜力"
                  : report.habitability >= 80
                    ? "高宜居潜力"
                    : report.habitability >= 70
                      ? "中等宜居潜力"
                      : "待深入评估"}
              </p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${report.habitability}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              综合液态水占比、盐度区间、pH 与有机分子检出评估——该水体具备支持微生物类生命的基本化学条件。
            </p>
          </div>
        )}

        {report.waterSignal && !report.oceanWater && (
          <div
            className="ach-card-in mt-3 flex items-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-medium text-primary shadow-sm"
            style={{ animationDelay: "170ms" }}
          >
            <Droplets className="h-4 w-4 shrink-0" aria-hidden="true" />
            光谱检出明确含水信号（约 {report.waterPpm} ppm），具重大水文历史研究价值
          </div>
        )}

        <div className="ach-card-in mt-4 rounded-lg border border-border bg-background/50 p-4" style={{ animationDelay: "230ms" }}>
          <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">
            {report.oceanWater ? "溶解成分谱 · DISSOLVED SOLUTES" : "矿物组成 · MINERAL COMPOSITION"}
          </p>
          <div className="space-y-2">
            {report.minerals.map((mineral, mi) => (
              <div
                key={mineral.name}
                className="ach-card-in flex items-center gap-3"
                style={{ animationDelay: `${300 + mi * 70}ms` }}
              >
                <span className="w-24 shrink-0 text-xs text-card-foreground">{mineral.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(2, Math.min(100, mineral.pct))}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-primary">
                  {mineral.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p
            className="ach-card-in rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-xs leading-relaxed text-secondary-foreground"
            style={{ animationDelay: "640ms" }}
          >
            微量项 · {report.traceNote}
          </p>
          <p
            className="ach-card-in rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-card-foreground"
            style={{ animationDelay: "740ms" }}
          >
            <span className="mr-1 font-mono tracking-widest text-primary">结论</span>
            {report.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
