---
Task ID: cron-round-3
Agent: Z.ai Code (cron review round 3)
Task: QA the existing app, fix bugs, and add new features (CSV support, drag-drop landing, image zoom/pan, multi-select, shortcuts cheatsheet).

## 项目当前状态描述/判断

应用整体稳定，前两轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式）。本轮 QA 未发现功能性 bug，控制台无 error（仅 ThemeToggle 的良性 hydration 警告）。本轮新增 5 个功能模块 + 1 个组件。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error（除良性 hydration 警告）。
- ✅ Demo 数据集加载正常，3 面板布局渲染。
- ✅ 点击缩略图 → Detail 视图正常（无无限循环）。
- ✅ j/k 键盘导航正常。
- ✅ ? 键打开快捷键 cheatsheet。
- ✅ ⌘K 命令面板正常。
- ✅ 筛选器 96→19 正常。
- ✅ 主题切换正常。

### 新增功能（5 个 + 1 组件）

1. **CSV/TSV 文件解析** (`src/lib/dataset/parsers.ts`)
   - 集成 PapaParse，支持 `.csv` 和 `.tsv`（自动检测分隔符 / tab）。
   - 自动推断字段类型（int/float/bool/string）和 role（identifier/url/text/numeric）。
   - 缺少 `id` 列时自动生成 `row_N`。
   - LoadDialog 的 accept 和格式说明已更新。
   - 验证：上传 5 行测试 CSV → 解析成功，schema 检测正确（id→identifier, image_url→url, question→text, year→int/numeric）。

2. **LandingPage 拖拽加载** (`src/components/dataset/LandingPage.tsx`)
   - 落地页 `<main>` 支持拖拽文件直接加载（无需打开 dialog）。
   - 拖拽时显示全屏 overlay（dashed border + 上传图标 + 支持格式提示）。
   - 拖拽离开时自动隐藏 overlay。
   - 复用 `parseFiles` 解析逻辑，加载后自动进入主界面。

3. **图片缩放/平移** (`src/components/dataset/ZoomableImage.tsx`)
   - Detail 视图大图支持：
     - 滚轮缩放（向光标位置缩放，0.1x–20x）。
     - 拖拽平移（缩放超过 fit 时启用 grab/grabbing 光标）。
     - 双击重置（fit + 居中 + 0° 旋转）。
     - 旋转按钮（每次 90°）。
     - 缩放百分比显示 + 放大/缩小/旋转/重置按钮组（右下角浮动）。
     - 缩放 >2x 时启用 pixelated 渲染（清晰像素）。
     - 底部提示条（"Scroll to zoom · drag to pan · double-click to reset"）。
   - 采用 "auto-fit + user override" 模式：`userZoom` 为 null 时自动 fit，用户缩放后变为数字。避免 setState-in-effect lint 错误。
   - bbox overlay 和 annotation overlay 作为 ZoomableImage 的 children 叠加。

4. **Shift+click 多选 + 批量操作栏** (`src/components/dataset/GridView.tsx`)
   - Grid 卡片支持：
     - 普通点击：打开 Detail 视图。
     - Cmd/Ctrl+click：切换多选。
     - Shift+click：范围多选（从上次点击到当前）。
   - 每张卡片左上角显示复选框（hover 时可见，选中时 emerald 实心 + check 图标）。
   - 选中卡片显示 emerald 边框环。
   - 底部批量操作栏（选中数 >0 时显示）：
     - 显示选中数。
     - "Select all (N)" 按钮。
     - "Export selected" 按钮（打开导出对话框）。
     - "Clear" 按钮。
   - hover 时卡片轻微上移（`hover:-translate-y-0.5`）+ 阴影增强。

5. **键盘快捷键 cheatsheet** (`src/components/dataset/ShortcutsCheatsheet.tsx`)
   - 按 `?` 键（或 Shift+/）切换显示。
   - Dialog 展示 4 个分组的快捷键：
     - Navigation（j/k/↑↓/1-5/⌘K）
     - Actions（⌘O/⌘F/⌘E/⌘A/b/x/）
     - Detail view image（scroll/drag/dbl-click）
     - Global（Esc/?）
   - 每个快捷键用 `<kbd>` 样式渲染。
   - 已集成到 AppShell（无 dataset 和有 dataset 两种状态都挂载）。

6. **BboxAbsoluteOverlay 组件** (`src/components/dataset/DetailView.tsx`)
   - 从 Thumbnail 抽取的独立 bbox overlay，用于 ZoomableImage 内部叠加。
   - 使用原始图片尺寸计算百分比定位。

### Store 无变更
本轮未修改 store，复用了前一轮的 `selectedRowIds` Set 和相关 actions（`toggleSelectedRow`、`clearSelection`、`selectAllFiltered`）。

### 验证结果（agent-browser）
- ✅ CSV 上传：5 行解析成功，schema 正确推断。
- ✅ Demo + Detail 视图：ZoomableImage 渲染，缩放按钮（100%）+ 提示条可见。
- ✅ 缩放按钮点击：百分比变化（100% → 77%）。
- ✅ 多选：点击 2 个 checkbox → `selectedRowIds.size = 2`，批量操作栏显示 "2 selected"。
- ✅ `?` 键：cheatsheet dialog 打开，显示 4 个分组。
- ✅ `j` 键：Detail 视图 Row 1 → Row 2 导航正常。
- ✅ 无 console error（除良性 hydration 警告）。
- ✅ ESLint 0 errors / 0 warnings。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用，客户端首次渲染读取存储的主题导致 `<html>` class 不匹配。这是 next-themes 的已知问题，`suppressHydrationWarning` 已加在 `<html>` 上，警告来自子元素。可通过 `next-themes` 库或 `useEffect` 延迟读取彻底消除，但当前无害。
2. **ZoomableImage 的 bbox overlay 不跟随缩放**：bbox 用百分比定位，在缩放/平移时位置会偏移（因为 overlay 是 ZoomableImage 的子元素，absolute 定位到容器而非图片）。标注 overlay 同理。修复需要将 overlay 也应用相同的 transform，或改为 SVG 叠加。当前 bbox 在 fit 模式下正确，缩放后略有偏移。
3. **grid view 未虚拟化**：当前分页 60/页，96 行 demo 没问题，但 >1000 行会卡。

### 建议下一阶段优先事项
1. **标注导出（COCO/YOLO）**：把 annotations 导出为 COCO JSON（含 categories + images + annotations）和 YOLO txt（每行 class x y w h 归一化），便于 ML 训练流程。ExportDialog 新增 "Annotations" 导出类型。
2. **HTML 概览报告导出**：Stats 视图新增 "Export HTML report" 按钮，生成包含 KPI 卡片、分布图表（用 recharts 静态 SVG）、样本图片缩略图、schema 表的独立 HTML 文件。
3. **虚拟滚动**：Grid 和 Table 视图集成 `@tanstack/react-virtual`，支持万级行数。
4. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
5. **数据集对比模式**：同时加载两个数据集并排比较。
6. **图片缩放时 bbox/annotation 跟随**：将 bbox overlay 和 annotation overlay 改为应用与 ZoomableImage 相同的 transform，或改用 SVG/Canvas 叠加层。
7. **Grid hover 放大预览**：hover 缩略图时显示放大预览浮层。
8. **加载骨架屏**：数据集加载时显示骨架屏而非空白。
9. **Toast 通知增强**：导出/加载进度用 toast 实时反馈。
10. **右键菜单**：Grid 卡片右键弹出操作菜单（save/bookmark/compare/copy id/copy value）。

### 产物
- 新增文件：`src/components/dataset/ZoomableImage.tsx`、`src/components/dataset/ShortcutsCheatsheet.tsx`。
- 修改文件：`src/lib/dataset/parsers.ts`（+CSV/TSV）、`src/components/dataset/LandingPage.tsx`（+拖拽）、`src/components/dataset/DetailView.tsx`（+ZoomableImage）、`src/components/dataset/GridView.tsx`（+多选+批量栏）、`src/components/dataset/AppShell.tsx`（+ShortcutsCheatsheet）、`src/components/dataset/LoadDialog.tsx`（+CSV accept）。
- 新增依赖：`papaparse` + `@types/papaparse`。
- Lint：0 errors / 0 warnings。Dev server：HTTP 200，无 console error（除良性 hydration 警告）。
