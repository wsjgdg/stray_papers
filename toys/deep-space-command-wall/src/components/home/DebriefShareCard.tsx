// 战报分享卡片：结算单一键生成 900×1200 canvas 战报图（纯前端绘制 + PNG 下载）。
// 内容：星空底纹 + 标头 + 任务代号/标题 + 评级圆章 + 总分 + NEW RECORD/历史最佳 +
// 五维横条 + 本场亮点 chips + 玩法称号 + 排行榜名次 + 落款。
// 颜色全部经 tokenHsl 从已烧 token 派生（禁 hex）；下载成功播 playRoverFlash。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playRoverFlash } from "@/lib/missionAudio";
import { MISSIONS } from "@/lib/missions";
import { drawPlanetEmblem } from "@/lib/cardArt";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";
import type { DebriefData } from "@/components/home/MissionDebrief";

const CARD_W = 900;
const CARD_H = 1200;

/** 确定性伪随机（卡片星空每次渲染一致, 不随 Math.random 抖动） */
function seededRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawCard(cv: HTMLCanvasElement, data: DebriefData): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const fg = tokenHsl("--card-foreground");
  const muted = tokenHsl("--muted-foreground");
  const bg = tokenHsl("--background");
  // 任务专属强调色：按任务代号找到 MissionVisual, 用星球主色源 token 调相派生（月球冷灰 / 火星红橙 / 欧罗巴冰蓝 / 金星琥珀 / 泰坦橙褐）; 找不到时回退 primary
  const mission = Object.values(MISSIONS).find((m) => m.code === data.missionCode);
  const acc = (alpha = 1): string =>
    mission
      ? tokenShiftHsl(
          mission.visual.hueSourceVar,
          { hue: mission.visual.hueShift, sat: mission.visual.satScale, light: mission.visual.lightScale },
          alpha,
        )
      : tokenHsl("--primary", alpha);
  const primary = acc();

  // 底 + 顶部主色辉光 + 星空
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, -120, 40, CARD_W / 2, -120, 700);
  glow.addColorStop(0, acc(0.22));
  glow.addColorStop(1, acc(0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 620);
  const rand = seededRand(data.total * 7919 + data.missionCode.length * 104729);
  for (let i = 0; i < 110; i++) {
    const x = rand() * CARD_W;
    const y = rand() * CARD_H;
    const r = 0.5 + rand() * 1.6;
    ctx.fillStyle = tokenHsl("--card-foreground", 0.06 + rand() * 0.22);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 外框
  ctx.strokeStyle = acc(0.45);
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, CARD_W - 36, CARD_H - 36);

  // 左上任务 badge 圆章 + 右上行星徽标（泰坦带环）
  if (mission) {
    ctx.beginPath();
    ctx.arc(104, 104, 32, 0, Math.PI * 2);
    ctx.fillStyle = acc(0.1);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = acc(0.55);
    ctx.stroke();
    ctx.fillStyle = primary;
    ctx.font = "bold 26px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(mission.badge, 104, 113);
    drawPlanetEmblem(ctx, CARD_W - 104, 104, 34, mission.visual);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 标头
  ctx.fillStyle = muted;
  ctx.font = "600 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("深空指挥墙 · DEEP SPACE COMMAND", CARD_W / 2, 78);
  ctx.fillStyle = fg;
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${data.missionCode} · ${data.missionTitle}`, CARD_W / 2, 130);

  // 评级圆章（S 级双层描边强调）
  const cy = 268;
  ctx.beginPath();
  ctx.arc(CARD_W / 2, cy, 84, 0, Math.PI * 2);
  ctx.fillStyle = acc(0.12);
  ctx.fill();
  ctx.lineWidth = data.grade === "S" ? 8 : 5;
  ctx.strokeStyle = primary;
  ctx.stroke();
  if (data.grade === "S") {
    ctx.beginPath();
    ctx.arc(CARD_W / 2, cy, 96, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = acc(0.5);
    ctx.stroke();
  }
  ctx.fillStyle = primary;
  ctx.font = "bold 96px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(data.grade, CARD_W / 2, cy + 34);

  // 总分
  ctx.fillStyle = muted;
  ctx.font = "600 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("综合评分 TOTAL SCORE", CARD_W / 2, 424);
  ctx.fillStyle = primary;
  ctx.font = "bold 88px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(String(data.total), CARD_W / 2 - 30, 512);
  ctx.fillStyle = muted;
  ctx.font = "600 30px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText("/100", CARD_W / 2 + 62, 512);
  ctx.textAlign = "center";
  if (data.isRecord) {
    ctx.fillStyle = primary;
    ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
    ctx.fillText("★ NEW RECORD · 刷新本任务历史最佳", CARD_W / 2, 562);
  } else if (data.best) {
    ctx.fillStyle = muted;
    ctx.font = "600 22px system-ui, -apple-system, sans-serif";
    const diff = data.total - data.best.total;
    ctx.fillText(
      `历史最佳 ${data.best.grade} · ${data.best.total} 分 · 本次 ${diff >= 0 ? "+" : ""}${diff} 分`,
      CARD_W / 2,
      562,
    );
  }

  // 五维评分横条
  const barTop = 616;
  const rowH = 54;
  data.dims.forEach((dim, i) => {
    const y = barTop + i * rowH;
    ctx.textAlign = "left";
    ctx.fillStyle = fg;
    ctx.font = "600 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(dim.label, 90, y + 20);
    // 轨道
    const bx = 280;
    const bw = 470;
    ctx.fillStyle = tokenHsl("--muted-foreground", 0.22);
    ctx.beginPath();
    ctx.roundRect(bx, y + 6, bw, 16, 8);
    ctx.fill();
    // 得分条
    const w = Math.max(8, (Math.min(100, Math.max(0, dim.score)) / 100) * bw);
    ctx.fillStyle = dim.score >= 80 ? primary : dim.score >= 50 ? acc(0.6) : tokenHsl("--destructive", 0.75);
    ctx.beginPath();
    ctx.roundRect(bx, y + 6, w, 16, 8);
    ctx.fill();
    // 分数
    ctx.textAlign = "right";
    ctx.fillStyle = primary;
    ctx.font = "bold 24px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(String(dim.score), CARD_W - 90, y + 24);
  });
  ctx.textAlign = "center";

  // 本场亮点 chips（与弹层同规则提炼, 至多 3 条）
  const highlights: string[] = [];
  if (data.isRecord) highlights.push("刷新历史最佳");
  if (data.grade === "S") highlights.push("综合评级 S");
  if (data.stats.sGrade > 0) highlights.push(`S 级样品 ×${data.stats.sGrade}`);
  if (data.stats.alarms > 0 && data.stats.acks >= data.stats.alarms) highlights.push("警报全处置");
  if (data.stats.evades >= 3) highlights.push(`裂隙规避 ×${data.stats.evades}`);
  const chips = highlights.slice(0, 3);
  const chipY = barTop + data.dims.length * rowH + 44;
  if (chips.length > 0) {
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
    const widths = chips.map((c) => ctx.measureText(`★ ${c}`).width + 44);
    const gap = 18;
    let x = (CARD_W - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1))) / 2;
    chips.forEach((c, i) => {
      const w = widths[i];
      ctx.fillStyle = acc(0.12);
      ctx.beginPath();
      ctx.roundRect(x, chipY - 26, w, 40, 10);
      ctx.fill();
      ctx.strokeStyle = acc(0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = primary;
      ctx.textAlign = "center";
      ctx.fillText(`★ ${c}`, x + w / 2, chipY + 2);
      x += w + gap;
    });
  }

  // 称号 + 排行榜名次
  const rank = data.board.find((r) => r.isPlayer)?.rank;
  const lineY = chipY + 88;
  ctx.textAlign = "center";
  ctx.fillStyle = fg;
  ctx.font = "600 24px system-ui, -apple-system, sans-serif";
  const parts: string[] = [`称号 · ${data.playTitle}`];
  if (rank !== undefined) parts.push(`全球值班网络 第 ${rank} 名`);
  ctx.fillText(parts.join("    "), CARD_W / 2, lineY);

  // 落款
  ctx.fillStyle = muted;
  ctx.font = "600 20px ui-monospace, SFMono-Regular, Menlo, monospace";
  const day = new Date();
  const dateText = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  ctx.fillText(`${dateText} · 值班席位认证 · 深空指挥墙`, CARD_W / 2, CARD_H - 62);
}

interface DebriefShareCardProps {
  data: DebriefData;
  onClose: () => void;
}

/** 分享卡片预览层（z 高于结算弹层）：canvas 预览 + 保存 PNG + 返回 */
export function DebriefShareCard({ data, onClose }: DebriefShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (cv) drawCard(cv, data);
  }, [data]);

  // ESC 只关卡片层（capture 阶段拦截, 不透传给全局弹层关闭链）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const handleDownload = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png");
      a.download = `debrief-${data.missionCode}-${data.total}.png`;
      a.click();
      playRoverFlash();
    } catch {
      // canvas 导出失败时静默（纯前端本地绘制理论上不会污染画布）
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-sm flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="战报分享卡片"
      >
        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          className="max-h-[68vh] w-auto max-w-full rounded-lg border border-primary/40 object-contain shadow-xl"
          aria-label="战报卡片预览"
        />
        <div className="flex w-full justify-center gap-2">
          <Button size="sm" onClick={handleDownload} className="bg-primary font-mono text-primary-foreground focus-visible:shadow-focus">
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            保存 PNG
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="border-border font-mono focus-visible:shadow-focus">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            返回
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
