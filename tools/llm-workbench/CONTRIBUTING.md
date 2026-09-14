# 贡献指南（Contributing）

感谢关注 LLM Workbench！本项目是本地大模型评估 + API 代理工作台（React + Express + Electron）。

## 环境要求

- Node.js 22+（开发主环境为 Windows；CI 覆盖 ubuntu 构建 + Windows 打包）
- `npm install` 安装依赖

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 并行启动 API（:8787）与 Web（:5173） |
| `npm run build` | `tsc -b && vite build`（prebuild 自动生成内嵌资源） |
| `npm run typecheck` | 全量类型检查 |
| `npm run lint` | ESLint（`react-hooks/exhaustive-deps` 为 error） |
| `npm run test` | vitest 单测 |
| `npm run test:coverage` | 带覆盖率门槛（lines ≥70%，CI 强制） |
| `npm run test:integration` | 端到端集成（mock 上游 + 真实服务，临时 HOME 隔离） |
| `npm run verify:electron-build` | Electron 打包前置产物检查 |

## 提交规范

- commit message 用**英文祈使句**（如 `fix: correct metrics sort`）；
- **一个逻辑改动一个 commit**；跨文件的同属改动合并提交；
- pre-commit 钩子（husky + lint-staged）：对改动文件自动 prettier/eslint + 增量 typecheck；全量门禁留给 CI。

## 每项改动的统一门禁

1. `npx prettier --check .`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run test:coverage`
6. `npm run build`
7. 涉及 `server/` 的改动另跑 `npm run test:integration`
8. 桌面端 / 打包相关改动必须真机冒烟（安装/启动/托盘/浮窗/代理转发）

## 测试隔离约定（重要）

- 需要隔离数据目录的测试：设 `process.env.LLM_WORKBENCH_HOME` 为临时目录——**该目录本身就是数据目录，没有 `.llm-workbench` 子目录**；
- 集成测试（`scripts/verify-*.mjs`）以临时 HOME 拉起真实服务，请保持这一模式，勿读写真实配置。

## 文档指引

- 架构概览：README「架构概览」与 [docs/architecture.md](docs/architecture.md)
- 发版流程：[docs/release-checklist.md](docs/release-checklist.md)
- 安全问题：见 [SECURITY.md](SECURITY.md)（不要走公开 issue）
