/**
 * 档案柜 · 编目（批次 BS「编目」）
 * 权限：认定一个角色是否存在。不是杀死，不是删除，不是改档案——是判定这个角色是否真实。
 * 确认：角色继续存在，剧情正常推进。
 * 否认：该角色出现的所有场景重新渲染——背景不变，但角色所在的位置变成空白；
 *   所有关于该角色的文本变成脚注：内容还在，但被划掉了，可以点开看，但原文已经降级。
 * 否认不是删除。删除是「这个人没了」。否认是「这个人从来没存在过，但文本里留下了痕迹」。
 * 没有确认弹窗，没有撤销按钮——否认就是否认。
 * 同一只蛙同一学期翻动第三次起，它自己申请降级：立绘闪烁，台词重复，最终它自己选择消失。
 * 认定界面会记得你做了什么——但不会提醒你做了什么。档案柜里多出的那页没有名字：
 *   上面只有一行「该条目已降级为非编目」。你只能从空白里推测。
 */
import { X, CheckCircle2, Ban } from "lucide-react";
import { FROG_BY_CHARACTER, type FrogExpression } from "@/components/frog/Frog";
import type { FrogCharacterId } from "@/data/characters";

export type ExistenceTier = "none" | "footnote" | "demoted";

interface ExistenceRow {
  /** 在册蛙的固定编号（名字可以空，编号不空） */
  index: number;
  frogId: FrogCharacterId;
  name: string;
  /** 该蛙所在的那条线 */
  lineLabel: string;
  tier: ExistenceTier;
  /** 本学期翻动了几次（第三次起自行降级） */
  toggles: number;
}

interface ExistenceOverlayProps {
  rows: ExistenceRow[];
  /** 认定界面口径（确认 N 只 · 否认 N 只） */
  summary: { denied: number; confirmed: number };
  /** 权限说明看过没有——只讲一次 */
  introSeen: boolean;
  onIntroAck: () => void;
  onSet: (frogId: FrogCharacterId, verdict: "confirmed" | "denied") => void;
  onClose: () => void;
}

export function ExistenceOverlay({
  rows,
  summary,
  introSeen,
  onIntroAck,
  onSet,
  onClose,
}: ExistenceOverlayProps) {

  if (!introSeen) {
    return (
      <div
        className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
        role="dialog"
        aria-label="编目权限"
      >
        <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
          <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground">档案柜 · 新增权限</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">编目</h2>
            <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
              从这一学期起，你多了一项权限：认定一个角色是否存在。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-card-foreground">
              不是杀死，不是删除，不是改档案。是判定这个角色是否真实。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-card-foreground">
              <span className="font-bold text-primary">确认</span>——角色继续存在，剧情正常推进。
              <span className="font-bold"> 否认</span>——该角色出现的所有场景重新渲染：背景不变，
              但角色所在的位置变成空白；所有关于该角色的文本变成脚注，可以点开看，但原文已经降级。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-card-foreground">
              否认不是删除。删除是「这个人没了」。否认是「这个人从来没存在过，但文本里留下了痕迹」。
            </p>
            <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              没有确认弹窗，没有撤销按钮——否认就是否认。同一只蛙翻动第三次起，它会自己选择消失。
              游戏不会替你记下否认的是谁：档案柜里多出的那页没有名字，上面只有一行「该条目已降级为非编目」。
              你只能从空白里推测。
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onIntroAck}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="编目"
    >
      <div className="mx-auto flex min-h-full max-w-xl items-start justify-center">
        <div className="w-full rounded-3xl border border-border bg-card p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-card-foreground">编目</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                在册 {summary.confirmed} 只 · 非编目 {summary.denied} 只。界面记得你做了什么，不会提醒你做了什么。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="合上编目"
              className="inline-flex shrink-0 rounded-full border border-border bg-background px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {rows.map((row) => {
              const demoted = row.tier === "demoted";
              const denied = row.tier === "footnote";
              const Expression: FrogExpression = demoted ? "frozen" : denied ? "silent" : "laugh";
              const Sprite = FROG_BY_CHARACTER[row.frogId];
              return (
                <div
                  key={row.frogId}
                  className={
                    demoted
                      ? "flex items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-3"
                      : denied
                        ? "flex items-center gap-3 rounded-2xl border border-dashed border-border bg-background/40 p-3"
                        : "flex items-center gap-3 rounded-2xl bg-background/60 p-3"
                  }
                >
                  <span className="shrink-0" aria-hidden>
                    {Sprite && !demoted ? (
                      <Sprite size={44} expression={Expression} />
                    ) : (
                      <span className="block h-11 w-11 rounded-xl border border-dashed border-border bg-muted/40" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                      第 {row.index} 号 · {row.lineLabel}
                    </p>
                    <p
                      className={
                        demoted
                          ? "mt-0.5 text-sm font-bold text-muted-foreground line-through decoration-destructive/60"
                          : "mt-0.5 text-sm font-bold text-card-foreground"
                      }
                    >
                      {demoted ? "该条目自行申请降级" : row.name}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {demoted
                        ? "它自己走的。翻动三次之后，没有谁劝它。"
                        : denied
                          ? `非编目。它出现的场景已成空白；文本降级为脚注。本学期翻动 ${row.toggles} 次。`
                          : row.toggles > 0
                            ? "在册。本学期翻动过一次——它还记得。"
                            : "在册。剧情正常推进。"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {demoted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive">
                        <Ban size={11} aria-hidden />
                        已降级
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSet(row.frogId, "confirmed")}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-card-foreground transition-colors duration-200 hover:bg-muted focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          <CheckCircle2 size={12} aria-hidden />
                          确认
                        </button>
                        <button
                          type="button"
                          onClick={() => onSet(row.frogId, "denied")}
                          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          否认
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-5 border-t border-dashed border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            你决定什么算存在。游戏不会问「你确定吗」——否认就是否认。被否认的那只不会出现在任何名单、
            任何场景、任何纪念册里；它只会以脚注的方式留在文本里。
          </p>
        </div>
      </div>
    </div>
  );
}

/** 否认后的那一下（浮层内的一次性回执）：不问确定，只回一行 */
export function existenceDenyNote(name: string): string {
  return `已否认。${name}——从这一行起，它不在了。`;
}
