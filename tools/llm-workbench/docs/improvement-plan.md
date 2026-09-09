# LLM Workbench 改进落地计划

> 基于 2026-09-09 全量代码审查（src+server ≈ 8.8k LOC，electron/scripts ≈ 29k LOC）
> 目标：先止血（P0 缺陷 + 安全），再治理仓库与构建，最后做工程化与前端重构。
> 全部改动在 `hardening` 分支推进（注意：本机 git 无法创建带斜杠的分支名），每个 Phase 一个独立 commit。

## 执行状态

| Phase | 状态 | commit |
|---|---|---|
| 0 基线 | ✅ | — （typecheck EXIT 0 / verify 6/6 / 配置已备份 `~/.llm-workbench.bak-20260909`） |
| 1 P0 缺陷修复 | ✅ | `149267f` |
| 2 安全与健壮性 | ✅ | `f0920b2` |
| 3 仓库与构建卫生 | ✅ 3.1/3.2/3.3/3.4 全部完成（3.1 真实磁盘无残留，无需删除） | `d7cc3e5` |
| 4 质量基建 | 🟡 进行中（prettier/eslint9/vitest/CI 配置已写，deps 安装中；verify 脚本已迁 4 个纯逻辑套件到 vitest） | — （待提交） |
| 5 前端重构 | ⏸ | — |
| 6 Backlog | ⏸ | — |

门禁实测（Phase 2 结束）：`typecheck` EXIT 0 · `verify` 10/10 套件 · `build` EXIT 0 · `push origin hardening` EXIT 0。

## 0. 基线准备（Phase 0，必须先做）

| 步骤 | 命令/动作 | 目的 |
|---|---|---|
| 0.1 | `git checkout -b feat/hardening` | 不在 main 上直接改 |
| 0.2 | `npm run typecheck` 记录当前 EXIT/输出 | 建立基线，区分「既有问题」与「本次引入」 |
| 0.3 | `npm run verify` 记录 6/6 PASS | 回归基线 |
| 0.4 | 备份配置 `cp -r ~/.llm-workbench ~/.llm-workbench.bak-20260909` | 加密/解锁相关改动有不可逆风险，必须留退路 |

回滚总原则：每个 Phase 一个 commit，失败即 `git revert --no-edit <sha>`，配置崩溃则从 0.4 的备份恢复。

---

## Phase 1 — P0 缺陷修复（确定 bug，低风险小改）

### 1.1 修复指标排序运算符优先级 bug
- 文件：`server/metrics.ts:207`
- 现状：`out.sort((x, y) => y.lastTs ?? 0 - (x.lastTs ?? 0))`
  `-` 优先级高于 `??`，实际解析为 `y.lastTs ?? (0 - (x.lastTs ?? 0))`，非 null 时返回巨大正数 → 比较函数恒定为正 → 排序失效。
- 改为：
  ```ts
  return out.sort((x, y) => (y.lastTs ?? 0) - (x.lastTs ?? 0));
  ```
- 验收：新增 `scripts/verify-metrics-sort.mjs`，构造 3 个 provider（lastTs 乱序 + 一个 null），断言输出按 lastTs 降序且 null 排末尾。

### 1.2 响应缓存加容量上限 + 主动过期清理
- 文件：`server/responseCache.ts`
- 现状：`store` 是裸 `Map`，无上限；TTL 仅在 `getCached` 命中时惰性删除 → 长跑（Electron 常驻）内存单调增长。
- 改动：
  - 引入 `MAX_ENTRIES = 256`、`MAX_BYTES = 64 * 1024 * 1024`；`putCached` 写入后按插入顺序（Map 保序）淘汰最旧条目，直至两项约束都满足。
  - 记录 `bytes` 累计（entry.body.byteLength），`clearCache`/淘汰时递减。
  - 新增 `sweepExpired()`，在 `getCacheStats()` 与 `putCached()` 中调用（避免引入常规定时器）；过期项主动删除并回收 bytes。
  - `getCached` 在 `!enabled` 时也累加 `misses`，修正统计口径。
  - `CacheStats` 增加 `bytes`、`evictions`、`expired`。
- 验收：`scripts/verify-response-cache.mjs` — 写入 300 条后断言 `size <= 256`；手动改系统时间不可行，改为注入 `storedAt` 为 `Date.now() - ttl - 1` 后调用 `sweepExpired()` 断言清零。

### 1.3 流式请求：客户端断开时中止上游
- 文件：`server/proxy.ts:378-416`（`tryKey` 的 SSE 分支）与 `server/proxy.ts:356-366`（`controller` 定义处）
- 现状：`controller` 只受 180s 超时控制；客户端关闭连接（用户取消、页面刷新）后上游流继续跑到超时，fd + 内存泄漏。
- 改动：
  ```ts
  const onClientClose = () => controller.abort();
  res.on('close', () => { if (!res.writableFinished) controller.abort(); });
  // 在 res.end() 之后：res.off('close', onClientClose)
  ```
  并在 `nodeStream.on('error')` 中区分 `abort`（客户端取消，不计为上游错误，但仍 `finalize` 记录 latency/error='client aborted'）。
- 注意：`res.on('close')` 在正常结束也会触发，必须用 `res.writableFinished` 判定，否则会误 abort 已完成请求。
- 验收：手工冒烟 + `scripts/it-stream-abort.mjs`（发起流式请求后 300ms 主动 destroy socket，断言服务端 1s 内上游 fetch 已 abort，可用 `metrics.totalRequests` 增长且 `error` 含 'aborted' 验证）。

### 1.4 3xx 响应：转发 Location 且不进缓存
- 文件：`server/proxy.ts:441-459`
- 现状：只回写 `content-type` / `cache-control`，`Location` 被丢弃；且 `status >= 200 && status < 400` 会把 3xx 写进缓存（配合 `redirect: 'manual'`，客户端拿到的是一个没有 Location 的废重定向，且会被后续请求命中缓存）。
- 改动：
  - 非流式成功分支：`const location = upstream.headers.get('location'); if (location) res.set('location', location);`
  - 缓存条件收紧为 `status >= 200 && status < 300`（3xx 不缓存）。
  - 可选增强：`entry.followRedirect` 配置（默认 false），为 true 时改用 `redirect: 'follow'`。
- 验收：`scripts/mock-upstream.mjs` 增加 `/redirect` 路由返回 302 + Location，断言代理响应带 Location 且二次请求 `cache.size` 不增长。

### 1.5 webAssets 生成物移出 git
- 文件：`.gitignore`、`server/generated/webAssets.ts`、`package.json`
- 现状：880KB 自动生成的 base64 产物已 tracked（`git ls-files` 确认），且 mtime 15:34 落后于 `dist/index.html` 21:57 → 内嵌产物与 dist 漂移；每次 build 产生巨型 diff。
- 改动：
  - `.gitignore` 增加 `server/generated/`；`git rm --cached server/generated/webAssets.ts`。
  - `package.json` 增加 `"prebuild": "node scripts/gen-web-assets.mjs"`，把 `build-exe.mjs` 里 [2/4] 的内嵌逻辑抽成独立脚本；`build-exe.mjs` 改为复用该脚本。
  - `server/index.ts:12` 的 import 保持不变（构建期保证存在）；若文件缺失，构建前必然先跑 prebuild。
- 风险：clone 后未 build 就 `tsx server/index.ts` 会编译失败。缓解：在 `server/index.ts` 顶部加注释说明，并在 `scripts/gen-web-assets.mjs` 缺失时输出友好提示；同时给 `dev` 脚本加 `predev` 生成一份空占位（`{}`）。
- 验收：`git status` 干净；`npm run build` 后 `server/generated/webAssets.ts` 重新生成且与 `dist/` 文件数一致；`npm run verify` 6/6。

**Phase 1 门禁**：`prettier --write` → `npm run typecheck` EXIT 0 → `npm run verify` 全 PASS → commit `fix: correct metrics sort, bound response cache, abort upstream on client disconnect`。

---

## Phase 2 — 安全与健壮性加固

| # | 文件:行 | 改动 | 风险 |
|---|---|---|---|
| 2.1 | `server/auth.ts:57` | `verifyPassword` 改用 `crypto.timingSafeEqual(Buffer.from(key.toString('base64')), Buffer.from(p.verifier))`，长度不等时先返回 false | 低 |
| 2.2 | `server/auth.ts:79` | profile id 改用 `crypto.randomUUID()`（保持 `p_` 前缀以兼容既有文件） | 低 |
| 2.3 | `server/auth.ts:8` | scrypt 参数 `N` 从 16384 提到 32768（本地工具，派生耗时仍 <200ms）；旧 verifier 因 salt+参数内嵌不受影响 —— 但**参数无版本标记**，故需同步写入 `kdfParams` 字段并在校验时按存的参数派生，避免旧档案失效 | 中（必须做版本化，否则锁死账户） |
| 2.4 | `server/index.ts:504`、`/api/proxy` 挂载处 | 新增可选 `PROXY_TOKEN` 环境变量：设置后 `/api/v1/*` 与 `/api/proxy/*` 要求 `Authorization: Bearer <token>` 或 `x-proxy-token`；未设置时行为不变（保持单机零配置体验） | 低（默认关闭） |
| 2.5 | `server/index.ts:477` | 增加 `gracefulShutdown()`：`clearInterval(rateTimer)` + `server.close()` + 10s 强退；注册 `SIGINT/SIGTERM`、`beforeExit`。导出 `stopServer()` 供 Electron `will-quit` 调用 | 低 |
| 2.6 | `server/config.ts:164` | `enableEncryption` 删掉那个被丢弃的 `crypto.randomBytes(16)`，改为 `deriveKey(password, EMPTY_PLACEHOLDER_SALT)` 并加注释说明真实 salt 由 `encryptWithKey` 生成并持久化 | 低（纯可读性） |
| 2.7 | `server/probe.ts:10-16` / `server/proxy.ts:59` | 删除 `probe.ts` 的 `buildHeaders` 与 `AUTH_STYLE` 表，统一 import `buildAuthHeaders`；`probe.ts:48` Google 从 `?key=` 查询串改为 `x-goog-api-key` 头（避免 key 进入 URL/代理日志） | 中（需重测 google 探测路径，无 key 时回退原行为） |
| 2.8 | `server/config.ts:230` | `maskConfig` 的 `apiKeyMasked` 在 `p.apiKey` 为空但 `apiKeys` 非空时，改为展示首个 key 的掩码，消除 UI 显示不一致 | 低 |

**Phase 2 门禁**：typecheck + verify 全 PASS；手工验证「启用加密 → 重启 → 解锁 → 配置可读」闭环（有 0.4 备份兜底）；commit `fix: harden auth compare/id, optional proxy token, graceful shutdown`。

---

## Phase 3 — 仓库与构建卫生

| # | 动作 | 说明 |
|---|---|---|
| 3.1 | 清理构建残留 | ✅ 实测真实磁盘（`C:\Users\sibop\WorkBuddy\2026-08-29-22-52-01\llm-workbench`）**不存在**任何 `out-*` 目录、`llm-workbench.exe`、`server.bundle.cjs`、`run.log`；此前量得的 ~9.6GB 仅存在于沙箱 overlay（历史 in-sandbox 构建产物，未落盘）。真实仓库已无残留，无需删除。保留 `.gitignore` 对 `out-*`/`release`/`dist`/`*.exe`/`*.cjs`/`run.log` 的忽略规则以防复发。 |
| 3.2 | 统一 out 目录 | ✅ `package.json` 的 `build.directories.output` 已为固定 `release`（原配置即如此，时间戳 `out-*` 目录不再生成） |
| 3.3 | 砍掉 pkg 链路 | ✅ 已移除 `pkg`、`@yao-pkg/pkg` 依赖与 `build:exe` 脚本、`scripts/build-exe.mjs`；保留 `scripts/gen-web-assets.mjs` |
| 3.4 | 补工程配置文件 | ✅ 已新增 `.editorconfig`、`README.md`、`.gitattributes`（`* text=auto eol=lf`，`.png/.ico binary`） |

**Phase 3 门禁**：`npm run electron:build:portable` 产物落在 `release/`；`git status` 无新垃圾；commit `chore: clean build artifacts, drop pkg, add editorconfig/readme`。

---

## Phase 4 — 质量基建（eslint / prettier / vitest / CI）

| # | 动作 | 细节 |
|---|---|---|
| 4.1 | prettier | 新增 `.prettierrc`（printWidth 100、singleQuote、semi true、trailingComma all）+ `.prettierignore`（dist/out-*/server/generated/node_modules/release）。首次全量格式化作为**独立 commit**，避免污染功能 diff |
| 4.2 | eslint 9 flat config | `eslint.config.js`：`@typescript-eslint` + `react-hooks` + `react-refresh`；先只开 `error` 级（no-unused-vars、no-explicit-any 设 warn），`npm run lint` 接入 |
| 4.3 | vitest | 新增 `vitest`；把现有 6 个 `scripts/verify-*.mjs` 逐个迁移为 `tests/*.test.ts`（model-merge、config-merge、bankofai、p0p1、p2、electron-build、metrics-sort、response-cache）。`npm run verify` 改为 `vitest run` 的门面，迁移期两套并存 |
| 4.4 | 覆盖率 | 目标：`src/lib`、`server/{config,crypto,metrics,responseCache,match,pricing,translate}` ≥70%；`vitest --coverage` |
| 4.5 | GitHub Actions | `.github/workflows/ci.yml`：Node 22 → `npm ci` → `lint` → `typecheck` → `vitest run` → `build`。push/PR 触发；不自动发版 |
| 4.6 | 提交门禁 | `package.json` 加 `"precommit"` 或 husky：`prettier --check && tsc -b && vitest run` |

**Phase 4 门禁**：CI 首次跑通（本地 `act` 或直接推分支看 Actions）；commit `chore: add eslint/prettier/vitest/ci`。

---

## Phase 5 — 前端重构

### 5.1 拆分巨型组件
`src/components/Proxy.tsx`（1434 行，内含 7 个子组件）→ `src/components/proxy/`：

```
proxy/
  Proxy.tsx          // 容器：tab 切换 + providers 传入
  ConfigPanel.tsx    // 原 :127-682（含 add-mode catalog、model section）
  Playground.tsx     // 原 :683-1041
  MetricsPanel.tsx   // 原 :1052-1132
  CachePanel.tsx     // 原 :1133-1189
  LogsPanel.tsx      // 原 :1190-1312
  SecurityCards.tsx  // 原 :1313-1434（EncryptionCard + UnifiedEndpointCard）
  shared.tsx         // fmtCost / Stat / Currency 类型
```

`src/components/FloatingStats.tsx`（805 行）→ `src/components/floating/`：
```
floating/
  FloatingStats.tsx  // 容器 + 状态
  Sparkline.tsx      // :754
  CostCurve.tsx      // :776
  MenuItem.tsx       // :692
  Row.tsx / Mini.tsx // :706 / :744
  format.ts          // fmtTok / todayStr / spikeLevel
```
约束：**纯结构搬运，不改任何 UI 行为**；拆完逐个 tab 手工冒烟 + 截图对比。

### 5.2 统一轮询（消除 3 个独立 3s 定时器）
- 现状：`MetricsPanel`（:1067）、`CachePanel`（:1147）、`LogsPanel`（:1227）各有一个 `setInterval(load, 3000)`，切到别的 tab 仍在跑；`FloatingStats` 另有一个 2s；`App.tsx` 有 30s。
- 方案 A（推荐）：服务端聚合端点 `GET /api/proxy/overview` 一次返回 `{metrics, cache, summary, logs?}`，前端单个 `useProxyOverview(3000)` hook 供三个面板共享。
- 方案 B（更省）：改为 SSE `/api/proxy/stream`，服务端 `sampleRateHistory` 的 2s 节拍上顺带推送 metrics/cache 增量。
- 同时新增 `useVisibilityPolling(interval, fn)`：页面 `document.hidden` 时暂停，可见时立即补一次。

### 5.3 其它
- `src/main.tsx` 外层包 `ErrorBoundary`（`src/components/ErrorBoundary.tsx`），避免单面板异常白屏整站。
- `src/api.ts`：所有 `fetch` 包装统一的 `request()`（超时、AbortSignal、错误体解析、401 统一提示），去掉逐处重复。
- `App.tsx` 的 30s snapshot 轮询接入 `useVisibilityPolling`；`abortRef` 逻辑抽到 hook。
- 类型收紧：当前仅 3 处 `any`（`App.tsx:44` 的 `electron?: any` 等），补 `src/types/electron.d.ts` 描述 `window.electron` 的 `isElectron/onOpenModel/onOpenSettings/onOpenSearch`。

**Phase 5 门禁**：typecheck + lint + verify 全 PASS；浏览器逐 tab 冒烟（概览/模型库/能力评估/控制台/本地代理/成本计算/浮窗）；commit `refactor: split Proxy/FloatingStats, unify polling`。

---

## Phase 6 — 可选增强（Backlog，按价值排序）

| 优先级 | 项 | 说明 |
|---|---|---|
| 高 | 请求失败重试策略外置 | `isRetryable` 现在硬编码 401/403/429；改为可配置（per-provider `retryOn: number[]`），并加指数退避（当前无退避，多 key 快速连续打上游） |
| 高 | 日志落盘可选化 | 目前 metrics 全内存、重启清零；加 `LOG_PERSIST=1` 写 `~/.llm-workbench/logs.ndjson`（脱敏），便于对账 |
| 中 | `/metrics` Prometheus 增强 | 当前只有 renderMetrics；补 per-model 维度、keySwitches、cacheHitRate histogram |
| 中 | 成本预算告警 | `FloatingStats` 已有当日成本；加阈值配置 + 系统通知（Electron 已有 Notification 依赖） |
| 中 | 上游超时可配 | 180s 硬编码于 `proxy.ts:359`；改为 per-provider `timeoutMs`，流式建议 600s |
| 低 | `aggregate.ts` 增量更新 | snapshot 每 10min 全量重建 + 全量 sort；改为按 created 归并 |
| 低 | 依赖升级 | express 4→5、recharts 2→3（均含 breaking，独立 PR） |

---

## 执行顺序与依赖

```
Phase 0 基线
   └─> Phase 1 (P0 修复) ──┬─> Phase 2 (安全加固)
                            └─> Phase 3 (仓库卫生) ──> Phase 4 (质量基建)
                                                          └─> Phase 5 (前端重构)
                                                                └─> Phase 6 (Backlog)
```

- Phase 1 与 Phase 3 无依赖，可并行；但建议串行以保持 commit 历史可读。
- Phase 5 必须在 Phase 4（eslint+vitest）之后，否则拆分无法被自动化验证。
- Phase 6 任意时刻可插入单个 item。

## 每阶段统一验收门禁

1. `npx prettier --check .`
2. `npm run typecheck` → EXIT 0
3. `npm run verify` → 全 PASS（Phase 4 起为 `vitest run`）
4. `npm run build` → EXIT 0
5. 浏览器/Electron 手工冒烟（typecheck ≠ runtime-safe）
6. commit（英文祈使句）→ `git push` → `git ls-remote` 确认

## 执行中发现并已修复的额外缺陷

| # | 位置 | 问题 | 处置 |
|---|---|---|---|
| X1 | `server/config.ts` `enableEncryption` + `server/crypto.ts` `encryptWithKey` | 派生 key 用 A 盐、写入 blob 的是 B 盐，`unlock` 按 blob.salt 重新派生 → **启用加密后必然解锁失败，配置永久锁死**（数据丢失级） | `encryptWithKey(value, key, salt?)` 接受调用方 salt；config 持有 `cryptoSalt` 并在 unlock 时回填。已加 `verify-security` 的「启用 → 重启 → 解锁 → 再保存 → 关闭」闭环用例 |
| X2 | `server/crypto.ts` `deriveKey` | N=32768/r=8 需 ~32MB，超过 Node 默认 scrypt maxmem → `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` | 显式 `maxmem: 128MB` |

## 风险登记

| 项 | 风险 | 缓解 |
|---|---|---|
| Phase 2.3 scrypt 参数变更 | 旧档案 verifier 失效 → 锁死 | 必须同时写入 `kdfParams` 并按存储参数派生；先做 0.4 备份 |
| Phase 1.5 webAssets 移出 git | clone 后未 build 直接跑 tsx 会失败 | 加 `predev` 生成空占位；README 写明 |
| Phase 3.1 删除 ~9.5GB | 误删 | 只删 gitignored 的 `out-*`，走回收站，分批准入，先列清单给你确认 |
| Phase 5.1 组件拆分 | 行为回归 | 纯结构搬运；拆一次跑一次冒烟；不做顺手重构 |
| 全局 | 配置加密不可逆 | 每个涉及 config/crypto 的 Phase 前确认 0.4 备份存在 |
