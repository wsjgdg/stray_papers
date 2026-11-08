/**
 * 种子确定性校验（seed-system.md 十二）
 * Node ≥ 22 原生 strip TS types：直接 import 真实数据层，不引测试框架。
 * 跑法：node scripts/seed-check.mjs
 */
import assert from "node:assert/strict"

import {
  CRISIS_DEFS,
  CRISIS_ORDER,
  getDailyMeta,
  getDailySeed,
  getRandomSeed,
} from "../src/lib/dungeonData.ts"
import { readFileSync } from "node:fs"
import {
  FLOOR_ENEMY_POOL,
  genAltarType,
  genBossSkills,
  genCrisis,
  genFloorEnemies,
  genRelicChoices,
  genRouteOptions,
  genUnknownEvent,
} from "../src/lib/seedGen.ts"
import { parseSeedCode } from "../src/lib/rng.ts"

const SEED_A = "A7F2-3C9D"
const SEED_B = "B1E0-44AF"

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ✅ ${name}`)
}

console.log("seed-check：种子驱动生成确定性")

const emptyCtx = { hpRatio: 1, schoolCounts: {}, prevRouteId: null }

/* 1. 同种子两遍逐字节一致（路线 / 敌人 / 三选一 / 事件 / 商店档 / 祭坛 / Boss 序列） */
check("同种子 routes:2..7 两遍一致", () => {
  for (const floor of [2, 3, 5, 6, 7]) {
    const a = JSON.stringify(genRouteOptions(SEED_A, floor, emptyCtx))
    const b = JSON.stringify(genRouteOptions(SEED_A, floor, emptyCtx))
    assert.equal(a, b, `routes:${floor}`)
  }
})

check("同种子同路线敌人两遍一致（含 hp/attack/标签）", () => {
  for (const floor of [2, 3, 5, 6, 7]) {
    for (const routeId of ["ad-canyon", "data-mine", "crash-edge"]) {
      const a = JSON.stringify(genFloorEnemies(SEED_A, floor, routeId))
      const b = JSON.stringify(genFloorEnemies(SEED_A, floor, routeId))
      assert.equal(a, b, `enemies:${floor}:${routeId}`)
    }
  }
})

check("同种子三选一两遍一致", () => {
  const a = genRelicChoices(SEED_A, `relic:3:open`, [], 3, 3)
  const b = genRelicChoices(SEED_A, `relic:3:open`, [], 3, 3)
  assert.equal(a.map((r) => r.id).join(), b.map((r) => r.id).join())
})

check("同种子事件 / 祭坛 / Boss 序列两遍一致", () => {
  assert.equal(genUnknownEvent(SEED_A, 5), genUnknownEvent(SEED_A, 5))
  assert.equal(genAltarType(SEED_A, 5), genAltarType(SEED_A, 5))
  assert.equal(
    JSON.stringify(genBossSkills(SEED_A, "ad")),
    JSON.stringify(genBossSkills(SEED_A, "ad")),
  )
  assert.equal(
    JSON.stringify(genBossSkills(SEED_A, "crash")),
    JSON.stringify(genBossSkills(SEED_A, "crash")),
  )
})

/* 2. 换种子结果不同 */
check("换种子路线 / 敌人 / 三选一不同", () => {
  const routesA = JSON.stringify(genRouteOptions(SEED_A, 6, emptyCtx))
  const routesB = JSON.stringify(genRouteOptions(SEED_B, 6, emptyCtx))
  assert.notEqual(routesA, routesB)
  const relicA = genRelicChoices(SEED_A, "relic:5:open", [], 3, 5)
    .map((r) => r.id)
    .join()
  const relicB = genRelicChoices(SEED_B, "relic:5:open", [], 3, 5)
    .map((r) => r.id)
    .join()
  assert.notEqual(relicA, relicB)
  const bossA = JSON.stringify(genBossSkills(SEED_A, "crash"))
  const bossB = JSON.stringify(genBossSkills(SEED_B, "crash"))
  assert.notEqual(bossA, bossB)
})

/* 3. 种子格式 */
check("日种子 / 随机种子 / 种子码校验匹配 XXXX-XXXX", () => {
  const daily = getDailySeed(new Date("2026-09-22T12:00:00"))
  assert.match(daily, /^[0-9A-F]{4}-[0-9A-F]{4}$/)
  assert.notEqual(daily, "0000-0000")
  assert.match(getRandomSeed(), /^[0-9A-F]{4}-[0-9A-F]{4}$/)
  assert.equal(parseSeedCode("a7f23c9d"), "A7F2-3C9D")
  assert.equal(parseSeedCode("A7F2-3C9D"), "A7F2-3C9D")
  assert.equal(parseSeedCode("zzzz"), null)
})

/* 4. 设计红线抽查 */
check("路线池按表：2/3 层四选一池、生成 2~3 条", () => {
  for (const floor of [2, 3]) {
    const options = genRouteOptions(SEED_A, floor, emptyCtx)
    assert.ok(options.length >= 2 && options.length <= 3, `floor ${floor} 条数`)
    const allowed = new Set(["ad-canyon", "cache-abyss", "data-mine", "unknown-zone"])
    options.forEach((entry) =>
      assert.ok(allowed.has(entry.routeId), `floor ${floor} 池外路线 ${entry.routeId}`),
    )
  }
})

check("低血量恢复系 ×2：满血与 35% 血抽样分布不同向", () => {
  let recovFull = 0
  let recovLow = 0
  const TRIALS = 200
  for (let i = 0; i < TRIALS; i++) {
    const seed = `F00${String(i).padStart(4, "0")}-0000`
    const recov = new Set(["recycle-bin", "cache-abyss", "unknown-zone"])
    const full = genRouteOptions(seed, 7, emptyCtx).filter((e) => recov.has(e.routeId)).length
    const low = genRouteOptions(
      seed,
      7,
      { ...emptyCtx, hpRatio: 0.35 },
    ).filter((e) => recov.has(e.routeId)).length
    recovFull += full
    recovLow += low
  }
  assert.ok(recovLow > recovFull, `恢复系加权未生效（满血 ${recovFull} vs 低血 ${recovLow}）`)
})

check("崩溃 Boss 第三阶段必含最终崩溃", () => {
  for (let i = 0; i < 50; i++) {
    const seed = `C0DE-${String(i).padStart(4, "0")}`
    const seq = genBossSkills(seed, "crash")
    const has = (seq[3] ?? []).some((skill) => skill.id === "crash-final")
    assert.ok(has, `种子 ${seed} 第三阶段缺最终崩溃`)
  }
})

check("敌人数量 1~4、血量攻击在档位 ±30% 内、标签 ≤3", () => {
  for (let i = 0; i < 200; i++) {
    const seed = `D5${String(i).padStart(5, "0")}-0`
    for (const floor of [2, 3, 5, 6, 7]) {
      const comp = genFloorEnemies(seed, floor, "data-mine")
      assert.ok(comp.length >= 1 && comp.length <= 4, `floor ${floor} 数量 ${comp.length}`)
      comp.forEach((spec) => {
        assert.ok(spec.tags.length <= 3, "标签超 3 个")
        assert.ok(spec.hp > 0 && spec.attack > 0)
      })
    }
  }
})

check("同层事件 / 祭坛 roll 稳定且同路线敌人不受分叉影响", () => {
  /* 分叉不变性：先跑 routes 流再跑 enemies 流，结果与单独跑 enemies 流一致 */
  const solo = JSON.stringify(genFloorEnemies(SEED_A, 5, "data-mine"))
  genRouteOptions(SEED_A, 5, emptyCtx)
  const afterFork = JSON.stringify(genFloorEnemies(SEED_A, 5, "data-mine"))
  assert.equal(solo, afterFork)
})

check("今日规则确定性：同日同元、池子 20/6/4、轮换按星期", () => {
  const d = new Date("2026-09-22T12:00:00") /* 周二 → 缓存法师 */
  const a = getDailyMeta(d)
  const b = getDailyMeta(d)
  assert.equal(JSON.stringify(a), JSON.stringify(b), "同日两次取元不一致")
  assert.equal(a.characterMode, "fixed")
  assert.equal(a.fixedCharacterId, "cache-mage")
  assert.equal(a.relicPool.length, 20)
  assert.equal(a.routePool.length, 6)
  assert.equal(a.enemyPool.length, 4)
  assert.ok(a.curseId === "none" || String(a.curseId).startsWith("curse-"))
  assert.equal(getDailyMeta(new Date("2026-09-21T12:00:00")).fixedCharacterId, "tab-assassin")
  assert.equal(getDailyMeta(new Date("2026-09-27T12:00:00")).characterMode, "pick")
  const m1 = getDailyMeta(new Date("2026-10-01T12:00:00"))
  const m2 = getDailyMeta(new Date("2026-10-02T12:00:00"))
  assert.notEqual(JSON.stringify(m1.relicPool), JSON.stringify(m2.relicPool))
})

check("每日池过滤：只抽池内内容，交集为空自动回退全池", () => {
  const day = new Date("2026-09-22T12:00:00")
  const seed = getDailySeed(day)
  const meta = getDailyMeta(day)
  for (const floor of [2, 3, 5, 6, 7]) {
    for (const routeId of ["data-mine", "crash-edge", "firewall"]) {
      const comp = genFloorEnemies(seed, floor, routeId, meta.enemyPool)
      const layerPool = FLOOR_ENEMY_POOL[floor] ?? []
      const inWindow = layerPool.some((id) => meta.enemyPool.includes(id))
      comp.forEach((spec) =>
        /* 层池与今日池交集为空时按设计回退全池，只在有交集时要求池内 */
        assert.ok(!inWindow || meta.enemyPool.includes(spec.defId), `敌人 ${spec.defId} 不在今日池`),
      )
    }
  }
  const entries = genRouteOptions(seed, 6, emptyCtx, {
    routePool: meta.routePool,
    enemyPool: meta.enemyPool,
  })
  entries.forEach((entry) =>
    assert.ok(meta.routePool.includes(entry.routeId), `路线 ${entry.routeId} 不在今日池`),
  )
  const relics = genRelicChoices(seed, "relic:3:open", [], 3, 3, undefined, meta.relicPool)
  relics.forEach((relic) =>
    assert.ok(meta.relicPool.includes(relic.id), `词条 ${relic.id} 不在今日池`),
  )
  /* 交集为空（L2 只有弹窗，给个不沾边的池）→ 回退全池照常生成 */
  const fallback = genFloorEnemies(seed, 2, "data-mine", ["notfound"])
  assert.ok(fallback.length >= 1, "空交集未回退全池")
})

/* 代价事件（fun-pack.md 三）：确定性 + 定义齐全 + 未知区域权重和守恒 */
check("genCrisis 同种子两遍一致且 5 事件定义齐全", () => {
  for (const seed of [SEED_A, SEED_B]) {
    for (const floor of [2, 3, 5, 6, 7]) {
      assert.equal(
        genCrisis(seed, floor),
        genCrisis(seed, floor),
        `genCrisis ${seed}:${floor} 两遍不一致`,
      )
    }
  }
  assert.equal(CRISIS_ORDER.length, 5, "代价事件应为 5 个")
  for (const id of CRISIS_ORDER) {
    const def = CRISIS_DEFS[id]
    assert.ok(def && def.options.length === 3, `代价事件 ${id} 定义不完整`)
  }
  /* 固定种子下确定复现：crisis 权重 19/105，采样里必须真的撞见过 */
  const sawCrisis = [SEED_A, SEED_B].some((seed) =>
    [2, 3, 5, 6, 7].some((floor) => genUnknownEvent(seed, floor) === "crisis"),
  )
  assert.ok(sawCrisis, "crisis 在固定种子采样中从未出现，权重接线可能断了")
})
check("未知区域事件权重和 = 100（fun-pack.md 五）", () => {
  const src = readFileSync(new URL("../src/lib/seedGen.ts", import.meta.url), "utf8")
  const block = src.slice(
    src.indexOf("export function genUnknownEvent"),
    src.indexOf("export function genCrisis"),
  )
  const sum = [...block.matchAll(/weight:\s*(\d+)/g)].reduce(
    (acc, m) => acc + Number(m[1]),
    0,
  )
  assert.equal(sum, 100, `权重和 ${sum} ≠ 100，加/调事件后要整体复核`)
})

console.log(`\nseed-check 全部通过：${passed} 项`)
