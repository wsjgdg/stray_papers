// 生涯总览分享卡：生涯统计弹层一键生成 900×1200 canvas 生涯卡（纯前端绘制 + PNG 下载）。
// 内容：星空底纹 + 标头 + 生涯称号/功勋 + 成就解锁率环形图 + 四格核心数据 +
// 五天体着陆次数逐行 + 每日挑战 / 拉力纪录 / 泰坦雾情 + 落款。
// 复用战报卡的 portal / ESC capture / 下载模式；颜色全部 tokenHsl 派生（禁 hex）。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playRoverFlash } from "@/lib/missionAudio";
import { MISSIONS, MISSION_ORDER } from "@/lib/missions";
import { drawPlanetEmblem } from "@/lib/cardArt";
import { tokenHsl } from "@/lib/themeColors";
import type { CareerSnapshot } from "@/lib/dscSave";

const CARD_W = 900;
const CARD_H = 1200;

/** 确定性伪随机（星空每次渲染一致） */
function seededRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawCard(cv: HTMLCanvasElement, snap: CareerSnapshot, title: { name: string; en: string }): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const c = snap.career;
  const fg = tokenHsl("--card-foreground");
  const muted = tokenHsl("--muted-foreground");
  const primary = tokenHsl("--primary");
  const bg = tokenHsl("--background");
  const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const SANS = "system-ui, -apple-system, sans-serif";

  // 底 + 顶部辉光 + 星空 + 外框
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, -120, 40, CARD_W / 2, -120, 700);
  glow.addColorStop(0, tokenHsl("--primary", 0.18));
  glow.addColorStop(1, tokenHsl("--primary", 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 620);
  const rand = seededRand(7919 + snap.merit * 104729);
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = tokenHsl("--card-foreground", 0.06 + rand() * 0.2);
    ctx.beginPath();
    ctx.arc(rand() * CARD_W, rand() * CARD_H, 0.5 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = tokenHsl("--primary", 0.45);
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, CARD_W - 36, CARD_H - 36);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 标头 + 称号 + 功勋
  ctx.fillStyle = muted;
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText("深空指挥墙 · CAREER DOSSIER", CARD_W / 2, 78);
  ctx.fillStyle = primary;
  ctx.font = `bold 58px ${SANS}`;
  ctx.fillText(title.name, CARD_W / 2, 158);
  ctx.fillStyle = muted;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(title.en, CARD_W / 2, 196);
  ctx.fillStyle = fg;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(`累计功勋 ${snap.merit}`, CARD_W / 2, 244);

  // 成就解锁率环形图（左）
  const rcx = 212;
  const rcy = 392;
  const rr = 84;
  const ratio = snap.achTotal > 0 ? Math.min(1, snap.achCount / snap.achTotal) : 0;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.strokeStyle = tokenHsl("--muted-foreground", 0.2);
  ctx.beginPath();
  ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
  ctx.stroke();
  if (ratio > 0) {
    ctx.strokeStyle = primary;
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.fillStyle = primary;
  ctx.font = `bold 46px ${MONO}`;
  ctx.fillText(`${snap.achCount}`, rcx, rcy + 8);
  ctx.fillStyle = muted;
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText(`/ ${snap.achTotal} 成就解锁`, rcx, rcy + 42);

  // 四格核心数据（右）
  const landingsTotal = MISSION_ORDER.reduce((s, id) => s + (c.landings[id] ?? 0), 0);
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "着陆总次数", value: `${landingsTotal}`, sub: "五大天体表面" },
    { label: "生涯总里程", value: `${(c.odometerM / 1000).toFixed(1)} km`, sub: "巡视车累计" },
    { label: "样品登记", value: `${c.samples} 件`, sub: `S 级 ${c.sGrade} · 化验 ${c.analyzed}` },
    {
      label: "历史最佳",
      value: c.bestTotal != null ? `${c.bestTotal} 分` : "—",
      sub: c.bestGrade ? `评级 ${c.bestGrade}` : "尚无结算纪录",
    },
  ];
  tiles.forEach((t, i) => {
    const x = 380 + (i % 2) * 232;
    const y = 316 + Math.floor(i / 2) * 108;
    ctx.fillStyle = tokenHsl("--muted-foreground", 0.1);
    ctx.beginPath();
    ctx.roundRect(x, y, 216, 94, 10);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = `600 17px ${SANS}`;
    ctx.fillText(t.label, x + 16, y + 28);
    ctx.fillStyle = primary;
    ctx.font = `bold 30px ${MONO}`;
    ctx.fillText(t.value, x + 16, y + 62);
    ctx.fillStyle = muted;
    ctx.font = `500 15px ${SANS}`;
    ctx.fillText(t.sub, x + 16, y + 84);
    ctx.textAlign = "center";
  });

  // 五天体着陆次数逐行（迷你横条按最多着陆地归一）
  const rowTop = 566;
  const rowH = 46;
  const maxLand = Math.max(1, ...MISSION_ORDER.map((id) => c.landings[id] ?? 0));
  MISSION_ORDER.forEach((id, i) => {
    const m = MISSIONS[id];
    const n = c.landings[id] ?? 0;
    const y = rowTop + i * rowH;
    // 行首该天体专属色小行星圆盘（泰坦带环）
    drawPlanetEmblem(ctx, 84, y + 17, 15, m.visual);
    ctx.textAlign = "left";
    ctx.fillStyle = n > 0 ? fg : muted;
    ctx.font = `600 21px ${MONO}`;
    ctx.fillText(m.code, 118, y + 22);
    ctx.fillStyle = tokenHsl("--muted-foreground", 0.2);
    ctx.beginPath();
    ctx.roundRect(280, y + 10, 400, 14, 7);
    ctx.fill();
    if (n > 0) {
      ctx.fillStyle = n === maxLand ? primary : tokenHsl("--primary", 0.6);
      ctx.beginPath();
      ctx.roundRect(280, y + 10, Math.max(14, (n / maxLand) * 400), 14, 7);
      ctx.fill();
    }
    ctx.textAlign = "right";
    ctx.fillStyle = n > 0 ? primary : muted;
    ctx.font = `bold 22px ${MONO}`;
    ctx.fillText(`×${n}`, 790, y + 24);
  });
  ctx.textAlign = "center";

  // 玩法累计行
  let lineY = rowTop + MISSION_ORDER.length * rowH + 44;
  ctx.fillStyle = fg;
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText(
    `每日挑战 完成 ${c.dailyCompletions} · 连击 ${c.dailyStreak} · 最佳 ${c.dailyBestStreak}`,
    CARD_W / 2,
    lineY,
  );
  lineY += 44;
  const fmtRally = (v: number | null) => (v != null ? `${v.toFixed(1)}s` : "—");
  ctx.fillStyle = muted;
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText(
    `拉力赛最佳 · 正序 ${fmtRally(snap.rally.std)} · 倒序 ${fmtRally(snap.rally.rev)} · 夜航 ${fmtRally(snap.rally.night)}`,
    CARD_W / 2,
    lineY,
  );
  if (c.fogTimeS > 0) {
    lineY += 44;
    ctx.fillText(
      `泰坦雾情 · 作业 ${Math.floor(c.fogTimeS / 60)} 分 ${c.fogTimeS % 60} 秒 · 雾中样品 ${c.fogSamples} 件`,
      CARD_W / 2,
      lineY,
    );
  }

  // 稀有成就栏：标题 + 名称 chips 自动换行（至多两行且不压分隔线, 溢出收进「+N 枚」）
  lineY += 52;
  ctx.fillStyle = muted;
  ctx.font = `600 20px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(`RARE ACHIEVEMENTS · 稀有成就 ${snap.rareUnlocked.length}/${snap.rareTotal}`, CARD_W / 2, lineY);
  if (snap.rareUnlocked.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = `500 20px ${SANS}`;
    ctx.fillText(`尚未解锁稀有成就 · ${snap.rareTotal} 枚徽章待收集`, CARD_W / 2, lineY + 42);
  } else {
    const names = snap.rareUnlocked;
    const chipH = 36;
    const gapX = 12;
    const gapY = 12;
    const maxW = 740;
    const bottomLimit = 1052; // 分隔线之上
    ctx.font = `bold 19px ${SANS}`;
    const widths = names.map((n) => ctx.measureText(`★ ${n}`).width + 34);
    // 折行
    const rowsAll: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    names.forEach((_, i) => {
      const w = widths[i];
      if (cur.length > 0 && curW + gapX + w > maxW) {
        rowsAll.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(i);
      curW += (cur.length > 1 ? gapX : 0) + w;
    });
    if (cur.length > 0) rowsAll.push(cur);
    // 行数受底部空间约束
    const rows = rowsAll.filter((_, ri) => lineY + 26 + ri * (chipH + gapY) + chipH <= bottomLimit);
    let hidden = names.length - rows.reduce((s, r) => s + r.length, 0);
    rows.forEach((row, ri) => {
      const totalW = row.reduce((s, i) => s + widths[i], 0) + gapX * (row.length - 1);
      let x = (CARD_W - totalW) / 2;
      const y = lineY + 26 + ri * (chipH + gapY);
      row.forEach((i) => {
        const w = widths[i];
        ctx.fillStyle = tokenHsl("--primary", 0.12);
        ctx.beginPath();
        ctx.roundRect(x, y, w, chipH, 9);
        ctx.fill();
        ctx.strokeStyle = tokenHsl("--primary", 0.5);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = primary;
        ctx.textAlign = "center";
        ctx.fillText(`★ ${names[i]}`, x + w / 2, y + 25);
        x += w + gapX;
      });
    });
    if (hidden > 0) {
      const moreY = lineY + 26 + rows.length * (chipH + gapY) + 18;
      if (moreY <= bottomLimit) {
        ctx.fillStyle = muted;
        ctx.textAlign = "center";
        ctx.font = `600 18px ${SANS}`;
        ctx.fillText(`另有 ${hidden} 枚稀有成就已解锁`, CARD_W / 2, moreY);
      } else {
        // 空间不足时把溢出数并进标题行末
        hidden = 0;
      }
    }
    ctx.textAlign = "center";
  }

  // 分隔线 + 落款
  ctx.strokeStyle = tokenHsl("--primary", 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(140, CARD_H - 130);
  ctx.lineTo(CARD_W - 140, CARD_H - 130);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = `600 20px ${MONO}`;
  const day = new Date();
  const dateText = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  ctx.fillText(`${dateText} · 值班席位认证 · 深空指挥墙`, CARD_W / 2, CARD_H - 76);
}

interface CareerShareCardProps {
  snap: CareerSnapshot;
  /** 生涯称号（由 CareerStats 计算后传入, 避免循环依赖） */
  title: { name: string; en: string };
  onClose: () => void;
}

/** 生涯卡预览层（portal 到 body, z 高于弹层）：canvas 预览 + 保存 PNG + 返回 */
export function CareerShareCard({ snap, title, onClose }: CareerShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (cv) drawCard(cv, snap, title);
  }, [snap, title]);

  // ESC 只关卡片层（capture 拦截, 不透传全局关闭链）
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
      a.download = `career-${snap.merit}.png`;
      a.click();
      playRoverFlash();
    } catch {
      // 纯前端本地绘制, 导出失败静默
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
        aria-label="生涯总览分享卡"
      >
        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          className="max-h-[68vh] w-auto max-w-full rounded-lg border border-primary/40 object-contain shadow-xl"
          aria-label="生涯卡片预览"
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
