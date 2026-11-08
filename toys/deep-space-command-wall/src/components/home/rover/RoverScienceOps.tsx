// 采样与化验面板（从 RoverControl 拆出）：机械臂采样/暂停/收臂 + 采样锁定原因提示 +
// S 级珍宝鉴赏卡（复制报告 / canvas 手绘金色分享卡下载）+ 样品清单（采集序/评级序）+
// 评级分布迷你条形图 + 样品分析舱进度。鉴赏卡与排序状态内聚在本组件。
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { ANALYSIS_STAGES, type SampleGrade, type SampleReport } from "@/lib/sampleAnalysis";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";
import type { AnalysisProgress, RoverSample, RoverSnapshot } from "@/pages/Home/useRover";
import { ARM_PHASE_LABEL, GRADE_BADGE, GRADE_ORDER, fmtTs } from "@/components/home/rover/shared";

interface RoverScienceOpsProps {
  snap: RoverSnapshot;
  unlocked: boolean;
  stormHalt: boolean;
  /** 金星热管理（过热保护锁定机械臂作业） */
  thermalHud?: { active: boolean; temp: number; overheat: boolean } | null;
  samples: RoverSample[];
  sampleReports: Record<number, SampleReport>;
  analysis: AnalysisProgress | null;
  onStartAnalysis: (sampleId: number) => void;
  onOpenReport: (sampleId: number) => void;
  onStartSampling: () => void;
  onToggleArmPause?: () => void;
  onCancelArm?: () => void;
  roverName: string;
  roverNameEn: string;
}

export function RoverScienceOps({
  snap,
  unlocked,
  stormHalt,
  thermalHud,
  samples,
  sampleReports,
  analysis,
  onStartAnalysis,
  onOpenReport,
  onStartSampling,
  onToggleArmPause,
  onCancelArm,
  roverName,
  roverNameEn,
}: RoverScienceOpsProps) {
  const armBusy = snap.armPhase !== "idle";
  const sampleBlockedReason = !unlocked
    ? "着陆后可用"
    : stormHalt
      ? "风暴停车, 全员隐蔽, 机械臂禁止作业"
      : thermalHud?.overheat
        ? "过热保护生效, 机械臂禁止作业"
        : armBusy
        ? "机械臂采样进行中"
        : snap.batteryDead
          ? "电量耗尽, 待机充电中"
          : snap.battery <= 15
            ? "电量需高于 15% 才能采样"
            : snap.moving
              ? "车辆静止后才能采样"
              : null;
  const canSample = sampleBlockedReason === null;
  const sampleHint = sampleBlockedReason ?? "静止且电量高于 15% 时可钻取样品（耗电约 8-10%）";
  // S 级样品放大鉴赏卡（清单行 ✨ 按钮弹出）
  const [admire, setAdmire] = useState<{ code: string; summary: string; minerals: { name: string; pct: number }[]; water: boolean } | null>(null);
  // 鉴赏卡报告复制反馈（1.6s 后自动还原按钮文案）
  const [copied, setCopied] = useState(false);
  // 样品清单排序（批次 Q）：采集顺序 / 评级序 S→C（未化验排最后, 同级按采集先后）
  const [sampleSort, setSampleSort] = useState<"seq" | "grade">("seq");
  const sortedSamples =
    sampleSort === "grade"
      ? [...samples].sort((a, b) => {
          const ga = sampleReports[a.id]?.grade;
          const gb = sampleReports[b.id]?.grade;
          const ra = ga ? (GRADE_ORDER[ga] ?? 9) : 99;
          const rb = gb ? (GRADE_ORDER[gb] ?? 9) : 99;
          return ra - rb || a.id - b.id;
        })
      : samples;
  // 评级分布小统计（批次 R）：S/A/B/C 计数, 清单头下方迷你条形图（至少一份报告才显示）
  const gradeCounts: Record<SampleGrade, number> = { S: 0, A: 0, B: 0, C: 0 };
  for (const rep of Object.values(sampleReports)) {
    if (gradeCounts[rep.grade] !== undefined) gradeCounts[rep.grade] += 1;
  }
  const reportTotal = gradeCounts.S + gradeCounts.A + gradeCounts.B + gradeCounts.C;
  const gradeMax = Math.max(1, gradeCounts.S, gradeCounts.A, gradeCounts.B, gradeCounts.C);
  // 鉴赏卡报告一键复制：编号+成分条形+含水+摘要全文进剪贴板（clipboard API 失败退 textarea+execCommand, 均静默）
  const copyAdmire = () => {
    if (!admire) return;
    const text = [
      `✨ S 级珍宝鉴赏 · ${admire.code}`,
      ...admire.minerals.map((mm) => `${mm.name} ${mm.pct}%`),
      admire.water ? "💧 检出含水信号" : "",
      "",
      admire.summary,
    ]
      .filter(Boolean)
      .join("\n");
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch {
        // 复制不可用时不打扰
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  };
  // 鉴赏卡分享图：canvas 手绘金色珍藏卡（编号+成分条形图+含水+摘要自动换行+落款）→ PNG 下载
  const shareAdmire = () => {
    if (!admire) return;
    const W = 640;
    const H = 400;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return;
    const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
    const gold = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 1);
    const goldBright = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, 1);
    g.fillStyle = tokenHsl("--card", 1);
    g.fillRect(0, 0, W, H);
    // 斜向大字水印（垫底, 内容盖在上面）
    g.save();
    g.globalAlpha = 0.06;
    g.translate(W / 2, H / 2);
    g.rotate(-Math.PI / 12);
    g.fillStyle = goldBright;
    g.font = `bold 46px ${MONO}`;
    g.textAlign = "center";
    g.fillText("DEEP SPACE MONITOR", 0, 0);
    g.restore();
    // 金色双层边框
    g.strokeStyle = gold;
    g.lineWidth = 3;
    g.strokeRect(10, 10, W - 20, H - 20);
    g.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.4);
    g.lineWidth = 1;
    g.strokeRect(18, 18, W - 36, H - 36);
    // 标题区
    g.textAlign = "center";
    g.fillStyle = goldBright;
    g.font = `bold 30px ${MONO}`;
    g.fillText(`✨ S 级珍宝 · ${admire.code}`, W / 2, 72);
    g.fillStyle = tokenHsl("--muted-foreground", 1);
    g.font = `13px ${MONO}`;
    g.fillText(`${roverName} (${roverNameEn}) · 任务珍藏档案`, W / 2, 98);
    // 矿物条形图
    const barTop = 132;
    admire.minerals.forEach((mm, i) => {
      const y = barTop + i * 40;
      g.textAlign = "left";
      g.fillStyle = tokenHsl("--card-foreground", 1);
      g.font = `bold 15px ${MONO}`;
      g.fillText(mm.name, 48, y + 5);
      g.fillStyle = tokenHsl("--muted", 1);
      g.fillRect(190, y - 8, 320, 14);
      g.fillStyle = gold;
      g.fillRect(190, y - 8, Math.max(6, (mm.pct / 100) * 320), 14);
      g.textAlign = "right";
      g.fillStyle = goldBright;
      g.font = `bold 15px ${MONO}`;
      g.fillText(`${mm.pct}%`, W - 48, y + 5);
    });
    let nextY = barTop + admire.minerals.length * 40 + 16;
    if (admire.water) {
      g.textAlign = "center";
      g.fillStyle = goldBright;
      g.font = `bold 16px ${MONO}`;
      g.fillText("💧 检出含水信号", W / 2, nextY);
      nextY += 26;
    }
    // 摘要逐字换行（超界截断; 行宽收窄给右下档案码留位）
    g.textAlign = "left";
    g.fillStyle = tokenHsl("--muted-foreground", 1);
    g.font = "14px sans-serif";
    const maxW = W - 210;
    let line = "";
    let ly = nextY + 8;
    for (const ch of admire.summary) {
      if (ly > H - 66) break;
      if (g.measureText(line + ch).width > maxW) {
        g.fillText(line, 48, ly);
        line = ch;
        ly += 22;
      } else {
        line += ch;
      }
    }
    if (line && ly <= H - 66) g.fillText(line, 48, ly);
    // 落款
    g.textAlign = "center";
    g.fillStyle = tokenHsl("--muted-foreground", 0.8);
    g.font = `12px ${MONO}`;
    g.fillText(`深空监测墙 · ${fmtTs(Date.now())} 存档`, W / 2, H - 32);
    // 任务徽章：右上双圆环徽记（巡视车名缩写 + MISSION 环字）+ 右下大号半透明车名压角
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = gold;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W - 58, 66, 27, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.arc(W - 58, 66, 22, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = goldBright;
    g.textAlign = "center";
    g.font = `bold 12px ${MONO}`;
    g.fillText(roverNameEn.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase(), W - 58, 64);
    g.font = `8px ${MONO}`;
    g.fillText("MISSION", W - 58, 78);
    g.restore();
    g.save();
    g.globalAlpha = 0.09;
    g.fillStyle = goldBright;
    g.font = `bold 60px ${MONO}`;
    g.textAlign = "right";
    g.fillText(roverNameEn.replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase(), W - 140, H - 66);
    g.restore();
    // 档案点阵码（装饰性伪 QR）：样品编号散列确定性生成 15×15 点阵 + 三角定位图案 + 编号小字
    const qrX = W - 120;
    const qrY = H - 124;
    const qrS = 62;
    const cells = 15;
    const cell = qrS / cells;
    let seedNum = 7;
    for (const ch of admire.code) seedNum = (seedNum * 31 + ch.charCodeAt(0)) % 9973;
    g.fillStyle = tokenHsl("--card-foreground", 0.9);
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        seedNum = (seedNum * 1103515245 + 12345) % 2147483648;
        if (((seedNum >>> 7) & 1) === 1) g.fillRect(qrX + c * cell, qrY + r * cell, cell - 0.6, cell - 0.6);
      }
    }
    const finder = (fx: number, fy: number) => {
      g.fillStyle = tokenHsl("--card-foreground", 0.9);
      g.fillRect(qrX + fx * cell, qrY + fy * cell, cell * 3, cell * 3);
      g.fillStyle = tokenHsl("--card", 1);
      g.fillRect(qrX + (fx + 0.5) * cell, qrY + (fy + 0.5) * cell, cell * 2, cell * 2);
      g.fillStyle = tokenHsl("--card-foreground", 0.9);
      g.fillRect(qrX + (fx + 1) * cell, qrY + (fy + 1) * cell, cell, cell);
    };
    finder(0, 0);
    finder(cells - 3, 0);
    finder(0, cells - 3);
    g.fillStyle = tokenHsl("--muted-foreground", 0.8);
    g.font = `9px ${MONO}`;
    g.textAlign = "center";
    g.fillText(`档案编号 · ${admire.code}`, qrX + qrS / 2, qrY + qrS + 12);
    try {
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png");
      a.download = `s-treasure-${admire.code}.png`;
      a.click();
    } catch {
      // 画布导出不可用时静默
    }
  };
  return (
    <>
          <div className="rounded-md border border-border bg-background px-3 py-2 shadow-sm">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="font-mono text-xs tracking-widest text-muted-foreground">ROBOTIC ARM · 机械臂</p>
              <p className={`font-mono text-xs tracking-widest ${armBusy ? "animate-pulse text-primary" : "text-muted-foreground"}`}>
                {ARM_PHASE_LABEL[snap.armPhase]}
              </p>
            </div>
            <button
              type="button"
              onClick={onStartSampling}
              disabled={!canSample}
              aria-label="机械臂钻取采样"
              title={sampleHint}
              className="w-full min-h-11 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-0"
            >
              {armBusy ? "采样进行中 ..." : "机械臂采样"}
            </button>
            {(snap.armPhase === "deploy" || snap.armPhase === "drill") && (
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={onToggleArmPause}
                  aria-label={snap.armPaused ? "续钻——机械臂从悬停处继续" : "暂停机械臂——钻头悬停原地"}
                  title={snap.armPaused ? "续钻：机械臂从悬停处接着干" : "暂停：钻头悬停原地, 想好了再续钻（暂停中可收臂放弃）"}
                  className={`min-h-11 flex-1 rounded-md border px-2 py-1 font-mono text-xs font-bold tracking-widest shadow-sm transition active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:min-h-0 ${
                    snap.armPaused
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {snap.armPaused ? "▶ 续钻" : "⏸ 暂停机械臂"}
                </button>
                {snap.armPaused && (
                  <button
                    type="button"
                    onClick={onCancelArm}
                    aria-label="一键收臂, 放弃本次钻取"
                    title="一键收臂——放弃本次钻取直接回收（样品作废, 省下剩余时间）"
                    className="min-h-11 flex-1 animate-pulse rounded-md border border-destructive/60 bg-destructive/10 px-2 py-1 font-mono text-xs font-bold tracking-widest text-destructive shadow-sm transition hover:bg-destructive/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus lg:min-h-0"
                  >
                    ⏹ 收臂放弃
                  </button>
                )}
              </div>
            )}
            {!canSample && unlocked && (
              <p className="mt-1 text-xs text-muted-foreground">{sampleBlockedReason}</p>
            )}
            {admire && (
              <div className="museum-rarity-s relative mt-2 overflow-hidden rounded-md border-2 border-primary bg-primary/10 p-2 shadow-md">
                <span className="museum-shine pointer-events-none absolute -inset-y-10 left-0 w-1/3" aria-hidden="true" />
                <p className="font-mono text-xs font-bold tracking-widest text-primary">✨ S 级珍宝鉴赏 · {admire.code}</p>
                {/* 矿物条形图：前三成分占比逐条可视化（宽度 = 占比%, 金色条 + 数值） */}
                <p className="mt-1 font-mono text-[10px] tracking-widest text-primary">成分亮点</p>
                <ul className="mt-0.5 space-y-0.5" aria-label="矿物成分占比">
                  {admire.minerals.map((mm) => (
                    <li key={mm.name} className="flex items-center gap-1 font-mono text-[10px]">
                      <span className="w-16 shrink-0 truncate text-muted-foreground">{mm.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                        <span
                          className="museum-rarity-s block h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${Math.max(4, Math.min(100, mm.pct))}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right tabular-nums text-primary">{mm.pct}%</span>
                    </li>
                  ))}
                </ul>
                {admire.water && (
                  <p className="mt-0.5 font-mono text-[10px] font-bold text-primary">💧 检出含水信号</p>
                )}
                <p className="mt-1 text-[10px] leading-relaxed text-card-foreground">{admire.summary}</p>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={copyAdmire}
                    aria-label="复制鉴赏报告全文到剪贴板"
                    title="把这份鉴赏报告（编号/成分/含水/摘要）复制成文本, 贴到哪里都行"
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold transition ${
                      copied
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    {copied ? "✓ 已复制" : "⧉ 复制报告"}
                  </button>
                  <button
                    type="button"
                    onClick={shareAdmire}
                    aria-label="生成并下载鉴赏分享卡片图"
                    title="把这枚珍宝画成金色分享卡片图（编号/成分条形图/摘要/落款）, 下载 PNG 随手晒"
                    className="rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary transition hover:bg-primary/20"
                  >
                    🖼 卡片图
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdmire(null)}
                    aria-label="关闭鉴赏卡"
                    className="rounded-sm border border-primary/50 bg-background px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary transition hover:bg-primary/15"
                  >
                    收起鉴赏
                  </button>
                </div>
              </div>
            )}
            {samples.length > 0 && (
              <>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                    样品舱 · {samples.length} 件
                  </p>
                  <button
                    type="button"
                    onClick={() => setSampleSort((v) => (v === "seq" ? "grade" : "seq"))}
                    aria-label={sampleSort === "seq" ? "按评级排序样品清单" : "恢复采集顺序排列"}
                    title={
                      sampleSort === "seq"
                        ? "点击按评级 S→C 排序（未化验的排最后）"
                        : "点击恢复按采集先后排列"
                    }
                    className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                      sampleSort === "grade"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-primary"
                    }`}
                  >
                    {sampleSort === "grade" ? "评级序 S→C ↓" : "采集序"}
                  </button>
                </div>
                {/* 评级分布迷你条形图（批次 R）：S/A/B/C 各档计数, 条高按最多档归一 */}
                {reportTotal > 0 && (
                  <div
                    className="mt-1.5 flex items-end gap-2 rounded-sm border border-border bg-background/60 px-2 py-1.5"
                    aria-label={`样品评级分布: S 级 ${gradeCounts.S} 份, A 级 ${gradeCounts.A} 份, B 级 ${gradeCounts.B} 份, C 级 ${gradeCounts.C} 份`}
                  >
                    {(["S", "A", "B", "C"] as SampleGrade[]).map((g) => (
                      <div key={g} className="flex flex-1 flex-col items-center gap-0.5" title={`${g} 级样品 ${gradeCounts[g]} 份`}>
                        <span className="flex h-5 w-full items-end justify-center" aria-hidden="true">
                          <span
                            className={`w-2.5 rounded-sm transition-all duration-500 ${
                              g === "S"
                                ? "bg-primary"
                                : g === "A"
                                  ? "bg-primary/50"
                                  : g === "B"
                                    ? "bg-muted-foreground/40"
                                    : "bg-border"
                            } ${gradeCounts[g] === 0 ? "opacity-40" : ""}`}
                            style={{ height: gradeCounts[g] > 0 ? `${Math.max(4, Math.round((gradeCounts[g] / gradeMax) * 20))}px` : "2px" }}
                          />
                        </span>
                        <span
                          className={`font-mono text-[9px] font-bold ${
                            g === "S" ? "text-primary" : g === "A" ? "text-primary/70" : "text-muted-foreground"
                          }`}
                        >
                          {g}
                          <span className="ml-0.5 font-normal tabular-nums">×{gradeCounts[g]}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto" aria-label="样品清单">
                {sortedSamples.map((sample) => {
                  const report = sampleReports[sample.id];
                  return (
                    <li
                      key={sample.id}
                      className="flex animate-in fade-in zoom-in-75 slide-in-from-left-2 items-center gap-2 rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs shadow-sm duration-500"
                    >
                      <span className="shrink-0 font-bold text-primary">{sample.code}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{sample.siteName}</span>
                      {report ? (
                        <>
                          <span
                            className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-bold ${GRADE_BADGE[report.grade]} ${
                              report.grade === "S" ? "museum-rarity-s animate-pulse" : ""
                            }`}
                            title={`科学价值评级 ${report.grade} 级 · 点击查看报告`}
                          >
                            {report.grade}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenReport(sample.id)}
                            aria-label={`查看样品 ${sample.code} 化验报告`}
                            className="shrink-0 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                          >
                            报告
                          </button>
                          {report.grade === "S" && (
                            <button
                              type="button"
                              onClick={() =>
                                setAdmire({
                                  code: sample.code,
                                  summary: report.summary,
                                  minerals: report.minerals.slice(0, 3).map((mm) => ({ name: mm.name, pct: mm.pct })),
                                  water: report.waterSignal,
                                })
                              }
                              aria-label={`放大鉴赏 S 级样品 ${sample.code}`}
                              title="放大鉴赏这枚 S 级珍宝——金色流光卡 + 成分亮点 + 报告摘要"
                              className="shrink-0 rounded-sm border border-primary bg-primary/20 px-1.5 py-0.5 transition hover:bg-primary/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
                            >
                              ✨
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStartAnalysis(sample.id)}
                          disabled={analysis !== null}
                          aria-label={`化验样品 ${sample.code}`}
                          title={analysis !== null ? "分析舱正忙, 请等待当前化验完成" : "送入样品分析舱化验成分（约 5-6 秒, 不耗车辆电量）"}
                          className="shrink-0 rounded-sm border border-border bg-background px-1.5 py-0.5 text-muted-foreground transition hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          化验
                        </button>
                      )}
                    </li>
                  );
                })}
                </ul>
              </>
            )}
          </div>

          <div className="relative overflow-hidden rounded-md border border-border bg-background px-3 py-2 shadow-sm">
            {analysis && <span className="lab-scan-beam" aria-hidden="true" />}
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-mono text-xs tracking-widest text-muted-foreground">SAMPLE LAB · 样品分析舱</p>
              <p
                className={`font-mono text-xs tracking-widest ${
                  analysis ? "animate-pulse text-primary" : "text-muted-foreground"
                }`}
              >
                {analysis ? analysis.stageLabel : "空闲"}
              </p>
            </div>
            {analysis ? (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${Math.max(3, Math.min(100, analysis.progress * 100))}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-xs">
                  <span className="text-muted-foreground">
                    <FlaskConical className="mr-1 inline h-3 w-3 text-primary" aria-hidden="true" />
                    {analysis.sampleCode} 化验中
                  </span>
                  <span className="tabular-nums text-primary">{Math.round(analysis.progress * 100)}%</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1 font-mono text-xs">
                  {ANALYSIS_STAGES.map((stage, i) => (
                    <span
                      key={stage.id}
                      className={`flex-1 rounded-sm border px-1 py-0.5 text-center ${
                        i === analysis.stageIndex
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : i < analysis.stageIndex
                            ? "border-border text-muted-foreground"
                            : "border-border text-muted-foreground/50"
                      }`}
                    >
                      {stage.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                在样品清单点「化验」生成成分报告：矿物百分比 / 含水信号 / 粒径硬度 / S-C 评级（着陆器供电, 不耗车辆电量）
              </p>
            )}
          </div>
    </>
  );
}
