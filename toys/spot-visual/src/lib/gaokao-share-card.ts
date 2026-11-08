// 志愿探索分享卡导出：纯 canvas 2D 绘制（同 share-card.ts 的零外链策略）。
import QRCode from "qrcode";

export interface CardPick {
  tier: "reach" | "match" | "safe";
  name: string;
  minScore: number;
  gap: number; // 用户分 - 投档线
}

export interface CardSameRank {
  name: string;
  minScore: number;
  planCount: number;
}

export interface GaokaoShareCardInput {
  prov: string;
  cat: string;
  score: number;
  rank: number; // 0 = 无一分一段
  ctrl?: number; // 本科线
  year: number; // 数据年份
  counts: { reach: number; match: number; safe: number; out?: number };
  /** 同科类考生总数，用于算位次百分位 */
  totalRank?: number;
  /** 三档各取一所代表院校（分差最接近的） */
  picks?: CardPick[];
  /** 同分去向：位次 ±15% 内计划数最多的院校 */
  sameRank?: CardSameRank[];
}

const W = 720;
const H = 1000;
const PAD = 48;
const TIER_COLORS = {
  reach: "#F59E0B",
  match: "#10B981",
  safe: "#3B82F6",
} as const;
const TIER_SHORT = { reach: "冲", match: "稳", safe: "保" } as const;

export async function downloadGaokaoShareCard(input: GaokaoShareCardInput) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return;

  // 背景
  g.fillStyle = "#F8FAFC";
  g.fillRect(0, 0, W, H);

  // ── 顶部色带 ──
  const grad = g.createLinearGradient(0, 0, W, 260);
  grad.addColorStop(0, "#4338CA");
  grad.addColorStop(1, "#6366F1");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, 260);

  g.fillStyle = "rgba(255,255,255,.85)";
  g.font = "600 24px system-ui, sans-serif";
  g.fillText("志愿探索 · 分数位次 · 冲稳保", PAD, 66);

  g.fillStyle = "#FFFFFF";
  g.font = "700 56px system-ui, sans-serif";
  g.fillText(`${input.prov} · ${input.cat}`.slice(0, 14), PAD, 140);

  g.fillStyle = "rgba(255,255,255,.92)";
  g.font = "500 26px system-ui, sans-serif";
  const sub = input.rank
    ? `${input.score} 分 · 位次约 #${input.rank.toLocaleString()}`
    : `${input.score} 分 · 位次未知`;
  g.fillText(sub, PAD, 188);

  // 第二行标签：超线分差 / 位次百分位 / 数据年份
  const tags: string[] = [`${input.year} 年数据`];
  if (input.ctrl != null) {
    const d = input.score - input.ctrl;
    tags.unshift(d >= 0 ? `超本科线 ${d} 分` : `本科线下 ${-d} 分`);
  }
  if (input.rank && input.totalRank && input.totalRank > 0) {
    const pct = (input.rank / input.totalRank) * 100;
    tags.push(`位次前 ${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`);
  }
  let tx = PAD;
  g.font = "500 17px system-ui, sans-serif";
  for (const t of tags) {
    const w = g.measureText(t).width + 28;
    g.fillStyle = "rgba(255,255,255,.16)";
    roundRect(g, tx, 208, w, 32, 16);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.95)";
    g.fillText(t, tx + 14, 230);
    tx += w + 10;
  }

  // ── 冲稳保三档统计 ──
  const cards: [keyof typeof TIER_COLORS, string, string][] = [
    ["reach", "冲一冲", "投档线高 0~18 分"],
    ["match", "稳一稳", "投档线低 1~22 分"],
    ["safe", "保一保", "投档线低 23~55 分"],
  ];
  let x = PAD;
  for (const [k, label, hint] of cards) {
    g.fillStyle = "#FFFFFF";
    roundRect(g, x, 300, 192, 146, 16);
    g.fill();
    g.fillStyle = TIER_COLORS[k];
    roundRect(g, x + 20, 322, 44, 8, 4);
    g.fill();
    g.fillStyle = "#0F172A";
    g.font = "700 28px system-ui, sans-serif";
    g.fillText(label, x + 20, 372);
    g.font = "700 42px system-ui, sans-serif";
    g.fillStyle = TIER_COLORS[k];
    g.fillText(`${input.counts[k]} 所`, x + 20, 424);
    g.fillStyle = "#94A3B8";
    g.font = "400 14px system-ui, sans-serif";
    g.fillText(hint, x + 20, 442 - 6);
    x += 216;
  }

  // ── 三档代表院校 ──
  let y = 496;
  if (input.picks?.length) {
    sectionTitle(g, "三档最近的一所", y);
    y += 32;
    for (const p of input.picks) {
      const color = TIER_COLORS[p.tier];
      g.fillStyle = color;
      roundRect(g, PAD, y - 17, 26, 26, 7);
      g.fill();
      g.fillStyle = "#FFFFFF";
      g.font = "700 15px system-ui, sans-serif";
      g.fillText(TIER_SHORT[p.tier], PAD + 7, y + 2);

      g.fillStyle = "#0F172A";
      g.font = "600 21px system-ui, sans-serif";
      g.fillText(p.name.slice(0, 16), PAD + 38, y + 2);

      g.fillStyle = "#94A3B8";
      g.font = "400 17px system-ui, sans-serif";
      const gapText = p.gap >= 0 ? `低 ${p.gap} 分` : `差 ${-p.gap} 分`;
      const right = `投档 ${p.minScore} · ${gapText}`;
      g.fillText(right, W - PAD - g.measureText(right).width, y + 2);
      y += 38;
    }
    y += 8;
  }

  // ── 同分去向 ──
  if (input.sameRank?.length) {
    sectionTitle(g, "同分去向 · 这个位次的人去了哪里", y);
    y += 32;
    for (const s of input.sameRank.slice(0, 3)) {
      g.fillStyle = "#0F172A";
      g.font = "500 20px system-ui, sans-serif";
      g.fillText(s.name.slice(0, 16), PAD, y + 2);
      g.fillStyle = "#94A3B8";
      g.font = "400 17px system-ui, sans-serif";
      const right = s.planCount
        ? `${s.minScore} 分 · 招 ${s.planCount} 人`
        : `${s.minScore} 分`;
      g.fillText(right, W - PAD - g.measureText(right).width, y + 2);
      y += 32;
    }
    y += 6;
  }

  // ── 免责说明 ──
  g.fillStyle = "#94A3B8";
  g.font = "400 15px system-ui, sans-serif";
  const lines = [
    "投档线按院校专业组最低分归并；位次由一分一段表插值估算。",
    "第三方非官方数据（MIT），仅供演示，正式填报以省考试院为准。",
  ];
  for (const line of lines) {
    // wrapText 返回折行后的下一行基线，避免长句折行时与下一段叠字
    y = wrapText(g, line, PAD, y, W - 240, 24) + 24;
  }

  // ── 角标 ──
  g.fillStyle = "#E2E8F0";
  g.fillRect(PAD, H - 128, W - PAD * 2, 1);
  g.fillStyle = "#4338CA";
  g.font = "700 22px system-ui, sans-serif";
  g.fillText("#WorkBuddy  #1024程序员节", PAD, H - 60);

  // 右下角二维码：扫码直达当前省市科类分数
  try {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      const qr = await QRCode.toDataURL(url, {
        width: 140,
        margin: 1,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.src = qr;
      });
      g.fillStyle = "#ffffff";
      roundRect(g, W - 168, H - 168, 152, 152, 12);
      g.fill();
      g.drawImage(img, W - 162, H - 162, 140, 140);
      g.fillStyle = "#94a3b8";
      g.font = "400 13px system-ui, sans-serif";
      g.fillText("扫码直达", W - 154, H - 176);
    }
  } catch {}

  const a = document.createElement("a");
  a.download = `志愿探索-${input.prov}-${input.score}分.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

function sectionTitle(g: CanvasRenderingContext2D, text: string, y: number) {
  g.fillStyle = "#64748B";
  g.font = "600 16px system-ui, sans-serif";
  g.fillText(text, PAD, y);
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
): number {
  let line = "";
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) {
      g.fillText(line, x, y);
      line = ch;
      y += lh;
    } else {
      line += ch;
    }
  }
  if (line) g.fillText(line, x, y);
  return y;
}
