// 任务进度总览弹层：四条任务的着陆 / 采样 / 化验 / 成就进度卡 + 关键里程碑清单
// + 顶部全局统计条 + 徽章墙分享卡（canvas 手绘战报图, PNG 前端下载）。
// 数据由 useHome 跨任务内存态派生, 打开即最新; canvas 颜色全部走 themeColors token。
import { useEffect, useRef } from "react";
import { CheckCircle2, Circle, Download, Droplets, Flag, FlaskConical, Rocket, Trophy } from "lucide-react";
import { MISSION_ORDER } from "@/lib/missions";
import { ACHIEVEMENT_TOTAL } from "@/lib/achievements";
import { tokenHsl } from "@/lib/themeColors";
import { Button } from "@/components/ui/button";

export interface MissionProgressRow {
  id: string;
  code: string;
  title: string;
  badge: string;
  landed: boolean;
  inProgress: boolean;
  samples: number;
  analyzed: number;
  sGrade: number;
  oceanWater: number;
  achievements: number;
  special: { label: string; done: boolean };
}

interface MissionOverviewProps {
  open: boolean;
  rows: MissionProgressRow[];
  achievementCount: number;
  onClose: () => void;
}

function milestone(done: boolean, label: string) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
      )}
      <span className={done ? "font-medium text-card-foreground" : "text-muted-foreground/60"}>{label}</span>
    </li>
  );
}

const CARD_W = 960;
const CARD_H = 540;

/** 在分享卡 canvas 上手绘战报图（纯 token 色, 无 hex） */
function drawShareCard(canvas: HTMLCanvasElement, rows: MissionProgressRow[], achievementCount: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const bg = tokenHsl("--background");
  const card = tokenHsl("--card");
  const primary = tokenHsl("--primary");
  const primarySoft = tokenHsl("--primary", 0.15);
  const fg = tokenHsl("--foreground");
  const muted = tokenHsl("--muted-foreground");
  const border = tokenHsl("--border");

  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // 顶部 primary 渐变光带
  const grad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  grad.addColorStop(0, primarySoft);
  grad.addColorStop(0.5, "transparent");
  grad.addColorStop(1, primarySoft);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, 120);

  ctx.textBaseline = "middle";
  ctx.fillStyle = fg;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("深空指挥墙 · 战报档案", 56, 62);
  ctx.fillStyle = muted;
  ctx.font = "16px monospace";
  ctx.fillText("DEEP SPACE COMMAND WALL · MISSION RECORD", 56, 100);

  // 任务徽章（着陆点亮 / 未着陆暗态; 按任务数均布横排, 四徽章自动适配间距）
  const badgeY = 220;
  const badgeGap = rows.length > 1 ? (CARD_W - 240) / (rows.length - 1) : 0;
  rows.forEach((row, i) => {
    const cx = 120 + i * badgeGap;
    ctx.beginPath();
    ctx.arc(cx, badgeY, 58, 0, Math.PI * 2);
    ctx.fillStyle = row.landed ? primarySoft : card;
    ctx.fill();
    ctx.lineWidth = row.landed ? 4 : 2;
    ctx.strokeStyle = row.landed ? primary : border;
    ctx.stroke();
    ctx.fillStyle = row.landed ? primary : muted;
    ctx.font = "bold 30px monospace";
    ctx.textAlign = "center";
    ctx.fillText(row.badge, cx, badgeY - 4);
    ctx.font = "14px monospace";
    ctx.fillText(row.landed ? "✓ LANDED" : "STANDBY", cx, badgeY + 28);
    ctx.fillStyle = row.landed ? fg : muted;
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(row.code, cx, badgeY + 92);
    ctx.font = "14px sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(row.title, cx, badgeY + 118);
    ctx.textAlign = "left";
  });

  // 战报统计行
  const landedCount = rows.filter((r) => r.landed).length;
  const totalSamples = rows.reduce((s, r) => s + r.samples, 0);
  const totalS = rows.reduce((s, r) => s + r.sGrade, 0);
  const totalOcean = rows.reduce((s, r) => s + r.oceanWater, 0);
  const stats: [string, string][] = [
    ["成功着陆", `${landedCount}/${MISSION_ORDER.length}`],
    ["成就解锁", `${achievementCount}/${ACHIEVEMENT_TOTAL}`],
    ["采集样品", `${totalSamples}`],
    ["S 级藏品", `${totalS}`],
    ["海洋水样", `${totalOcean}`],
  ];
  const statY = 408;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, statY - 42);
  ctx.lineTo(CARD_W - 56, statY - 42);
  ctx.stroke();
  stats.forEach(([label, value], i) => {
    const cx = 110 + i * 180;
    ctx.fillStyle = primary;
    ctx.font = "bold 34px monospace";
    ctx.fillText(value, cx, statY);
    ctx.fillStyle = muted;
    ctx.font = "15px sans-serif";
    ctx.fillText(label, cx, statY + 30);
  });

  // 页脚称号
  const rank =
    landedCount >= MISSION_ORDER.length
      ? "四星统帅 · QUAD CROWN"
      : landedCount >= 3
        ? "三星统帅 · TRIPLE CROWN"
        : landedCount >= 2
          ? "双星指挥官 · DUAL COMMANDER"
          : landedCount === 1
            ? "星际先遣员 · PATHFINDER"
            : "地面值班员 · WATCH OFFICER";
  ctx.fillStyle = fg;
  ctx.font = "bold 22px monospace";
  ctx.fillText(`现任称号  ${rank}`, 56, 500);
  ctx.fillStyle = muted;
  ctx.font = "13px monospace";
  const dateText = new Date().toLocaleDateString("zh-CN");
  ctx.textAlign = "right";
  ctx.fillText(`GENERATED ${dateText} · RUNNINGHUB DEEP SPACE NETWORK`, CARD_W - 56, 500);
  ctx.textAlign = "left";
}

export function MissionOverview({ open, rows, achievementCount, onClose }: MissionOverviewProps) {
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!open) return;
    if (shareCanvasRef.current) drawShareCard(shareCanvasRef.current, rows, achievementCount);
  }, [open, rows, achievementCount]);
  if (!open) return null;
  const landedCount = rows.filter((r) => r.landed).length;
  const totalSamples = rows.reduce((s, r) => s + r.samples, 0);
  const totalAnalyzed = rows.reduce((s, r) => s + r.analyzed, 0);
  const totalOcean = rows.reduce((s, r) => s + r.oceanWater, 0);

  const downloadShareCard = () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "深空战报分享卡.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col animate-in fade-in zoom-in-95 rounded-lg border border-primary/40 bg-card p-6 shadow-xl duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="任务进度总览"
      >
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
              <Flag className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-card-foreground">
                任务进度总览 <span className="text-primary">·</span> MISSION PROGRESS
              </h2>
              <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
                深空指挥墙 · 全会话战果一览 · 实时结算
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

        {/* 全局统计条 */}
        <div className="ach-card-in mt-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: Rocket, label: "成功着陆", value: `${landedCount}/${MISSION_ORDER.length}`, accent: landedCount >= MISSION_ORDER.length },
            { icon: Trophy, label: "成就解锁", value: `${achievementCount}/${ACHIEVEMENT_TOTAL}`, accent: false },
            { icon: FlaskConical, label: "采集 / 化验", value: `${totalSamples} / ${totalAnalyzed}`, accent: false },
            { icon: Droplets, label: "海洋水样", value: `${totalOcean} 管`, accent: totalOcean > 0 },
          ].map((cell, i) => (
            <div
              key={cell.label}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`ach-card-in flex items-center gap-2.5 rounded-md border px-3 py-2 shadow-sm ${
                cell.accent ? "museum-rarity-s border-primary bg-primary/10" : "border-border bg-background/50"
              }`}
            >
              <cell.icon className={`h-4 w-4 shrink-0 ${cell.accent ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{cell.label}</p>
                <p className={`font-mono text-sm font-bold tabular-nums ${cell.accent ? "text-primary" : "text-card-foreground"}`}>
                  {cell.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid flex-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row, i) => (
            <div
              key={row.id}
              style={{ animationDelay: `${120 + i * 90}ms` }}
              className={`ach-card-in flex flex-col rounded-lg border p-4 shadow-md ${
                row.landed ? "border-primary/50 bg-background" : "border-border bg-background/60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold shadow-md ${
                    row.landed
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {row.badge}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold text-card-foreground">{row.code}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.title}</p>
                </div>
              </div>

              <p
                className={`mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest ${
                  row.landed
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : row.inProgress
                      ? "border-foreground/40 bg-secondary text-secondary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground"
                }`}
              >
                {row.landed ? "✓ 已着陆" : row.inProgress ? "飞行中" : "待点火"}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-xs">
                <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                  样品 <b className="tabular-nums text-primary">{row.samples}</b>
                </span>
                <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                  化验 <b className="tabular-nums text-primary">{row.analyzed}</b>
                </span>
                <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                  S 级 <b className="tabular-nums text-primary">{row.sGrade}</b>
                </span>
                <span className="rounded-sm bg-secondary/60 px-2 py-1 text-muted-foreground">
                  成就 <b className="tabular-nums text-primary">{row.achievements}</b>
                </span>
              </div>

              <ul className="mt-3 space-y-1.5 border-t border-border pt-3" aria-label={`${row.code} 关键里程碑`}>
                {milestone(row.landed, "完成软着陆")}
                {milestone(row.samples >= 3, "采集满 3 件样品")}
                {milestone(row.sGrade >= 1, "化验出 S 级藏品")}
                {milestone(row.special.done, row.special.label)}
                {milestone(row.achievements >= 5, "本任务解锁 5 枚成就")}
              </ul>
            </div>
          ))}
        </div>

        {/* 徽章墙分享卡：canvas 手绘战报图 + PNG 下载 */}
        <section
          aria-label="徽章墙分享卡"
          className="ach-card-in mt-4 shrink-0 rounded-lg border border-primary/30 bg-background/50 p-4 shadow-sm"
          style={{ animationDelay: "400ms" }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs tracking-widest text-muted-foreground">
              徽章墙分享卡 · BADGE WALL SHARE CARD
            </p>
            <button
              type="button"
              onClick={downloadShareCard}
              aria-label="下载战报分享卡 PNG"
              className="flex items-center gap-2 rounded-md border border-primary bg-primary px-3 py-1.5 font-mono text-xs font-bold tracking-widest text-primary-foreground shadow-md transition hover:bg-primary/90 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载分享卡 PNG
            </button>
          </div>
          <canvas
            ref={shareCanvasRef}
            width={CARD_W}
            height={CARD_H}
            className="w-full rounded-md border border-border shadow-md"
            aria-label="战报分享卡预览"
            role="img"
          />
        </section>
      </div>
    </div>
  );
}
