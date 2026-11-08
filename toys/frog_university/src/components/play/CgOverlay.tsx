/**
 * CG 定格演出（批次 B2）：节点带 cg → 全屏定格淡入（0.6s + 快门），角落显示标题/副题。
 * 点击继续收起（淡出）；展开期间由 Logic 层挡住快进与自动播放——先收 CG 才继续。
 * 展开瞬间 markCgSeen 记收集（Logic 层做，本组件只管演出）。
 */
import { useEffect, useState } from "react";
import { ChevronDown, Image } from "lucide-react";
import { clsx } from "clsx";
import { CgArt } from "./CgArt";
import type { CgSceneMeta } from "@/data/cg";
import { RichText } from "@/components/common/RichText";

interface CgOverlayProps {
  scene: CgSceneMeta;
  onClose: () => void;
}

/** 收起淡出时长（与 nw-cg-out 对齐） */
const CG_OUT_MS = 320;

export function CgOverlay({ scene, onClose }: CgOverlayProps) {
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (closing) return;
    setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, CG_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  /* Esc 也能收（galgame 惯例：CG 一按就过） */
  useEffect(() => {
    if (closing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closing 变化后不再监听：淡出期间禁重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 select-none",
        closing ? "nw-cg-out" : "nw-cg-in",
      )}
      role="presentation"
    >
      <CgArt id={scene.id} className="absolute inset-0" />

      {/* 角落标题卡：哪一张定格、出自哪条线 */}
      <div className="pointer-events-none absolute bottom-6 left-4 max-w-sm rounded-2xl border border-border bg-card/90 p-4 shadow-lg backdrop-blur sm:left-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
          <Image size={11} aria-hidden />
          CG · 定格
        </p>
        <h2 className="mt-2 text-lg font-bold text-card-foreground sm:text-xl">{scene.title}</h2>
        <RichText className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm" text={scene.subtitle} />
      </div>

      {/* 点击继续（收起）；空状态兜底不需要 */}
      <button
        type="button"
        onClick={close}
        aria-label={`收起定格「${scene.title}」`}
        className="group absolute bottom-6 right-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-4 py-2.5 text-sm font-bold text-card-foreground shadow-md backdrop-blur transition-all duration-200 hover:scale-105 hover:border-primary hover:text-primary focus-visible:shadow-focus focus-visible:outline-none sm:right-6"
      >
        <ChevronDown size={15} className="transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden />
        点击继续
      </button>
    </div>
  );
}
