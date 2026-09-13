# LLM Workbench

大模型能力评估 + 本地 API 代理工作台。前端 Vite + React 18 + TypeScript，后端 Express，桌面端 Electron（主窗口 + 常驻浮窗）。

## 快速开始

```bash
npm install
npm run dev          # API :8787 + Web :5173
npm run build        # tsc -b && vite build（prebuild 会自动生成内嵌资源）
npm start            # 仅启动 API，自动打开浏览器
npm run verify       # vitest 全量单测
```

桌面端：

```bash
npm run electron:dev              # 开发模式（后端 8790）
npm run electron:build            # NSIS 安装包 → release/
npm run electron:build:portable   # 免安装目录 → release/
```

## 架构概览

```
┌─ Electron ──────────────┐   ┌─ 浏览器 ─────────────────┐
│ main.cjs（窗口/托盘/日志） │   │ React SPA（Dashboard /   │
│  └ server.cjs（内嵌后端）  │   │ 模型库 / 评估 / 代理 / 成本）│
└────────────┬────────────┘   └──────────┬───────────────┘
             │  LLM_WORKBENCH_HOME 注入数据目录          │ fetch /api/* · EventSource
             ▼                          ▼
      Express API（server/）：REST + SSE(overview 每 2s 推送)
      ├─ proxy.ts        多厂商代理入口（统一 OpenAI 兼容 /api/v1）
      │   ├ keyRotation  多 key 轮询 + 冷却跳过 + 指数退避
      │   ├ forwarding   apiFormat 转换（openai/anthropic/gemini）
      │   ├ caching      响应缓存（LRU 上限 + SWR）
      │   └ finalize     usage 抓取 / 成本估算 / 结构化日志
      ├─ metrics.ts      指标/日志/日预算状态（内存态，可选 ndjson 落盘）
      ├─ pricing.ts      定价：快照模型价 → 用户覆盖（pricing-overrides.json）
      ├─ prometheus.ts   GET /metrics（Grafana 对接）
      └─ auth.ts / config.ts  档案 RBAC + 配置原子写（AES-256-GCM 可选加密）
```

代理只监听 `127.0.0.1`；API 响应中的 Key 一律掩码。

## 目录约定

| 路径 | 说明 |
|---|---|
| `src/` | 前端（React）。`components/` 下为各功能面板 |
| `server/` | 后端（Express）。`sources/` 为外部数据源抓取，`generated/` 为构建期产物 |
| `electron/` | 主进程、preload、设置；`server.cjs` 由 esbuild 从 `server/index.ts` 打包而来 |
| `scripts/` | 构建脚本与集成测试夹具（mock-upstream / it-apiFormat 等） |
| `docs/` | 设计/改进文档与发版流程 |

`server/generated/webAssets.ts` 是构建期生成的 base64 内嵌资源（~900KB），**不入库**，由 `predev` / `prebuild` / `pretypecheck` 自动调用 `scripts/gen-web-assets.mjs` 生成。

## 配置与数据位置

数据目录由 `LLM_WORKBENCH_HOME` 指定；未设置时为 `~/.llm-workbench`（Electron 启动时注入 userData 目录，并自动从旧目录一次性迁移）。

| 文件 | 说明 |
|---|---|
| `<数据目录>/config.json` | 厂商配置（API Key 明文或 AES-256-GCM 密文）、代理令牌、日预算 |
| `<数据目录>/auth.json` | 本地档案与口令 verifier（scrypt 派生，不存明文） |
| `<数据目录>/pricing-overrides.json` | 用户定价覆盖（代理页 → 成本计算器设置） |
| `<数据目录>/logs.ndjson` | 结构化调用日志（`LOG_PERSIST=1` 时启用，Key 已脱敏） |
| `<userData>/logs/main-*.log` | Electron 主进程诊断日志（黑屏排查用） |
| `%TEMP%/llm-workbench.log` | 启动日志（双击闪退时排查用） |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_PORT` | `8787` | API 端口，被占用时自动顺延最多 +10 |
| `ELECTRON_PORT` | `8790` | Electron 内嵌后端端口 |
| `LLM_WORKBENCH_HOME` | `~/.llm-workbench` | 数据目录（Electron 自动注入 userData） |
| `PROXY_TOKEN` | 空 | 设置后 `/api/proxy/*` 与 `/api/v1/*` 需携带 `Authorization: Bearer <token>` 或 `x-proxy-token`。用于防止本机其它进程白嫖已配置的 Key；也可在设置页启用并持久化 |
| `LOG_PERSIST` | 关 | 置 `1` 后调用日志追加写入 `logs.ndjson`（脱敏） |
| `NO_OPEN` | — | 启动时不自动打开浏览器 |
| `NO_REUSE` | — | 不做「复用已运行实例并退出」 |
| `WEB_DIR` | — | 指定前端静态资源目录（Electron 使用） |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | 抓取外部数据源时代理 |

## 安全说明

- 代理仅监听本机回环地址，不对局域网开放。
- API Key 保存在本机 `config.json`；设置页可启用 AES-256-GCM 主密码加密（密钥经 scrypt 派生，参数版本化）。
- 默认单机所有者免登录可改配置；一旦存在非管理员档案（多用户模式），所有写接口需管理员会话。
- `PROXY_TOKEN` 可防止本机其它进程未授权使用已配置的 Key。

## 打包（Windows）

```bash
npm run electron:build            # NSIS 安装包 + blockmap + latest.yml → release/
```

- 首次运行 electron-builder 会下载 NSIS/winCodeSign 工具链，需前台且超时 >420s。
- 未做代码签名，安装时 SmartScreen 会提示「仍要运行」；发布产物附 `SHA256SUMS.txt` 供校验。
- 打 `v*` tag 推送后，CI 自动构建安装包并创建 GitHub Release（含 SHA256SUMS），流程见 `docs/release-checklist.md`。

## 自动化测试

- `npm run verify` / `npm run test`：vitest 单测（`tests/*.test.ts`，19 个文件 130+ 用例：config/metrics/budget/match/pricing/pricingOverrides/spendExport/keyHealth/translate/responseCache/retryPolicy/security/modelMerge 等）。
- `npm run test:coverage`：带覆盖率门槛（`vitest.config.ts` 内 `thresholds.lines` ≥70%，CI 强制执行）。
- `npm run test:integration`：端到端集成（mock 上游拉起真实服务）：bankofai 空列表、3xx 转发/断流加固、apiFormat 全链路转换、翻译冒烟。临时隔离 `HOME`，不污染本机配置。
- `npm run verify:electron-build`：Electron 打包前置产物检查（server.cjs / icon / build-config）。

`scripts/` 中保留的 `mock-upstream.mjs` / `it-apiFormat.mjs` / `smoke-translate.mjs` / `test-custom-proxy.mjs` 为集成夹具，可独立运行。

## 常见问题

- **双击启动后窗口一闪而过**：查看 `%TEMP%/llm-workbench.log`。
- **打包版黑屏/白屏**：退出托盘里的常驻实例后重开；再不行查 `<userData>/logs/main-*.log`（主进程会记录窗口加载失败与后端起停），窗口内置「重试」按钮可重载。
- **提示「Frontend not built」**：先 `npm run build`。
- **端口被占用**：服务会自动顺延到下一个可用端口，日志会写明实际端口。
- **启用了配置加密后忘记密码**：配置无法恢复（加密是不可逆的），请提前备份整个数据目录。
