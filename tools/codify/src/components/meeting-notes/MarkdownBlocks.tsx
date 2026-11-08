import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  createMdParser,
  flushMd,
  pushMdChunk,
  type MdBlock,
} from "@/lib/incrementalMd"

// 块级渲染器：只认「已完成的块」，每块一个节点——流式追加时只在末尾挂新节点，
// 已挂载的块不重解析不重渲染（React 按 key 复用），长文本下也没有全量重排。
export function MarkdownBlocks({ blocks, className }: { blocks: MdBlock[]; className?: string }) {
  // 有序列表编号：连续 ordered li 递增，遇其他块归零
  let olCounter = 0
  return (
    <div className={cn("space-y-1.5", className)}>
      {blocks.map((b, i) => {
        if (b.kind !== "li" || !b.ordered) olCounter = 0
        const key = `${i}-${b.kind}`
        if (b.kind === "heading") {
          return (
            <p
              key={key}
              className={cn(
                "font-semibold tracking-tight text-foreground",
                b.level <= 2 ? "text-sm" : "text-[13px]",
              )}
            >
              {b.text}
            </p>
          )
        }
        if (b.kind === "quote") {
          return (
            <p key={key} className="border-l-2 border-primary/40 pl-2.5 text-[13px] leading-relaxed text-muted-foreground">
              {b.text}
            </p>
          )
        }
        if (b.kind === "li") {
          const marker = b.ordered ? `${++olCounter}.` : "•"
          return (
            <p key={key} className="flex items-baseline gap-1.5 text-[13px] leading-relaxed text-foreground/85">
              <span className="shrink-0 text-muted-foreground cjk-latin tabular-nums">{marker}</span>
              <span className="min-w-0">{b.text}</span>
            </p>
          )
        }
        return (
          <p key={key} className="text-[13px] leading-relaxed text-foreground/85">
            {b.text}
          </p>
        )
      })}
    </div>
  )
}

// 流式消费组件：直接吃 AsyncIterable<string>（各 Provider 已把 SSE / WebSocket / chunked
// 归一化成这个契约），内部驱动增量解析状态机，块完成即挂载。
// 当前平台通道为 poll-first（无 chatStream 实现），注册流式 Provider 后此组件即被点亮；
// 非流式路径用 parseMdBlocks + MarkdownBlocks 渲染，两条路径口径一致。
export function StreamingMarkdown({
  stream,
  className,
  onDone,
  onError,
}: {
  stream: AsyncIterable<string>
  className?: string
  onDone?: (fullText: string) => void
  onError?: (err: unknown) => void
}) {
  const [blocks, setBlocks] = useState<MdBlock[]>([])

  useEffect(() => {
    const parser = createMdParser()
    let cancelled = false
    let full = ""
    ;(async () => {
      try {
        for await (const chunk of stream) {
          if (cancelled) return
          full += chunk
          const fresh = pushMdChunk(parser, chunk)
          if (fresh.length > 0) setBlocks((prev) => [...prev, ...fresh])
        }
        if (cancelled) return
        const tail = flushMd(parser)
        if (tail.length > 0) setBlocks((prev) => [...prev, ...tail])
        onDone?.(full)
      } catch (err) {
        if (!cancelled) onError?.(err)
      }
    })()
    return () => {
      cancelled = true
    }
    // stream 由调用方按次创建（一次问答一个 iterable），不按引用做依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <MarkdownBlocks blocks={blocks} className={className} />
}
