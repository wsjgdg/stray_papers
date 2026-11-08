/**
 * 校园地图 · 登记（批次 BQ「登记」）
 * 公告：湖边区域自即日起实行进入登记——湖是全校唯一没有墙的地方，现在它有了一块牌子。
 * 签到表：登记处的签到表六十行，栏目和宿舍楼那张一模一样（到场情况：到／未到／代签）。
 *   连纸都是同一批印的——制度的纸不挑地方：宿舍、食堂、湖边，同一台打印机。
 * 事由：登记表上多了一栏「事由」。你写「散步」，抬头看，前面几行的字迹不同、内容相同——
 *   「散步」成了这一栏的标准答案，像「正常」一样。
 *   湖边夜里谈过什么，表上没有这一栏。表上只有事由：散步。能进表的东西，都不疼。
 * 签名：你签了名。从今天起，你到这里来过，是有记录的。
 *   湖边的名单在变长——空白那一行是留给还没来的蛙的：它不知道它在等谁，名单替它等着。
 */
import { useState } from "react";
import { Waves } from "lucide-react";

interface LakeRegisterOverlayProps {
  /** 立牌的那一天（档案行用） */
  day: number;
  /** 登记完了（落档 + 收浮层） */
  onAck: () => void;
}

export function LakeRegisterOverlay({ day, onAck }: LakeRegisterOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label="湖边登记"
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Waves size={13} aria-hidden />
            湖岸东侧 · 登记处
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "公告" : step === 1 ? "签到表" : step === 2 ? "事由" : "签名"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                公告栏贴出通知：湖边区域自即日起实行进入登记。登记处设在湖岸东侧，全天开放。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                湖是全校唯一没有墙的地方。你记得第一次去的时候，那里什么都没有——没有牌子，没有表，没有编号。
                现在它有一块牌子了。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  知道了
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你去看了一眼。登记处有一张签到表，六十行，栏目和宿舍楼那张一模一样：到场情况，三个选项——到／未到／代签。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                连纸都是同一批印的。制度的纸不挑地方：宿舍、食堂、湖边，同一台打印机。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  继续
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">登记表上多了一栏：事由。</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你写「散步」。抬头看，前面几行的字迹不同，内容相同——
                「散步」成了这一栏的标准答案，像「正常」一样。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                湖边夜里谈过什么，表上没有这一栏。表上只有事由：散步。能进表的东西，都不疼。
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
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">你签了名。</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                从今天起，你到这里来过，是有记录的。
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，湖边实行进入登记。该蛙已登记（事由：散步）。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                湖边的名单在变长。表的最后一行空着——那一行是留给还没来的蛙的：
                它不知道它在等谁，名单替它等着。
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
