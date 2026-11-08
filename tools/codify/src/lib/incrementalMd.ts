// 增量 Markdown 解析器（状态机驱动）：流式输出时每收到一个 chunk 从上次断点继续，
// 每解析出一个「完整块」立即交给 UI 挂载，而不是等整棵树建好再全量重解析。
//
// 抑制策略（防「半截标题先歪着再变正」的闪烁）：
// - 行缓冲：chunk 切在行中间时，残行留在 lineBuf 里等下一个 chunk，不渲染半行；
// - 段落缓冲：普通文本行攒进 para，直到空行 / 块级行 / 流结束才作为完整段落吐出——
//   未收尾的标题、引用、列表项天然不会提前出现（它们都以完整行到达才成块）。
//
// 纯函数状态机、零依赖：poll-first 整段到达时一次 feed 也能用（退化为单次全量解析）。

export type MdBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "li"; text: string; ordered: boolean }
  | { kind: "quote"; text: string }

export interface MdParser {
  lineBuf: string // 未收到换行符的残行（不渲染，等下一个 chunk）
  para: string[] // 攒着还没收尾的段落行
  blocks: MdBlock[] // 已完成的块（只增不改）
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/
const QUOTE_RE = /^>\s?(.*)$/
const UL_RE = /^[-*•]\s+(.+)$/
const OL_RE = /^\d+[.、)]\s+(.+)$/

export function createMdParser(): MdParser {
  return { lineBuf: "", para: [], blocks: [] }
}

// CJK 相邻的行合并段落时不加空格，拉丁文本加空格
function joinLines(a: string, b: string): string {
  const cjk = /[⺀-鿿豈-﫿︰-﹯＀-｠]/
  const tail = a.slice(-1)
  const head = b.slice(0, 1)
  return cjk.test(tail) || cjk.test(head) ? a + b : `${a} ${b}`
}

function flushPara(p: MdParser): void {
  if (p.para.length === 0) return
  p.blocks.push({ kind: "para", text: p.para.reduce((acc, l) => (acc ? joinLines(acc, l) : l), "") })
  p.para = []
}

function feedLine(p: MdParser, raw: string): void {
  const line = raw.trim()
  if (!line) {
    flushPara(p)
    return
  }
  const h = line.match(HEADING_RE)
  if (h) {
    flushPara(p)
    p.blocks.push({ kind: "heading", level: h[1].length, text: h[2].trim() })
    return
  }
  const q = line.match(QUOTE_RE)
  if (q && q[1].trim()) {
    flushPara(p)
    p.blocks.push({ kind: "quote", text: q[1].trim() })
    return
  }
  const ul = line.match(UL_RE)
  if (ul) {
    flushPara(p)
    p.blocks.push({ kind: "li", text: ul[1].trim(), ordered: false })
    return
  }
  const ol = line.match(OL_RE)
  if (ol) {
    flushPara(p)
    p.blocks.push({ kind: "li", text: ol[1].trim(), ordered: true })
    return
  }
  p.para.push(line)
}

// 喂入一个 chunk，返回「这次新完成的块」（增量，UI 直接 append）
export function pushMdChunk(p: MdParser, chunk: string): MdBlock[] {
  const before = p.blocks.length
  p.lineBuf += chunk
  const lines = p.lineBuf.split("\n")
  p.lineBuf = lines.pop() ?? "" // 残行留缓冲——半行不渲染
  for (const l of lines) feedLine(p, l)
  return p.blocks.slice(before)
}

// 流结束时收尾：残行与未收尾段落作为完整块吐出
export function flushMd(p: MdParser): MdBlock[] {
  const before = p.blocks.length
  if (p.lineBuf.trim()) feedLine(p, p.lineBuf)
  p.lineBuf = ""
  flushPara(p)
  return p.blocks.slice(before)
}

// 整段文本一次解析（非流式路径复用同一状态机，渲染口径一致）
export function parseMdBlocks(text: string): MdBlock[] {
  const p = createMdParser()
  pushMdChunk(p, text)
  flushMd(p)
  return p.blocks
}
