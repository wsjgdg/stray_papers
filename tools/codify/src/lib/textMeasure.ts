// Canvas 文本测量（Pretext 式方案）：在 DOM 外用 measureText() 完成文本宽度测量，
// 不触发昂贵的布局重排——虚拟滚动的行高全部预先算好，滚动过程零 DOM 测量。
// 测量结果按「字体 + 文本」缓存，同一段文本只测一次。

export interface Chip {
  text: string
  font: string // canvas font 串，如 "11px system-ui, sans-serif"
  padX: number // 芯片左右内边距合计（纯文本段为 0）
}

let ctx: CanvasRenderingContext2D | null | undefined

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx === undefined) {
    try {
      ctx = document.createElement("canvas").getContext("2d")
    } catch {
      ctx = null
    }
  }
  return ctx
}

const WIDTH_CACHE = new Map<string, number>()
const WIDTH_CACHE_CAP = 4000

export function measureTextWidth(text: string, font: string): number {
  const key = `${font}|${text}`
  const hit = WIDTH_CACHE.get(key)
  if (hit !== undefined) return hit
  const c = getCtx()
  // canvas 不可用（极旧环境 / SSR）时按「CJK 全宽、其余半宽」估算，宁可略宽不重叠
  let w: number
  if (c) {
    c.font = font
    w = c.measureText(text).width
  } else {
    w = 0
    for (const ch of text) w += /[⺀-鿿豈-﫿︰-﹯＀-｠]/.test(ch) ? 11 : 6
  }
  if (WIDTH_CACHE.size >= WIDTH_CACHE_CAP) WIDTH_CACHE.clear()
  WIDTH_CACHE.set(key, w)
  return w
}

// 模拟 flex-wrap 排版：给一排「芯片」（文本段 / 徽标 / 标签），算出在 maxWidth 内会折成几行。
// 与浏览器布局同为贪心换行，误差只来自字体近似——虚拟滚动用它预算行高，
// 即使个别行偏差一两像素，也只是滚动条高度略不准，不会重叠或截断（真实布局仍由 CSS 完成）。
export function countChipLines(chips: Chip[], gapX: number, maxWidth: number): number {
  if (chips.length === 0) return 0
  let lines = 1
  let used = 0
  for (const chip of chips) {
    const w = measureTextWidth(chip.text, chip.font) + chip.padX
    if (used > 0 && used + gapX + w > maxWidth) {
      lines++
      used = w
    } else {
      used += (used > 0 ? gapX : 0) + w
    }
  }
  return lines
}
