/**
 * 校园地图 · 团体行动（批次 CA「团体」）
 * 你什么都没做，但世界自己动了——它们在你不在的时候自己做了事。
 * 加入 → 信息、资源、保护（也被绑定，档案照写：该蛙所在团体）；
 * 旁观 → 安全（但这一栏从此空白：你永远不知道它们在做什么）。
 */
import { useState } from "react";
import { Users } from "lucide-react";
import type { FactionMeta } from "@/data/factions";
import { RichText } from "@/components/common/RichText";

interface FactionActionOverlayProps {
  /** 哪个团体动了 */
  meta: FactionMeta;
  /** 它们动手的那一天 */
  day: number;
  /** 你已经在这边（内情直接给你看；不再发邀请） */
  joinedAlready: boolean;
  /** 勾结被看见了（仅公示栏；有则先摆材料） */
  exposed: { text: string; disposition: string } | null;
  /** 加入 / 不掺和（落档在地图侧；浮层留在原地展示回执） */
  onDecide: (join: boolean) => void;
  /** 收下 */
  onClose: () => void;
}

export function FactionActionOverlay({
  meta,
  day,
  joinedAlready,
  exposed,
  onDecide,
  onClose,
}: FactionActionOverlayProps) {
  const [decided, setDecided] = useState<boolean | null>(null);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="团体行动"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Users size={13} aria-hidden />
            《{meta.title}》
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {decided === null ? meta.action.title : decided ? "加入" : "在场外"}
          </h2>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            第 {day} 天 · 你不在的时候
          </p>

          {decided === null && (
            <>
              <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={meta.action.text} />
              {(joinedAlready || meta.action.inside) && joinedAlready && (
                <RichText className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground" text={meta.action.inside} />
              )}
              {exposed && (
                <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-card-foreground">
                  {exposed.text}
                  <span className="mt-1 block font-mono text-[11px] tracking-wider text-destructive/90">
                    {exposed.disposition}
                  </span>
                </p>
              )}
              <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={meta.bond} />
              {!joinedAlready && (
                <RichText className="anim-fade-up mt-3 text-sm leading-relaxed text-card-foreground" text={meta.action.joinOffer} />
              )}
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                >
                  离开
                </button>
                {joinedAlready ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDecided(true);
                      onDecide(true);
                    }}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    收下
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDecided(false);
                        onDecide(false);
                      }}
                      className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      不掺和
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDecided(true);
                        onDecide(true);
                      }}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      加入
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {decided !== null && (
            <>
              <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed text-card-foreground">
                {decided ? meta.joinReceipt : "你没有掺和。档案里没有这一行——它们做了什么与你无关；与你有关的，是你从此只能看见它们做了什么。"}
              </p>
              {!joinedAlready && !decided && (
                <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                  你安全。名单上没有你，材料上没有你——分裂的两边也不会来找你要个说法。
                </p>
              )}
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                {meta.action.title}——这件事不在你的档案里，因为它不是你做的。这是它第一次只属于它们。
              </p>
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
