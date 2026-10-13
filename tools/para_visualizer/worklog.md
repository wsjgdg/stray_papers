---
Task ID: cron-round-2
Agent: Z.ai Code (cron review round 2)
Task: QA the existing app, fix bugs, and add new features (persistence, command palette, keyboard nav, annotation, dark mode).

## 项目当前状态描述/判断

应用整体稳定。前一轮已实现完整的 3 面板布局、5 种视图（Grid/Table/Detail/Compare/Stats）、多策略图片解码、筛选构建器、全文搜索、排序、bbox 叠加、导出、字段映射。本轮 QA 发现并修复了若干 bug，并新增了 6 个功能模块。

### QA 发现的问题
1. **react-resizable-panels 警告**：动态渲染的面板缺少 `id` 和 `order` props，导致 "Invalid layout total size" 和 "Panel id and order props recommended" 警告。
2. **关键 bug：AnnotationOverlay 无限循环**：`useDatasetStore((s) => s.annotations[rowId] || [])` 每次渲染都返回新的 `[]` 引用，导致 `useSyncExternalStore` 检测到快照变化 → `forceStoreRerender` → `Maximum update depth exceeded`。点击缩略图进入 Detail 视图时直接崩溃。
3. **性能问题**：DetailView 和 RightPanel 选择整个 `blobCache` 对象，导致任意一张缩略图解码时全部 re-render。

## 当前目标/已完成的修改/验证结果

### Bug 修复
- **AnnotationOverlay 无限循环**：改为选择稳定的 `annotations` map 引用，再用 `useMemo` 派生 per-row 列表，空值用模块级 `EMPTY` 常量（稳定引用）。
- **react-resizable-panels 警告**：给 `ResizablePanel` 添加 `id` + `order` props，并加 `autoSaveId="dib-layout"` 持久化布局。
- **blobCache 选择器优化**：DetailView / RightPanel 从 `useDatasetStore((s) => s.blobCache)` 改为 `useDatasetStore((s) => s.blobCache[cacheKey])`，只选择当前行的缓存条目。
- **持久化 debounced 写入**：`setupPersistence` 的 subscribe 回调用 `setTimeout` 400ms debounce，避免每次 `cacheBlob` 都触发 `JSON.stringify`。

### 新增功能（6 个）
1. **localStorage 持久化** (`src/lib/dataset/persist.ts`)
   - 持久化：bookmarks、recent、fieldRoles、viewMode、thumbnailSize、sidebarOpen、detailPanelOpen、showBboxOverlay、hiddenFields、annotations。
   - 应用启动时一次性 hydrate（单个 `setState` 批量更新，避免级联渲染）。
   - 修改时 debounced 写入（400ms）。
2. **命令面板** (`src/components/dataset/CommandPalette.tsx`)
   - ⌘K 打开，支持模糊搜索命令。
   - 分组：Views（Grid/Table/Detail/Compare/Stats）、Actions（Open/Filter/Export/Schema/Bookmarks）、Layout（toggle sidebar/detail）、Annotation（mode）、Theme（light/dark）、Cleanup（clear selection/compare/reset）、Jump to row（前 20 条匹配行）。
3. **书签面板** (`src/components/dataset/BookmarkPanel.tsx`)
   - 左侧 Sheet，列出所有书签，支持搜索、快速跳转、单条删除、全部清空。
   - Header 显示书签计数徽章。
4. **键盘导航** (`src/lib/dataset/useKeyboardNav.ts`)
   - `1-5`：切换视图
   - `j`/`k` 或 ↑/↓：在 Detail/Grid 视图中导航行
   - `b`：切换当前行书签
   - `/`：聚焦搜索框
   - `x`：清除多选
   - `Cmd+A`：全选筛选结果
   - `Escape`：逐层关闭（命令面板 → 筛选面板 → 取消选中行）
5. **标注/标签功能** (`src/components/dataset/AnnotationOverlay.tsx`)
   - DetailView 工具栏新增 "Annotate" 切换按钮。
   - 在图片上点击拖拽画框，弹出输入标签名 + 选颜色（6 色调色板）。
   - 标注存储为归一化坐标（0-1），分辨率无关，持久化到 localStorage。
   - 标注模式下显示浮动工具栏（颜色选择 + 计数 + 清除）。
   - 每个标注可悬停删除。
6. **深色模式 + 主题切换** (`src/components/dataset/ThemeToggle.tsx`)
   - Header 新增主题切换按钮（light → dark → system 循环）。
   - 三图标（Sun/Moon/MonitorSmartphone）平滑过渡动画。
   - 持久化到 localStorage，system 模式监听系统主题变化。

### Header 增强
- 新增 "Search commands… ⌘K" 触发按钮（桌面端可见）。
- 新增书签计数徽章按钮（有书签时显示）。
- 新增主题切换按钮。
- Menubar 的 Edit 菜单新增 Bookmarks 入口；View 菜单新增 Command palette 入口；Help 菜单新增 Keyboard shortcuts 提示。

### Store 扩展
新增字段：`selectedRowIds`（多选 Set）、`annotations`（按 rowId 分组的标注 map）、`annotationMode`、`annotationColor`、`showAnnotations`、`showCommandPalette`、`showBookmarkPanel`。
新增 actions：`toggleSelectedRow`、`clearSelection`、`selectAllFiltered`、`addAnnotation`、`removeAnnotation`、`clearAnnotations`、`setAnnotationMode`、`setAnnotationColor`、`setShowAnnotations`、`setShowCommandPalette`、`setShowBookmarkPanel`。

### 验证结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载 → 3 面板布局正常渲染。
- ✅ 点击缩略图 → Detail 视图正常（不再崩溃）。
- ✅ ⌘K 命令面板打开，搜索 "chart_005" 能跳到第 6 行。
- ✅ 主题切换：light → dark → system，`document.documentElement.classList` 正确切换。
- ✅ 键盘导航：`j` 键从 Row 1 跳到 Row 2；`b` 键切换书签。
- ✅ 筛选器：question_type = "Data Retrieval" → 96 行筛选到 19 行。
- ✅ Annotate 模式启用后显示拖拽提示和颜色工具栏。
- ✅ react-resizable-panels 警告已消除（仅剩一条无害的 layout normalization 提示）。
- ✅ ESLint 0 errors / 0 warnings。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **react-resizable-panels 偶发警告**："Invalid layout total size: 20%, 55%" — 当 detail panel 切换显示/隐藏时，panel 总和不是 100%。库会自动 normalize，无害但日志噪音。可通过始终渲染 3 个 panel + size=0 隐藏来彻底消除。
2. **grid view 未虚拟化**：当前分页 60/页，96 行 demo 没问题，但 >1000 行会卡。建议集成 `react-window` 或 `@tanstack/react-virtual`。
3. **Parquet 直接解析仍不支持**：需 WASM parquet reader（如 `parquet-wasm`）。

### 建议下一阶段优先事项
1. **虚拟滚动**：Grid 和 Table 视图集成虚拟滚动，支持万级行数。
2. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
3. **CSV 文件支持**：当前只支持 .arrow/.feather/.json，可加 .csv 解析（PapaParse）。
4. **拖拽到落地页**：LandingPage 当前只显示静态预览，应支持直接拖拽文件到落地页加载。
5. **批量多选 + 批量操作**：`selectedRowIds` Set 已就绪，需在 Grid/Table 添加 Shift+click 多选 UI 和批量导出/书签/比较按钮。
6. **HTML 概览报告导出**：Stats 视图的 "导出为 HTML 报告" 功能（含样本图和统计图表）。
7. **数据集对比模式**：同时加载两个数据集并排比较。
8. **标注导出**：把 annotations 导出为 COCO/YOLO JSON 格式，便于 ML 训练流程。
9. **键盘快捷键帮助浮层**：按 `?` 弹出完整快捷键 cheatsheet。
10. **图片缩放/平移**：Detail 视图大图支持滚轮缩放和拖拽平移（当前只是 object-contain）。

### 产物
- 新增文件：`src/lib/dataset/persist.ts`、`src/lib/dataset/useKeyboardNav.ts`、`src/components/dataset/CommandPalette.tsx`、`src/components/dataset/BookmarkPanel.tsx`、`src/components/dataset/AnnotationOverlay.tsx`、`src/components/dataset/ThemeToggle.tsx`。
- 修改文件：`src/app/page.tsx`、`src/components/dataset/AppShell.tsx`、`src/components/dataset/DetailView.tsx`、`src/components/dataset/RightPanel.tsx`、`src/lib/dataset/store.ts`。
- Lint：0 errors / 0 warnings。Dev server：HTTP 200，无 console error。
