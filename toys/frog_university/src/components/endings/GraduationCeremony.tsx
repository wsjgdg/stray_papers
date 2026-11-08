/**
 * 毕业典礼 · 全屏谢幕仪式（挂在结局图鉴页内，十条线全通后从图鉴顶部入口进入）
 * 三段议程：上台致辞 → 毕业证成绩单 → 制作名单；Esc 或右上角随时关回图鉴。
 * 数据全部来自现有存档聚合（GraduationDiplomaData），二周目重复可看。
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GitBranch, GraduationCap, X } from "lucide-react";
import { playSe } from "@/lib/audio";
import type { GraduationDiplomaData } from "@/pages/Endings/useEndings";
import { GraduationSpeech } from "./GraduationSpeech";
import { GraduationDiploma } from "./GraduationDiploma";
import { GraduationCredits } from "./GraduationCredits";
import { GraduationPhoto } from "./GraduationPhoto";

/** 议程单：与台下的三项内容一一对应 */
const CEREMONY_STEPS = ["上台 · 结业致辞", "毕业证 · 成绩单", "制作名单"] as const;

interface GraduationCeremonyProps {
  data: GraduationDiplomaData;
  onClose: () => void;
  /** 岔路回顾入口（批次 U·P2）：有未走的岔路时传入——通关仪式最后一页直接去岔路册 */
  onReviewBranch?: () => void;
  /** 未走的岔路数（显示在按钮上） */
  branchLeft?: number;
}

export function GraduationCeremony({ data, onClose, onReviewBranch, branchLeft }: GraduationCeremonyProps) {
  const [step, setStep] = useState(0);
  const last = step === CEREMONY_STEPS.length - 1;

  /* Esc 关闭；挂载期间锁住背景滚动 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  /* 翻纸声（批次 CY-81）：议程翻页配一页纸翻过去的声音；礼成那一下换成掌声 */
  const goPrev = useCallback(() => {
    playSe("se-page");
    setStep((prev) => Math.max(0, prev - 1));
  }, []);
  const goNext = useCallback(() => {
    if (last) {
      playSe("se-applause");
      onClose();
      return;
    }
    playSe("se-page");
    setStep((prev) => Math.min(CEREMONY_STEPS.length - 1, prev + 1));
  }, [last, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="毕业典礼"
      className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-md"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <p className="inline-flex min-w-0 items-center gap-2">
            <GraduationCap size={18} className="shrink-0 text-primary" aria-hidden />
            <span className="truncate text-sm font-black tracking-tight text-foreground sm:text-base">
              奶蛙大学 · 结业典礼
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭毕业典礼，回结局图鉴"
            title="关闭毕业典礼"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        {/* 议程单：可点任意一项直接跳 */}
        <nav aria-label="典礼议程" className="flex flex-wrap items-center justify-center gap-2">
          {CEREMONY_STEPS.map((label, index) => {
            const active = index === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (index !== step) playSe("se-page");
                  setStep(index);
                }}
                aria-current={active ? "step" : undefined}
                className={
                  active
                    ? "rounded-full border border-primary bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-sm focus-visible:shadow-focus focus-visible:outline-none"
                    : "rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground shadow-sm transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
                }
              >
                第 {index + 1} 项
                <span className="ml-1 hidden sm:inline">· {label}</span>
              </button>
            );
          })}
        </nav>

        <main key={step} className="anim-fade-up">
          {step === 0 && (
            <>
              <GraduationSpeech playthrough={data.playthrough} />
              {/* 毕业照（批次 AX「同届」）：照片不核对脸，只核对位置 */}
              <GraduationPhoto data={data} />
            </>
          )}
          {step === 1 && <GraduationDiploma data={data} />}
          {step === 2 && <GraduationCredits />}
        </main>

        <footer className="mt-auto flex flex-wrap items-center justify-center gap-3 pb-4">
          {step > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              <ChevronLeft size={15} aria-hidden />
              上一项
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            {last ? "礼成 · 回图鉴" : "下一项议程"}
            {!last && <ChevronRight size={15} aria-hidden />}
          </button>
          {last && onReviewBranch && (branchLeft ?? 0) > 0 && (
            <button
              type="button"
              onClick={onReviewBranch}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-bold text-primary shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              <GitBranch size={14} aria-hidden />
              岔路回顾 · 还有 {branchLeft} 处没走
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
