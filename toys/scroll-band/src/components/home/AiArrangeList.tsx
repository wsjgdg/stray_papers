import type { useHome } from "@/pages/Home/useHome";
import { AiAdviceCard } from "./AiAdviceCard";

// 编曲建议列表：和弦锚点组 / 鼓律动轨 / 换乐器 / 重复升一级变奏，
// 生成的对象与手动画线完全同源（进撤销栈、可编辑、可分享）。
export function AiArrangeList(p: ReturnType<typeof useHome>) {
  if (p.aiArrangeList.length === 0) {
    return (
      <p className="border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
        旋律已经够丰满了，这轮没有编曲建议。
        <br />
        选中一条主旋律再按「重新分析」，它会优先得到和弦与鼓律动。
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {p.aiArrangeList.map((a) => (
        <AiAdviceCard
          key={a.id}
          advice={a}
          applyLocked={p.aiApplyLocked}
          onApply={p.onAiApply}
          onIgnore={p.onAiIgnore}
          onHover={p.onAiHover}
        />
      ))}
    </ul>
  );
}
