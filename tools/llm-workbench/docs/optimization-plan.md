# LLM Workbench 优化落地计划（2026-09-10）

> 基于 v0.1.1 现状制定。前一版计划（`docs/improvement-plan.md`）Phase 0-5 已全部执行完毕
> （commits `149267f` → `f0920b2` → `d7cc3e5` → Phase 4 → `3eb00a2`），
> 另完成 exe 打包与黑屏修复（`595dfc6`）。本文件覆盖**下一阶段**的全部可优化项。
>
> 工作量：S ≤ 半天，M ≈ 1 天，L ≈ 2-3 天。优先级：P0（尽快）/ P1（本迭代）/ P2（择机）。
> 分支约定：直接在 main 上按项推进，每项一个 commit（英文祈使句），逐项过门禁。

## 当前基线（事实）

| 维度 | 现状 |
|---|---|
| 规模 | server 3.7k LOC（14 文件）· src 5.8k LOC · electron 0.7k（main.cjs 498） |
| 质量 | prettier 干净 · tsc EXIT 0 · vitest 56/56（8 文件，行覆盖 90.7%）· eslint 0 error |
| CI | `.github/workflows/ci.yml`：ubuntu 上 lint + typecheck + test + build；**无打包、无覆盖率门槛、无发版** |
| 打包 | v0.1.1 NSIS 79MB + win-unpacked 便携版；`asar:false`（临时手段）；**无签名、无自动更新**；`latest.yml` 已生成但无 publish 配置 |
| 前端产物 | 单 chunk 670KB（gzip 192KB），无代码分割；recharts 全量引入 |
| 已知环境坑 | NSIS 工具链首跑下载需前台超时 >420s；本沙箱无法启动 GUI（验证走 node + curl） |

---

## Phase A — 桌面与分发（黑屏善后 + 安装体验 + 更新链路）

| # | 优先级 | 项 | 现状(file:line) | 改法 | 量 |
|---|---|---|---|---|---|
| A1 | P0 | 窗口加载失败兜底页 | `main.cjs:240,267` 直接 `loadURL(127.0.0.1)`；`waitForBackend` 15s 失败后仍照常建窗 → 404/失败时黑屏 | `did-fail-load` 与 `waitForBackend` 失败时加载内联 data:URL 错误页（含原因 + 「重试」按钮，IPC 触发 `win.reload()`）+ 系统通知 | S |
| A2 | P0 | 主进程日志落盘 | `main.cjs:56-71` attachDiag 只 `console.log`，打包态 stdout 不可见 → 本次黑屏排查最大阻力 | 日志写 `userData/logs/main-YYYY-MM-DD.log`（保留 7 天轮转），诊断事件（fail-load/render-gone/backend 起停/端口）全落盘；托盘加「打开日志文件夹」 | S |
| A3 | P0 | 端口错位防护 | `server/index.ts:579` 端口被占会 +1 顺延，但 `main.cjs:20` 固定 `ELECTRON_PORT=8790` → 主窗可能打到**别的实例**上 | server 启动完成后把实际端口回传（约定 stdout 行或 startServer 返回值）；main.cjs 用实际端口建窗；顺延时 Notification 提示 | M |
| A4 | P0 | 退出时优雅关停后端 | `index.ts:627` 已导出 `stopServer()`，但 `main.cjs:491 before-quit` 只 unregisterAll | before-quit 调 `require('./server.cjs').stopServer?.()`（server.cjs 需透传导出），清采样定时器 + close httpServer | S |
| A5 | P1 | 恢复 asar + asarUnpack | `package.json:75` `"asar": false` 是黑屏临时解；builder 每次告警 "strongly not recommended" | `"asar": true` + `"asarUnpack": ["dist/**"]`；`main.cjs` WEB_DIR 候选顺序：`app.asar.unpacked/dist` → `app.asar/dist`（Electron fs 补丁可读 asar）→ 旧 `app/dist`。**必须完整重打 + 桌面实测** | M |
| A6 | P1 | NSIS 安装体验 | `package.json:88-90` 仅 createDesktopShortcut，oneClick 默认 true（无目录选择、静默安装） | `oneClick:false`、`allowToChangeInstallationDirectory:true`、`installerLanguages:['zh_CN']`、卸载面板显示名、卸载时可选保留 `%APPDATA%` 数据 | S |
| A7 | P1 | 真图标 | `scripts/make-icon.mjs` 程序化 PNG 单尺寸 | 设计/生成多尺寸 `icon.ico`（256/128/64/48/32/16），`build.win.icon` 指 .ico，任务栏/托盘/安装器全清晰 | S |
| A8 | P1 | 元数据补全 | builder 每次告警 `description is missed` / `author is missed` | package.json 补 `description` + `author`（NSIS 卸载面板与 exe 属性展示） | S |
| A9 | P1 | 自动更新 | `latest.yml` 已生成但无消费方；发版只能手动重装 | 接 `electron-updater`：`build.publish:{provider:"github"}`；启动后台 `checkForUpdatesAndNotify`（静默下载、退出即装）；无签名会有 UAC 提示，README 说明 | M |
| A10 | P2 | 便携版分发形态 | 仅 win-unpacked 目录（181MB 散文件） | 加 `zip` target 或 7z 打包脚本；所有 release 产物生成 `SHA256SUMS.txt` | S |
| A11 | P2 | 托盘菜单增强 | 现有 8 项 | 加「检查更新」「打开日志文件夹」「打开数据目录」 | S |
| A12 | P2 | 关闭行为设置 | `main.cjs:244-248` 关主窗硬编码 = 隐藏到托盘 | 设置页加「关闭主窗：最小化到托盘 / 退出应用」选项 | S |

---

## Phase B — 代理内核（可靠性 / 安全 / 可观测）

| # | 优先级 | 项 | 现状(file:line) | 改法 | 量 |
|---|---|---|---|---|---|
| B1 | P0 | 重试策略外置 + 指数退避 | `proxy.ts` isRetryable 硬编码 401/403/429；多 key 快速连打上游无退避 | per-provider `retryOn:number[]` + 指数退避（base 500ms ×2^n，cap 8s）+ 尊重 `Retry-After` 头 | M |
| B2 | P1 | 上游超时可配 | `proxy.ts:359` 180s 硬编码（流式也 180s，长生成会被截断） | per-provider `timeoutMs`（默认 180s，流式默认 600s） | S |
| B3 | P1 | key 冷却与健康面板 | key 失败立即轮下一个，坏 key 每次请求都要撞一次 | 连续 N 次 401/429 的 key 进 cooldown（如 5min，窗口内跳过）；`probe.ts` 定时巡检；SecurityCards 加 key 健康列表（可用/冷却/失效） | M |
| B4 | P1 | 默认鉴权 token | `index.ts` PROXY_TOKEN 可选（默认关）→ 本机任意进程可白嫖已存 key | 首启生成随机 token 存 config，`/api/v1`+`/api/proxy` 默认要求；设置页展示/复制/重置；`PROXY_TOKEN=off` 显式关闭保底 | M |
| B5 | P1 | 结构化日志 + 请求 ID | metrics 全内存重启清零；LogsPanel 只有环内存 | 每请求生成 `x-request-id` 贯穿；`LOG_PERSIST=1` 时 ndjson 追加 `~/.llm-workbench/logs.ndjson`（脱敏：只留 key 掩码），LogsPanel 加「加载历史」 | M |
| B6 | P2 | upstream 连接复用 | server 侧未见显式 keep-alive Agent 配置 | undici `Agent`（keepAliveTimeout、per-provider maxSockets）压测 RTT 前后对比后合入 | S |
| B7 | P2 | 缓存 LRU + SWR | `responseCache.ts` FIFO 256 条/64MB（Phase 1 已加） | FIFO→LRU（命中移尾）；可选 stale-while-revalidate（TTL 后 30s 内回旧值 + 后台刷新） | M |
| B8 | P2 | SSE 推送替代轮询 | 前端 3s 轮询 `/api/proxy/overview` | `/api/proxy/stream` 复用 `sampleRateHistory` 2s 节拍推增量；`useProxyOverview` 改 EventSource，轮询保留为降级 | M |
| B9 | P2 | proxy.ts 拆模块 | 588 行混合 key 轮换/转发/缓存/收尾 | 拆 `keyRotation.ts`/`forwarding.ts`/`caching.ts`/`finalize.ts`，纯搬运 + 既有单测护住 | M |
| B10 | P2 | Prometheus 增强 | `prometheus.ts` 162 行基础版 | 补 per-model 维度、keySwitches 计数、cacheHitRate、延迟 histogram bucket | S |
| B11 | P1 | 配置原子写 | config.json 直接 writeFileSync，多窗口并发可写坏 | tmp 文件 + `fs.renameSync` 原子替换（server 与 electron/settings.cjs 两处） | S |
| B12 | P2 | 数据目录统一 | `~/.llm-workbench` 与 Electron `userData` 双轨 | 统一 `app.getPath('userData')`（server 经 env 接收），首启检测旧目录一次性迁移 + 提示 | M |

---

## Phase C — 前端性能与体验

| # | 优先级 | 项 | 现状(file:line) | 改法 | 量 |
|---|---|---|---|---|---|
| C1 | P0 | 路由级代码分割 | `dist/assets/index-*.js` 670KB 单 chunk（gzip 192KB）；`vite.config.ts` 无 manualChunks | 各页 `React.lazy` + `manualChunks:{vendor:['react','react-dom'],charts:['recharts']}`；首屏只载 Dashboard，预期主包减半 | M |
| C2 | P1 | FloatingStats 再拆 | `floating/FloatingStats.tsx` 791 行（子组件已拆，容器+状态仍巨型） | 抽 `useFloatStats` hook（聚合/轮询/持久化）与 UI 分离，目标 <300 行 | M |
| C3 | P1 | App.tsx 拆分 | `src/App.tsx` 645 行（tab 容器+数据+搜索浮层） | `useModels`/`useSnapshot` hooks + `SearchOverlay` 独立组件 | M |
| C4 | P1 | 配置表单校验 | `proxy/ConfigPanel.tsx` 636 行，key/URL 编辑无校验提示 | 抽 `ProviderForm`，key 格式 / URL 合法性 / 重复检测即时提示 | M |
| C5 | P2 | 大表虚拟滚动 | `ModelTable.tsx` 624 行，数百模型时全量渲染 | react-window 或自写窗口化（行高固定易做） | M |
| C6 | P2 | 统一空态/加载/错误态 | 各页 ad-hoc 文案与 spinner | `<EmptyState/>`/`<Skeleton/>`/`<ErrorState/>` 三件套统一接入 | S |
| C7 | P2 | 去 recharts | recharts 全量引入占 bundle 大头（约 -400KB 潜力） | Dashboard 图表改自绘 SVG（floating/Sparkline.tsx、CostCurve.tsx 已验证可行），整个依赖可移除 | M |
| C8 | P1 | 亮色主题核查 | nativeTheme 已桥接，但组件存在硬编码深色（#0f1626 系） | 逐组件过 Tailwind `dark:` 变体，浅色下截图走查 | S |
| C9 | P2 | 键盘导航 / a11y | 弹层 Esc、tab 焦点无统一处理 | `useDismissable` hook（Esc/点击外关闭/焦点陷阱）；aria 标注 | S |
| C10 | P2 | 表格列设置持久化 | 模型表排序/列显隐刷新即失 | localStorage 持久化列配置 | S |

---

## Phase D — 数据与成本

| # | 优先级 | 项 | 现状(file:line) | 改法 | 量 |
|---|---|---|---|---|---|
| D1 | P1 | 定价表外置 | `pricing.ts` 96 行静态表，模型价格过期只能改代码 | `data/pricing.json` + 版本字段；UI「更新定价」（手动粘贴/本地导入）；代理计费与成本计算器共用一份数据 | M |
| D2 | P1 | 成本导出 | metrics 仅内存 + 浮窗今日成本 | Proxy 页导出 CSV/JSON（按 provider/model/日），月度汇总 | S |
| D3 | P1 | 预算告警 | FloatingStats 有 spikeLevel 但无阈值动作 | 设置日/月预算 → 超阈值 Electron Notification + 浮窗红色脉冲 | S |
| D4 | P2 | 指标持久化 | `metrics.ts` 318 行全内存，10min 速率窗口 | 每日聚合（provider×model×day）落盘 json；Dashboard 趋势图从 10min 扩到 30 天 | L |
| D5 | P2 | 配置备份/恢复 | 配置损坏只能手工拷目录 | 设置页「导出加密备份 / 导入」（复用 crypto.ts AES-256-GCM，含 kdfParams 版本） | M |

---

## Phase E — 发布工程

| # | 优先级 | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|---|
| E1 | P0 | CI 打包 job | ci.yml 只有 lint/test/build，安装包全靠本机手打 | windows-latest job：electron-builder（缓存 electron-builder Cache），artifact 上传 Setup/blockmap/latest.yml；`v*` tag 触发 | M |
| E2 | P1 | Release 自动化 | 无发版流程 | tag → build → GitHub Release 自动上传 exe + SHA256SUMS + CHANGELOG（conventional commits 生成） | M |
| E3 | P2 | 代码签名 | 无证书，SmartScreen 拦截 | 调研 OV 证书或 Azure Trusted Signing；未签期 README 写明处置 + 发布页给 SHA256 | M |
| E4 | P1 | 版本与变更流程 | version 手改，无 CHANGELOG | `npm version` + `CHANGELOG.md` 维护约定；发版 checklist 入 docs | S |
| E5 | P2 | 依赖自动更新 | 手动升级 | dependabot.yml（npm + actions，每月批次） | S |

---

## Phase F — 质量与文档

| # | 优先级 | 项 | 现状 | 改法 | 量 |
|---|---|---|---|---|---|
| F1 | P1 | scripts 清理 | scripts/ 18 个文件：verify-*.mjs 多数已迁移 vitest（8 套件） | 删除已迁移的 verify-*（p0p1/p2/security/metrics-sort/response-cache/model-merge/config-merge/electron-build）与 verify-all/legacy 门面；保留 mock-upstream、it-apiFormat、smoke-translate、test-custom-proxy（集成夹具）并加注释说明用途 | S |
| F2 | P2 | Electron E2E | 56 单测全是模块级，无窗口级冒烟 | Playwright `_electron`：启动 win-unpacked → 断言主窗加载/首 tab 渲染/`/api/health`；CI 可选 job | L |
| F3 | P1 | 覆盖率门槛 | 覆盖率 90.7% 但无强制，可能静默回退 | vitest `coverage.thresholds.lines: 70`（目标模块 80）接入 CI | S |
| F4 | P1 | README 补全 | README.md 3KB | 架构图、快捷键表、打包指南（NSIS 首跑下载超时 >420s 坑）、故障排查（黑屏 → 退出托盘实例/查日志/查端口占用）、安全说明 | S |
| F5 | P2 | 架构文档 | 无 | `docs/architecture.md`：请求流（proxy→cache→metrics→prometheus）、配置/加密模型（kdfParams 版本化）、Electron 进程模型（main/preload/renderer + in-process backend） | M |
| F6 | P2 | 提交提速 | husky pre-commit 全量 tsc+vitest，较慢 | lint-staged 只查改动文件；全量门禁留给 CI | S |
| F7 | P2 | eslint 加强 | 现仅基础规则 | `react-hooks/exhaustive-deps: error`；server 侧 `@typescript-eslint/no-floating-promises` | S |

---

## Phase G — 长期可选（不排期）

| # | 项 | 说明 |
|---|---|---|
| G1 | express 4→5 | 路由通配/中间件 breaking，独立 PR |
| G2 | recharts 2→3 | 若 C7（移除 recharts）完成则作废 |
| G3 | i18n 抽层 | 中文硬编码 → resources zh/en |
| G4 | deep link | `llmworkbench://` 唤起设置/模型面板 |
| G5 | React Query/SWR | 若 B8（SSE）完成价值降低 |
| G6 | 多 profile | 同一 exe 多套配置（userData 隔离） |
| G7 | server 独立 tsconfig project | src/server 分离构建，tsc 增量更快 |
| G8 | 启动画面 + onboarding | Splash 遮盖后端启动期；首次运行引导（token/添加 key） |

---

## 执行顺序与依赖

```
A1 A2 A4（黑屏善后，立即） ──> A3（端口正确性）──> A5（asar 回归，依赖 A3）
B1 B11（独立小改先行）──> B2 B3 B4 B5（内核批次）
C1 ──（先决策 C7 是否移除 recharts，影响分割策略）──> C2 C3 C4
E1（A5 稳定后接入 CI 打包）──> E2
D/F/G 任意穿插，单项单 commit
```

- A 系列优先：直接决定「发给别人的安装包能不能用、坏了能不能查」。
- C7 决策点：移除 recharts 则 C1 分割更简单、bundle 收益最大；保留则先按 vendor chunk 拆。
- B4（默认鉴权）是唯一有行为争议的项：默认开=更安全但破坏零配置；合入前在 README + 设置页明确说明。

## 统一门禁（每项 commit 前）

1. `npx prettier --check .`
2. `npm run typecheck` EXIT 0
3. `npm run test`（56+ 全过；F3 起含覆盖率门槛）
4. `npm run build` EXIT 0
5. **tsc-pass ≠ runtime-safe**：涉及 server/proxy 改动必须 `node electron/server.cjs` + curl 实测；涉及打包改动必须重打 + 桌面双击实测
6. commit（英文祈使句）→ `git push origin main`（SSH）→ `git ls-remote` 确认

## 桌面冒烟清单（A/E 批次专用）

安装（覆盖升级 + 全新装）→ 启动非黑屏 → 托盘 8 项菜单逐个点 → 浮窗显示/拖拽/穿透/四角吸附 → 全局快捷键 3 个 → 代理加 key → 非流式+流式各一发 → 缓存命中 → 指标/日志刷新 → 重启进程数据仍在 → 卸载后 `%APPDATA%` 数据处置符合预期。

## 风险登记

| 项 | 风险 | 缓解 |
|---|---|---|
| A5 asar 回归 | WEB_DIR 在 asar 内读取有隐性差异（send/stream 行为） | 候选顺序设计成「unpacked 优先」；重打后完整冒烟清单过一遍；出问题可一键回 `asar:false` |
| A3 端口回传 | server.cjs 是 esbuild 产物，返回值透传需改 bundle 链路 | 用约定 stdout 行（`[api] LISTEN <port>`）解析，最小侵入 |
| A9 自动更新 | 无签名时 updater 提示体验差 | 先后台静默检测 + 通知「有新版本」，不强制自动安装 |
| B4 默认鉴权 | 破坏「零配置开箱即用」 | 首启引导页自动展示 token + 一键复制；env `PROXY_TOKEN=off` 保底逃生 |
| B11 原子写 | rename 跨盘符失败 | tmp 文件与目标同目录生成 |
| C7 去 recharts | 图表视觉回归 | 逐图截图对比；floating 已有自绘先例验证可行 |
| D4 指标持久化 | 落盘增长失控 | 按天文件 + 保留 30 天轮转 |
