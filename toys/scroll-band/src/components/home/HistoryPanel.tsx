import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

// 作曲历史面板：撤销栈可视版——列出全部步骤（复用 pushHistory 的动作描述源），
// 当前位置高亮；点任意一步时间旅行（向后跳不丢未来步骤，重做栈保留可再前进）。
export function HistoryPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  // 节点 0 = 未做任何改动的初始状态；第 i 步 = 完成第 i 条动作后的状态
  const rows: { idx: number; label: string }[] = [
    { idx: 0, label: "初始状态（还没动笔）" },
    ...p.histSteps.map((label, i) => ({ idx: i + 1, label })),
  ];
  // 最新一步在前：最常点的「回到刚才」不用滚到底
  const ordered = [...rows].reverse();
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseHist}
    >
      <div
        data-panel-card
        className="flex max-h-[80vh] w-full max-w-md flex-col border border-border bg-card p-6 text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mono text-2xl font-bold">作曲历史</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
          点任意一步直接跳到它<span className="text-primary">完成后的状态</span>；往后跳也不丢未来——
          重做栈还在，随时 ↷ 回到之后的步骤。
        </p>
        {p.histSteps.length === 0 ? (
          <p className="mt-4 border border-dashed border-border p-4 text-center font-mono text-xs text-muted-foreground">
            还没有编辑步骤——画条线、落个锚点，这里就会列出每一步
          </p>
        ) : (
          <ol className="mt-4 flex-1 space-y-1 overflow-y-auto pr-1">
            {ordered.map((r) => {
              const active = r.idx === p.histPos;
              return (
                <li key={r.idx} data-panel-item>
                  <button
                    type="button"
                    onClick={() => p.onHistJump(r.idx)}
                    aria-current={active ? "step" : undefined}
                    className={`flex w-full items-center gap-2 border px-3 py-2 text-left font-mono text-xs focus-visible:shadow-[var(--focus-ring)] ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                    }`}
                  >
                    <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                      {r.idx === 0 ? "起始" : `#${r.idx}`}
                    </span>
                    <span className="flex-1">{r.label}</span>
                    {active && <span className="shrink-0 font-bold text-primary">当前</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          深度上限 {p.histLimit} 步（当前 {p.histSteps.length} 步）·{" "}
          {p.histAhead > 0 ? `前方还有 ${p.histAhead} 步未来可前进` : "前方没有未来步骤"}
        </p>
      </div>
    </div>
  );
}
