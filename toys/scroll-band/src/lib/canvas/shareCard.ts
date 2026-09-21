// 滚动乐团 · 封面分享图
// 把作曲画布上的线与锚点渲染成一张 16:9 分享卡 PNG（配 .wav 音频一起发），
// 配色全部取自已烧进 :root 的设计 token（CSS 变量存的是 hsl 三元组，需包一层 hsl()）。

import { CURVE_PARAM_META, type CanvasObject } from "@/lib/canvas/scoreCanvas";

const W = 1200;
const H = 675;

function token(name: string, fallback: string): string {
  const raw = window
    .getComputedStyle(window.document.documentElement)
    .getPropertyValue(name)
    .trim();
  // 兼容两种写法：纯三元组「220 13% 14%」或完整颜色「hsl(...)」
  if (!raw) return fallback;
  return raw.startsWith("#") || raw.includes("hsl") || raw.includes("rgb")
    ? raw
    : `hsl(${raw})`;
}

export function renderShareCard(
  objs: CanvasObject[],
  meta: { title: string; info: string },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas 不可用"));

  const bg = token("--background", "black");
  const primary = token("--primary", "white");
  const muted = token("--muted-foreground", "gray");
  const border = token("--border", "gray");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 外框（演出票根感）
  ctx.strokeStyle = primary;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.globalAlpha = 1;

  // 音阶参考线（横平线 = 音阶级，和舞台同款语言）
  const PAD_X = 70;
  const TOP = 150;
  const BOT = H - 130;
  const degs = 5;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i <= degs; i += 1) {
    const y = TOP + ((BOT - TOP) * i) / degs;
    ctx.beginPath();
    ctx.moveTo(PAD_X, y);
    ctx.lineTo(W - PAD_X, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 画布对象：x,y 归一化 → 卡面中部（y 小 = 高音 = 靠上，与舞台一致）
  const mapX = (x: number) => PAD_X + x * (W - PAD_X * 2);
  const mapY = (y: number) => TOP + y * (BOT - TOP);
  for (const o of objs) {
    const pts = o.points;
    if (pts.length === 0) continue;
    if (o.type === "stroke") {
      // 光晕层 + 主体层两遍描线，模拟舞台辉光
      for (const pass of [
        { alpha: 0.14, width: 14 },
        { alpha: 1, width: 3.5 },
      ] as const) {
        ctx.strokeStyle = primary;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = pass.alpha;
        ctx.lineWidth = pass.width;
        ctx.beginPath();
        ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (o.type === "curve") {
      // 参数曲线：细虚线（参数固定色相，与舞台虚线同语言）+ 起点参数名
      const hue = o.curveParam ? CURVE_PARAM_META[o.curveParam].hue : 196;
      ctx.strokeStyle = `hsla(${hue}, 85%, 70%, 0.85)`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 9]);
      ctx.beginPath();
      ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `hsla(${hue}, 85%, 74%, 0.9)`;
      ctx.font = "22px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(o.curveParam ? CURVE_PARAM_META[o.curveParam].name : "曲线", mapX(pts[0].x) + 6, mapY(pts[0].y) - 14);
    } else {
      const v = o.audio.velocityCurve[0] ?? 0.5;
      ctx.fillStyle = primary;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(mapX(pts[0].x), mapY(pts[0].y), 10 + 14 * v, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(mapX(pts[0].x), mapY(pts[0].y), 6 + 6 * v, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 文案：标题 + 设置信息 + 落款
  ctx.textBaseline = "middle";
  ctx.fillStyle = primary;
  ctx.font = "bold 52px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(meta.title, PAD_X, 84);
  ctx.fillStyle = muted;
  ctx.font = "26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(meta.info, PAD_X, H - 78);
  ctx.textAlign = "right";
  ctx.fillStyle = primary;
  ctx.globalAlpha = 0.8;
  ctx.font = "bold 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("SCROLL ORCHESTRA", W - PAD_X, H - 78);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("导出失败"))), "image/png");
  });
}
