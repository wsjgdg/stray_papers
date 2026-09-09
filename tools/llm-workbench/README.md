# LLM Workbench

大模型能力评估 + 本地 API 代理工作台。前端 Vite + React 18 + TypeScript，后端 Express，桌面端 Electron（主窗口 + 常驻浮窗）。

## 快速开始

```bash
npm install
npm run dev          # API :8787 + Web :5173
npm run build        # tsc -b && vite build（prebuild 会自动生成内嵌资源）
npm start            # 仅启动 API，自动打开浏览器
npm run verify       # 全量回归（10 个套件）
```

桌面端：

```bash
npm run electron:dev              # 开发模式（后端 8790）
npm run electron:build            # NSIS 安装包 → release/
npm run electron:build:portable   # 免安装目录 → release/
```

## 目录约定

| 路径 | 说明 |
|---|---|
| `src/` | 前端（React）。`components/` 下为各功能面板 |
| `server/` | 后端（Express）。`sources/` 为外部数据源抓取，`generated/` 为构建期产物 |
| `electron/` | 主进程、preload、设置；`server.cjs` 由 esbuild 从 `server/index.ts` 打包而来 |
| `scripts/` | 构建与回归脚本。`verify-*.mjs` 由 `npm run verify` 统一调度 |
| `docs/` | 设计/改进文档 |

`server/generated/webAssets.ts` 是构建期生成的 base64 内嵌资源（~900KB），**不入库**，由 `predev` / `prebuild` / `pretypecheck` 自动调用 `scripts/gen-web-assets.mjs` 生成。

## 配置与数据位置

| 文件 | 说明 |
|---|---|
| `~/.llm-workbench/config.json` | 厂商配置（API Key 明文或 AES-256-GCM 密文） |
| `~/.llm-workbench/auth.json` | 本地档案与口令 verifier（scrypt 派生，不存明文） |
| `%TEMP%/llm-workbench.log` | 启动日志（双击闪退时排查用） |

代理只监听 `127.0.0.1`；API 响应中的 Key 一律掩码。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_PORT` | `8787` | API 端口，被占用时自动顺延最多 +10 |
| `ELECTRON_PORT` | `8790` | Electron 内嵌后端端口 |
| `PROXY_TOKEN` | 空 | 设置后 `/api/proxy/*` 与 `/api/v1/*` 需携带 `Authorization: Bearer <token>` 或 `x-proxy-token`。用于防止本机其它进程白嫖已配置的 Key |
| `NO_OPEN` | — | 启动时不自动打开浏览器 |
| `NO_REUSE` | — | 不做「复用已运行实例并退出」 |
| `WEB_DIR` | — | 指定前端静态资源目录（Electron 使用） |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | 抓取外部数据源时代理 |

## 自动化测试

`npm run verify` 依次运行：model-merge、config-merge、bankofai、p0p1、p2、metrics-sort、response-cache、proxy-hardening、security、electron-build。
其中 `proxy-hardening` 与 `security` 会临时隔离 `HOME` 并拉起真实服务 + mock 上游，不污染本机配置。

## 常见问题

- **双击启动后窗口一闪而过**：查看 `%TEMP%/llm-workbench.log`。
- **提示「Frontend not built」**：先 `npm run build`。
- **端口被占用**：服务会自动顺延到下一个可用端口，日志会写明实际端口。
- **启用了配置加密后忘记密码**：配置无法恢复（加密是不可逆的），请提前备份 `~/.llm-workbench/`。
