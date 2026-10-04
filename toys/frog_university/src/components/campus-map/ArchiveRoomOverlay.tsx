/**
 * 校园地图 · 门后（批次 BM「门后」）
 * 调任：移交后的去向落实——档案室。那扇你路过十一次、每一次都关着的门，开了。
 *   里面是档案室：一排柜子，没有窗。灯常亮，不靠天亮。你原来以为门后面有别的——门后面是文件。
 * 钥匙：钥匙圈上挂着上一只的旧钥匙。新钥匙没有，锁也不换。
 *   制度不换锁，只换人——开这扇门的力气，一直在同一只手里轮。
 * 递卷：柜台的规矩写在牌子上：档案室不认人——不问姓名，只问编号。
 *   你递出去的第一份，是你自己的那份。它翻完说「谢了」，走了。
 *   你等了三个学期的那道题「它读出了什么」，答案就这么简单：什么都没有。
 *   档案没有让人读出东西的功能。它只负责被翻。
 * 名牌：柜门上的名牌写着上一只的名字，你没换。制度不换名牌，只换铅笔字——
 *   你的名字用铅笔加在下面，可以擦。写名字的地方，从来用的都是铅笔。
 * 落点：门后面没有别的。门后是文件；文件后面，是你——别的蛙手里递过来的文件，落款出自你。
 *   你就是那只它们从来没见过的蛙。
 */
import { useState } from "react";
import { Key } from "lucide-react";

interface ArchiveRoomOverlayProps {
  /** 来查档的那只（柜台不认人，你知道的只有它的编号） */
  servedName: string;
  /** 档案行的天数 */
  day: number;
  /** 看柜完了（落档 + 收浮层） */
  onAck: () => void;
}

export function ArchiveRoomOverlay({ servedName, day, onAck }: ArchiveRoomOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="档案室"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Key size={13} aria-hidden />
            走廊尽头 · 档案室
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "调任单" : step === 1 ? "钥匙" : step === 2 ? "递卷" : "名牌"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                调任单下来了。去向一栏写着：档案室。职责一栏写着：看柜。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你走到走廊尽头。那扇门——你路过它十一次、每一次都关着的那扇——开了。
                里面是档案室：一排柜子，没有窗。灯常亮，不靠天亮。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                你原来以为门后面有别的。门后面是文件。一排一排的柜子，每排贴着编号——编号比你知道的蛙多。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  进去
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                钥匙从抽屉里给你。钥匙圈上有一把旧的，标着上一只的编号。新钥匙没有——锁也不换。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">交接单上写着：钥匙随岗位走，人不随钥匙走。</p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                制度不换锁，只换人。开这扇门的力气，一直在同一只手里轮。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                下午，{servedName}来查档。柜台的规矩写在牌子上：档案室不认人——不问姓名，只问编号。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你登记、递卷、收卷。递出去的第一份，是你自己的那份。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                它翻完说「谢了」，走了。它不知道。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                你等了三个学期的那道题——它读出了什么——答案就这么简单：什么都没有。
                档案没有让人读出东西的功能。它只负责被翻。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                傍晚锁门。柜门上的名牌写着上一只的名字——你没换。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                制度不换名牌，只换铅笔字。你的名字用铅笔加在下面，可以擦。
                字迹很浅——你知道为什么：写名字的地方，从来用的都是铅笔。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙调任档案室。看柜一日，递卷一份（递的是自己的）。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                门后面没有别的。门后是文件；文件后面，是你。
                别的蛙手里递过来的文件，落款出自你——你就是那只它们从来没见过的蛙。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onAck}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
