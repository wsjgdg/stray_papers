/**
 * 校园地图 · 挂档总览（批次 CY-101）
 * 面板里挤不下的那面柜子，摊开来读：一屏读全所有挂着的小字。
 * 与面板同源（keptNotesOf），不另立账——面板是抽屉，这页是摊开的整面。
 */
import { Pin } from "lucide-react";
import { keptNotesOf } from "@/data/keptNotes";
import type { GameSaveData } from "@/lib/gameSave";

interface KeptNotesOverlayProps {
  /** 存档 */
  save: GameSaveData;
  onClose: () => void;
}

export function KeptNotesOverlay({ save, onClose }: KeptNotesOverlayProps) {
  const notes = keptNotesOf(save);
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="挂档总览"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Pin size={13} aria-hidden />
            档案室 · 挂档总览
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            一整面柜子，摊开来读
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            小字不占编号、不进总目——但它们挂着：翻档案都翻得到，开新学期也还挂着。
          </p>

          <ul className="mt-4 space-y-3">
            {notes.map((item) => (
              <li
                key={item.key}
                className="rounded-xl border border-border bg-background/60 p-4"
              >
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-primary">
                    {item.label}
                  </span>
                  {item.semester !== null && item.day !== null && (
                    <span className="shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground">
                      第 {item.semester} 学期 · 第 {item.day} 天挂上
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">{item.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px] tracking-widest text-muted-foreground">
            共 {notes.length} 行小字 · 全部摊开
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg focus-visible:shadow-focus focus-visible:outline-none"
          >
            把柜子挂回去
          </button>
        </div>
      </div>
    </div>
  );
}
