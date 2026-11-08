// 任务结算单弹层：着陆后自动出具——五维评分（着陆精度/警报响应/样品质量/驾驶行为/危机处置）
// + 综合评级翻牌揭晓 + 历史最佳对比 + 数据 chips + 全球值班网络排行榜（前端模拟席位, 无后端）+ 总评一句话。
// 演出升级：总分数字滚动上升 / 维度条从 0 展开 / 破纪录维度 NEW 徽标 / 本场亮点 chips /
// 排行榜玩家行滚动到可视区 + 开场音效（whoosh / 破纪录 ding / S 级金光音）。
// reducedMotion 开启时全部瞬时呈现。颜色全部 token 类。
import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Crown, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playDebriefWhoosh, playGradeSShine, playRecordDing, playVictoryFanfare } from "@/lib/missionAudio";
import { DebriefShareCard } from "@/components/home/DebriefShareCard";

export interface DebriefDim {
  label: string;
  labelEn: string;
  score: number;
  /** 该维度历史最佳分（本任务此前结算记录, 首次结算为空） */
  best?: number | null;
}

export interface DebriefData {
  missionCode: string;
  missionTitle: string;
  grade: "S" | "A" | "B" | "C" | "D";
  total: number;
  comment: string;
  /** 本次总分是否刷新本任务历史最佳 */
  isRecord: boolean;
  /** 本次结算前的历史最佳（首次结算为空） */
  best: { total: number; grade: string } | null;
  dims: DebriefDim[];
  /** 全球值班网络排行榜（玩家席位已插入, 按总分降序） */
  board: { rank: number; name: string; score: number; isPlayer: boolean }[];
  stats: {
    landingText: string;
    samples: number;
    sGrade: number;
    acks: number;
    alarms: number;
    evades: number;
    rallyBestText: string;
    crisisText: string;
    /** 发电账本：巡视车太阳能累计发电与积尘折损 */
    genText: string;
    /** 金星热管理统计（仅 VNS-1 结算: 过热/应急散热/峰值热负载, 其他任务为 undefined 不渲染） */
    thermalText?: string;
  };
  /** 值班玩法盘点：本次任务各交互事件的完成计数 + 会话历史最佳（流星/演练/握手/诊断/抽问/天线/极光） */
  plays: { label: string; value: string; best?: number }[];
  /** 玩法称号评定（七项计数总和分档：围观群众/新锐值班员/熟练老手/王牌值班手/值班厅之王） */
  playTitle: string;
  /** 本次称号档位高于上次结算：盘点行播「称号晋升」流光动画 */
  playTitlePromoted: boolean;
}

interface MissionDebriefProps {
  open: boolean;
  data: DebriefData | null;
  onClose: () => void;
  /** 减弱动画：全部演出瞬时呈现（数字不滚动 / 维度条不展开 / 不平滑滚动） */
  reducedMotion?: boolean;
}

/** 弹层内芯（含全部演出 hooks; 外层按 open/data 条件渲染, key 换局重挂载） */
function DebriefBody({ data, reducedMotion }: { data: DebriefData; reducedMotion: boolean }) {
  // 开场音效：whoosh 即响; 凯旋号角 200ms 跟进（上行琶音 + 定音鼓 + 长延主和弦, 约 3.2s）;
  // S 级金光音与破纪录 ding 顺延到号角延音段, 避免撞车（减弱动画只关视觉, 音效照播）
  useEffect(() => {
    playDebriefWhoosh();
    const timers: number[] = [window.setTimeout(playVictoryFanfare, 200)];
    if (data.grade === "S") timers.push(window.setTimeout(playGradeSShine, 1600));
    if (data.isRecord) timers.push(window.setTimeout(playRecordDing, 2200));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [data]);

  // 总分数字滚动上升（800ms 缓出）+ 维度条延迟展开触发
  const [shownTotal, setShownTotal] = useState(reducedMotion ? data.total : 0);
  const [revealed, setRevealed] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setShownTotal(data.total);
      setRevealed(true);
      return;
    }
    const revealRaf = requestAnimationFrame(() => setRevealed(true));
    const t0 = performance.now();
    const dur = 800;
    let countRaf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setShownTotal(Math.round(data.total * (1 - Math.pow(1 - k, 3))));
      if (k < 1) countRaf = requestAnimationFrame(step);
    };
    countRaf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(revealRaf);
      cancelAnimationFrame(countRaf);
    };
  }, [data, reducedMotion]);

  // 排行榜玩家行：入场后滚动到可视区并闪一次高亮
  const playerRowRef = useRef<HTMLDivElement | null>(null);
  const [playerFlash, setPlayerFlash] = useState(false);
  useEffect(() => {
    const el = playerRowRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
      if (!reducedMotion) {
        setPlayerFlash(true);
        window.setTimeout(() => setPlayerFlash(false), 1200);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  // 分享卡片预览层开关
  const [shareOpen, setShareOpen] = useState(false);

  // 本场亮点：从结算数据提炼最突出的至多 3 条
  const highlights: string[] = [];
  if (data.isRecord) highlights.push("刷新本任务历史最佳");
  if (data.grade === "S") highlights.push("综合评级 S · 王牌值班");
  if (data.stats.sGrade > 0) highlights.push(`S 级样品 ×${data.stats.sGrade}`);
  if (data.stats.alarms > 0 && data.stats.acks >= data.stats.alarms)
    highlights.push(`警报 ${data.stats.alarms} 条全部手动处置`);
  if (data.stats.evades >= 3) highlights.push(`裂隙规避 ×${data.stats.evades}`);
  const topHighlights = highlights.slice(0, 3);

  return (
    <>
      <div className="ach-card-in flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary shadow-md">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-card-foreground">
              任务结算单 <span className="text-primary">·</span> MISSION DEBRIEF
            </h2>
            <p className="mt-0.5 font-mono text-xs tracking-widest text-muted-foreground">
              {data.missionCode} · {data.missionTitle}
            </p>
          </div>
        </div>
      </div>

      {/* 综合评级翻牌 + 总分（数字滚动上升） */}
      <div className="ach-card-in mt-4 flex items-center gap-4" style={{ animationDelay: "120ms" }}>
        <div className="grade-flip relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-lg">
          {data.grade === "S" && (
            <>
              <span className="grade-sparkle gsf-1 pointer-events-none absolute top-2" aria-hidden="true" />
              <span className="grade-sparkle gsf-2 pointer-events-none absolute top-0" aria-hidden="true" />
              <span className="grade-sparkle gsf-3 pointer-events-none absolute top-4" aria-hidden="true" />
            </>
          )}
          <span className="font-display text-5xl font-bold">{data.grade}</span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-widest text-muted-foreground">综合评分 TOTAL SCORE</p>
          <p className="font-display text-4xl font-bold tabular-nums text-primary">
            {shownTotal}
            <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-card-foreground">{data.comment}</p>
          {data.isRecord ? (
            <p className="museum-rarity-s relative mt-1.5 inline-block overflow-hidden rounded-sm border border-primary bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-primary">
              <span className="museum-shine pointer-events-none absolute -inset-y-6 left-0 w-1/3" aria-hidden="true" />
              ★ NEW RECORD · 刷新本任务历史最佳
            </p>
          ) : data.best ? (
            <p className="mt-1.5 font-mono text-[10px] tracking-widest text-muted-foreground">
              历史最佳 {data.best.grade} · {data.best.total} 分 · 本次{" "}
              <b className={`tabular-nums ${data.total >= data.best.total ? "text-primary" : "text-destructive"}`}>
                {data.total - data.best.total >= 0 ? "+" : ""}
                {data.total - data.best.total}
              </b>{" "}
              分
            </p>
          ) : null}
        </div>
      </div>

      {/* 五维评分条（挂载后从 0 展开; 破纪录维度带 NEW 徽标） */}
      <div className="ach-card-in mt-4 rounded-lg border border-border bg-background/50 p-4" style={{ animationDelay: "220ms" }}>
        <p className="mb-3 font-mono text-xs tracking-widest text-muted-foreground">五维评分 · BY DIMENSION</p>
        <div className="space-y-2">
          {data.dims.map((dim, i) => {
            const dimRecord = dim.best != null && dim.score > dim.best;
            return (
              <div key={dim.labelEn} className="ach-card-in flex items-center gap-3" style={{ animationDelay: `${300 + i * 80}ms` }}>
                <span className="w-20 shrink-0 text-xs text-card-foreground">
                  {dim.label}
                  <span className="ml-1 font-mono text-[9px] tracking-widest text-muted-foreground">{dim.labelEn}</span>
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${dim.score >= 80 ? "bg-primary" : dim.score >= 50 ? "bg-primary/60" : "bg-destructive/70"}`}
                    style={{ width: `${revealed ? Math.max(2, Math.min(100, dim.score)) : 0}%`, transitionDelay: `${i * 80}ms` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right">
                  <span className="block font-mono text-xs font-bold tabular-nums text-primary">
                    {dim.score}
                    {dimRecord && (
                      <span className="museum-rarity-s relative ml-1 inline-block overflow-hidden rounded-sm border border-primary bg-primary/15 px-1 align-middle font-mono text-[8px] font-bold tracking-widest text-primary">
                        <span className="museum-shine pointer-events-none absolute -inset-y-4 left-0 w-1/3" aria-hidden="true" />
                        NEW
                      </span>
                    )}
                  </span>
                  {dim.best != null && (
                    <span className="block font-mono text-[8px] tabular-nums text-muted-foreground">最佳 {dim.best}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 数据 chips */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["着陆", data.stats.landingText],
          ["样品", `${data.stats.samples} 件 · S级 ${data.stats.sGrade}`],
          ["警报", `处置 ${data.stats.acks}/${data.stats.alarms}`],
          ["危机", data.stats.crisisText],
          ["规避", `${data.stats.evades} 次`],
          ["拉力赛", data.stats.rallyBestText],
          ["发电", data.stats.genText],
          ...(data.stats.thermalText ? ([["热管理", data.stats.thermalText]] as [string, string][]) : []),
        ].map(([label, value], i) => (
          <div
            key={label}
            className="ach-card-in rounded-md bg-secondary/60 px-2.5 py-1.5"
            style={{ animationDelay: `${700 + i * 60}ms` }}
          >
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate font-mono text-xs font-bold tabular-nums text-card-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* 本场亮点（结算数据里最突出的至多 3 条） */}
      {topHighlights.length > 0 && (
        <div className="ach-card-in mt-3" style={{ animationDelay: "1020ms" }}>
          <p className="flex items-center gap-1.5 font-mono text-xs tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            HIGHLIGHTS · 本场亮点
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {topHighlights.map((hl) => (
              <span
                key={hl}
                className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary"
              >
                ★ {hl}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 值班玩法盘点：本次任务交互事件计数一览 */}
      {data.plays.length > 0 && (
        <div className="ach-card-in mt-3" style={{ animationDelay: "1120ms" }}>
          <p className="flex flex-wrap items-center font-mono text-xs tracking-widest text-muted-foreground">
            DUTY PLAYS · 值班玩法盘点
            <span
              className={`ml-2 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-bold text-primary ${
                data.playTitlePromoted ? "museum-rarity-s animate-pulse" : ""
              }`}
            >
              称号 · {data.playTitle}
              {data.playTitlePromoted ? " ↑晋升" : ""}
            </span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.plays.map((pl) => (
              <span key={pl.label} className="rounded-md bg-secondary/60 px-2.5 py-1 font-mono text-xs text-card-foreground">
                {pl.label} <b className="tabular-nums text-primary">{pl.value}</b>
                {pl.best !== undefined && pl.best > 0 && (
                  <span className="ml-1 text-[9px] text-muted-foreground">最佳 {pl.best}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {/* 全球值班网络排行榜（模拟席位 + 玩家插入排名, 玩家行自动滚入视野并闪烁高亮） */}
      <div className="ach-card-in mt-4 rounded-lg border border-border bg-background/50 p-4" style={{ animationDelay: "820ms" }}>
        <p className="mb-2 flex items-center gap-1.5 font-mono text-xs tracking-widest text-muted-foreground">
          <Crown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          全球值班网络排行榜 · GLOBAL DUTY RANKING
        </p>
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {data.board.map((row) =>
            row.isPlayer ? (
              <div
                key="player"
                ref={playerRowRef}
                className={`museum-rarity-s relative flex items-center gap-2 overflow-hidden rounded-md border border-primary bg-primary/15 px-2.5 py-1.5 transition-shadow duration-300 ${
                  playerFlash ? "shadow-lg ring-2 ring-primary" : ""
                }`}
              >
                <span className="museum-shine pointer-events-none absolute -inset-y-8 left-0 w-1/3" aria-hidden="true" />
                <span className="w-7 shrink-0 font-mono text-xs font-bold tabular-nums text-primary">#{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-primary">你 · 本指挥席 ★</span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">{row.score}</span>
              </div>
            ) : (
              <div key={row.name} className="flex items-center gap-2 rounded-md bg-secondary/40 px-2.5 py-1.5">
                <span className={`w-7 shrink-0 font-mono text-xs font-bold tabular-nums ${row.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                  #{row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-card-foreground">{row.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{row.score}</span>
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-center font-mono text-[9px] tracking-widest text-muted-foreground/70">
          榜单为值班网络模拟推演席位 · 你的名次按本次综合评分实时插入
        </p>
      </div>

      {/* 战报分享卡片：生成 900×1200 canvas 卡片预览 + PNG 下载 */}
      <div className="ach-card-in mt-4 flex justify-center" style={{ animationDelay: "920ms" }}>
        <Button
          size="sm"
          onClick={() => setShareOpen(true)}
          className="border border-primary/50 bg-primary/10 font-mono text-primary hover:bg-primary/20 hover:text-primary focus-visible:shadow-focus"
        >
          <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          保存战报卡片
        </Button>
      </div>
      {shareOpen && <DebriefShareCard data={data} onClose={() => setShareOpen(false)} />}
    </>
  );
}

export function MissionDebrief({ open, data, onClose, reducedMotion = false }: MissionDebriefProps) {
  if (!open || !data) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto animate-in fade-in zoom-in-95 rounded-lg border-2 border-primary/50 bg-card p-6 shadow-xl duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="任务结算单"
      >
        <DebriefBody key={`${data.missionCode}-${data.total}-${data.isRecord}`} data={data} reducedMotion={reducedMotion} />
        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="border-border font-mono focus-visible:shadow-focus">
            关闭 ESC
          </Button>
        </div>
      </div>
    </div>
  );
}
