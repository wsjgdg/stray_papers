# frog_university · 奶蛙大学 · 项目约定

> 校园题材文字冒险（galgame 式对话推进）。十条线、30 种结局、二周目回响。
> React 19 + TypeScript + Vite 8 + Tailwind 3 + React Router 7，**纯前端、零后端、离线可玩**。
>
> 本文件是项目约定的唯一权威源（原根目录 `CLAUDE.md` 已并入此处）。
> 日常流水日志见 `.workbuddy/memory/YYYY-MM-DD.md`。

## 命令

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm build        # tsc -b && vite build → dist/
pnpm preview      # 本地预览产物
pnpm lint         # 0 error / 62 warning（存量债，见下）
pnpm typecheck
```

Windows 一键启动：`start.cmd`（薄壳，转调 `scripts/start.ps1`，单窗口前台运行）。

## 硬约束

- **无后端**。不要引入任何服务端依赖、API 调用、环境变量或平台 SDK。剧本全量打包进产物，
  存档走 localStorage，音频浏览器现场合成（`src/lib/bgm.ts`，无音频文件）。
- **不要手改 `docs/renpy/`**。那是 `pnpm gen:renpy` 的生成物，改剧本请动 `src/data/**`。
- **剧本改动必须跑完整管线**（改的是数据，影响下游全部产物）：
  ```bash
  pnpm export:renpy && pnpm pipeline:text && pnpm verify:renpy && pnpm gen:renpy && pnpm verify:demo
  ```
  `verify:renpy` 必须保持「10 条线全部通过」，`verify:renpy`/`verify:demo` 问题总计须为 0。

## 环境坑（Windows）

- **`pnpm-workspace.yaml` 的 `nodeLinker: hoisted` 不能删**。默认的 isolated 布局在本机建不出
  符号链接（`node_modules/@types/` 全空，`tsc` 报 TS2688）。pnpm 11 已不读 `.npmrc` 里的同类键。
  `onlyBuiltDependencies` 放行 rolldown 原生绑定，删了会找不到平台二进制。
- **脚本里不要用 `new URL(...).pathname`**。Windows 上返回 `/C:/Users/...`，交给 `path.join`
  会变成 `C:\C:\Users\...`。统一用 `fileURLToPath()`。三个脚本已修（export-renpy / text-pipeline /
  gen-renpy），新增脚本照此办理。
- **`tsc` 通过 ≠ 运行时可用**。改完 UI 必须起 dev/preview 用无头浏览器实跑
  （CDP 9222，见 skill `cdp-headless-smoke`），尤其 lazy 路由与 overlay。

## 存量 lint 债

`eslint.config.js` 里 7 条规则被显式降为 `warn`（react-hooks v7 的 React Compiler 系规则 +
`react-refresh/only-export-components`）。这批源文件写于那些规则出现之前，按 React 18 时代
写法组织，能正常工作、tsc 与冒烟都通过。**不要为了让 lint 变绿而批量改**——那是覆盖 2000+
行的行为重构，得逐文件来（`usePlay.ts` 单文件就有 25 条）。

`no-irregular-whitespace` 开了 `skipJSXText`：正文是中文，文案里大量用全角空格 U+3000 做排版
留白，是刻意用法，别去「修」。

## 历史包袱

本项目原为 VibeX 平台应用（依赖 PocketBase + RunningHub SSO + `/api/aigc`），2026-10-04 完成
脱平台化改造，成为纯静态 SPA。改造全记录见 `.workbuddy/memory/2026-10-04.md`。
改造前的平台文件备份已删除，无需回退路径。
