/**
 * 校园地图 · 登记（批次 DL「登记」）
 * 档案室的柜子上多了一册簿子：《非在册文书登记簿》。
 * 它不收你的纸，它只记「有纸在它不知道的地方」。
 * 三种处理：认领 / 不认领 / 抄进抽屉——没有正确的，
 * 只有你的抽屉在它的世界里最后是什么位置。
 */
import { useState } from "react";
import { BookMarked } from "lucide-react";
import {
  REGISTRY_DISCOVERY,
  REGISTRY_DONE,
  REGISTRY_NOTICE,
  REGISTRY_OUTCOMES,
  unregisteredCountOf,
} from "@/data/registry";
import type { GameSaveData } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface RegistryOverlayProps {
  /** 张贴那一天 */
  day: number;
  /** 存档（页数按它派生） */
  save: GameSaveData;
  /** 处理（落档在地图侧；浮层留在原地展示落定） */
  onRespond: (pick: "claim" | "leave" | "copy") => void;
  /** 收下 */
  onClose: () => void;
}

export function RegistryOverlay({ day, save, onRespond, onClose }: RegistryOverlayProps) {
  const [stage, setStage] = useState<"find" | "ask" | "outcome" | "done">("find");
  const [choice, setChoice] = useState<"claim" | "leave" | "copy" | null>(null);
  const pages = unregisteredCountOf(save);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="登记"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <BookMarked size={13} aria-hidden />
            档案室 · 非在册文书登记簿
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {stage === "find"
              ? "这册簿子只记数字"
              : stage === "ask"
                ? "三种处理"
                : stage === "outcome"
                  ? choice === "claim"
                    ? "已认领"
                    : choice === "leave"
                      ? "无主"
                      : "抄本"
                  : "落定"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 学号 036 · 名下非在册 {pages} 页
          </p>

          {stage === "find" && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={REGISTRY_DISCOVERY} />
              <div className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3">
                <p className="font-mono text-[10px] font-bold tracking-widest text-primary">《非在册文书登记簿》</p>
                <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={REGISTRY_NOTICE} />
                <p className="mt-2 rounded-lg border border-border bg-card p-2 text-sm leading-relaxed text-card-foreground">
                  兹登记学号 036 名下非在册文书 {pages} 页。
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    内容、位置、归属：不记。
                  </span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("ask")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  看那册簿子
                </button>
              </div>
            </>
          )}

          {stage === "ask" && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                三种处理。没有正确的——只有你的抽屉在它的世界里最后是什么位置。
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChoice("claim");
                    onRespond("claim");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">认领</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    在登记簿上签字。被注意值 +1——「不知道」被记进了它自己的簿子，这是它给你的第一张收据。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("leave");
                    onRespond("leave");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">不认领</span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    空行按无主计。沉默值 +1——无主地没人翻：翻要先立一个理由，理由一栏它不知道填什么。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice("copy");
                    onRespond("copy");
                    setStage("outcome");
                  }}
                  className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-left transition-colors duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
                    抄进抽屉
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-card-foreground">
                    登记簿是它的，抄本是你的。被注意值 +2——抽屉从此有了一个读法：它自己读不了，但你知道。
                  </p>
                </button>
              </div>
            </>
          )}

          {stage === "outcome" && choice !== null && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm font-bold text-card-foreground" text={REGISTRY_OUTCOMES[choice].title} />
              <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={REGISTRY_OUTCOMES[choice].body} />
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={REGISTRY_OUTCOMES[choice].filing} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下回执
                </button>
              </div>
            </>
          )}

          {stage === "done" && (
            <>
              <RichText className="anim-fade-up mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground" text={REGISTRY_DONE} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收下
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
