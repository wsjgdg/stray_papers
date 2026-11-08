/**
 * 结算页的竖版分享图：纯 Canvas 2D 手绘（圆角矩形 + 文字 + 色块），
 * 不引入任何截图 / 绘图库。所有颜色与字体都从 :root 的 CSS 变量现读，
 * 代码里不出现任何写死的色值。
 */

import type { RelicSchoolKey } from "@/lib/dungeonData"

const CARD_WIDTH = 720
const CARD_HEIGHT = 1280
const CARD_SCALE = 2
const PADDING = 48

type SharePalette = {
  background: string
  card: string
  foreground: string
  muted: string
  border: string
  primary: string
  primaryForeground: string
  destructive: string
  fontDisplay: string
  fontMono: string
  radiusMd: number
  radiusSm: number
}

export type ShareRelicChip = {
  name: string
  school: RelicSchoolKey
}

export type ShareBondLine = {
  name: string
  desc: string
}

export type ShareImageInput = {
  characterName: string
  roleLabel: string
  cleared: boolean
  floor: number
  floorTotal: number
  cause: string
  kills: number
  damageDealt: number
  reward: number
  seed: string
  durationLabel: string
  bestFloor: number
  relics: ShareRelicChip[]
  bonds: ShareBondLine[]
}

/* ------------------------------------------------------------------ *
 * 取色：全部来自 :root 的 CSS 变量（值是 "211 100% 50%" 这种分量写法）
 * ------------------------------------------------------------------ */

function toCssColor(raw: string, fallbackRaw: string): string {
  const value = (raw || fallbackRaw).trim()
  if (!value) return "transparent"
  if (value.includes(",")) return `hsl(${value})`
  return `hsl(${value.split(/\s+/).join(", ")})`
}

function buildPalette(): SharePalette {
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string) => styles.getPropertyValue(name).trim()
  const primaryRaw = read("--primary")

  return {
    background: toCssColor(read("--background"), read("--card")),
    card: toCssColor(read("--card"), read("--background")),
    foreground: toCssColor(read("--foreground"), read("--card-foreground")),
    muted: toCssColor(read("--muted-foreground"), read("--foreground")),
    border: toCssColor(read("--border"), read("--muted-foreground")),
    primary: toCssColor(primaryRaw, read("--ring")),
    primaryForeground: toCssColor(read("--primary-foreground"), read("--foreground")),
    destructive: toCssColor(read("--destructive"), read("--foreground")),
    fontDisplay: read("--font-display") || "sans-serif",
    fontMono: read("--font-mono") || "monospace",
    radiusMd: Number.parseFloat(read("--radius-md")) || 6,
    radiusSm: Number.parseFloat(read("--radius-sm")) || 4,
  }
}

function schoolColor(palette: SharePalette, school: RelicSchoolKey): string {
  if (school === "script") return palette.primary
  if (school === "general") return palette.primary
  if (school === "style") return palette.destructive
  if (school === "network") return palette.foreground
  return palette.muted
}

/* ------------------------------------------------------------------ *
 * 绘制小工具
 * ------------------------------------------------------------------ */

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  roundRectPath(ctx, x, y, width, height, radius)
  ctx.fillStyle = color
  ctx.fill()
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  lineWidth = 2,
): void {
  roundRectPath(ctx, x, y, width, height, radius)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  family: string,
  weight: "normal" | "bold" = "normal",
): void {
  ctx.font = `${weight} ${size}px ${family}`
}

/** 按可用宽度把一段文字切成若干行（中英混排按字符量测） */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let current = ""

  for (const char of text) {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current)
      current = char
      if (lines.length === maxLines) break
    } else {
      current = next
    }
  }

  if (lines.length < maxLines && current.length > 0) lines.push(current)
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth - 24) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`
    }
  }
  return lines
}

/* ------------------------------------------------------------------ *
 * 主绘制
 * ------------------------------------------------------------------ */

export function renderRunShareImage(input: ShareImageInput): string | null {
  if (typeof document === "undefined") return null

  const palette = buildPalette()
  const canvas = document.createElement("canvas")
  canvas.width = CARD_WIDTH * CARD_SCALE
  canvas.height = CARD_HEIGHT * CARD_SCALE
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(CARD_SCALE, CARD_SCALE)

  const innerWidth = CARD_WIDTH - PADDING * 2
  const accent = input.cleared ? palette.primary : palette.destructive

  /* 底色 + 两团光斑，跟站内的暗底发光一致 */
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  ctx.globalAlpha = 0.22
  ctx.fillStyle = palette.primary
  ctx.beginPath()
  ctx.arc(120, 150, 210, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = palette.destructive
  ctx.beginPath()
  ctx.arc(640, 1120, 190, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  /* 外框 */
  strokeRoundRect(
    ctx,
    PADDING / 2,
    PADDING / 2,
    CARD_WIDTH - PADDING,
    CARD_HEIGHT - PADDING,
    palette.radiusMd * 3,
    palette.border,
  )

  let cursor = 96

  /* 眉标 */
  setFont(ctx, 20, palette.fontMono, "bold")
  ctx.fillStyle = palette.muted
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("标签地牢 · 本局战绩", PADDING, cursor)
  cursor += 16

  /* 角色名 */
  setFont(ctx, 60, palette.fontDisplay, "bold")
  ctx.fillStyle = palette.foreground
  ctx.fillText(input.characterName, PADDING, cursor + 56)
  cursor += 82

  /* 结局标签 */
  const badgeText = input.cleared ? "通关 · 地牢打穿" : "倒下 · 标签全灭"
  setFont(ctx, 22, palette.fontMono, "bold")
  const badgeWidth = ctx.measureText(badgeText).width + 40
  ctx.globalAlpha = 0.16
  fillRoundRect(ctx, PADDING, cursor, badgeWidth, 46, palette.radiusSm, accent)
  ctx.globalAlpha = 1
  strokeRoundRect(ctx, PADDING, cursor, badgeWidth, 46, palette.radiusSm, accent)
  ctx.fillStyle = accent
  ctx.fillText(badgeText, PADDING + 20, cursor + 31)
  cursor += 78

  /* 到达层数 + 用时 */
  setFont(ctx, 42, palette.fontDisplay, "bold")
  ctx.fillStyle = palette.foreground
  ctx.fillText(`第 ${input.floor} / ${input.floorTotal} 层`, PADDING, cursor)
  cursor += 46

  setFont(ctx, 20, palette.fontMono)
  ctx.fillStyle = palette.muted
  ctx.fillText(
    `用时 ${input.durationLabel} · 历史最深 ${input.bestFloor} 层 · 角色定位 ${input.roleLabel}`,
    PADDING,
    cursor,
  )
  cursor += 34

  /* 死因 / 通关说明 */
  setFont(ctx, 22, palette.fontMono)
  ctx.fillStyle = palette.foreground
  const causeLines = wrapText(ctx, input.cause, innerWidth, 2)
  causeLines.forEach((line, index) => {
    ctx.fillText(line, PADDING, cursor + index * 32)
  })
  cursor += causeLines.length * 32 + 26

  /* 三格数据 */
  const statGap = 16
  const statWidth = (innerWidth - statGap * 2) / 3
  const statHeight = 112
  const stats: { label: string; value: string; accent?: boolean }[] = [
    { label: "关掉标签", value: String(input.kills) },
    { label: "总伤害", value: String(input.damageDealt) },
    { label: "本局碎片", value: `+${input.reward}`, accent: true },
  ]
  stats.forEach((stat, index) => {
    const x = PADDING + index * (statWidth + statGap)
    ctx.globalAlpha = 0.9
    fillRoundRect(ctx, x, cursor, statWidth, statHeight, palette.radiusMd, palette.card)
    ctx.globalAlpha = 1
    strokeRoundRect(ctx, x, cursor, statWidth, statHeight, palette.radiusMd, palette.border)

    setFont(ctx, 18, palette.fontMono)
    ctx.fillStyle = palette.muted
    ctx.fillText(stat.label, x + 18, cursor + 40)

    setFont(ctx, 38, palette.fontDisplay, "bold")
    ctx.fillStyle = stat.accent ? palette.primary : palette.foreground
    ctx.fillText(stat.value, x + 18, cursor + 88)
  })
  cursor += statHeight + 40

  /* 词条 */
  setFont(ctx, 18, palette.fontMono, "bold")
  ctx.fillStyle = palette.muted
  ctx.fillText(`本局词条 ${input.relics.length} 个`, PADDING, cursor)
  cursor += 22

  if (input.relics.length === 0) {
    setFont(ctx, 22, palette.fontMono)
    ctx.fillStyle = palette.muted
    ctx.fillText("这局一个词条都没带走", PADDING, cursor + 20)
    cursor += 44
  } else {
    setFont(ctx, 20, palette.fontMono, "bold")
    let chipX = PADDING
    let chipY = cursor + 6
    const chipHeight = 42
    input.relics.forEach((relic) => {
      const chipWidth = ctx.measureText(relic.name).width + 34
      if (chipX + chipWidth > CARD_WIDTH - PADDING) {
        chipX = PADDING
        chipY += chipHeight + 12
      }
      const color = schoolColor(palette, relic.school)
      ctx.globalAlpha = 0.14
      fillRoundRect(ctx, chipX, chipY, chipWidth, chipHeight, palette.radiusSm, color)
      ctx.globalAlpha = 1
      strokeRoundRect(ctx, chipX, chipY, chipWidth, chipHeight, palette.radiusSm, color)
      ctx.fillStyle = color
      ctx.fillText(relic.name, chipX + 17, chipY + 28)
      chipX += chipWidth + 12
    })
    cursor = chipY + chipHeight + 34
  }

  /* 流派 combo */
  if (input.bonds.length > 0) {
    ctx.globalAlpha = 0.14
    fillRoundRect(ctx, PADDING, cursor, innerWidth, 96, palette.radiusMd, palette.primary)
    ctx.globalAlpha = 1
    strokeRoundRect(ctx, PADDING, cursor, innerWidth, 96, palette.radiusMd, palette.primary)
    setFont(ctx, 22, palette.fontMono, "bold")
    ctx.fillStyle = palette.primary
    ctx.fillText(
      `流派点亮 · ${input.bonds.map((bond) => bond.name).join(" / ")}`,
      PADDING + 20,
      cursor + 40,
    )
    setFont(ctx, 18, palette.fontMono)
    ctx.fillStyle = palette.muted
    ctx.fillText(input.bonds[0].desc, PADDING + 20, cursor + 72)
    cursor += 122
  }

  /* 种子码 */
  const seedTop = CARD_HEIGHT - PADDING - 300
  const seedY = Math.max(cursor, seedTop)
  fillRoundRect(ctx, PADDING, seedY, innerWidth, 150, palette.radiusMd, palette.card)
  strokeRoundRect(ctx, PADDING, seedY, innerWidth, 150, palette.radiusMd, palette.primary)
  setFont(ctx, 18, palette.fontMono, "bold")
  ctx.fillStyle = palette.muted
  ctx.fillText("本局种子码", PADDING + 24, seedY + 40)
  setFont(ctx, 44, palette.fontMono, "bold")
  ctx.fillStyle = palette.primary
  ctx.fillText(input.seed, PADDING + 24, seedY + 96)
  setFont(ctx, 18, palette.fontMono)
  ctx.fillStyle = palette.muted
  ctx.fillText("把这串码给朋友，他能玩到同一局", PADDING + 24, seedY + 128)

  /* 页脚 */
  setFont(ctx, 18, palette.fontMono)
  ctx.fillStyle = palette.muted
  ctx.textAlign = "center"
  ctx.fillText("标签地牢 · 一局一分钟的浏览器小游戏", CARD_WIDTH / 2, CARD_HEIGHT - PADDING - 24)
  ctx.textAlign = "left"

  return canvas.toDataURL("image/png")
}

export function downloadShareImage(dataUrl: string, fileName: string): void {
  if (typeof document === "undefined") return
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = fileName
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function buildShareFileName(seed: string): string {
  const safe = seed.replace(/[^\w-]+/g, "") || "run"
  return `标签地牢-${safe}.png`
}
