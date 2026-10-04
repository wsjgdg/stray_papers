/**
 * 重音渲染（共享）：素材里的 **加粗** 记号是每一句的落点——
 * 此前它们以原样字符显示给玩家；现在按记号渲染成真正的加粗。
 * 用法：
 *   <RichText className="…" text={X} />        段落级（渲染成 <p>）
 *   <RichInline text={X} />                    行内级（渲染成片段，放进现有 <p>/<span>）
 *   parseEmphasis(X)                           取分段（逐字演出等自绘场景用）
 */
import type { ReactNode } from "react";

export interface EmphasisSegment {
  text: string;
  bold: boolean;
}

/** 按 ** 成对拆段：奇数个记号时整段按纯文本处理（不吞字） */
export function parseEmphasis(text: string): EmphasisSegment[] {
  if (!text.includes("**")) return [{ text, bold: false }];
  const parts = text.split("**");
  if (parts.length % 2 === 0) return [{ text: text.replaceAll("**", ""), bold: false }];
  const segments: EmphasisSegment[] = [];
  parts.forEach((part, index) => {
    if (part === "") return;
    segments.push({ text: part, bold: index % 2 === 1 });
  });
  return segments.length > 0 ? segments : [{ text: "", bold: false }];
}

/** 行内片段：放进现有 <p>/<span> 里用 */
export function RichInline({ text }: { text: string }) {
  return <>{renderSegments(parseEmphasis(text))}</>;
}

/** 段落级：渲染成 <p>，className 原样带过去 */
export function RichText({ text, className }: { text: string; className?: string }) {
  return <p className={className}>{renderSegments(parseEmphasis(text))}</p>;
}

function renderSegments(segments: EmphasisSegment[]): ReactNode[] {
  return segments.map((segment, index) =>
    segment.bold ? (
      <strong key={`${index}-${segment.text}`}>{segment.text}</strong>
    ) : (
      <span key={`${index}-${segment.text}`}>{segment.text}</span>
    ),
  );
}
