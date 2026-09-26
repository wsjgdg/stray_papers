// 逐块保真校验（chunk-level fidelity verification）：
// 「补标点分段」由 LLM 执行，提示词虽然铁律禁止改写，但模型仍可能静默丢词、加词、改措辞。
// 信任指令不如信任机器——整理稿逐块与原文做字符级对齐，只允许三类差异：
//   ① 标点 / 空白 / 分段变化（归一化后不可见，天然放行）；
//   ② 时间戳标记格式（结构化前缀，比对前整体剥除）；
//   ③ 小步单字替换（≤2 连续字，疑似同音错别字修正——整理本来就是它的职责，计数放行）。
// 其余改动（成段增字、丢字、连续 ≥3 字改写、整块对不上原文）一律标记「疑似改写」，
// 由用户对照决定——校验不自动回滚整理稿，也不静默接受。
//
// 算法：整理稿按行切块（超长行再细分），每块取内容探针在原文归一化串上按游标顺序定位，
// 对「块 ↔ 定位窗口」做编辑距离 DP（带规模上限），回溯操作序列并聚类成改动簇逐簇判定。
// 纯函数、零依赖（仅借 textPure 的相似度做超长块粗判），主线程与 text.worker 共用。

import { textSimilarity } from "@/lib/textPure"

export type FidelityFlagKind = "unaligned" | "insert" | "delete" | "rewrite" | "minor" | "overall"

export interface FidelityIssue {
  kind: FidelityFlagKind
  line: number // 1-based：问题块在整理稿中的行号；overall 类为 0
  detail: string // 机器生成的问题描述（含具体增删改的字符）
  origSnippet: string // 对应原文片段（截断展示）
  polishedSnippet: string // 整理稿片段（截断展示）
}

export interface FidelityReport {
  chunks: number // 参与校验的块数（整理稿非空内容行）
  flagged: number // 疑似有实质改动的块数
  typoFixes: number // 被放行的疑似错别字修正处数（≤2 连续字替换 + 零星单字增删）
  issues: FidelityIssue[] // 问题明细（上限 MAX_ISSUES 条，flagged 计数不受限）
  origChars: number // 原文有效内容字符数（归一化后）
  polishedChars: number // 整理稿有效内容字符数
  // 聚合改动量（内容字符口径）：转写稿「用户修正率」度量复用同一套对齐引擎，
  // 质量信号面板按 插入/删除/替换 拆分修正类型（同音错字以替换为主，删词丢句以删除为主）
  insertChars: number
  deleteChars: number
  subChars: number
}

// ── 归一化：剥时间戳标记 → 去标点空白 → 记录每个内容字符的原始偏移与行号 ──

// 时间戳标记是结构化前缀，整理要求原样保留但格式可能微调（[3:25]↔[03:25]），
// 比对前整体剥除，避免数字位数变化造成误报；行首裸时间戳（00:12 老王：…）同样剥除
const TS_TOKEN_RE = /\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]|\(\s*\d{1,2}:\d{2}(?::\d{2})?\s*\)/g
const TS_LINE_HEAD_RE = /^[ \t]*\d{1,2}:\d{2}(?::\d{2})?[ \t]*/gm
// 标点与空白（与 ai.ts 引用校验同一口径，另含常见全角符号）；单字符判定，不能带 g 标记
const PUNCT_RE = /[\s“”"‘’'《》〈〉【】[\]（）()。，,、；;：:！!？?…—\-–·~～|/\\]/

interface NormText {
  chars: string // 归一化后的内容字符串（已小写）
  source: string // 剥除时间戳标记后的源文本（rawOf 的偏移基准）
  rawOf: number[] // 内容字符 i → source 中的偏移
  lineOf: number[] // 内容字符 i → 1-based 行号
}

function normalize(text: string): NormText {
  const stripped = text.replace(TS_TOKEN_RE, "").replace(TS_LINE_HEAD_RE, "")
  let chars = ""
  const rawOf: number[] = []
  const lineOf: number[] = []
  let line = 1
  let offset = 0
  for (const ch of stripped) {
    if (ch === "\n") {
      line++
      offset += ch.length
      continue
    }
    if (PUNCT_RE.test(ch)) {
      offset += ch.length
      continue
    }
    chars += ch.toLowerCase()
    rawOf.push(offset)
    lineOf.push(line)
    offset += ch.length
  }
  return { chars, source: stripped, rawOf, lineOf }
}

// ── 编辑距离 DP（带操作回溯）──

type OpKind = 0 | 1 | 2 | 3 // 0 匹配 / 1 替换 / 2 删除（原文有、整理稿无）/ 3 插入（整理稿多出来）
interface AlignOp {
  t: OpKind
  a: string // 整理稿侧字符（匹配/替换/插入时有值）
  b: string // 原文侧字符（匹配/替换/删除时有值）
}

const DP_CELL_CAP = 4_000_000 // 超过此规模的块退化为整体相似度粗判

// freeTrail：窗口尾部允许「免费跳过」的原文字符数——尾探针定位失败时窗口带冗余尾巴，
// 冗余不属于整理稿该块的内容，不能计成删除；尾探针定位成功时 freeTrail = 0（窗口紧贴，
// 块内真实删改全部计入编辑距离）
function alignOps(
  a: string,
  b: string,
  freeTrail: number,
): { dist: number; ops: AlignOp[] } | null {
  const la = a.length
  const lb = b.length
  if (la * lb > DP_CELL_CAP) return null
  const W = lb + 1
  const d = new Uint32Array((la + 1) * W)
  const bk = new Uint8Array((la + 1) * W) // 0 对角 / 1 上（插入 a[i-1]）/ 2 左（删除 b[j-1]）
  for (let j = 1; j <= lb; j++) {
    d[j] = j
    bk[j] = 2
  }
  for (let i = 1; i <= la; i++) {
    const row = i * W
    d[row] = i
    bk[row] = 1
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const diag = d[row - W + j - 1] + (ai === b.charCodeAt(j - 1) ? 0 : 1)
      const up = d[row - W + j] + 1
      const left = d[row + j - 1] + 1
      let best = diag
      let move = 0
      if (up < best) {
        best = up
        move = 1
      }
      if (left < best) {
        best = left
        move = 2
      }
      d[row + j] = best
      bk[row + j] = move
    }
  }
  // 终点：freeTrail > 0 时在窗口尾部冗余区里取最优终点（免费跳过的尾巴不产生操作）
  let endJ = lb
  let best = d[la * W + lb]
  for (let j = Math.max(0, lb - freeTrail); j < lb; j++) {
    if (d[la * W + j] < best) {
      best = d[la * W + j]
      endJ = j
    }
  }
  const ops: AlignOp[] = []
  let i = la
  let j = endJ
  while (i > 0 || j > 0) {
    const move = bk[i * W + j]
    if (i > 0 && j > 0 && move === 0) {
      const eq = a[i - 1] === b[j - 1]
      ops.push({ t: eq ? 0 : 1, a: a[i - 1], b: b[j - 1] })
      i--
      j--
    } else if (i > 0 && (move === 1 || j === 0)) {
      ops.push({ t: 3, a: a[i - 1], b: "" })
      i--
    } else {
      ops.push({ t: 2, a: "", b: b[j - 1] })
      j--
    }
  }
  ops.reverse()
  return { dist: best, ops }
}

// ── 分块：整理稿按行切，超长行细分（无换行的整段粘贴也能逐块校验）──

interface Chunk {
  line: number // 1-based 整理稿行号
  raw: string // 原始行内容（展示用）
  start: number // 块内容在归一化整理稿里的起点（细分行时非行首）
  content: string // 归一化内容字符
}

const CHUNK_SPLIT_CHARS = 1200

function buildChunks(polishedNorm: NormText): Chunk[] {
  // 按行号分组内容字符，再对超长行细分
  const byLine = new Map<number, { content: string; start: number }[]>()
  let curLine = 1
  let curContent = ""
  let curStart = 0
  for (let i = 0; i < polishedNorm.chars.length; i++) {
    const ln = polishedNorm.lineOf[i]
    if (ln !== curLine) {
      if (curContent) pushLine(byLine, curLine, curContent, curStart)
      curLine = ln
      curContent = ""
      curStart = i
    }
    curContent += polishedNorm.chars[i]
  }
  if (curContent) pushLine(byLine, curLine, curContent, curStart)

  const chunks: Chunk[] = []
  for (const [line, parts] of byLine) {
    for (const p of parts) {
      if (p.content.length <= CHUNK_SPLIT_CHARS) {
        chunks.push({ line, raw: "", start: p.start, content: p.content })
      } else {
        for (let off = 0; off < p.content.length; off += CHUNK_SPLIT_CHARS) {
          chunks.push({
            line,
            raw: "",
            start: p.start + off,
            content: p.content.slice(off, off + CHUNK_SPLIT_CHARS),
          })
        }
      }
    }
  }
  return chunks
}

function pushLine(
  byLine: Map<number, { content: string; start: number }[]>,
  line: number,
  content: string,
  start: number,
): void {
  const list = byLine.get(line)
  if (list) list.push({ content, start })
  else byLine.set(line, [{ content, start }])
}

// ── 主流程 ──

const PROBE_LEN = 8 // 定位探针长度（内容字符数）
const CURSOR_BACKOFF = 64 // 游标回退容差（块间内容连续，允许少量重叠）
const WINDOW_SLACK_RATIO = 0.4 // 窗口冗余比例（容忍原文侧更长的删改区域）
const WINDOW_SLACK_MIN = 32
const MAX_DIST_RATIO = 0.2 // 编辑距离容忍比例（超过 = 改动过多，直接判疑似改写）
const MAX_DIST_MIN = 8
const MINOR_CAP = 2 // 单块内允许放行的零星单字增删次数
const MAX_ISSUES = 40 // 报告的问题明细上限（计数不封顶）
const TINY_CHUNK = 4 // 短于此长度的块对不上原文时不标记（「嗯」「对」类填充语合并属正常整理）

export function verifyFidelity(original: string, polished: string): FidelityReport {
  const origNorm = normalize(original)
  const polNorm = normalize(polished)
  const rawLines = polished.split("\n")
  const chunks = buildChunks(polNorm)
  // buildChunks 里拿不到原始行文本，这里统一回填（行号 → 原始行）
  const lineRaw = new Map<number, string>()
  rawLines.forEach((l, i) => lineRaw.set(i + 1, l.trim()))
  for (const c of chunks) c.raw = lineRaw.get(c.line) ?? ""

  const issues: FidelityIssue[] = []
  const pushIssue = (iss: FidelityIssue) => {
    if (issues.length < MAX_ISSUES) issues.push(iss)
  }
  let flagged = 0
  let typoFixes = 0
  let insTotal = 0
  let delTotal = 0
  let subTotal = 0
  let cursor = 0 // 原文归一化串上的推进游标
  let prevLine = 0 // 上一块的行号：块间丢失的内容归属于上一块结尾（丢在它之后）
  // 块间空隙检测：整理只应改标点/分段，块与块之间的原文内容字符不应凭空消失。
  // 上一块对齐终点与本块起点之间若夹着原文内容（超过容差），说明有整段被丢——
  // 这是块内 DP 看不见的盲区（丢的内容根本不在任何块里）
  const GAP_TOLERANCE = 2

  for (const chunk of chunks) {
    const a = chunk.content
    const la = a.length
    const result = locateAndAlign(a, origNorm, cursor)
    if (result === null) {
      // 定位失败：短块（填充语）静默跳过，正常块标记「无法对齐」
      if (la >= TINY_CHUNK) {
        flagged++
        insTotal += la // 对不上原文的内容全部按「多出」计
        pushIssue({
          kind: "unaligned",
          line: chunk.line,
          detail: "在原文中找不到与该块对应的内容片段（疑似被改写或凭空生成）",
          origSnippet: "",
          polishedSnippet: clip(chunk.raw, 80),
        })
      }
      continue
    }
    const gap = result.ws - cursor
    if (gap > GAP_TOLERANCE) {
      flagged++
      delTotal += gap
      pushIssue({
        kind: "delete",
        line: prevLine || chunk.line,
        detail: `此处疑似丢失 ${gap} 字原文内容（在整理稿第 ${prevLine || chunk.line} 行之后消失）`,
        origSnippet: clip(snippetOf(origNorm, cursor, result.ws), 80),
        polishedSnippet: "",
      })
    }
    cursor = Math.max(cursor, result.ws + la)
    prevLine = chunk.line

    const aligned = alignOps(a, result.b, result.freeTrail)
    if (aligned === null) {
      // 超长块退化为整体相似度粗判（DP 规模超上限）
      const sim = textSimilarity(a.slice(0, 4000), result.b.slice(0, 4000))
      if (sim < 0.85) {
        flagged++
        pushIssue({
          kind: "rewrite",
          line: chunk.line,
          detail: `块过长无法逐字比对，整体相似度仅 ${Math.round(sim * 100)}%，疑似大量改写`,
          origSnippet: clip(snippetOf(origNorm, result.ws, result.ws + result.b.length), 80),
          polishedSnippet: clip(chunk.raw, 80),
        })
      }
      continue
    }

    const maxDist = Math.max(MAX_DIST_MIN, Math.ceil(la * MAX_DIST_RATIO))
    if (aligned.dist > maxDist) {
      flagged++
      for (const op of aligned.ops) {
        if (op.t === 1) subTotal++
        else if (op.t === 2) delTotal++
        else if (op.t === 3) insTotal++
      }
      pushIssue({
        kind: "rewrite",
        line: chunk.line,
        detail: `内容改动过多（编辑距离 ${aligned.dist}，容忍 ${maxDist}），疑似整段改写`,
        origSnippet: clip(snippetOf(origNorm, result.ws, result.ws + result.b.length), 80),
        polishedSnippet: clip(chunk.raw, 80),
      })
      continue
    }

    // 操作序列聚类 → 逐簇判定
    const chunkIssues = classifyOps(aligned.ops, (iss) => {
      pushIssue({
        ...iss,
        line: chunk.line,
        origSnippet: clip(snippetOf(origNorm, result.ws, result.ws + result.b.length), 80),
        polishedSnippet: clip(chunk.raw, 80),
      })
    })
    typoFixes += chunkIssues.typoFixes
    insTotal += chunkIssues.ins
    delTotal += chunkIssues.del
    subTotal += chunkIssues.sub
    if (chunkIssues.flagged) flagged++
  }

  // 尾部空隙：最后一块之后原文还剩大段内容 = 结尾被整段丢掉
  const tailGap = origNorm.chars.length - cursor
  if (tailGap > Math.max(GAP_TOLERANCE, Math.ceil(origNorm.chars.length * 0.02))) {
    flagged++
    pushIssue({
      kind: "delete",
      line: 0,
      detail: `整理稿结尾疑似丢失 ${tailGap} 字原文内容`,
      origSnippet: clip(snippetOf(origNorm, cursor, origNorm.chars.length), 80),
      polishedSnippet: "",
    })
  }

  // 整体长度对账：逐块校验之外的最后一道网（大量小块被丢时块级游标仍能走完）
  const oc = origNorm.chars.length
  const pc = polNorm.chars.length
  if (oc > 0 && pc < oc * 0.92) {
    pushIssue({
      kind: "overall",
      line: 0,
      detail: `整理稿有效内容比原文少 ${Math.round((1 - pc / oc) * 100)}%（${oc} → ${pc} 字），疑似整体丢内容`,
      origSnippet: "",
      polishedSnippet: "",
    })
    flagged++
  } else if (oc > 0 && pc > oc * 1.15) {
    pushIssue({
      kind: "overall",
      line: 0,
      detail: `整理稿有效内容比原文多 ${Math.round((pc / oc - 1) * 100)}%（${oc} → ${pc} 字），疑似掺入原文没有的内容`,
      origSnippet: "",
      polishedSnippet: "",
    })
    flagged++
  }

  return {
    chunks: chunks.length,
    flagged,
    typoFixes,
    issues,
    origChars: oc,
    polishedChars: pc,
    insertChars: insTotal,
    deleteChars: delTotal,
    subChars: subTotal,
  }
}

// 在原文归一化串上定位块并截取对齐窗口；找不到返回 null。
// 两级定位：首探针定窗口起点；尾探针能定住则窗口紧贴块内容（freeTrail=0，
// 块内真实删改全部进入编辑距离）；尾探针失配（尾部被改动）才放宽窗口带免费尾巴。
function locateAndAlign(
  a: string,
  orig: NormText,
  cursor: number,
): { ws: number; b: string; freeTrail: number } | null {
  const la = a.length
  const searchFrom = Math.max(0, cursor - CURSOR_BACKOFF)
  // 多探针定位：块首可能被模型加了字导致首探针失配，用 1/3、2/3 处探针兜底
  const offsets = la <= PROBE_LEN ? [0] : [0, Math.floor(la / 3), Math.floor((la * 2) / 3)]
  for (const from of [searchFrom, 0]) {
    for (const off of offsets) {
      const probe = a.slice(off, off + PROBE_LEN)
      if (probe.length < Math.min(3, la)) continue
      const idx = orig.chars.indexOf(probe, from)
      if (idx < 0) continue
      const ws = Math.max(0, idx - off)
      // 尾探针：从窗口起点往后找块尾内容，找得到就紧贴截窗
      const tail = a.slice(-Math.min(PROBE_LEN, la))
      const t = orig.chars.indexOf(tail, ws)
      if (t >= 0 && t + tail.length >= ws + Math.floor(la / 2)) {
        const we = Math.min(orig.chars.length, t + tail.length)
        return { ws, b: orig.chars.slice(ws, we), freeTrail: 0 }
      }
      // 尾探针失配：放宽窗口（容忍原文侧更长的删改区域），尾部冗余免费跳过
      const slack = Math.max(WINDOW_SLACK_MIN, Math.ceil(la * WINDOW_SLACK_RATIO))
      const we = Math.min(orig.chars.length, ws + la + slack)
      return { ws, b: orig.chars.slice(ws, we), freeTrail: Math.max(0, we - (ws + la)) }
    }
  }
  return null
}

// 原文归一化区间 → 源文本片段（展示用；偏移基准是剥时间戳后的 source）
function snippetOf(orig: NormText, ws: number, we: number): string {
  if (ws >= orig.rawOf.length || orig.rawOf.length === 0) return ""
  const s = orig.rawOf[ws]
  const lastIdx = Math.min(we, orig.rawOf.length) - 1
  const end = lastIdx >= 0 ? orig.rawOf[lastIdx] + 1 : s
  return orig.source.slice(s, end)
}

// 操作序列聚类判定：连续的非匹配操作聚成一簇，按簇内构成分类。
// 同时聚合插入/删除/替换字符量（修正率度量与「改了什么类型」拆分共用这份计数）
function classifyOps(
  ops: AlignOp[],
  emit: (iss: { kind: FidelityFlagKind; detail: string }) => void,
): { typoFixes: number; flagged: boolean; ins: number; del: number; sub: number } {
  let typoFixes = 0
  let minor = 0
  let flagged = false
  let ins = 0
  let del = 0
  let sub = 0
  let i = 0
  while (i < ops.length) {
    if (ops[i].t === 0) {
      i++
      continue
    }
    // 收集连续非匹配簇
    let j = i
    let nSub = 0
    let nIns = 0
    let nDel = 0
    let oldSide = ""
    let newSide = ""
    while (j < ops.length && ops[j].t !== 0) {
      const op = ops[j]
      if (op.t === 1) {
        nSub++
        oldSide += op.b
        newSide += op.a
      } else if (op.t === 2) {
        nDel++
        oldSide += op.b
      } else {
        nIns++
        newSide += op.a
      }
      j++
    }
    ins += nIns
    del += nDel
    sub += nSub
    const total = nSub + nIns + nDel
    if (nIns === 0 && nDel === 0) {
      // 纯替换簇：≤2 字视为疑似同音错别字修正（放行的合法改动），≥3 字 = 改写措辞
      if (total <= 2) typoFixes += total
      else {
        flagged = true
        emit({ kind: "rewrite", detail: `疑似改写措辞：「${oldSide}」→「${newSide}」` })
      }
    } else if (total === 1) {
      minor++
    } else {
      flagged = true
      const kind: FidelityFlagKind = nIns > nDel ? "insert" : nDel > nIns ? "delete" : "rewrite"
      const detail =
        kind === "insert"
          ? `疑似多出 ${total} 字内容：「${newSide}」`
          : kind === "delete"
            ? `疑似丢失 ${total} 字内容：「${oldSide}」`
            : `疑似改写内容：「${oldSide}」→「${newSide}」`
      emit({ kind, detail })
    }
    i = j
  }
  // 零星单字增删累计过多也不再放行（单处像错字修正，成堆就是改写）
  if (minor > MINOR_CAP) {
    flagged = true
    emit({ kind: "minor", detail: `另有 ${minor} 处单字增删（单处可能是错字修正，累计偏多请人工核对）` })
  } else {
    typoFixes += minor
  }
  return { typoFixes, flagged, ins, del, sub }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}
