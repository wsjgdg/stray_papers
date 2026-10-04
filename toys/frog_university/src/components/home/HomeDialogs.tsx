interface HomeDialogsProps {
  creditsOpen: boolean;
  freshConfirmOpen: boolean;
  /** 确认弹层里可贴的种子码（可留空）：贴了就重走那一局的世界 */
  seedInput: string;
  onSeedInput: (value: string) => void;
  onCloseCredits: () => void;
  onConfirmNewGame: () => void;
  onCancelNewGame: () => void;
}

const CREDITS: Array<{ role: string; who: string }> = [
  { role: "监制", who: "蛙校长（已老实）" },
  { role: "编剧", who: "一只不想上早八的蛙" },
  { role: "美术", who: "五只拒绝出镜的奶蛙" },
  { role: "梗浓度调控", who: "抽象系主任" },
  { role: "音效", who: "图书馆翻书声、食堂手勺声，以及你叹气的声音" },
  { role: "特别出演", who: "你的绩点（友情客串，未参与拍摄）" },
  { role: "鸣谢", who: "每一个「再玩一局就睡」的你" },
];

/** 制作名单彩蛋弹窗 + 开新档覆盖确认弹窗 */
export function HomeDialogs({
  creditsOpen,
  freshConfirmOpen,
  seedInput,
  onSeedInput,
  onCloseCredits,
  onConfirmNewGame,
  onCancelNewGame,
}: HomeDialogsProps) {
  return (
    <>
      {creditsOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
          onClick={onCloseCredits}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="制作名单"
            className="anim-fade-up w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-md sm:p-7"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl font-bold text-card-foreground">制作名单</h3>
              <button
                type="button"
                onClick={onCloseCredits}
                aria-label="关闭制作名单"
                className="rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                ✕
              </button>
            </div>
            <ul className="mt-5 space-y-2.5">
              {CREDITS.map((item) => (
                <li
                  key={item.role}
                  className="flex flex-col gap-0.5 rounded-2xl bg-background/60 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="shrink-0 text-xs font-bold text-primary">{item.role}</span>
                  <span className="text-sm text-card-foreground">{item.who}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-center text-xs text-muted-foreground">本名单不含任何真实人类，请放心对号入座</p>
          </div>
        </div>
      )}
      {freshConfirmOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
          onClick={onCancelNewGame}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="确认开新档"
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-md sm:p-7"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-card-foreground">要开新学期吗？</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              开新档会把这学期的进度清零；图鉴、真话罐、岔路册这些档案不退。蛙也会记得上一学期的你——记得归记得，数值照清。
            </p>
            <label className="mt-4 block text-left">
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                想重走某一局？贴上那一局的种子码（可留空）
              </span>
              <input
                value={seedInput}
                onChange={(event) => onSeedInput(event.target.value)}
                placeholder="NAIWA-042317-雨多-晴天"
                aria-label="种子码（可留空）"
                className="mt-1.5 w-full rounded-xl border border-border bg-background/60 px-3 py-2 font-mono text-xs text-card-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancelNewGame}
                className="rounded-full bg-muted px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
              >
                再想想
              </button>
              <button
                type="button"
                onClick={onConfirmNewGame}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
              >
                开新档
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
