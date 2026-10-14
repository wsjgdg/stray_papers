# para_visualizer

一个 **100% 在浏览器端运行** 的数据集图像浏览器 / 标注 / 对比 / 导出工具。
专为浏览内嵌在 `.arrow` / `.parquet` / `.csv` / `.tsv` / `.json` 数据集中的图片而生，无需后端、无需上传。

> 本项目已从 z.ai 的脚手架（`z-ai-web-dev-sdk`、Prisma、Caddy 等）中剥离，
> 仅保留一个纯前端的 Next.js 应用，可在任意装有 Node.js 的机器上独立运行。

---

## 功能特性

- **多格式数据加载**：拖拽或选择 `.arrow` / `.feather` / `.ipc` / `.parquet` / `.csv` / `.tsv` / `.json` 文件
- **5 种视图**：Grid（网格）/ Table（表格）/ Detail（详情）/ Compare（对比）/ Stats（统计）
- **多策略图片解码**：bytes / base64 / data-URL / URL fetch / 嵌套 struct
- **标注与导出**：画框标注（6 色调色板）、导出 COCO JSON / YOLO txt、批量导出图片与 metadata
- **搜索与筛选**：全文搜索高亮、动态筛选构建器（AND/OR）、任意列排序
- **书签与对比**：书签面板、多数据集并排字段差异高亮
- **键盘快捷键**：`j/k`、`1-5`、`b/n/f/t/d`、`⌘K` 命令面板、`?` 快捷键速查表等
- **统计视图**：KPI 卡片 + 分类分布 / 散点 / 直方图 / 热力图 / 箱线图 + schema 表
- **深色模式**、响应式三面板布局、虚拟滚动（大数据集流畅）、localStorage 持久化

## 技术栈

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**（Radix）
- **Zustand** 状态管理
- **apache-arrow** + **parquet-wasm**（浏览器端解析）
- **PapaParse**（CSV/TSV）、**@tanstack/react-virtual**（虚拟滚动）
- **framer-motion**（动画）、**recharts**（图表）

## 环境要求

- **Node.js >= 18**（推荐 20+，含 `npm`）
- 支持 Windows / macOS / Linux

## 快速开始

### 方式一：一键启动脚本（推荐 Windows 用户）

直接双击 **`start.cmd`**，它会调用 `start.ps1` 自动完成：

1. 检查 Node / npm 环境
2. 安装依赖（首次，或 `node_modules` 不存在时）
3. 启动开发服务器

启动后访问 **http://localhost:3000**。窗口会保持打开以便查看日志，按 `Ctrl+C` 停止。

> `start.cmd` 已配置 `-ExecutionPolicy Bypass` 与 `-NoExit`，
> 因此即使启动失败也不会“闪退”，错误信息会停留在窗口中。
> 在 PowerShell 7+（`pwsh`）与 Windows PowerShell 下均可运行。

### 方式二：手动命令

```bash
# 安装依赖
npm install

# 启动开发服务器（http://localhost:3000）
npm run dev
```

### 生产构建与运行

```bash
npm run build      # 生产构建
npm run start      # 以生产模式启动（默认 3000 端口）
```

### 代码检查

```bash
npm run lint
```

## 项目结构

```
src/
  app/                 # Next.js 路由（page.tsx 入口、layout、api）
  components/
    dataset/           # 业务组件（各视图、工具栏、面板等）
    ui/                # shadcn/ui 基础组件
  hooks/               # 通用 hooks
  lib/
    dataset/           # 数据解析 / 筛选 / 状态 / 键盘导航等核心逻辑
    utils.ts
public/
  demo/                # 内置演示数据集（demo-dataset.json）
  favicon.svg
scripts/               # 演示数据集生成脚本（generate-demo-dataset.ts）
```

## 数据格式说明

| 格式 | 说明 |
| --- | --- |
| `.arrow` / `.feather` / `.ipc` | Apache Arrow IPC，浏览器端 `apache-arrow` 解析 |
| `.parquet` | 浏览器端 `parquet-wasm` 解析（自动校验 PAR1 头） |
| `.csv` / `.tsv` | PapaParse 解析（首行表头） |
| `.json` | 支持演示格式（`{ name, files:[{name,schema,rows}] }`）、纯数组、schema+data |

内置演示数据集会在首页首次加载时自动预取，可直接点击体验。

## 说明

- 首次加载会尝试预取内置 demo，无需任何配置即可体验。
- 所有数据解析、图片解码、标注均在浏览器本地完成，**不会上传到任何服务器**。
- 本项目不含后端数据库；原 z.ai 脚手架中的 Prisma / SQLite 已被移除。

## License

供学习与研究使用。
