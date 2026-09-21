import type { useHome } from "@/pages/Home/useHome";
import { AiAdviceCard } from "./AiAdviceCard";

// 混音助手建议列表：读 p.aiMixList（分析在 Logic 层跑，纯本地规则）。
// 0 条时按规格播报「画布已经很均衡」而不是空面板。
export function AiMixList(p: ReturnType<typeof useHome>) {
  if (p.aiMixList.length === 0) {
    return (
      <p className="border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
        画布已经很均衡，暂时没有混音建议。
        <br />
        多画几条线或动一动再按「重新分析」。
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {p.aiMixList.map((a) => (
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
