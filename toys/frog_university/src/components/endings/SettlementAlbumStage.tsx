/**
 * 结局档案 · 结算册（批次 CY-140）：把已收的结算处置单整册誊成一页图。
 * 舞台在屏幕外（-10000px），挂载后等两帧再交出画布——纸面上印章一挂就是盖好的（staticStamp）。
 * 口径同图鉴：档案只记一次，这本册子是重印的，不另记。
 */
import { useEffect, useRef } from "react";
import type { Ending } from "@/data/storylines";
import { EndingSettlementPlate } from "@/components/play/EndingSettlementPlate";

export interface SettlementAlbumItem {
  lineTitle: string;
  ending: Ending;
}

interface SettlementAlbumStageProps {
  items: SettlementAlbumItem[];
  collected: number;
  total: number;
  /** 挂载并渲染完成后，把这个节点交给调用方走统一盖章导出通道 */
  onCapture: (node: HTMLDivElement) => void;
}

export function SettlementAlbumStage({ items, collected, total, onCapture }: SettlementAlbumStageProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (ref.current) onCapture(ref.current);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [onCapture]);

  return (
    <div ref={ref} className="w-[860px] rounded-3xl border border-border bg-card p-8">
      {/* 封面页 */}
      <div className="rounded-3xl border border-primary/30 bg-primary/5 px-8 py-8 text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-primary">结 局 档 案</p>
        <h2 className="mt-3 text-3xl font-bold text-card-foreground">结算册</h2>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          盖好的章、认定依据、还有那幅定格——一张一张，都在这本册子里。
        </p>
        <p className="mt-2 font-mono text-xs tracking-widest text-muted-foreground">
          已收 {collected}/{total} · 重印 · 不另记
        </p>
        {/* 封面图（批次 CY-142）：一张纸、一枚章、一盏灯、一只钟——结算册的封面带一幅小景 */}
        <svg viewBox="0 0 600 96" className="mx-auto mt-5 w-full max-w-md" aria-hidden>
          <g>
            <rect x="70" y="16" width="110" height="64" rx="4" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.3" />
            <path d="M84 34 h82 M84 46 h66 M84 58 h72" stroke="var(--frog-ink)" strokeWidth="2" opacity="0.25" strokeLinecap="round" />
            <rect x="84" y="66" width="40" height="6" rx="2" fill="hsl(var(--destructive))" opacity="0.55" />
          </g>
          <g transform="rotate(-8 300 48)">
            <rect x="278" y="26" width="44" height="44" rx="5" fill="none" stroke="hsl(var(--destructive))" strokeOpacity="0.7" strokeWidth="3" />
            <rect x="288" y="36" width="24" height="24" rx="2" fill="hsl(var(--destructive))" opacity="0.22" />
          </g>
          <g>
            <path d="M446 40 A 18 18 0 0 1 482 40 Z" fill="var(--frog-badge)" stroke="var(--frog-ink)" strokeOpacity="0.35" />
            <path d="M452 44 L476 44 L484 74 L444 74 Z" fill="hsl(var(--primary))" opacity="0.14" />
            <line x1="436" y1="76" x2="492" y2="76" stroke="var(--frog-ink)" strokeOpacity="0.3" strokeWidth="2" />
          </g>
          <g>
            <circle cx="540" cy="48" r="20" fill="hsl(var(--card))" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
            <line x1="540" y1="48" x2="540" y2="36" stroke="var(--frog-ink)" strokeOpacity="0.6" strokeWidth="2" />
            <line x1="540" y1="48" x2="549" y2="53" stroke="var(--frog-ink)" strokeOpacity="0.4" strokeWidth="2" />
          </g>
        </svg>
      </div>
      {/* 目录页 */}
      <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-5">
        <p className="text-xs font-bold tracking-widest text-primary">目 录</p>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.ending.id} className="flex items-baseline gap-2 text-xs leading-relaxed">
              <span className="font-mono text-[10px] font-bold text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-bold text-card-foreground">{item.ending.title}</span>
              <span className="text-muted-foreground">
                {item.lineTitle} · {item.ending.settlement?.tierName ?? ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {/* 处置单：一单一格，静止章 */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.ending.id} className="overflow-hidden rounded-2xl border border-border">
            <div className="[&>div]:mt-0">
              <EndingSettlementPlate ending={item.ending} staticStamp />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground">
        档案只记一次——这本结算册是重印的，不另记。
      </p>
    </div>
  );
}
