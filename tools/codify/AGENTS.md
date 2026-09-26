# 会议纪要工作台（standalone fork）

本仓库是从 VibeX / RunningHub 平台导出的「个人会议纪要工作台」的**独立分支**，已彻底脱离原平台：

- **LLM 通道**：改用用户自有的 OpenAI 兼容接口（设置页填 `baseUrl` / `apiKey` / 模型），不再依赖平台计费代理（原 PocketBase `/api/llm/*` 已移除）。
- **数据层**：本就全部存于浏览器本地（localStorage + IndexedDB），离线可用；导出备份默认不含密钥。
- **已移除的平台耦合**：`.vibex/`、`vibex-local/`（平台回传工具链）、`pocketbase/`（服务端 LLM 钩子）、`public/sso-popup-callback.html`（RH SSO 回调）、`RhAccountMenu` 登录入口、`rhLogin.ts` / `pb.ts`、计费确认墙（`visitorPaysForAi=false`）。
- 原 VibeX「导出回传」流程不再适用——本仓库即是源码本身。

## 本地运行
- Windows：双击 `start.cmd`（自动探测 8000+ 空闲端口并打开浏览器；依赖缺失时先 `pnpm install`）。
- 手动：`pnpm install && pnpm dev`。
- 构建：`pnpm build`（= `tsc -b && vite build`）；预览：`pnpm preview`。

## 技术栈
React 19 + TypeScript + Vite + Tailwind CSS 3 + shadcn/ui（Radix）+ cmdk。架构与功能详见 `README.md`。
