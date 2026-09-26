// Golden set：核心路径回归套件（依赖升级 / schema 变更后的最低验证门槛）。
//
// 用法：node scripts/golden-set.mjs（package.json 里的 `golden` script）。
// 环境：Node + fake-indexeddb（模拟 IndexedDB）+ vite ssrLoadModule（直接跑 src 的 TS，
// 无 Worker 时 textWorkerClient 自动走同步兜底——与浏览器路径同一份编解码实现）。
//
// 覆盖的核心路径（数据不丢不错的全部命门）：
//   1. schema 迁移链：合成注册表链式迁移 / 断链如实停 / 未来版本直通
//   2. 备份契约：导出 → 解析 → 会议数据保真；默认剔除密钥
//   3. 存储往返：大转写稿（分片+压缩）save → load → hydrate 逐字节一致
//   4. 压缩编解码：raw / lz4 / deflate / 归档档（zstd 或 deflate 兜底）往返一致
//   5. 事件日志：journalPatch 记差异 → buildRevertPatch 逆向恢复
//   6. 档案加密：开启后静态密文 → 错误密码拒绝 → 正确密码解锁 → 改密旧钥失效 → 关闭回明文
//   7. 安全删除：覆写后记录不可读
//
// 升级依赖的流程（见 docs/freeze-list.md）：一次只升一个 → 跑本套件 → tsc/eslint/build。
// 本套件红灯时禁止继续升级，先定位是依赖破坏还是套件自身过期。

import assert from "node:assert/strict"
import { createServer } from "vite"

// ── 浏览器环境模拟（必须在加载任何 src 模块之前装好）──
import "fake-indexeddb/auto"

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
globalThis.window = globalThis
globalThis.location = { pathname: "/", search: "", hash: "", origin: "http://localhost", href: "http://localhost/" }
globalThis.document = { createElement: () => ({ style: {} }), body: { appendChild() {}, removeChild() {} } }

let passed = 0
function ok(cond, label) {
  assert.ok(cond, label)
  passed++
  console.log(`  ✓ ${label}`)
}
function eq(a, b, label) {
  assert.deepEqual(a, b, label)
  passed++
  console.log(`  ✓ ${label}`)
}

const server = await createServer({
  configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  middlewareMode: true,
  server: { hmr: false, watch: null },
  logLevel: "error",
})
const load = (p) => server.ssrLoadModule(p)

try {
  // ── 1. schema 迁移链 ──
  console.log("\n[1] schema 迁移注册表")
  const { applyMigrationChain } = await load("/src/lib/schemaMigrations.ts")
  {
    const table = {
      1: (o) => ({ ...o, meetings: o.meetings.map((m) => ({ ...m, title: `[v2]${m.title}` })) }),
      2: (o) => ({ ...o, meetings: o.meetings.map((m) => ({ ...m, title: `[v3]${m.title}` })) }),
    }
    const r = applyMigrationChain({ version: 1, meetings: [{ title: "周会" }] }, table, 3)
    eq(r.applied, [1, 2], "v1→v3 链式应用两步")
    eq(r.obj.meetings[0].title, "[v3][v2]周会", "迁移按版本顺序叠加")
    eq(r.obj.version, 3, "版本号推进到当前")
    eq(r.stoppedAt, null, "完整链无断点")
  }
  {
    const table = { 1: (o) => o } // 缺 v2→v3
    const r = applyMigrationChain({ version: 1, meetings: [] }, table, 3)
    eq(r.applied, [1], "断链前已走的步保留")
    eq(r.stoppedAt, 2, "断链点如实标记（不硬解析）")
  }
  {
    const boom = applyMigrationChain({ version: 1, meetings: [] }, { 1: () => { throw new Error("x") } }, 2)
    eq(boom.stoppedAt, 1, "单步抛错不炸链，停在断点")
    const future = applyMigrationChain({ version: 99, meetings: [] }, {}, 3)
    eq(future.applied, [], "未来版本直通不迁移（宽容读取）")
    const noVer = applyMigrationChain({ meetings: [] }, {}, 3)
    eq(noVer.fromVersion, 1, "缺 version 按最老版本起链")
  }

  // ── 2. 备份契约 ──
  console.log("\n[2] 备份导出 → 导入保真")
  const storeMod = await load("/src/lib/store.ts")
  const { buildBackupPayload, parseBackupJson, backupVersionIssueOf, validateBackupObject, createMeeting } = storeMod
  {
    const m = createMeeting("季度复盘", "2026-09-01")
    m.transcript = "老王：三季度目标完成率 92%。\n小李：定价策略需要复盘。"
    m.actions = [{ id: "a1", text: "输出定价方案", owner: "小李", status: "open" }]
    const data = { meetings: [m], qaHistory: [{ id: "q1", question: "完成率?", answer: "92%", citations: [], createdAt: 1 }] }
    const payload = buildBackupPayload(data)
    eq(payload.version, storeMod.BACKUP_VERSION, "导出版本 = 迁移注册表当前版")
    eq(payload.secrets, "excluded", "默认剔除密钥")
    const back = parseBackupJson(JSON.stringify(payload))
    ok(back !== null, "自家导出可解析")
    eq(back.meetings.length, 1, "会议数保真")
    eq(back.meetings[0].title, "季度复盘", "标题保真")
    eq(back.meetings[0].transcript, m.transcript, "转写稿逐字保真")
    eq(back.meetings[0].actions[0].text, "输出定价方案", "行动项保真")
    eq(back.qaHistory.length, 1, "问答历史保真")
    ok(backupVersionIssueOf({ minReaderVersion: 99 }) !== null, "未来最低可读版本明确拒绝")
    ok(validateBackupObject({ app: "other-tool", meetings: [] }) === null, "他家备份拒绝")
    // 迁移链已接入导入主通道：v1 载荷经 validateBackupObject 原样通过
    ok(validateBackupObject(payload) !== null, "当前版载荷过迁移链后仍可导入")
  }

  // ── 3+4. 存储往返与压缩 ──
  console.log("\n[3] 存储往返（分片 + 压缩）")
  const idb = await load("/src/lib/idbStore.ts")
  const comp = await load("/src/lib/compression.ts")
  {
    // 压缩编解码往返
    const text = "会议纪要压缩样本。".repeat(400) // >512B 触发压缩
    const bytes = new TextEncoder().encode(text)
    const active = comp.compressActiveSync(bytes)
    ok(active.codec === "lz4", `活动档走 lz4（实际 ${active.codec}）`)
    eq(new TextDecoder().decode(comp.decompressSyncOnly(active)), text, "lz4 往返一致")
    const arch = await comp.compressBytes(bytes, "archive")
    ok(["zstd", "deflate", "raw"].includes(arch.codec), `归档档 codec=${arch.codec}`)
    eq(new TextDecoder().decode(await comp.decompressBytes(arch)), text, "归档档往返一致")
    const small = comp.compressActiveSync(new TextEncoder().encode("短"))
    eq(small.codec, "raw", "小载荷不压缩（raw）")

    // 全库写入 → 读取 → 大文本回填
    const big = createMeeting("全员大会", "2026-08-15")
    big.transcript = "【全员大会转写】".repeat(60_000) // ~1.8MB，必然跨分片
    const small2 = createMeeting("站会", "2026-08-16")
    small2.transcript = "今天三件事。"
    const saved = await idb.saveStoreData({ meetings: [big, small2], qaHistory: [] })
    ok(saved === true, "saveStoreData 成功（含写后读回校验）")
    const loaded = await idb.loadStoreData()
    eq(loaded.backend, "indexeddb", "后端为 IndexedDB")
    eq(loaded.data.meetings.length, 2, "会议数往返一致")
    const bigBack = loaded.data.meetings.find((x) => x.title === "全员大会")
    eq(bigBack.transcript, "", "大文本阶段 A 占位空串")
    ok(loaded.pending.some((p) => p.meetingId === big.id && p.field === "transcript"), "大字段进待回填清单")
    const hydrated = await idb.hydrateMeetingFields(big.id, ["transcript"])
    eq(hydrated.transcript, big.transcript, "阶段 B 回填逐字节一致（跨分片+压缩）")
  }

  // ── 5. 事件日志 ──
  console.log("\n[5] 事件日志：差异记录 → 时间点回滚")
  const journal = await load("/src/lib/eventJournal.ts")
  {
    const m = createMeeting("评审会", "2026-09-10")
    const before = structuredClone(m)
    const ts0 = Date.now()
    journal.journalPatch(m.id, before, { title: "评审会（改期）" })
    const evs = journal.eventsForMeeting(m.id)
    eq(evs.length, 1, "字段变更记录一条事件")
    ok(evs[0].revertable, "小字段事件可回滚")
    const current = { ...before, title: "评审会（改期）" }
    const patch = journal.buildRevertPatch(current, ts0)
    ok(patch !== null && patch.title === "评审会", "回滚补丁恢复旧标题")
    journal.journalPurge(m.id)
    eq(journal.eventsForMeeting(m.id).length, 0, "purge 清空该会议历史")
  }

  // ── 6. 档案加密 ──
  console.log("\n[6] 档案加密：开启 → 静态密文 → 改密 → 关闭")
  const vault = await load("/src/lib/vault.ts")
  const vaultOps = await load("/src/lib/vaultOps.ts")
  {
    const enabled = await vaultOps.enableVault("correct-horse-battery")
    eq(enabled, null, "开启加密成功（null = 无错误）")
    ok(vault.isVaultEnabled(), "vault 元数据已落盘")
    // 静态密文：绕过应用层直接读原始 IDB
    vault.lockVault()
    const locked = await idb.loadStoreData()
    eq(locked.data.meetings.length, 0, "锁定态：应用层读不出明文（静态密文）")
    ok(!(await vault.unlockVault("wrong-password")), "错误密码拒绝")
    ok(await vault.unlockVault("correct-horse-battery"), "正确密码解锁")
    const unlocked = await idb.loadStoreData()
    eq(unlocked.data.meetings.length, 2, "解锁后数据完整回来")

    // 改密 = 全量重加密：旧密码即刻失效
    eq(await vaultOps.changeVaultPassword("correct-horse-battery", "new-passphrase-42"), null, "改密成功")
    vault.lockVault()
    ok(!(await vault.unlockVault("correct-horse-battery")), "改密后旧密码失效（旧钥撤销）")
    ok(await vault.unlockVault("new-passphrase-42"), "新密码解锁")
    eq((await idb.loadStoreData()).data.meetings.length, 2, "改密后数据完整")

    // 关闭加密 → 回到明文
    eq(await vaultOps.disableVault("new-passphrase-42"), null, "关闭加密成功")
    ok(!vault.isVaultEnabled(), "vault 元数据已清除")
    const plain = await idb.loadStoreData()
    eq(plain.data.meetings.length, 2, "关闭后明文可读")

    // ── 7. 安全删除 ──
    console.log("\n[7] 安全删除：覆写后不可读")
    const victim = plain.data.meetings.find((x) => x.title === "全员大会")
    await idb.secureDeleteMeetingRecords(victim.id)
    const after = await idb.hydrateMeetingFields(victim.id, ["transcript"])
    eq(after.transcript ?? "", "", "被删会议的大文本分片已覆写清除")
    const reload = await idb.loadStoreData()
    ok(!reload.data.meetings.some((x) => x.id === victim.id), "被删会议元数据已移除")
  }

  console.log(`\n✅ golden set 全部通过：${passed} 条断言`)
} catch (err) {
  console.error(`\n❌ golden set 失败（已通过的断言：${passed}）`)
  console.error(err)
  process.exitCode = 1
} finally {
  await server.close()
}
