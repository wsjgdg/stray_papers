import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";
import { AiMixList } from "./AiMixList";
import { AiArrangeList } from "./AiArrangeList";
import { AiStyleSection } from "./AiStyleSection";
import { AiLyricSection } from "./AiLyricSection";

// AI 指挥台抽屉（作曲模式专属）：右侧终端风面板，三个页签——
// 混音建议 / 编曲建议 / 风格迁移。分析与应用全在 Logic 层（纯本地规则引擎），
// 这里只是等宽终端皮。顶栏「AI」chip 开合；关闭即卸载。
export function AiPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const pending =
    p.aiMixList.filter((a) => a.status === "pending").length +
    p.aiArrangeList.filter((a) => a.status === "pending").length;
  // 歌词页签只对「选中的旋律线」出现（鼓律动轨/曲线/锚点没有配词入口）
  const tabs: Array<{ id: "mix" | "arrange" | "style" | "lyric"; label: string }> = [
    { id: "mix", label: "混音" },
    { id: "arrange", label: "编曲" },
    { id: "style", label: "风格" },
    ...(p.lyricTargetAvailable ? [{ id: "lyric" as const, label: "歌词" }] : []),
  ];
  return (
    <div
      ref={rootRef}
      className="fixed inset-y-0 right-0 z-40 flex w-[min(94vw,380px)] flex-col border-l border-primary/40 bg-card font-mono text-card-foreground shadow-lg"
    >
      <div data-panel-card className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-bold leading-none">
              AI <span className="text-primary">指挥台</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">mix · arrange · restyle</p>
          </div>
          <button
            type="button"
            onClick={p.onToggleAi}
            aria-label="关闭 AI 指挥台"
            className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            ×
          </button>
        </header>

        <div className="flex shrink-0 gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={p.onAiAnalyze}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            重新分析
          </button>
          <button
            type="button"
            disabled={pending === 0 || p.aiApplyLocked}
            onClick={p.onAiApplyAll}
            title={p.aiApplyLocked ? "接龙态前人的段落锁着拍子，传完这棒再应用" : undefined}
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            一键应用全部{pending > 0 ? ` (${pending})` : ""}
          </button>
        </div>

        <nav className="flex shrink-0 gap-1 px-4 pt-3" aria-label="AI 指挥台页签">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => p.onSetAiTab(t.id)}
              className={
                p.aiTab === t.id
                  ? "rounded-t-md border border-b-0 border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
                  : "rounded-t-md border border-b-0 border-transparent px-3 py-1 text-xs text-muted-foreground hover:text-card-foreground focus-visible:shadow-[var(--focus-ring)]"
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {p.aiTab === "mix" ? (
            <AiMixList {...p} />
          ) : p.aiTab === "arrange" ? (
            <AiArrangeList {...p} />
          ) : p.aiTab === "lyric" ? (
            <AiLyricSection {...p} />
          ) : (
            <AiStyleSection {...p} />
          )}
        </main>

        <footer className="shrink-0 border-t border-border px-4 py-2 text-xs leading-relaxed text-muted-foreground">
          {p.aiApplyLocked ? "接龙进行中：建议可看，应用要等这棒传完" : "所有应用都进撤销栈，随时可「撤销」反悔"}
        </footer>
      </div>
    </div>
  );
}
