/**
 * 校园地图 · 私档（批次 BV「私档」）
 * 调阅弹层：翻开的不是好感度解锁的资料——是这只蛙自己写的、或者别人写的、关于它自己的东西。
 * 看过就回不去了：这条线从此多了一件不能提的事（铭牌带调阅痕，下次开口先认账，「不知道」档永久关闭）。
 * 落点：档案被调阅的痕迹不会因为读档消失——登记行写的就是这件事。
 */
import { Eye } from "lucide-react";
import type { PrivateDossier } from "@/data/privateDossiers";
import { FROG_CHARACTERS } from "@/data/characters";
import { RichText } from "@/components/common/RichText";

interface PrivateDossierOverlayProps {
  dossier: PrivateDossier;
  /** 调阅发生在第几天（登记行用） */
  day: number;
  /** 合上（回到夜的落定） */
  onClose: () => void;
}

export function PrivateDossierOverlay({ dossier, day, onClose }: PrivateDossierOverlayProps) {
  const frogName = FROG_CHARACTERS[dossier.frogId].displayName;
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/85 px-4 py-10"
      role="dialog"
      aria-label="私档调阅"
    >
      <div className="mx-auto flex min-h-full max-w-2xl items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              <Eye size={13} aria-hidden />
              调阅记录
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                第 {day} 天
              </span>
              <span className="rounded-full border border-destructive/40 bg-destructive/5 px-2.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                不可撤销
              </span>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            看过就回不去了——这条线从此多了一件不能提的事。
          </p>

          <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-border pb-3">
              <h3 className="text-base font-bold tracking-widest text-card-foreground">
                《{dossier.docTitle}》
              </h3>
              <span className="rounded-full border border-destructive/40 bg-destructive/5 px-2.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                未经申请
              </span>
            </div>
            <p className="pt-3 font-mono text-[10px] font-bold tracking-widest text-muted-foreground">
              发现地点 · {dossier.place} · 关于{frogName}
            </p>

            <div className="mt-4 flex flex-col gap-4">
              {dossier.pages.map((page, index) => (
                <div key={dossier.id + "-p" + index} className="rounded-xl bg-background/60 p-3.5">
                  {page.split("\n").map((line, lineIndex) => (
                    <p
                      key={dossier.id + "-p" + index + "-l" + lineIndex}
                      className="font-mono text-[13px] leading-relaxed text-card-foreground/95"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <RichText className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground" text={dossier.coda} />

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
            >
              合上
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
