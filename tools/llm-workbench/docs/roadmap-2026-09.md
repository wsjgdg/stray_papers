# 下一阶段优化方案（2026-09-14 盘点）

> 本文件覆盖 `docs/optimization-plan.md` **仍未做**的项，以及本轮代码核查新发现的缺口。
> 基线：main `79cbcc0` · server 4.0k LOC / src 6.4k LOC · vitest 22 files 151 tests · 行覆盖 89.7% ·
> 构建产物 `index 54.88kB` + `vendor 143kB` + `charts 394.46kB`（gzip 108kB）。
> 工作量：S ≤ 半天，M ≈ 1 天，L ≈ 2-3 天。优先级按「风险/价值 ÷ 成本」排。

---

## 0. 结论

- **安全面 5 个真实缺口**，其中「本地 API 无来源校验」是唯一外部可利用项。
- **代理内核缺「模型路由 + fallback 链」这一最核心能力**：统一端点现在只会挑第一个可用厂商，也不跨厂商容错。
- **前端最高性价比是去掉 recharts**（-394KB，只用了 2 个组件）。
- 其余为体验债（虚拟滚动 / 亮色主题 / 日志检索）与工程债（asar / 自动更新 / E2E / 签名）。

---

## Phase A — 安全（建议先做，全部 S）

| # | 项 | 现状与风险 | 改法 | 量 |
|---|---|---|---|---|
| A1 | **本地 API 无来源校验**（唯一外部可利用项） | `server/index.ts` 全站无 `Origin` / `Sec-Fetch-Site` 校验（grep 确认）。任意网页都能向 `127.0.0.1:8787` 发请求；JSON POST 会被预检拦下，但简单请求（GET、`text/plain` POST）不受限，配合 `PROXY_TOKEN` 存 localStorage 存在组合利用面 | 加中间件：允许 `Origin` ∈ {`http://127.0.0.1:<实际端口>`, `http://localhost:<实际端口>`, `file://`} 或**缺失**（非浏览器客户端放行）；其余 403 并记日志。实际端口在 `startServer` 后注入 | S |
| A2 | **登录无失败限速** | `server/auth.ts` 无 attempt / throttle / lock（grep 确认）。多用户模式下可暴力枚举；scrypt 只抬高单次成本，不封禁 | per-档案失败计数 + 指数退避（1→2→4…上限 30s）+ 连续 10 次锁 5 分钟；内存态即可 | S |
| A3 | **代理令牌持久化在 localStorage** | `src/api.ts:309` `PROXY_TOKEN_STORAGE_KEY`，长期有效且脚本可读 | 改 `sessionStorage`（关标签即失效）；设置页补「令牌仅当前会话保存」说明 | S |
| A4 | **备份口令无强度 / 无二次确认** | `server/backup.ts:65` 仅 `length >= 8`。导出时口令输错 → 备份永久不可恢复 | 导出改为「输入两遍且一致才启用」；强度提示（≥12 位含两类字符） | S |
| A5 | **请求体限制一刀切** | `server/index.ts:136` `express.json({ limit: '20mb' })` 覆盖全部路由 | 代理路由保持 20MB；其余 `/api/*`（除 `/api/proxy/import`）收紧到 1MB | S |

**验收**：新增 `tests/localGuard.test.ts`（Origin 白名单放行 / 非白名单 403 / 登录退避计数）。

---

## Phase B — 代理内核：路由与容错（本阶段价值最高）

| # | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|
| B1 | **模型路由 + fallback 链**（核心缺口） ✅ 已完成 2026-09-14 | `server/proxy.ts:421-435`：统一端点未指定厂商时只取**第一个** `enabled && apiKey` 的厂商；没有按模型路由，也没有跨厂商容错（多 key 轮换只在单厂商内生效） | 新增 `routing` 配置：`{ "routes": { "gpt-4o": ["openai","my-gw"], "claude-*": ["anthropic"] }, "default": ["openai","my-gw"] }`。匹配：精确 → 通配 → default；链内遇「5xx / 超时 / 429 且该厂所有 key 冷却」转下一家；响应头回写 `x-route-used` / `x-route-attempts`，日志记 `routeChain` | M |
| B2 | **按标签的成本归因** ✅ 已完成 2026-09-14 | 成本只有 provider × model 维度 | 识别请求头 `x-lb-tag` 并透传到日志与 usageStore；导出与面板支持按 tag 分组。多项目共用一套 key 时的刚需 | M |
| B3 | **per-provider / per-key 配额** ✅ 已完成 2026-09-14 | 只有全局日预算，无速率与单 key 上限 | `maxRps`（令牌桶，超限 429 并跳 key）、`dailyKeyBudgetUsd`（单 key 日成本上限，超限从轮询池剔除） | M |
| B4 | **请求重放** ✅ 已完成 2026-09-14 | 日志只能看，排障要手工拼 body | 日志行 → 「重放」：用存档的 method/path/body（不含鉴权头）重发，结果并排展示 | S |
| B5 | **内置定价表外置** ✅ 已完成 2026-09-14 | `server/pricing.ts:19` `PROVIDER_PRICING` 硬编码，调价只能改代码 | 下沉为 `data/pricing.json`（含 `version` + `updatedAt`），启动时加载；UI 加「导入定价 JSON」与版本显示；用户覆盖（D1）逻辑不变 | M |
| B6 | **统一端点模型目录** ✅ 已完成 2026-09-14 | `/api/v1/*` 无 `/models`，第三方客户端（Cherry Studio / NextChat）接入要手填模型名 | `GET /api/v1/models`：聚合所有启用厂商的 `enabledModels`，输出 modelMapping 之后的对外名，OpenAI 兼容格式 | S |

**依赖**：B1 与已完成的 modelMapping 是上下游（mapping 决定"叫什么"，routing 决定"发给谁"），建议同批落地，并在配置页合并为一个「路由」小节。

**进度追踪（2026-09-14）**：
- ✅ **Phase A 全组**（A1–A5，安全）：提交 `4b97ad4`。
- ✅ **B1 模型路由 + fallback 链**：`server/routing.ts` 新增（`isValidRouting`/`matchRoute`/`resolveChain`）；`server/proxy.ts` 统一端点改写链模式（响应头 `x-route-used`/`x-route-attempts` + 日志 `routeChain`）；`server/config.ts` 加 `getRouting`/`setRouting`；`server/index.ts` 加 `GET/POST /api/proxy/routing`；前端 `RoutingCard`（`SecurityCards.tsx`）+ `src/api.ts` 的 `fetchRouting`/`saveRouting`。
- ✅ **B6 统一端点模型目录**：`server/config.ts` 的 `listRoutedModels()` 聚合启用厂商模型（含 modelMapping 别名）；`server/index.ts` 加 `GET /api/v1/models`（OpenAI 兼容）。
- 测试：`tests/routing.test.ts`（15）、`tests/config.test.ts` +2、`tests/proxyChain.test.ts`（4 集成）；全量 **182 tests / 25 files** 通过。`tsc -b --force` EXIT 0，`vite build` EXIT 0。
- ✅ **B2 按标签的成本归因**：`server/proxy.ts` 的 `mkInput` 读取 `x-lb-tag` → `finalize`/`CallLog.tag` → `usageStore` 新增 tag 维度（`day→provider→model→tag→cell`，旧 3 层结构经 `sanitize` 自动迁移进 `(untagged)`）；新增 `usageByTag()` 聚合 + `GET /api/proxy/usage/by-tag`；`/api/proxy/logs` 支持 `tag` 过滤；导出 CSV 增加 `tag` 列。前端 `LogsPanel` 显示标签列 + `MetricsPanel` 新增「按标签归集成本」卡片。
- ✅ **B3 per-provider / per-key 配额**：新增 `server/rateLimit.ts`（令牌桶纯函数 `takeToken` + 每厂商状态 `tryConsume`，容量 `max(1,ceil(rps))`）与 `server/keyBudget.ts`（`(provider,keyMask)` 当日成本累计，跨日归零）；`ProviderConfig` 加 `maxRps` / `dailyKeyBudgetUsd`；`proxy.ts` 超速率 → 429 + `Retry-After`（chain 模式交给下一厂商），超预算的 Key 从轮询池剔除；`metrics.recordCall` 按 Key 累计成本；配置页新增两个配额输入。集成测试 `tests/quota.test.ts`（429 + Retry-After、超预算 429）。设计取舍：预算为硬配额（fail-closed，缓存命中同样拦截，与全局日预算一致）；速率限制置于缓存之后（缓存命中不打上游，不消耗令牌）。
- ✅ **B4 请求重放**：`metrics.CallLog` 新增 `reqBody`/`reqBodyTruncated`（截断存档上限 `MAX_REQ_BODY_BYTES = 32KB`，**仅内存环形缓冲持有，落盘 ndjson 前剥离**，避免 prompt 落盘）；新增 `server/replay.ts`（`makeCaptureResponse()` 最小 Response 捕获器 + `replayCall(log, send?)`，`send` 可注入便于单测；强制 `stream=false`、不带任何原始鉴权头、一律使用当前配置的 Key；响应体 20KB 截断）；`POST /api/proxy/logs/:requestId/replay`（404 无日志 / 400 无存档或非法 JSON / 502 发送失败）；`/api/proxy/logs` 列表不下发请求体，只给 `hasReqBody` 标记。前端 `LogsPanel` 每行「重放」按钮 + 结果对比面板。
- ✅ **B5 内置定价表外置**：`data/pricing.json`（`version` + `updatedAt` + `providers`）作为随仓库发布的基准表；`server/pricing.ts` 新增 `parsePricingTable()` / `initPricingTable(candidates?)` / `getPricingTableState()` / `savePricingTable()` / `deletePricingTable()`；加载优先级 `$PRICING_FILE` > `configDir()/pricing.json`（UI 导入，可写）> 仓库 `data/pricing.json`，**文件条目与内置表合并**（未覆盖厂商仍用内置价），无可用文件回退内置；`GET/POST/DELETE /api/proxy/pricing-table`；前端 `PricingOverrides` 加「基准定价表」区（显示来源/版本/更新时间 + 导入 JSON + 恢复内置）。D1 用户覆盖优先级不变（模型覆盖 > 快照模型价 > 厂商覆盖 > 基准表 > DEFAULT）。
- 代理内核 **B1–B6 全部完成**；测试 **220 tests / 31 files** 通过（新增 `tests/pricingTable.test.ts` 7、`tests/replay.test.ts` 11）；`tsc -b --force` EXIT 0，`vite build` EXIT 0。

---

## Phase C — 评估能力（让 "Workbench" 名副其实）

| # | 项 | 说明 | 量 |
|---|---|---|---|
| C1 | 自建评测集 | `evals/<name>.json`：`{ prompt, cases: [{ input, expect?, judge: 'exact'|'contains'|'llm' }], models: [...] }`。跑批走本地代理（自动获得缓存/重试/成本），结果落盘 `eval-results/*.json` | L |
| C2 | 评测结果矩阵 | 复用 `Compare.tsx` 结果卡片骨架，按 case × model 展示通过率 / 延迟 / 成本，导出 CSV | M（依赖 C1） |
| C3 | LLM-as-judge | 复用 routing 任选已配置厂商打分，主观题给 1-5 分 | M（依赖 C1） |

> 这是从「观测工具」走向「决策工具」的一步。若不做，产品定位仍停留在「代理 + 看板」。

---

## Phase D — 前端性能与体验（P2）

| # | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|
| D1 | **去 recharts**（原 C7） | 仅 `CostCalculator` / `Leaderboards` 引用，却占 `charts` chunk **394.46kB（gzip 108kB）** | 图表改自绘 SVG（`floating/Sparkline.tsx`、`CostCurve.tsx` 已是先例）；同步移除 `manualChunks.charts` | M |
| D2 | **ModelTable 虚拟滚动** | 664 行、数百模型全量渲染 | 行高固定，自写窗口化（约 60 行，无新依赖）；保留排序持久化 | M |
| D3 | **亮色主题** | 57 处硬编码深色 hex（ConfigPanel 8、CostCalculator 5、FloatingStats 5、ModelTable 5…），`nativeTheme` 已桥接但组件没接 | 抽 CSS 变量 + Tailwind `dark:` 变体逐组件替换，浅色下走查 | M |
| D4 | **日志检索增强** | 只能按 provider/status 过滤，无 requestId / 模型 / 关键词检索 | 加关键词框（匹配 model / requestId / error）+ 详情抽屉 | S |
| D5 | 表格列显隐持久化 | 排序已持久化（`2265e9c`），列显隐未做 | localStorage 存列配置 + 「重置」 | S |
| D6 | a11y 收尾 | Esc 已统一（`useDismissable`），但无焦点陷阱 | `useDismissable` 扩展焦点陷阱；提示加 `aria-live` | S |

---

## Phase E — 数据与成本（P2）

| # | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|
| E1 | 月度预算 + 预测 | 只有日预算 | 加 `monthlyUsd`；近 7 日线性外推月终值显示在预算条 | S |
| E2 | 用量留存可运维 | `usageStore` 固定保留 90 天，无清理入口 | 设置页加「导出全部用量 / 清理 N 天前」 | S |
| E3 | 成本异动告警 | 浮窗只在超阈值时通知 | 加「单小时成本环比 > N 倍」告警（复用 `spikeLevel`） | S |

---

## Phase F — 工程与发布（P2/P3）

| # | 项 | 说明 | 量 |
|---|---|---|---|
| F1 | **恢复 asar**（原 A5） | `package.json` 仍 `"asar": false`（黑屏期临时解），builder 每次告警 | `"asar": true` + `asarUnpack: ["dist/**"]`；WEB_DIR 候选 `app.asar.unpacked/dist` → `app.asar/dist`；**必须重打 + 桌面完整冒烟** | M |
| F2 | 自动更新（原 A9） | `latest.yml` 已产出但无消费方 | `electron-updater` + `publish: {provider:'github'}`；后台静默检查 + 通知，不强制安装 | M |
| F3 | Electron E2E（原 F2） | 151 单测全是模块级，无窗口级冒烟 | Playwright `_electron`：启动 win-unpacked → 断言主窗加载 / 首 tab 渲染 / `/api/health` | L |
| F4 | 代码签名（原 E3） | 无证书 → SmartScreen 拦截 | OV 证书或 Azure Trusted Signing（成本项）；未签期维持 SHA256SUMS | M |
| F5 | 依赖升级 | express 4→5；recharts 随 D1 移除 | 独立 PR | M |
| F6 | i18n 抽层 | 中文硬编码全量 | `resources/zh|en` + 语言切换；优先级最低 | M |
| F7 | 多 profile 隔离 | 同一 exe 只能一套配置 | `LLM_WORKBENCH_HOME` 子目录 + `--profile` 启动参数 | M |
| F8 | **提交门禁重建** | 2026-09-14 事故：husky → lint-staged 在沙箱被 SIGTERM 中断，导致 `.git/refs` 与 pack 丢失 | `.husky/pre-commit` 换成 3 行脚本（只对改动文件跑 `prettier --check`），全量门禁留给 CI | S |

---

## 建议执行顺序

```
A1 A2 A3 A4 A5（安全，半天内可完） ──┐
                                    ├─> ✅ B1 B6（路由 + /v1/models）
D1（去 recharts，无依赖可并行）─────┘        └─> ✅ B2 B3（配额 / 归因）──> ✅ B4 B5（重放 / 定价外置）
                                                                        └─> C1 C2（评测，最大新功能，下一步）
D2 D3 D4（前端体验，任意穿插）
F1（asar）──> F2（自动更新）──> F3 / F4
```

- **第一批建议：A 全组 + B1/B6** ≈ 2-3 天，止血 + 补上代理最核心能力。
- **D1 可独立并行**，纯收益。
- **C 组是产品定位决策**，确认要不要往「评测」走再投入。

## 统一门禁（每项 commit 前）

1. `prettier --check .`
2. `npm run typecheck` EXIT 0
3. `npm run test`（151+ 全过）
4. `npm run build` EXIT 0
5. 涉及 server/proxy 必须 `node electron/server.cjs` + curl 实测；涉及打包必须重打 + 桌面双击实测
6. commit（英文祈使句）→ `git push origin main`（SSH）→ `git ls-remote` 确认

## 风险登记

| 项 | 风险 | 缓解 |
|---|---|---|
| A1 Origin 白名单 | 第三方客户端不带 Origin 被误杀 | 缺失 Origin 放行，仅拒绝「带了但不在白名单」 |
| B1 路由链 | 配置错误打到错厂商 / 死循环 | 链内去重、深度上限 3、每次尝试写日志与 `x-route-*` 头 |
| D1 去 recharts | 图表视觉回归 | 逐图截图对比后再删依赖 |
| F1 asar 回归 | asar 内读取差异导致白屏 | 保留 `asar:false` 一键回退；完整冒烟清单过一遍 |
| F2 自动更新 | 无签名时 UAC 提示体验差 | 仅通知，不自动安装 |
