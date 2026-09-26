// 实体消解（entity resolution）：「张三 / 张总 / 老张」是不是同一个人？
// 图谱的人物节点来自说话人标注、行动项负责人与 AI 补全实体，三个来源各自成节点，
// 没有归并层就会出现同人多节点（关系网被切碎）或误合并（两个人变一个人）。
//
// 机制分三层，全部本地免费：
// 1. 别名规则（用户确认后才生效）：alias → canonical 的映射，持久化在 localStorage；
//    支持传递闭包（张总→张三、张三→Zhang San 则 张总→Zhang San），带环保护。
// 2. 归并建议（只建议、不自动合并）：称谓模式（X总/X工/X老师/老X/小X）、名称包含、
//    归一化同名。人名歧义大，机器只做候选，合并动作必须由用户点。
// 3. 互斥约束（负样本）：同一场会议里以不同说话人身份同时出现的两个人，几乎不可能是
//    同一人——这类配对直接从建议里剔除；用户点过「不是同一人」的配对持久化排除。

import { parseTranscriptLines, type Meeting } from "@/lib/store"
import { vaultGetItem, vaultSetItem } from "@/lib/vault"

export interface AliasRule {
  alias: string // 别名（如「张总」）
  canonical: string // 归并到的主名（如「张三」）
}

const ALIASES_KEY = "meeting-notes-entity-aliases-v1"
const EXCLUSIONS_KEY = "meeting-notes-entity-exclusions-v1"
const ALIASES_CAP = 200
const EXCLUSIONS_CAP = 200

// 排除对的稳定 key：与顺序无关
export function exclusionKey(a: string, b: string): string {
  return [a.trim(), b.trim()].sort().join("≠")
}

export function loadAliasRules(): AliasRule[] {
  try {
    const raw = vaultGetItem(ALIASES_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list
      .filter(
        (r): r is AliasRule =>
          Boolean(r) && typeof (r as AliasRule).alias === "string" && typeof (r as AliasRule).canonical === "string",
      )
      .slice(0, ALIASES_CAP)
  } catch {
    return []
  }
}

export function saveAliasRules(rules: AliasRule[]): void {
  try {
    vaultSetItem(ALIASES_KEY, JSON.stringify(rules.slice(0, ALIASES_CAP)))
  } catch {
    // 写失败不阻塞图谱渲染；下次操作重试
  }
}

export function loadExclusions(): string[] {
  try {
    const raw = vaultGetItem(EXCLUSIONS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, EXCLUSIONS_CAP) : []
  } catch {
    return []
  }
}

export function saveExclusions(keys: string[]): void {
  try {
    vaultSetItem(EXCLUSIONS_KEY, JSON.stringify(keys.slice(0, EXCLUSIONS_CAP)))
  } catch {
    // 同上
  }
}

// 名称归一化：去首尾与内部空白、统一小写（英文名大小写差异不应产生两个节点）
export function normName(s: string): string {
  return s.trim().replace(/\s+/g, "").toLowerCase()
}

// 传递闭包 + 环保护：alias → 最终 canonical
export function buildAliasMap(rules: AliasRule[]): Map<string, string> {
  const direct = new Map<string, string>()
  for (const r of rules) {
    const a = r.alias.trim()
    const c = r.canonical.trim()
    if (a && c && a !== c) direct.set(a, c)
  }
  const out = new Map<string, string>()
  for (const start of direct.keys()) {
    let cur = start
    const seen = new Set<string>([start])
    let steps = 0
    while (steps++ < 10) {
      const next = direct.get(cur)
      if (!next || seen.has(next)) break
      seen.add(next)
      cur = next
    }
    if (cur !== start) out.set(start, cur)
  }
  return out
}

// 全部人物名与出现频次（说话人 + 负责人 + 人物型 AI 实体）：频次决定归并方向（主名 = 更常用的写法）
export function personNameStats(meetings: Meeting[]): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (name: string) => {
    const n = name.trim()
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  for (const m of meetings) {
    for (const l of parseTranscriptLines(m.transcript)) {
      if (l.speaker) bump(l.speaker)
    }
    for (const a of m.actions) bump(a.assignee)
    for (const e of m.entities ?? []) {
      if (e.type === "person") bump(e.name)
    }
  }
  return counts
}

// 同一场会议里以不同说话人身份同时出现的配对：互斥负样本，绝不建议归并
function speakerExclusionPairs(meetings: Meeting[]): Set<string> {
  const pairs = new Set<string>()
  for (const m of meetings) {
    const names = [...new Set(parseTranscriptLines(m.transcript).map((l) => l.speaker.trim()).filter(Boolean))]
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        pairs.add(exclusionKey(names[i], names[j]))
      }
    }
  }
  return pairs
}

export interface MergeSuggestion {
  a: string // 建议归并掉的一侧（别名）
  b: string // 建议保留的主名
  reason: string
}

// 中文称谓模式：X总 / X工 / X老师 / 老X / 小X……剥掉称谓后与另一个人名同干即候选
const HONORIFIC_SUFFIXES = ["总监", "经理", "老师", "医生", "律师", "教授", "老板", "书记", "厂长", "部长", "主管", "总", "工", "哥", "姐"]
const FAMILIAR_PREFIXES = ["老", "小"]

function stemOf(name: string): { stem: string; pattern: string } | null {
  for (const suf of HONORIFIC_SUFFIXES) {
    // 剥掉称谓后至少剩 1 个字：「张总」→ 张 ✓；「总监」本身不是人名 ✗
    if (name.length > suf.length && name.endsWith(suf)) {
      return { stem: name.slice(0, name.length - suf.length), pattern: `称谓「${suf}」` }
    }
  }
  for (const pre of FAMILIAR_PREFIXES) {
    if (name.length > pre.length && name.startsWith(pre)) {
      return { stem: name.slice(pre.length), pattern: `称呼「${pre}」` }
    }
  }
  return null
}

// 生成归并建议：只出候选，不自动改任何数据
export function suggestMerges(
  meetings: Meeting[],
  aliasMap: Map<string, string>,
  exclusions: string[],
): MergeSuggestion[] {
  const stats = personNameStats(meetings)
  const names = [...stats.keys()]
  if (names.length < 2) return []

  const excluded = new Set(exclusions)
  const mutex = speakerExclusionPairs(meetings)
  const canonOf = (n: string) => aliasMap.get(n.trim()) ?? n.trim()

  // 已归并到同一主名 / 已排除 / 同场互斥的配对都不再建议
  const blocked = (x: string, y: string): boolean => {
    if (x === y) return true
    if (canonOf(x) === canonOf(y)) return true // 已经指向同一主名
    if (excluded.has(exclusionKey(x, y))) return true
    if (mutex.has(exclusionKey(x, y))) return true
    return false
  }

  const out: MergeSuggestion[] = []
  const seenPair = new Set<string>()
  const push = (x: string, y: string, reason: string) => {
    if (blocked(x, y)) return
    const key = exclusionKey(x, y)
    if (seenPair.has(key)) return
    seenPair.add(key)
    // 主名 = 出现频次高的一侧；频次相同按字典序稳定输出
    const [alias, canonical] =
      (stats.get(x) ?? 0) > (stats.get(y) ?? 0) || ((stats.get(x) ?? 0) === (stats.get(y) ?? 0) && x.localeCompare(y) < 0)
        ? [x, y]
        : [y, x]
    out.push({ a: alias, b: canonical, reason })
  }

  // ① 归一化同名（大小写 / 空白差异）：确定性最高
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (normName(names[i]) === normName(names[j])) {
        push(names[i], names[j], "写法差异（大小写或空白）")
      }
    }
  }

  // ② 称谓模式：张总 ↔ 张三（剥掉称谓后同干）。
  //    歧义保护：干能匹配到多个人名时不建议（「张总」面对张三和张伟无法判断是谁），
  //    精确同名优先于前缀匹配
  for (const name of names) {
    const s = stemOf(name)
    if (!s) continue
    const stem = normName(s.stem)
    if (!stem) continue
    const others = names.filter((n) => n !== name && !blocked(name, n))
    const exact = others.filter((n) => normName(n) === stem)
    const prefixed = others.filter((n) => normName(n).startsWith(stem))
    if (exact.length === 1) {
      push(name, exact[0], `${s.pattern}：「${name}」即「${exact[0]}」`)
    } else if (exact.length === 0 && prefixed.length === 1) {
      push(name, prefixed[0], `${s.pattern}：「${s.stem}」与「${prefixed[0]}」`)
    }
    // 匹配到 0 个或多个：歧义或无对应，不建议——宁缺毋滥
  }

  // ③ 名称包含：短名 ≥2 字且是长名的连续子串（王芳 ↔ 王芳芳）——歧义大，仅作低置信候选
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const x = names[i]
      const y = names[j]
      if (seenPair.has(exclusionKey(x, y))) continue
      const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x]
      if (shorter.length >= 2 && normName(longer).includes(normName(shorter))) {
        push(x, y, "名称包含（可能是同一人的不同写法，请确认）")
      }
    }
  }

  return out
}
