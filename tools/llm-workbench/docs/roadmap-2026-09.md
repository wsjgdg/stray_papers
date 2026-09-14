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
| C1 | 自建评测集 ✅ 已完成 2026-09-14 | `evals/<name>.json`：`{ prompt, cases: [{ input, expect?, judge: 'exact'|'contains'|'llm' }], models: [...] }`。跑批走本地代理（自动获得缓存/重试/成本），结果落盘 `eval-results/*.json` | L |
| C2 | 评测结果矩阵 ✅ 已完成 2026-09-14 | 复用 `Compare.tsx` 结果卡片骨架，按 case × model 展示通过率 / 延迟 / 成本，导出 CSV | M（依赖 C1） |
| C3 | LLM-as-judge ✅ 已完成 2026-09-14 | 复用 routing 任选已配置厂商打分，主观题给 1-5 分 | M（依赖 C1） |

> 这是从「观测工具」走向「决策工具」的一步。若不做，产品定位仍停留在「代理 + 看板」。

### Phase C 落地记录（2026-09-14）

- ✅ **C1 自建评测集**：新增 `server/evals.ts`（`parseEvalSet` / `listEvalSets` / `getEvalSet` / `saveEvalSet` / `deleteEvalSet` / `runEvalSet` / `startEvalRun` / `getEvalRun` / `listEvalRuns` / `stopEvalRun`）。集合来源：**用户集 `<configDir>/evals/*.json`（可写）优先于随仓库发布的 `<cwd>/evals/*.json`（只读示例）**；id 只允许 `[A-Za-z0-9._-]`（拒绝路径穿越）；仓库示例不可删。跑批**回环到本实例的统一端点 `/api/v1/chat/completions`**（`setEvalLoopback` 在 listen 成功后注入，避免与 index.ts 循环 import），因此自动获得路由/回退/缓存/重试/密钥轮询与**成本记账**（行的成本按 `x-request-id` 反查 `CallLog.costUsd`，与「调用日志」同口径）。**逐条串行**执行（结果可复现、不打爆上游、不被限流干扰）；`shouldStop` 在两条用例之间生效；结果每行即时落盘 `<configDir>/eval-results/<runId>.json`，重启后仍可查看/导出。随仓库示例：`evals/smoke.json`（确定性判分）、`evals/judge-demo.json`（LLM 判官）。
- ✅ **C3 LLM-as-judge**：`judgeModel` 指定判官模型（同一回环、同样计入成本）；`buildJudgePrompt` 生成「题目/参考答案/候选回答」并要求**只输出 1-5 整数**，`parseScore` 取首个 1-5 数字，**≥3 视为通过**（`PASS_SCORE`）。判官调用失败 → 该行 `pass=null`（不计分，不误判为失败）。
- ✅ **C2 结果矩阵**：`summarizeRun` 按模型聚合（通过率/平均延迟/平均分/成本/缓存命中/错误数，按通过率降序）；`runToCsv` 输出明细 CSV（**保留完整 output 不截断**，`⏎` 折叠换行，带公式注入防护）。前端新增「代理 → 评测」子页 `Evals.tsx`：集合选择/新建/编辑 JSON/删除，运行与停止（`useVisibilityPolling` 1.5s，页面隐藏自动暂停），**case × model 单元格矩阵**（✓/✗/ERR + 单格延迟，点击看期望 vs 输出对照），跑批历史列表 + CSV 导出。
- 新端点：`GET /api/proxy/evals`、`GET/POST/DELETE /api/proxy/evals/:id`、`POST /api/proxy/evals/:id/run`、`GET /api/proxy/evals/runs`、`GET /api/proxy/evals/runs/:runId`、`POST .../stop`、`GET .../export`（CSV）。
- 测试：`tests/evals.test.ts`（18 例：结构校验/判分语义/存取与路径穿越/串行顺序/成本回填/错误与中断/汇总与 CSV/未注入回环立即报错/**真实回环 e2e 跑批 + 判官打分**）；全量 **238 tests / 32 files** 通过，`tsc -b --force` EXIT 0，`vite build` EXIT 0。
- 已知限制：判官调用的成本未单独归到行上（行的成本只含被测调用），后续可在 run 上加 `judgeCostUsd`。

**浏览器复测（真实 Chromium，非仅 tsc/build）**：`tsc-pass ≠ runtime-safe`，本批新增整块 UI，故用 Edge headless + CDP 走了一遍真实交互——启动 `tsx server/index.ts`（`NO_OPEN=1`）与 `vite`，驱动浏览器点「本地代理 → 评测」，断言：子页导航出现「评测」、面板渲染出「评测集 / 跑批历史」、集合列表含 `smoke` 示例、页面提示 `eval-results` 结果目录、**零 console 异常**（9/9 步通过）。截图存临时目录。注：沙箱里 `npm run dev` 会被 wsl.exe 黑名单拦截，需直接 `node node_modules/tsx/dist/cli.mjs server/index.ts` + `node node_modules/vite/bin/vite.js`。

---

## Phase D — 前端性能与体验（P2）

| # | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|
| D1 | **去 recharts**（原 C7）✅ 已完成 2026-09-14 | 仅 `CostCalculator` / `Leaderboards` 引用，却占 `charts` chunk **394.46kB（gzip 108kB）** | 图表改自绘 SVG（`floating/Sparkline.tsx`、`CostCurve.tsx` 已是先例）；同步移除 `manualChunks.charts` | M |
| D2 | **ModelTable 虚拟滚动** ✅ 已完成 2026-09-14 | 664 行、数百模型全量渲染 | 行高固定，自写窗口化（约 60 行，无新依赖）；保留排序持久化 | M |
| D3 | **亮色主题** ✅ 已完成 2026-09-14 | 57 处硬编码深色 hex（ConfigPanel 8、CostCalculator 5、FloatingStats 5、ModelTable 5…），`nativeTheme` 已桥接但组件没接 | 抽 CSS 变量 + Tailwind `dark:` 变体逐组件替换，浅色下走查 | M |
| D4 | **日志检索增强** ✅ 已完成 2026-09-14 | 只能按 provider/status 过滤，无 requestId / 模型 / 关键词检索 | 加关键词框（匹配 model / requestId / error）+ 详情抽屉 | S |
| D5 | 表格列显隐持久化 ✅ 已完成 2026-09-14 | 排序已持久化（`2265e9c`），列显隐未做 | localStorage 存列配置 + 「重置」 | S |
| D6 | a11y 收尾 ✅ 已完成 2026-09-14 | Esc 已统一（`useDismissable`），但无焦点陷阱 | `useDismissable` 扩展焦点陷阱；提示加 `aria-live` | S |

### Phase D 落地记录（2026-09-14）

- ✅ **D1 去 recharts**：新增 `src/components/charts.tsx`（`ColumnChart` / `ScatterPlot` / `niceMax`，自绘 SVG，用 `ResizeObserver` 量宽后**按真实像素绘制**——若用 `preserveAspectRatio="none"` 拉伸会让文字变形）；`CostCalculator` / `Leaderboards` 切到自绘并消费主题令牌；`package.json` 移除 `recharts`、`package-lock.json` 手工做可达性剪枝（844→809 包，共享依赖保留）、`vite.config.ts` 删除 `manualChunks.charts` 分支。**实测 JS 总量 712.6KB → 334.6KB（−378KB / −53%），charts chunk 385.2KB → 4.9KB**。
- ✅ **D2 ModelTable 虚拟滚动**：新增 `src/hooks/useVirtualList.ts`（**估算 + 实测混合**：未知行用 `estimate`，实测后按真实高度累计偏移；支持变高行与展开行；`findVisibleRange` 为可单测纯函数，二分定位首行 + overscan；`reportSize` 支持按行组回报合计高度）；`ModelTable` 删除 `PAGE_SIZE=50` 分页改为连续窗口化（**445 个模型实测只渲染 21–30 行**），筛选条件变化回到顶部，深链定位改 `scrollToIndex`；`colSpan` 由固定 11 改为动态。单测 `tests/virtualList.test.ts`（9 例）。
- ✅ **D3 亮色主题**：`src/index.css` 建主题令牌层（`:root` 深色 / `[data-theme='light']` 浅色），Tailwind 颜色统一映射为 `rgb(var(--c-*-rgb) / <alpha-value>)`——**这是关键坑：直接把颜色映射成 `var(--c-x)` 会让 `border-accent/60` 这类 `/opacity` 类全部失效并让 postcss 构建报错**，改 RGB 通道后既保留 `var()` 内联用法又让 59 处 slash-opacity 继续可用。新增 `src/hooks/useTheme.ts`（优先级：`localStorage['wb-theme']` > Electron `nativeTheme` > 系统 `prefers-color-scheme`）+ 头部切换按钮；全库 **123 处硬编码 hex、41 个不同色值**收敛到令牌。
  顺带修出两个真 bug：① `Sparkline` / `CostCurve` / `Mini` 把 **class 名当颜色**传给 `style.background`（浮窗曲线背景从未生效）；② 浮窗主题源只看 Electron，**浏览器/非 Electron 下不跟随系统主题**。
- ✅ **D4 日志检索增强**：`server/metrics.ts` 抽出 `applyLogFilter()` 让内存日志与历史落盘日志**共用一套过滤语义**，并新增 `q` 关键词维度（大小写不敏感，匹配 model / requestId / error / tag / path / provider）；`GET /api/proxy/logs` 支持 `q`（**服务端过滤**，否则只能搜已加载的 200 条）。前端 `LogsPanel` 加关键词框（300ms 防抖）+ 行详情抽屉（完整字段 + 重放入口）。
- ✅ **D5 列显隐持久化**：新增 `src/hooks/useColumnPrefs.ts` + 可复用 `src/components/ColumnPicker.tsx`（勾选 + 「重置」，至少保留一列）；`ModelTable`（11 列）与 `LogsPanel`（13 列）接入，localStorage 持久化。单测 `tests/columnPrefs.test.ts`。
- ✅ **D6 a11y 收尾**：`useDismissable` 拆出独立的 `useFocusTrap(ref, active)`（打开时焦点移入、Tab/Shift+Tab 在弹层内循环、关闭后归还触发元素；`fallbackRef` 必须用 `useRef` 保持稳定，否则每帧重跑会反复重置焦点）；`SettingsModal` / `SearchPalette` / `LogsPanel` 抽屉接入；加密解锁门禁**只接 trap 不接 Esc**（不允许跳过）。状态提示改为**常驻 live region**（外壳常驻 + 内层条件渲染——条件渲染的元素不在 DOM 里，读屏无法播报）。
- 测试 **254 tests / 34 files** 通过（新增 `tests/virtualList.test.ts` 9、`tests/columnPrefs.test.ts`）；`tsc -b --force` EXIT 0；`vite build` EXIT 0。

**浏览器复测（真实 Chromium，11/11 步通过，零 console 异常）**：本批改了几乎全部 UI 与全库配色，故用 Edge headless + CDP（零依赖）实测 D1–D6，并**新增 WCAG 对比度审计**（令牌级 + DOM 实文本级，遍历 6 个主 tab 与本地代理 6 个子页，每主题约 2000 个元素）。审计修出**真实的浅色可读性缺陷**：

- 浅色下 `accent` / `up` / `down` / `warn` 作为「文字 + 同色 10–15% 底」（Chip、primary 按钮、选中态 tab、价格 chip）实测只有 **4.04–4.12**，低于 11–12px 文字所需的 4.5；排名徽标金/银/铜/其余为 **2.87–3.32**。
- 修法：按「文字 + 同色 12% 底」的**实际合成底色**重算两套色值——浅色 `accent 21 88 172` / `up 176 42 34` / `down 12 110 62` / `warn 146 84 0` / `rank1 #7a5406` / `rank2 #4a5461` / `rank3 #8a4515` / `rank-rest #5b6675`；深色 `up → 248 113 113`（red-400）、`rank-rest → #a8b4c6`。修后**两主题 × 11 个界面 × 约 2000 元素全部 0 失败**。
- 复测踩坑：headless 下 `element.focus()` 不会改变 `activeElement`，验证焦点陷阱必须先开 `Emulation.setFocusEmulationEnabled`（否则 D6 必然假失败）；lazy 面板点击前必须轮询等待（固定 sleep 会 race 动态 `import()`）。
- **复测隔离（不消耗真实额度）**：起本地 mock 上游（`127.0.0.1:9999`）+ 临时厂商 `smoke` 造日志，跑完删除临时厂商、**按 sha256 逐字节还原 `config.json`**、清掉 mock 用量。后续复测沿用此隔离方式。

---

## Phase E — 数据与成本（P2）

| # | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|
| E1 | 月度预算 + 预测 | 只有日预算 | 加 `monthlyUsd`；近 7 日线性外推月终值显示在预算条 | ✅ |
| E2 | 用量留存可运维 | `usageStore` 固定保留 90 天，无清理入口 | 设置页加「导出全部用量 / 清理 N 天前」 | ✅ |
| E3 | 成本异动告警 | 浮窗只在超阈值时通知 | 加「单小时成本环比 > N 倍」告警（复用 `spikeLevel`） | S |

### Phase E1 落地记录（2026-09-14）

**做了什么**
- `config.budget` 加 `monthlyUsd`；`setBudget` 由「整块覆写」改为**按字段增量写入**（`null`/`≤0` 清该项，
  清日预算不再连带清掉月度；两项皆空才整块删除，配置文件保持干净）。`getBudget()` 同步返回 `monthlyUsd`。
- `metrics.budgetStatus` 泛化为 `ratioLevel(used, limit)`（日/月共用同一 80%·100% 口径与 3 位小数先舍后判的语义），
  `budgetStatus` 保留为等价封装（`proxy.ts` fail-closed 守卫零改动）。
- `usageStore` 新增 `usageDayTotalsOf` / `usageTodayTotals` / `usageTodayCost` / `usageDayTotals`（复用单日实现，口径唯一）
  与纯函数 `projectMonthEnd(dayTotals, now, monthlyUsd)`：**已完成日均 × 剩余天数 + 本月至今**；
  今日是部分交易日故不进均值分母；窗口 `min(7, 已过天数−1)` 天且缺失天按 0 计；1 号退化为 `basis='today'`。
- `/api/proxy/budget` 返回 `month{...,ratio,level,projectedRatio,projectedLevel}`；POST 改为增量 + 逐字段校验（`{}`/负数/非数字均 400）。
- `BudgetBar` 重构为「日预算 + 月度预算（仅告警）」两块：月度块显示已达比例进度条与**预测落点竖标**、
  「预计超支 $X」/「预计月终 $X」。月度只告警，`blockOnExceed` 仍只作用于日预算。

**顺带修掉的真实缺陷（根因）**
- 原 `todayCostUsd` 只读 `metrics` 的内存日桶，**重启即归零**。E1 让「今日」与「本月」同屏展示后矛盾直接可见；
  更严重的是 `proxy.ts` 的 fail-closed 守卫读同一值 → **重启后日预算拦截静默失效（fail-open）**。
- 改法：`getSummary()` 的当日 token/成本统一取 `usageStore`（内存态由 `recordUsage` 同步更新 + 启动从磁盘载入，跨重启不丢），
  并删除 `metrics` 里重复的 `dailyBuckets` + `DAILY_TTL_DAYS`（消灭第二套数据源）。
- 复测证据：预置 `usage-daily.json` 后冷启动服务，`todayUsd = 0.5000`（而非归零）。

**验证**
- 单测 34 文件 / **267 通过**（+13：`ratioLevel` 等价回归、`projectMonthEnd` 7 例含月末/月初/跨月/2 月、
  `usageDayTotals` 聚合、**跨重启今日成本**、`setBudget` 增量语义 3 例）。
- 真实浏览器复测（Edge headless + CDP，隔离临时数据目录）：**8/8 步通过、0 console 错误**——
  月度输入/清除、预测超支 chip、进度条宽度 67% 与竖标夹到 100%、日预算 exceed 条色 `bg-up`、
  增量语义（清日不连带清月）、重载后持久化。真实数据目录 sha256 **零改动**。

### Phase E2 落地记录（2026-09-14）

**做了什么**
- `usageStore` 新增运维三件套：
  - `usageStats()` 概览 —— 天数 / 数据范围 / 累计请求与成本 / 厂商·模型·标签去重基数 / 文件字节 / 脏标记 /
    自动保留窗口与裁剪起点（模型按 `provider/model` 去重，避免同名模型跨厂商混算）。
  - `usagePurgePlan(cutoffDay)` **纯函数**：算出「删除早于 cutoffDay 的数据」会移除什么（不改状态）；
    `purgeUsageBefore(cutoffDay)` 执行删除并落盘。`purgeCutoffForKeepDays(keepDays)` 把「保留 N 天（含今日）」
    换算成清理起点，下限钳到 1 天 —— **永远删不到今日**。
  - `usageSnapshot()` 返回深拷贝，导出不会反向改坏内存态。
  - `RETENTION_DAYS` 提升为导出的 `USAGE_RETENTION_DAYS`（UI 要展示策略、路由要校验上界）。
- 端点：`GET /api/proxy/usage/ops?keepDays=N`（概览 + 预览，纯读）、
  `POST /api/proxy/usage/purge`（admin，keepDays 校验 1~90 整数，越界/非整数一律 400）、
  `GET /api/proxy/usage/export`（全量原始 JSON，`Content-Disposition` 带日期文件名，导出前先 flush）。
- 新组件 `UsageOpsCard`（挂「本地代理 / 实时指标」，与 `BudgetBar` 同屏）：
  概览行 + 「导出全量 JSON」+ 「保留最近 N 天」输入 + **预览 → 确认清理两段式**。
  预览与实际清理在服务端共用同一实现（所见即所删）；**改动天数即作废旧预览**，避免按过期的数字误删；
  `dayCount=0` 时连确认按钮都不渲染（不留禁用噪音）。
- 新增 `.btn-danger` 变体（`border-up/60 bg-up/15 text-up`），与既有 `.btn-primary` 同构。

**验证**
- 单测 34 文件 / **274 通过**（+7：`usageStats` 正常与空存储、`purgeCutoffForKeepDays` 边界与取整、
  纯函数「只算不改」且 preview≡实删、清理落盘跨重启、无匹配不写盘、快照深拷贝）。
- 接口实测（预置 20 天 × $1）：概览 `days=20 / $20 / 20 次`；keepDays=7 → 删 13 天（2026-08-26 → 2026-09-07）$13；
  keepDays=90 → 0 天；`0 / -1 / 91 / abc / 2.5 / 空` 全部 400；导出 20 天全量 + 正确文件名。
- 真实浏览器复测（Edge headless + CDP，临时数据目录预置 20 天）：**11/11 步通过、0 console 错误**——
  概览数值、无可清理时不出现确认按钮、预览文案与按钮一致、改天数作废旧预览、确认清理后概览收敛为 7 天 / $7.0000、
  重载后仍为 7 天（已落盘）、导出 href 正确；**新增 `btn-danger` 的双主题对比度审计 0 失败**（浅色最低 4.84、深色最低 4.99，含该按钮本身）。
  真实数据目录 sha256 **零改动**。

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
                                                                        └─> ✅ C1 C2 C3（评测）
✅ D1–D6（前端性能与体验）──> ✅ E1 E2（月度预算 + 用量留存可运维）──> 下一步 E3 或 F1 F2（打包与自动更新）
F1（asar）──> F2（自动更新）──> F3 / F4
```

- **第一批建议：A 全组 + B1/B6** ≈ 2-3 天，止血 + 补上代理最核心能力。
- **D1 可独立并行**，纯收益；D1–D6 已全部落地（JS 总量 −53%）。
- **C 组是产品定位决策**，确认要不要往「评测」走再投入。
- **下一步**：E 组（月度预算/用量运维/成本异动）成本低收益直接；F1→F2 是发布链路，需重打安装包 + 桌面完整冒烟。

## 统一门禁（每项 commit 前）

1. `prettier --check .`
2. `npm run typecheck` EXIT 0
3. `npm run test`（274 全过）
4. `npm run build` EXIT 0
5. 涉及 server/proxy 必须 `node electron/server.cjs` + curl 实测；涉及打包必须重打 + 桌面双击实测
6. **改 UI 必须真实浏览器复测**（`tsc-pass ≠ runtime-safe`）：Edge headless + CDP，见 skill `cdp-headless-smoke`；改配色须跑对比度审计
7. commit（英文祈使句）→ `git push origin main`（SSH）→ `git ls-remote` 确认

## 风险登记

| 项 | 风险 | 缓解 |
|---|---|---|
| A1 Origin 白名单 | 第三方客户端不带 Origin 被误杀 | 缺失 Origin 放行，仅拒绝「带了但不在白名单」 |
| B1 路由链 | 配置错误打到错厂商 / 死循环 | 链内去重、深度上限 3、每次尝试写日志与 `x-route-*` 头 |
| D1 去 recharts | 图表视觉回归 | 逐图截图对比后再删依赖 ✅ 已做：移除 `node_modules/recharts` 后构建通过即证明无残留引用，并用自绘 `charts.tsx` 重画 |
| D3 亮色主题 | 令牌化后 `/opacity` 类静默失效（构建报错或样式丢失） | Tailwind 颜色必须映射为 `rgb(var(--c-*-rgb) / <alpha-value>)`；改完必须跑真实构建 + 对比度审计 ✅ 已做 |
| D3 亮色主题 | 「同色文字 + 同色浅底」的 Chip/徽标对比度不足 | 按合成底色实测重算语义色，并纳入浏览器复测的自动对比度审计（阈值 4.5 / 大字 3.0）✅ 已做 |
| E1 预算 | 「当日成本」曾有两套数据源（`metrics` 内存日桶 vs `usageStore` 持久化），重启后互相矛盾且日预算 fail-open | 统一以 `usageStore` 为唯一口径（内存态同步更新 + 启动载入磁盘），删除 `metrics.dailyBuckets`；单测覆盖「跨重启今日成本」✅ 已做 |
| E1 预算 | `setBudget` 增量语义下，前端传 `{}` 会静默无操作 | 服务端对「无任何字段」返回 400，逐字段校验正数；UI 两块的设置/清除按钮各自只提交自己那一项 ✅ 已做 |
| E2 用量清理 | 手动清理是**不可撤销**的破坏性操作，误删会丢历史成本 | ①`purgeUsagePlan` 是纯函数，**预览与实际清理共用同一实现**（所见即所删）；②「保留天数」一变即作废旧预览，确认按钮随预览消失，杜绝按过期数字误删；③`keepDays` 下限钳到 1 天，**永远删不到今日**；④`dayCount=0` 时不渲染确认按钮（不留禁用噪音） ✅ 已做 |
| E2 用量清理 | 清理后 UI 仍显示旧数值 | 清理响应直接回传新 `stats`，前端一次 setState 收敛；轮询只刷新概览、不覆盖用户正在确认的预览 ✅ 已做 |
| F1 asar 回归 | asar 内读取差异导致白屏 | 保留 `asar:false` 一键回退；完整冒烟清单过一遍 |
| F2 自动更新 | 无签名时 UAC 提示体验差 | 仅通知，不自动安装 |
