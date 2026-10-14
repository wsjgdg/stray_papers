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

## 会话保持（上传文件不再丢失）

本应用 100% 在浏览器端运行，原本刷新后上传的数据集会丢失（数据只存在内存中，`recent` 仅记录文件名）。
现已加入 **IndexedDB 会话持久化**：

- 你上传的文件（原始 `File` 字节）会写入浏览器 IndexedDB，不离开本机、不上传服务器；
- 下次启动：若上次会话较小（≤ 60MB）会**自动恢复**，直接进入浏览界面；若较大，落地页会出现 **“Restore previous files”** 卡片，一键恢复；
- 点击 **Load demo** 会清空该会话（demo 走远程拉取，无需本地保存）；
- 恢复本质是把保存的原始文件重新解析一遍，因此不会占用额外存储。
- 自动恢复的体积上限可通过 `NEXT_PUBLIC_SESSION_AUTO_RESTORE_MAX_MB`（MB，默认 60；设为 `0` 关闭自动恢复）调整。

## 入口说明

- 落地页有两个按钮：**“Open your files”**（打开本地文件）与 **“Try the demo dataset”**，并支持把文件**拖拽**到落地页；
- 首次无数据时，应用会在约 600ms 后**自动弹出 Load 对话框**；
- 进入数据集后，顶栏始终有 **“Open”** 按钮与菜单项 **“Open files…“**，可继续加载/追加数据集；
- 有保存的会话时，落地页还会出现 **“Restore previous files”** 卡片。

## 图片代理（绕过 CORS）

数据集中的图片字段通常是第三方 URL，原站往往不带 CORS 头，浏览器直接拉取会被拦截。
本项目内置一个**服务端图片代理**路由 `/api/proxy-image`：

- 面板里所有远程图片都通过 `GET /api/proxy-image?url=<目标URL>` 请求；
- Node 服务端用 `fetch` 拉取二进制流并原样回传（透传 `content-type`，并加 `cache-control` 缓存 1 小时）；
- 因此浏览器端不再受目标站 CORS 限制。

环境变量：

| 变量 | 作用 |
| --- | --- |
| `PROXY_STRICT=1` | 开启严格模式：拒绝代理私有/内网/回环/链路本地 IP 与 `localhost`，防止被当作 SSRF / 开放代理滥用（默认关闭，因为本工具用途就是浏览第三方数据集图）。 |
| `PROXY_TIMEOUT_MS=12000` | 代理服务端上游拉取超时（毫秒）。超时返回 502，避免慢/不可达的图占住并发槽位（默认 12s，需短于客户端超时）。 |

服务端还会对成功代理的图片做**内存缓存（LRU，1h，最多 300 条）**并**合并并发同 URL 请求**：同一张图在滚动/重新加载时秒出，且不会重复打慢主机。
**失败时绝不缓存**，所以"重试"能真正重新拉取。

更进一步，成功代理的图还会写入**磁盘缓存** `.cache/proxy/`（按 URL 的 sha1 命名，1h TTL，>8MB 的图不入盘以免撑爆磁盘）。这一层能撑过 `npm start` 重启：重启后第一次访问同一张图返回 `x-cache: HIT-DISK`，不再去网络抓。`.cache/` 已加入 `.gitignore`。
`x-cache` 响应头会标记来源：`MISS`（去上游）/ `HIT-MEM`（内存命中）/ `HIT-DISK`（磁盘命中）。

**失败图侧栏**：右上角工具栏的 ⚠ 按钮（带失败计数角标）打开"Failed images"侧栏，逐条列出解码/加载失败的缩略图及原因，每条可单独 **Retry**，顶部可 **Retry all** 或清空列表；点行 id 可跳转到对应行（Detail 视图）。失败计数来自 store 的 `failures`（仅代理失败/解码失败计入，纯 URL 不可达不计入，因为重拉无意义）。
| `NEXT_PUBLIC_IMAGE_TIMEOUT_MS=8000` | 浏览器侧单图拉取超时（毫秒）。超时即标记该图为失败并释放队列槽位（默认 8s）。 |
| `NEXT_PUBLIC_IMAGE_CONCURRENCY=12` | 缩略图并发解码数（1–32，默认 12）。图片解码是网络密集型，可调高以更快填满网格；调低以减少对慢网络的压力。 |
| `NEXT_PUBLIC_DISABLE_IMAGE_PROXY=1` | 禁用代理，浏览器直连原 URL（仅当原站允许 CORS 时才可用）。 |
| `NEXT_PUBLIC_SESSION_AUTO_RESTORE_MAX_MB=60` | 自动恢复会话的体积上限（MB）。超过则不在启动时静默恢复，改为落地页显示 “Restore previous files” 卡片；设为 `0` 可完全关闭自动恢复（默认 60）。 |

> 代理仅转发图片字节，不转发任何本地 cookie / 鉴权头。

## 批量加载性能

网格视图用 `@tanstack/react-virtual` 虚拟滚动，但多列 + overscan 会让数十个缩略图**同时**进入可视区。
为避免一次性发起 40+ 个并行请求导致网络拥塞和主线程卡顿，所有缩略图解码走一个**全局并发限制队列**（`src/lib/dataset/imageQueue.ts`）：

- 默认最多 **8** 个图片同时解码，其余按进入顺序（FIFO）排队；
- 卡片滚出可视区时其未开始的请求会被取消，不浪费带宽；
- 图片按可视顺序“渐进式”填充，滚动更顺滑。

## 说明

- 首次加载会尝试预取内置 demo，无需任何配置即可体验。
- 所有数据解析、图片解码、标注均在浏览器本地完成，**不会上传到任何服务器**（图片代理例外：仅把远程图片转发给浏览器显示，不留存）。
- 本项目不含后端数据库；原 z.ai 脚手架中的 Prisma / SQLite 已被移除。

## License

供学习与研究使用。
