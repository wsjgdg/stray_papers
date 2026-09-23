/**
 * 种子驱动随机流（规格 .rh/pages/seed-system.md 一）
 *
 * 原则：一局的所有「内容生成」（路线 / 敌人 / 词条 / 事件 / 商店 / 祭坛 / Boss 技能序列）
 * 只准走这里的 streamFor；战斗内的实时随机（暴击 / 闪避 / 掉落位置）继续 Math.random。
 * 每个生成物有独立子流（键 = 固定字符串 + 层号 + 局种子），玩家路径分叉不影响其他分支内容，
 * 保证「同种子 + 同版本 → 内容完全一致」。
 */

/** 版本盐：改池表 / 权重表时 bump 一次，保证旧种子不被悄悄改变 */
export const GEN_SALT = "seed-gen-v1"

/** cyrb128：字符串 → uint32 */
export function hashString(input: string): number {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  // eslint-disable-next-line no-bitwise
  return (h1 ^ h2 ^ h3 ^ h4) >>> 0
}

/** mulberry32：确定性强随机 */
export function makeRng(seedNum: number): () => number {
  let a = seedNum >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 局种子 + 固定键 → 独立随机流 */
export function streamFor(runSeed: string, key: string): () => number {
  return makeRng(hashString(`${GEN_SALT}:${runSeed}:${key}`))
}

export function rollInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

export type Weighted<T> = { item: T; weight: number }

export function pickWeighted<T>(rng: () => number, items: Weighted<T>[]): T {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = rng() * total
  for (const entry of items) {
    roll -= entry.weight
    if (roll < 0) return entry.item
  }
  return items[items.length - 1].item
}

/** 按权重不放回抽 n 个（池不足时全取） */
export function pickWeightedMany<T>(
  rng: () => number,
  items: Weighted<T>[],
  n: number,
): T[] {
  const rest = [...items]
  const out: T[] = []
  while (out.length < n && rest.length > 0) {
    const hit = pickWeighted(rng, rest)
    out.push(hit)
    rest.splice(
      rest.findIndex((entry) => entry.item === hit),
      1,
    )
  }
  return out
}

/** Fisher–Yates（替换所有 .sort(() => Math.random()-0.5) 式洗牌） */
export function shuffleSeeded<T>(rng: () => number, items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** 0.9 ~ 1.1 的种子浮动系数 */
export function float0911(rng: () => number): number {
  return 0.9 + rng() * 0.2
}

/** 种子码显示格式：uint32 → XXXX-XXXX（8 位十六进制大写） */
export function formatSeedCode(hash: number): string {
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(-8)
  return `${hex.slice(0, 4)}-${hex.slice(4)}`
}

const SEED_CODE_RE = /^[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}$/

/** 校验并归一化玩家输入的 8 位十六进制种子码；不合法返回 null */
export function parseSeedCode(input: string): string | null {
  const trimmed = input.trim()
  if (!SEED_CODE_RE.test(trimmed)) return null
  const hex = trimmed.replace("-", "").toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4)}`
}
