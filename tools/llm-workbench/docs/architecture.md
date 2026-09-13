# Architecture（架构文档）

> 与代码同步维护；概览版见 README「架构概览」。本文展开请求流、数据与加密模型、Electron 进程模型。

## 1. 进程与端口模型

| 形态 | 进程 | 端口 | 数据目录 |
|---|---|---|---|
| `npm run dev` | tsx watch `server/index.ts`（API）+ Vite（Web） | 8787 / 5173 | `~/.llm-workbench` |
| `npm start` | 单进程：Express 同时服务 API 与 `dist/` 静态资源 | 8787（被占自动 +1，最多 +10） | 同上 |
| Electron | main.cjs（窗口/托盘/日志）→ in-process 启动 `server.cjs`（esbuild 打包的后端） | `ELECTRON_PORT`=8790 | `LLM_WORKBENCH_HOME` 注入 `app.getPath('userData')` |

- 数据目录解析（`server/config.ts` `resolveConfigDir`）：`LLM_WORKBENCH_HOME` 环境变量优先，否则 `~/.llm-workbench`；Electron 首启做一次性迁移（marker 防重，旧目录保留）。
- 后端启动入口 `startServer()` 可被 Electron 直接调用；直接运行时自启。`stopServer()` 供 `before-quit` 优雅关停（清采样定时器 + close httpServer）。

## 2. 代理请求生命周期

入口两条：`/api/proxy/:provider/*`（按厂商路由）与 `/api/v1/*`（统一 OpenAI 兼容：`x-lb-provider` 头 → 模型名 `vendor/model` 前缀 → 第一个已启用且有 Key 的厂商）。

`proxyRequest`（`server/proxy.ts`）按序执行：

1. **目标解析** `resolveTarget`：已知厂商取 `PROVIDERS` 表与 `styleOfKnown`；未知 id 视为自定义厂商（baseUrl + authStyle + apiFormat）。
2. **策略解析**：`retryOn`（per-provider，缺省 `[401,403,429]`）、`timeoutMs`（非流式 180s / 流式 600s）。
3. **响应缓存** `responseCache.ts`：仅非流式；`cacheKey = method + path + body + provider`；LRU（256 条 / 64MB）+ TTL 惰性删除 + SWR（TTL 后短暂窗口回旧值后台刷新）。
4. **多 Key 轮询**（`keyRotation.ts` + `keyHealth.ts`）：
   - 游标轮询起点；`isUsable` 过滤冷却中的 Key（连续 3 次 429 → 冷却 5min；401/403 → 坏 Key 冷却 30min；成功立即复位；**全部冷却时回退全量池兜底**）。
   - 失败切换带指数退避（500ms × 2^n，封顶 8s；尊重上游 `Retry-After`）。
   - 坏 Key 由 `probeProvider` 巡检循环（60s）尝试复活。
5. **转发与格式转换**（`forwarding.ts` + `translate.ts`）：openai 透传；anthropic/gemini 做请求体、路径、响应体与 SSE 流的三向转换。
6. **流式管道**：`Readable.fromWeb` + `createStreamTranslator`；客户端断开（`res.close` 且 `!writableFinished`）立即 `controller.abort()`，不拖到超时。
7. **收尾**（`finalize.ts`）：usage 抓取（JSON `usage` 字段或 SSE 尾帧）→ `estimateCost`（cache-read token 从计费基数扣减）→ `recordCall`（内存指标 + 可选 ndjson 落盘，Key 只存掩码）。

## 3. 定价与成本链

```
快照模型库（aggregate.ts 拉取外部数据源）
  → updateModelPrices：按模型 id 与去 vendor 前缀 tail 建双索引
  → 用户覆盖 pricing-overrides.json（admin API 维护）
priceFor 优先级：模型覆盖 → 快照模型价 → 厂商覆盖 → 内置厂商默认 → DEFAULT
estimateCost = billable(input−cacheRead)×input + output×output + cacheRead×cacheRead（USD/1M）
消费方：代理计费（recordCall）· 成本计算器 · 支出导出（/api/proxy/metrics/export CSV/JSON）
预算：config.budget.dailyUsd → budgetStatus（ratio ≥0.8 warn / ≥1 exceed，level 与展示 ratio 同源）
```

## 4. 配置与加密模型

- `config.json`：`providers`（apiKey/apiKeys/baseUrl/enabled/models/enabledModels/retryOn/timeoutMs）、`proxyToken`/`proxyTokenEnabled`、`budget`。
- 加密（`crypto.ts`）：AES-256-GCM；主密码经 scrypt（N=32768, r=8, 显式 maxmem 128MB）派生；blob 内嵌 `salt/iv/authTag` 与 **kdfParams 版本号**，校验按存储参数派生（旧档案兼容）。
- 所有配置写入走 `atomicWriteJson`（同目录 pid tmp + `renameSync`），防崩溃/并发写坏；加密锁定态禁止写入（避免覆盖密文）。

## 5. 安全模型

- 仅监听 `127.0.0.1`；API 响应中 Key 一律 `maskKey`（`****` + 末 4 位）。
- `requireProxyToken`：`PROXY_TOKEN` env 或设置页持久化的令牌，保护 `/api/proxy/*` 与 `/api/v1/*`（比较用 `timingSafeEqualStr`）。
- `requireAdmin`：**存在非管理员档案时**强制管理员会话；单机所有者（仅 admin 档案）免登录放行——这是约定行为，不是漏洞。
- 档案口令 scrypt 派生 verifier，`timingSafeEqual` 比对；profile id 为 `crypto.randomUUID()`。

## 6. 可观测性

| 端点 | 内容 |
|---|---|
| `GET /api/proxy/overview` | metrics + cache 统计 + summary（浮窗/面板聚合轮询） |
| `GET /api/proxy/stream` | SSE：连接即推首帧，之后每 2s 推全量聚合（替代前端 3s 轮询，轮询保留为降级） |
| `GET /metrics` | Prometheus：per-model 系列、延迟 histogram、cacheHitRate、keySwitches |
| `GET /api/proxy/logs` | 环形内存日志（`LOG_PERSIST=1` 时另有 ndjson 持久化，可查历史） |
| `GET /api/proxy/budget` | 今日成本 + 预算阈值状态（ok/warn/exceed） |
| `GET /api/proxy/key-health` | 多 Key 健康面板数据（掩码 + 冷却剩余） |

指标全部内存态（进程重启清零），与 ndjson 落盘口径互补。

## 7. 前端结构

- 路由级代码分割：`React.lazy` + `manualChunks`（`vendor`：react 系；`charts`：recharts）。
- 数据层：`useProxyOverview`（单一聚合轮询 / SSE 订阅）、`useVisibilityPolling`（页面隐藏暂停、恢复补拉）。
- Electron 桥：`window.electron`（`isElectron`、`onOpenModel`、`onOpenSettings`、`onOpenSearch`、`saveStats/loadStats`、`getTheme/onThemeChange` 等），类型在 `src/types/electron.d.ts`。
- 浮窗（FloatingStats）：独立 HTML 入口，standalone 模式下统计落盘（节流 4s + pagehide flush），支持极简模式/穿透/字号/对比度设置。

## 8. 测试与门禁矩阵

| 层 | 内容 | 门禁 |
|---|---|---|
| 单测 | vitest `tests/*.test.ts`（config/metrics/budget/match/pricing/pricingOverrides/spendExport/keyHealth/translate/responseCache/retryPolicy/security/modelMerge 等） | `npm run test`；husky 增量 typecheck |
| 集成 | `npm run test:integration`：mock 上游 + 真实服务（bankofai 空列表、3xx/断流加固、apiFormat 全链路、翻译冒烟），临时 HOME 隔离 | server 改动必跑 |
| 覆盖率 | v8 覆盖率，`thresholds.lines ≥70%` | `npm run test:coverage`（CI 强制） |
| CI | lint → typecheck → coverage → build；`v*` tag 触发 Windows 打包 + GitHub Release（SHA256SUMS） | `.github/workflows/ci.yml` |
