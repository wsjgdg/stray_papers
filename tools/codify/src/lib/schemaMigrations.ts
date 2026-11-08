// 数据 schema 迁移注册表：备份 / 持久化载荷的结构演进走「一版一步」的链式迁移，
// 不依赖宽容解析兜住结构性变更。
//
// 政策（与 store.ts 的备份契约配套）：
// - 新增可选字段：不需要迁移——宽容解析天然向前/向后兼容；
// - 结构性变更（改名 / 删除 / 语义变化）：**必须**在这里注册一个
//   migrate_vN_to_vN+1 函数，并把 SCHEMA_VERSION 升到 N+1。禁止跳版
//   （注册表出现空洞时链会断，导入只能退回宽容解析并如实告警）；
// - 导入时从备份自带的 version 起链式调用，直到当前版本。高版本备份
//   （未来导出的）不迁移，按既有宽容策略尝试读取；
// - 每个迁移函数应是纯函数：入参对象 → 新对象，不触盘、不抛异常
//   （单步失败由链执行器捕获、记日志、停在当前版——剩余差异交给宽容解析）。
//
// 新增一版的操作清单：
// 1. 写 migrateV<N>ToV<N+1>（纯函数），在 MIGRATIONS 注册键 N；
// 2. SCHEMA_VERSION 改为 N+1；
// 3. 在 scripts/golden-set.mjs 里加一条「vN 样本 → 迁移 → 结构断言」用例；
// 4. 旧版本导出的真实备份样本存进 scripts/fixtures/（有则加，无则至少用合成样本）。

export type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>

// 当前 schema 版本。store.ts 的 BACKUP_VERSION 引用这里，保证「导出版本」
// 与「迁移链终点」永远是同一个数。
export const SCHEMA_VERSION = 1

// 键 = 源版本 N，值 = N → N+1 的迁移函数。当前 schema 仍是 v1（首版），
// 注册表为空是正常状态——机制先行，第一次结构变更时开始积累。
export const MIGRATIONS: Record<number, MigrationFn> = {}

export interface MigrationResult {
  obj: Record<string, unknown>
  /** 载荷声明的源版本（缺失时按 1 处理——历史备份都带 version，缺失视为最老） */
  fromVersion: number
  /** 实际成功应用的迁移步（[1,2] = v1→v2→v3） */
  applied: number[]
  /** 链在某版断掉（注册表空洞或单步抛错）：停在断点版本，剩余差异交给宽容解析 */
  stoppedAt: number | null
}

/**
 * 从 raw.version 起链式迁移到 current。纯函数、不抛异常：
 * 单步失败记日志并停在当前版（stoppedAt 标记断点），调用方据此如实告警。
 * table/current 可注入——golden-set 用合成注册表验证链机制，不污染生产表。
 */
export function applyMigrationChain(
  raw: Record<string, unknown>,
  table: Record<number, MigrationFn> = MIGRATIONS,
  current: number = SCHEMA_VERSION,
): MigrationResult {
  const fromVersion =
    typeof raw.version === "number" && Number.isFinite(raw.version) ? Math.floor(raw.version) : 1
  if (fromVersion >= current) {
    // 已是当前版，或来自未来（更高版本导出）：不迁移，宽容读取
    return { obj: raw, fromVersion, applied: [], stoppedAt: null }
  }
  let obj = raw
  const applied: number[] = []
  for (let v = fromVersion; v < current; v++) {
    const fn = table[v]
    if (!fn) {
      console.error(`[migrations] 缺少 v${v} → v${v + 1} 迁移函数，链在 v${v} 断开`)
      return { obj, fromVersion, applied, stoppedAt: v }
    }
    try {
      obj = fn(obj)
      obj = { ...obj, version: v + 1 }
      applied.push(v)
    } catch (err) {
      console.error(`[migrations] v${v} → v${v + 1} 迁移失败，停在 v${v}`, err)
      return { obj, fromVersion, applied, stoppedAt: v }
    }
  }
  return { obj, fromVersion, applied, stoppedAt: null }
}
