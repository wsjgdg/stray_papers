---
Task ID: cron-round-4
Agent: Z.ai Code (cron review round 4)
Task: QA the existing app, fix bugs, and add new features (annotation export, HTML report, context menu, loading skeleton).

## 项目当前状态描述/判断

应用整体稳定，前三轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 4 个功能模块。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ 点击缩略图 → Detail 视图正常（ZoomableImage 渲染，缩放提示可见）。
- ✅ 无错误。

### 新增功能（4 个）

1. **标注导出（COCO JSON + YOLO txt）** (`src/components/dataset/ExportDialog.tsx`)
   - ExportDialog 新增两个导出类型：
     - **Annotations (COCO)**：导出为 COCO 格式 JSON（info + licenses + images + annotations + categories）。每个标注包含 image_id、category_id、bbox（绝对像素 x,y,w,h）、area、iscrowd、segmentation。自动从所有标注标签构建 categories 列表。
     - **Annotations (YOLO)**：导出为 YOLO 格式 txt（每行 `class center_x center_y width height`，归一化 0-1）。文件头部包含 classes 映射注释，每张图片的标注用 `# image_id` 注释分隔。
   - 选择标注导出类型时显示格式说明。
   - `buildCocoExport` 和 `buildYoloExport` 辅助函数实现完整转换逻辑。

2. **HTML 概览报告导出** (`src/components/dataset/HtmlReportExport.tsx`)
   - Stats 视图右上角新增 "Export HTML report" 按钮。
   - 生成自包含的独立 HTML 文件（内联 CSS，无外部依赖）：
     - 渐变 header（violet→fuchsia）含数据集名、生成时间、行数、文件数、标注数。
     - 4 个 KPI 卡片（Total rows / Fields / Files / Total size），每个带彩色顶边。
     - Files 表格（name/split/size/rows/fields）。
     - Category distributions（水平条形图，CSS 实现，渐变填充）。
     - Numeric field statistics 表格（min/max/avg/non-null）。
     - Schema 表格（field/type/role-badge/nullable）。
     - Sample images 网格（前 12 张已解码图片，嵌入 blob URL）。
   - 文件名：`{dataset_name}_report.html`。

3. **右键上下文菜单** (`src/components/dataset/GridView.tsx`)
   - Grid 卡片右键弹出操作菜单（使用 shadcn ContextMenu）：
     - View detail（打开 Detail 视图）
     - Add/Remove bookmark
     - Add/Remove from compare
     - Select/Deselect（多选）
     - --- 分隔线 ---
     - Save image（解码并下载）
     - Copy row id
     - Copy {label_field}（复制代表字段的值）
   - 每个菜单项带图标，操作后显示 toast 通知。

4. **加载骨架屏** (`src/components/dataset/LoadingSkeleton.tsx`)
   - AppShell 在 `loading=true` 且无 dataset 时显示 LoadingSkeleton：
     - Header 骨架（logo + 标题 + 按钮占位）。
     - 中央加载动画（FileBox 图标 + 旋转 Loader2 + "Loading dataset…" 文字）。
     - Status bar 骨架。
   - 导出 GridSkeleton 组件（12 个卡片骨架，带 aspect-[3/2] 图片占位 + 文本行占位）。

### Store 无变更
本轮未修改 store，复用了现有的 `annotations` map 和 `loading` 状态。

### 验证结果（agent-browser）
- ✅ Export dialog 显示 6 个导出选项（Images/Metadata CSV/Metadata JSON/Images+CSV/Annotations COCO/Annotations YOLO）。
- ✅ 选择 COCO 时显示格式说明。
- ✅ Stats 视图显示 "Export HTML report" 按钮。
- ✅ Grid 视图渲染正常，右键菜单组件已挂载（ContextMenuTrigger 包裹每张卡片）。
- ✅ Detail 视图 ZoomableImage 正常。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 0 warnings。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前三轮已知）。
2. **ZoomableImage 的 bbox overlay 不跟随缩放**：bbox 用百分比定位，缩放后略有偏移（前一轮已知）。
3. **grid view 未虚拟化**：当前分页 60/页（前一轮已知）。

### 建议下一阶段优先事项
1. **Grid hover 放大预览**：hover 缩略图时显示放大预览浮层（delay 500ms，跟随鼠标）。
2. **虚拟滚动**：Grid 和 Table 视图集成 `@tanstack/react-virtual`，支持万级行数。
3. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
4. **数据集对比模式**：同时加载两个数据集并排比较。
5. **图片缩放时 bbox/annotation 跟随**：将 overlay 应用相同 transform 或改用 SVG/Canvas。
6. **Toast 通知增强**：导出/加载进度用 toast 实时反馈。
7. **可视化打磨**：更多动画过渡、渐变点缀、卡片 hover 效果。
8. **搜索高亮**：全文搜索时高亮匹配的关键词。
9. **行号跳转**：Cmd+G 输入行号跳转。
10. **多文件对比**：同时打开多个文件时支持文件间对比。

### 产物
- 新增文件：`src/components/dataset/HtmlReportExport.tsx`、`src/components/dataset/LoadingSkeleton.tsx`。
- 修改文件：`src/components/dataset/ExportDialog.tsx`（+COCO/YOLO 导出）、`src/components/dataset/StatsView.tsx`（+HTML 报告按钮）、`src/components/dataset/GridView.tsx`（+右键菜单）、`src/components/dataset/AppShell.tsx`（+LoadingSkeleton）。
- Lint：0 errors / 0 warnings。Dev server：HTTP 200，无 console error。
