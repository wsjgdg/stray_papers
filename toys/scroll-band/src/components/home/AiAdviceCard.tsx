import type { AiAdvice } from "@/lib/musicAi";

// 单条 AI 建议卡（混音/编曲两列表共用）：终端风等宽 + hover 联动画布描边 +
// 逐条「应用 / 忽略」，应用后打勾、忽略后划线；接龙锁拍时应用按钮置灰。
export function AiAdviceCard(props: {
  advice: AiAdvice;
  applyLocked: boolean;
  onApply: (id: string) => void;
  onIgnore: (id: string) => void;
  onHover: (ids: string[]) => void;
}) {
  const { advice, applyLocked, onApply, onIgnore, onHover } = props;
  return (
    <li
      data-panel-item
      className="rounded-md border border-border bg-background/40 p-3 shadow-sm"
      onMouseEnter={() => onHover(advice.targets)}
      onMouseLeave={() => onHover([])}
      onFocus={() => onHover(advice.targets)}
      onBlur={() => onHover([])}
    >
      <p className="text-xs leading-relaxed text-card-foreground">{advice.text}</p>
      {advice.status === "applied" ? (
        <p className="mt-2 text-xs font-bold text-primary">✓ 已应用</p>
      ) : advice.status === "ignored" ? (
        <p className="mt-2 text-xs text-muted-foreground line-through">已忽略</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={applyLocked}
            onClick={() => onApply(advice.id)}
            title={applyLocked ? "接龙态前人的段落锁着拍子，传完这棒再应用" : undefined}
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            应用
          </button>
          <button
            type="button"
            onClick={() => onIgnore(advice.id)}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
          >
            忽略
          </button>
        </div>
      )}
    </li>
  );
}
