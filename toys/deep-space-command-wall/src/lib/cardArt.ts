// 分享卡片共享绘制件：行星徽标。按 MissionVisual 从已烧 token 派生球体色
// （tokenShiftHsl, 禁 hex），径向渐变高光/暗缘 + dustAlpha 大气辉光,
// 泰坦额外画倾斜椭圆环（土星系意象）。供 DebriefShareCard / CareerShareCard 复用。
import type { MissionVisual } from "@/lib/missions";
import { tokenShiftHsl } from "@/lib/themeColors";

interface EmblemOpts {
  /** 绘制倾斜椭圆环（默认按 visual.planet === "titan" 自动决定, 可显式覆盖） */
  ring?: boolean;
}

/**
 * 在 (x, y) 画半径 r 的行星徽标。
 * 球体色 = hueSourceVar 按 hueShift/satScale/lightScale 调相; 高光提亮、暗缘压暗、辉光取 dustAlpha。
 */
export function drawPlanetEmblem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  visual: MissionVisual,
  opts: EmblemOpts = {},
): void {
  const shift = { hue: visual.hueShift, sat: visual.satScale, light: visual.lightScale };
  const base = tokenShiftHsl(visual.hueSourceVar, shift);
  const lit = tokenShiftHsl(visual.hueSourceVar, { ...shift, light: visual.lightScale * 1.3 });
  const dark = tokenShiftHsl(visual.hueSourceVar, { ...shift, light: visual.lightScale * 0.55 });

  // 大气辉光（dustAlpha=0 时给一层极淡的同色晕, 保证深色天体也有轮廓感）
  const glowA = Math.max(visual.dustAlpha, 0.12);
  const glow = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.9);
  glow.addColorStop(0, tokenShiftHsl(visual.hueSourceVar, shift, glowA));
  glow.addColorStop(1, tokenShiftHsl(visual.hueSourceVar, shift, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  // 环的后半段（球体之下, 先画被球挡住的上半弧）
  const ring = opts.ring ?? visual.planet === "titan";
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.strokeStyle = tokenShiftHsl(visual.hueSourceVar, shift, 0.55);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.75, r * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 球体：左上高光 → 基色 → 右下暗缘
  const disc = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  disc.addColorStop(0, lit);
  disc.addColorStop(0.55, base);
  disc.addColorStop(1, dark);
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // 环的前半段（球体之上）
  if (ring) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.strokeStyle = tokenShiftHsl(visual.hueSourceVar, shift, 0.8);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.75, r * 0.55, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }
}
