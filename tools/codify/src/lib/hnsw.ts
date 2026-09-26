// HNSW（Hierarchical Navigable Small World）近似最近邻索引——纯图逻辑，零外部依赖。
//
// 与向量格式解耦：距离通过注入的打分器回调计算（相似度语义，越大越近），
// Worker 侧接 4-bit 量化向量 + LRU 解码缓存；测试侧接普通 float 向量。
//
// 实现要点（Malkov & Yashunin 2018 的紧凑版）：
// - 层级抽签 level = floor(-ln(U) · mL)，mL = 1/ln(M)；确定性种子 RNG，同数据同构建结果；
// - 插入：顶层贪心下降（ef=1）→ 逐层 searchLayer(efConstruction) → 启发式邻居选择
//   （多样性剪枝：候选与已选邻居过近则跳过，避免枢纽节点霸占链接）→ 双向连边 + 超限收缩；
// - 查询：上层贪心下降 → 第 0 层 efSearch 束搜索 → 过滤墓碑 → topK；
// - 删除 = 墓碑标记（图结构不动，遍历可穿过、结果与选邻排除）；墓碑比例超阈值由调用方触发重建
//   （HNSW 原地物理删除会破坏图连通性，重建是该规模下的正确做法）。
//
// 规模口径：个人会议档案（几百场 × ~21 段 ≈ 万级节点），构建秒级、查询毫秒级；
// 万级以下暴力扫描本就 <10ms，因此调用方设了 HNSW 启用门槛，小库直接精确扫描。

export interface HnswOptions {
  m?: number // 每节点每层最大出边（第 0 层为 2m）
  efConstruction?: number
  efSearch?: number
  seed?: number // 确定性层级抽签
}

export interface HnswHit {
  id: number
  score: number // 相似度（越大越相关）
}

export interface HnswScorers {
  /** 查询向量 ↔ 节点：相似度 */
  queryToNode: (query: Float32Array, nodeId: number) => number
  /** 节点 ↔ 节点：相似度（邻居选择启发式与收缩用） */
  nodeToNode: (a: number, b: number) => number
  /** 节点是否已墓碑 */
  isDeleted: (nodeId: number) => boolean
}

// 参数口径（个人会议档案：万级节点、后台构建、查询毫秒级）：
// m=8 / efConstruction=80 是构建成本与召回的平衡点（efC 翻倍 ≈ 建图时间翻倍，
// 万级节点全量构建需控制在分钟内）；efSearch=96，调用方可按 topK 显式放大。
const DEFAULT_M = 8
const DEFAULT_EF_CONSTRUCTION = 80
const DEFAULT_EF_SEARCH = 128

// mulberry32：小而确定的 PRNG（层级抽签唯一随机源）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class HnswIndex {
  private readonly m: number
  private readonly mMax0: number
  private readonly efConstruction: number
  readonly efSearch: number
  private readonly mL: number
  private readonly rng: () => number
  private readonly scorers: HnswScorers

  private levels: number[] = [] // nodeId → 最高层
  private links: number[][][] = [] // nodeId → layer → 邻居 ids
  private deleted = new Set<number>()
  private entry = -1
  private maxLevel = -1
  private liveN = 0

  constructor(scorers: HnswScorers, opts: HnswOptions = {}) {
    this.m = opts.m ?? DEFAULT_M
    this.mMax0 = this.m * 2
    this.efConstruction = opts.efConstruction ?? DEFAULT_EF_CONSTRUCTION
    this.efSearch = opts.efSearch ?? DEFAULT_EF_SEARCH
    this.mL = 1 / Math.log(this.m)
    this.rng = mulberry32(opts.seed ?? 0x5eed)
    this.scorers = scorers
  }

  get size(): number {
    return this.levels.length
  }

  liveCount(): number {
    return this.liveN
  }

  deletedCount(): number {
    return this.deleted.size
  }

  // 墓碑占比：调用方据此决定是否触发重建压缩
  tombstoneRatio(): number {
    return this.levels.length === 0 ? 0 : this.deleted.size / this.levels.length
  }

  private randomLevel(): number {
    const u = this.rng()
    return Math.max(0, Math.floor(-Math.log(Math.max(u, 1e-12)) * this.mL))
  }

  add(id: number): void {
    if (id < this.levels.length) return // 已有节点（重复 add 幂等）
    const lvl = this.randomLevel()
    this.levels[id] = lvl
    this.links[id] = Array.from({ length: lvl + 1 }, () => [])
    this.liveN++
    const { nodeToNode, isDeleted } = this.scorers

    if (this.entry < 0 || isDeleted(this.entry)) {
      this.entry = id
      if (lvl > this.maxLevel) this.maxLevel = lvl
      return
    }

    // 插入目标以「节点 id」身份参与打分：nodeToNode(id, ·)
    const scorer = (other: number) => nodeToNode(id, other)
    let eps = [this.entry]

    // 顶层 → lvl+1：贪心下降（ef=1）
    for (let l = this.maxLevel; l > lvl; l--) {
      eps = this.searchLayer(scorer, eps, 1, l).map((c) => c.id)
    }
    // min(lvl, maxLevel) → 0：束搜索 + 连边
    const top = Math.min(lvl, this.maxLevel)
    for (let l = top; l >= 0; l--) {
      const cand = this.searchLayer(scorer, eps, this.efConstruction, l)
      const mMax = l === 0 ? this.mMax0 : this.m
      const neighbors = this.selectNeighbors(id, cand, this.m, l)
      this.links[id][l] = neighbors.map((c) => c.id)
      for (const nb of neighbors) {
        const list = this.links[nb.id][l]
        list.push(id)
        if (list.length > mMax) {
          // 超限收缩：以 nb 为目标重新启发式选邻
          const shrunk = this.selectNeighbors(nb.id, this.candFromList(nb.id, list, l), mMax, l)
          this.links[nb.id][l] = shrunk.map((c) => c.id)
        }
      }
      eps = cand.map((c) => c.id)
    }

    if (lvl > this.maxLevel) {
      this.maxLevel = lvl
      this.entry = id
    }
  }

  markDeleted(id: number): void {
    if (id >= this.levels.length || this.deleted.has(id)) return
    this.deleted.add(id)
    this.liveN--
    if (this.entry === id) {
      // 入口墓碑：换一个最高层的活节点当入口（找不到则置空，等重建）
      let best = -1
      let bestLvl = -1
      for (let i = 0; i < this.levels.length; i++) {
        if (!this.deleted.has(i) && this.levels[i] > bestLvl) {
          best = i
          bestLvl = this.levels[i]
        }
      }
      this.entry = best
      this.maxLevel = bestLvl
    }
  }

  search(query: Float32Array, k: number, ef?: number): HnswHit[] {
    if (this.entry < 0 || this.liveN === 0) return []
    const scorer = (nodeId: number) => this.scorers.queryToNode(query, nodeId)
    let eps = [this.entry]
    for (let l = this.maxLevel; l > 0; l--) {
      eps = this.searchLayer(scorer, eps, 1, l).map((c) => c.id)
    }
    // ef 下限随 k 放大：深 topK（按段取节点再聚合到会议的场景，k 上百）需要更宽的
    // 束搜索才能保住召回；上限 1024 封顶防止病态 k 拖垮延迟
    const efUsed = Math.max(ef ?? this.efSearch, Math.min(k * 3, 1024))
    const found = this.searchLayer(scorer, eps, efUsed, 0)
    const out: HnswHit[] = []
    for (const c of found) {
      if (this.deleted.has(c.id)) continue
      out.push({ id: c.id, score: c.score })
      if (out.length >= k) break
    }
    return out
  }

  // ── 内部：单层束搜索（相似度语义：优先扩展分高的候选，结果集按分数保 top-ef） ──

  private searchLayer(
    scorer: (nodeId: number) => number,
    entryIds: number[],
    ef: number,
    layer: number,
  ): { id: number; score: number }[] {
    const visited = new Set<number>()
    // candidates：待扩展，按分数降序；results：当前 top-ef，按分数降序
    const candidates: { id: number; score: number }[] = []
    const results: { id: number; score: number }[] = []
    const pushSorted = (arr: { id: number; score: number }[], item: { id: number; score: number }) => {
      // 小规模有序数组二分插入（ef ≤ 数百，插入成本可忽略）
      let lo = 0
      let hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (arr[mid].score > item.score) lo = mid + 1
        else hi = mid
      }
      arr.splice(lo, 0, item)
    }
    for (const id of entryIds) {
      if (visited.has(id)) continue
      visited.add(id)
      const item = { id, score: scorer(id) }
      pushSorted(candidates, item)
      pushSorted(results, item)
      if (results.length > ef) results.pop()
    }
    while (candidates.length > 0) {
      const best = candidates.shift()!
      const worst = results[results.length - 1]
      // 候选里最有希望的都比结果集最差的低 → 不可能再改善（墓碑不参与终止判定外的比较）
      if (results.length >= ef && worst && best.score < worst.score) break
      const neighbors = this.links[best.id]?.[layer] ?? []
      for (const nb of neighbors) {
        if (visited.has(nb)) continue
        visited.add(nb)
        const score = scorer(nb)
        const worstNow = results[results.length - 1]
        if (results.length < ef || (worstNow && score > worstNow.score)) {
          pushSorted(candidates, { id: nb, score })
          pushSorted(results, { id: nb, score })
          if (results.length > ef) results.pop()
        }
      }
    }
    return results
  }

  // 启发式邻居选择：按分数降序取，但与「已选邻居」比与目标更近的候选跳过（多样性剪枝）
  private selectNeighbors(
    targetId: number,
    cand: { id: number; score: number }[],
    m: number,
    layer: number,
  ): { id: number; score: number }[] {
    const { nodeToNode, isDeleted } = this.scorers
    const kept: { id: number; score: number }[] = []
    for (const c of cand) {
      if (kept.length >= m) break
      if (c.id === targetId || isDeleted(c.id)) continue
      let dominated = false
      for (const s of kept) {
        // 候选与已选邻居的距离比它与目标的距离更近 → 该候选被已选覆盖，跳过
        if (nodeToNode(c.id, s.id) > c.score) {
          dominated = true
          break
        }
      }
      if (!dominated) kept.push(c)
    }
    // 剪枝过狠导致欠配时用普通 top-m 兜底，保证图连通
    if (kept.length === 0) {
      for (const c of cand) {
        if (kept.length >= m) break
        if (c.id !== targetId && !isDeleted(c.id)) kept.push(c)
      }
    }
    void layer
    return kept
  }

  private candFromList(
    targetId: number,
    list: number[],
    layer: number,
  ): { id: number; score: number }[] {
    const { nodeToNode } = this.scorers
    const out: { id: number; score: number }[] = []
    for (const id of list) {
      if (id === targetId) continue
      out.push({ id, score: nodeToNode(targetId, id) })
    }
    out.sort((a, b) => b.score - a.score)
    void layer
    return out
  }
}
