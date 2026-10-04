/**
 * 校园地图 · 「你回来了」（批次 AP「校园是活的系统」之四）
 * 现实时间 = 游戏时间：玩家长时间不打开游戏（满三天），再进来时
 * 档案替你补一行「无记录」，蛙们隔着一段距离说同一句「你回来了」——
 * 没有谁问你去了哪儿，这句是排练过的，档案替他们记住该说什么。
 * 你不在的时候，学校还在：照常点名，照常把没回来的记成「未归」。
 */
import { FROG_CHARACTERS } from "@/data/characters";
import { formatCnDate, type AwayRecord } from "@/lib/gameSave";

interface ReturnVisitOverlayProps {
  record: AwayRecord;
  /** 角色腐烂（批次 BD）：离校满七天回来——好感没被看着，褪了一层 */
  decayed?: boolean;
  onClose: () => void;
}

/** 说「你回来了」的蛙：五只原班里轮到谁，谁就说——同一句，一字不差 */
const GREETERS: Array<keyof typeof FROG_CHARACTERS> = ["huiHui", "moMo", "geGe"];

export function ReturnVisitOverlay({ record, decayed = false, onClose }: ReturnVisitOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="你回来了"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">校园 · 缺席记录已补好</p>

          <div className="mt-4 flex flex-col gap-2">
            {GREETERS.map((id) => (
              <p key={id} className="text-sm leading-relaxed text-card-foreground">
                <span className="mr-2 font-bold text-primary">{FROG_CHARACTERS[id].displayName}：</span>
                「你回来了。」
              </p>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            三只蛙，同一句。没有谁问你去了哪儿——这句「你回来了」是排练过的，档案替他们记住该说什么。
          </p>

          <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
            该蛙于 {formatCnDate(record.from)} 至 {formatCnDate(record.to)} 无记录。（{record.days} 天）
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            这一行只有你回来之后才补得上——你不回来，它就一直空着。学校还在：你不的时候，它照常点名，
            照常把没回来的记成「未归」。现实时间就是游戏时间。
          </p>

          {/* 角色腐烂（批次 BD）：你不看它们，它们就会淡下去——好感 −5，用真话一点点描回来 */}
          {decayed && (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              （你不在的这段时间，它们淡了一点。台词比上学期短了——没说的那些，是没对你说的。
              好感不是掉了，是没被看着的东西会褪色。档案记了一笔：全体好感 −5。
              淡下去的那部分，要用真话一点点描回来。）
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              ……嗯
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
