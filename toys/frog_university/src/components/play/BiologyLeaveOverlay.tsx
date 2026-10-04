/**
 * 蛙的生物学 · 结局相位出口（批次 AH）
 * 结局之后，两个不进图鉴的出口：
 * 冬眠——把自己挂进档案柜的背面，跳过一学期；醒来时世界换了一轮，人也淡一点（不消失，只是淡）。
 * 蜕一层皮——数值清空开新学期，旧皮留在柜子里（写着这一局走的路），可以穿回。
 * 都不是读档、不是开新档：档案对两件事的处理方式不同——冬眠那段写「无记录」，蜕皮那张皮还在。
 */
import { clsx } from "clsx";
import { RichText } from "@/components/common/RichText";

export type BiologyLeaveKind = "hibernate" | "molt";

const COPY: Record<BiologyLeaveKind, { badge: string; title: string; body: string; note: string; confirm: string }> = {
  hibernate: {
    badge: "学期出口 · 二选一之外的那一个",
    title: "冬眠",
    body: "把自己挂进档案柜的背面。这一学期不参与——数值照清，档案替它记了一行：该蛙冬眠期间无记录。",
    note: "醒来的时候，世界换了一轮：天气、深夜、日程的顺序都会变。人也淡一点——不消失，只是淡。档案柜里多出一段空白，理由栏写的是「季节」。",
    confirm: "睡下",
  },
  molt: {
    badge: "学期出口 · 二选一之外的那一个",
    title: "蜕一层皮",
    body: "数值清空，旧皮留进柜子。旧皮上写着这一局走的路、说过的真话、沉默的次数。",
    note: "旧皮可以穿回。穿回来的那学期，剧情会认出你——「你不是已经蜕过了吗？」蜕下的皮上限六层，满了最旧的那张自然掉落。",
    confirm: "蜕下",
  },
};

export function BiologyLeaveOverlay({
  kind,
  onConfirm,
  onClose,
}: {
  kind: BiologyLeaveKind;
  onConfirm: (kind: BiologyLeaveKind) => void;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label={copy.title}
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className={clsx("anim-fade-up my-auto w-full rounded-2xl border bg-card p-6 shadow-2xl", kind === "hibernate" ? "border-primary/40" : "border-border")}>
          <RichText className="text-center text-[10px] font-bold tracking-widest text-muted-foreground" text={copy.badge} />
          <h2 className="mt-2 text-center text-xl font-bold tracking-widest text-card-foreground">{copy.title}</h2>
          <RichText className="mt-4 text-sm leading-relaxed text-card-foreground" text={copy.body} />
          <RichText className="anim-fade-up mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground" text={copy.note} />
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              再想想
            </button>
            <button
              type="button"
              onClick={() => onConfirm(kind)}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              {copy.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
