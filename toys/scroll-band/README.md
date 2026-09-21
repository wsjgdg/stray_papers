# 滚动乐团 · ScrollOrchestra

一个原本构建于 VibeX / RunningHub 托管平台的网页应用，**现已改造为完全自包含、零后端依赖**的纯前端项目。

- 数据持久化：浏览器 **IndexedDB**（作品 / 成绩 / 关卡），昵称存 `localStorage`
- AI 能力：**可选**。配置你自己的 OpenAI 兼容 Key 后启用；不配置则全部本地功能照常运行
- 外部依赖：**无**。不连接 PocketBase、不调用 RunningHub 登录 / 计费 / 沙箱接口

> 原平台专属代码（rh 源码标注插件、`allowedHosts`、RunningHub 登录、计费确认弹窗、PocketBase 后端、VibeX Source round-trip）已全部移除或降级为本地实现。

## 技术栈

- Vite 8 + React 19 + TypeScript 6
- Tailwind CSS 3 + Radix UI + GSAP + Recharts
- 包管理：npm（pnpm 在本仓库环境下符号链接受限，已切换为 npm 扁平安装）
- 本地存储：IndexedDB（经 `src/lib/localStore.ts`）

## 快速开始

```bash
npm install --legacy-peer-deps   # 安装依赖（含 esbuild 平台二进制，需联网一次）
npm run dev        # 开发服务器，http://localhost:8000
npm run build      # 类型检查(tsc -b) + 生产构建到 dist/
npm run preview    # 预览生产构建，http://localhost:8000
```

> 一键启动（稳定 cmd 窗口，单窗口，不用 bat）：
> - 双击 `start.cmd`（推荐）——它在**同一个 cmd 窗口**里调用 `start.ps1`，不会闪退、不会开多个窗口。
> - 或手动在 cmd 里运行 `powershell -ExecutionPolicy Bypass -File start.ps1`（或先 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 一次，之后直接 `start.ps1`）。
> 脚本在当前窗口内自动安装依赖（如缺失）并拉起 dev server、打开浏览器，结束时有 `Read-Host` 兜底。**改 `.env` 后必须重启本脚本**——Vite 只在启动时读 `.env`，运行中改文件不会热加载。

> 生产构建产物是纯静态文件，可由任意静态服务器托管（或 `npm run preview`）。
> 当前使用 `BrowserRouter` + `base "/"`；如需 `file://` 直接双击打开，请将 `vite.config.ts` 的 `base` 改为 `"./"` 并改用 `HashRouter`。

## AI 配置（可选，已内置默认）

默认主供应商为 **Agnes AI**，并自动配置 **BigModel（智谱）** 作为降级供应商。填好 `.env` 即可开箱即用：

| 变量 | 含义 | 必填 |
| --- | --- | --- |
| `AI_BASE_URL` | 主供应商 OpenAI 兼容接口基址（不含 `/chat/completions`） | 启用 AI 时必填 |
| `AI_API_KEY` | 主供应商 API Key（Bearer） | 启用 AI 时必填 |
| `AI_MODEL` | 主模型名，如 `agnes-2.5-flash` | 启用 AI 时必填 |
| `AI_FALLBACK_BASE_URL` | 降级供应商基址，默认 `https://open.bigmodel.cn/api/paas/v4` | 否 |
| `AI_FALLBACK_API_KEY` | 降级供应商 Key；留空则关闭降级 | 否 |
| `AI_FALLBACK_MODEL` | 降级模型，默认 `glm-4.7-flash` | 否 |

> 变量前缀是 `AI_`（非 `VITE_`），由 `vite.config.ts` 的 `envPrefix` 暴露给前端。
> 主请求失败时自动改用降级供应商；二者均未配置时，AI 指挥台 / 智能配词优雅降级（提示「未配置」），其余功能不受影响。

## 目录与改造要点

| 原实现 | 现实现 | 文件 |
| --- | --- | --- |
| PocketBase 集合 (`pb.collection()`) | 浏览器 IndexedDB | `src/lib/localStore.ts` |
| `/api/works`、`/api/scores`、`/api/levels` | 本地 IndexedDB 读写 | `src/lib/social.ts` |
| `/api/llm` 异步任务轮询 | 直接调用 OpenAI 兼容 `/chat/completions` | `src/lib/aiConfig.ts`、`src/lib/llm.ts` |
| `/api/agents` 轮询 | 单次 `chat()` 调用 | `src/lib/agent.ts` |
| RunningHub 登录 / 计费确认 | 离线昵称 + 直通（不弹付费确认） | `src/lib/auth.ts`、`src/hooks/useCostConfirm.ts` |
| rh 账号菜单 | 本地昵称设置 | `src/components/rh/RhAccountMenu.tsx` |
| VibeX 源码标注 / `allowedHosts` | 已移除 | `vite.config.ts` |

未改动：`src/lib/musicAi.ts`（规则引擎，本就零网络）、`src/lib/aigc.ts`（无引用，靠 `pb` stub 编译通过）。

## 验证状态

- [x] 移除全部平台耦合（rh 插件 / PocketBase / RunningHub 登录计费）
- [x] 数据层迁移到 IndexedDB
- [x] AI 层改为可选 OpenAI 兼容调用
- [x] 依赖安装（npm）
- [x] `npm run build` 通过（tsc -b + vite build）
