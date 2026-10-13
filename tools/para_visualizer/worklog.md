---
Task ID: cron-round-5
Agent: Z.ai Code (cron review round 5)
Task: QA the existing app, fix bugs, and add new features (virtual scroll, search highlight, row jump).

## 项目当前状态描述/判断

应用整体稳定，前四轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 3 个功能模块 + 1 个组件。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Detail 视图 ZoomableImage 正常。
- ✅ 无错误。

### 新增功能（3 个 + 1 组件）

1. **Grid 视图虚拟滚动** (`src/components/dataset/GridView.tsx`)
   - 集成 `@tanstack/react-virtual` 实现行级虚拟滚动。
   - 根据容器宽度 + thumbnailSize 动态计算每行列数（`colsPerRow`）。
   - 卡片高度 = thumbnail（aspect 3/2）+ caption 区（~56px）。
   - 只渲染可见行 + overscan 4 行，支持万级行数流畅滚动。
   - 移除旧分页（Prev/Next），改为底部状态栏显示 "N rows · virtual scroll · M cols · Xpx"。
   - ResizeObserver 跟踪容器宽度变化，自动调整列数。
   - 保留 Shift+click 范围多选、Cmd+click 单选、右键菜单等所有交互。
   - handleCardClick 提取为组件级函数（接收 row + event）。

2. **搜索高亮** (`src/components/dataset/Highlight.tsx`)
   - 新建 `Highlight` 组件：接收 text + query，用 `<mark>` 高亮匹配子串。
   - 大小写不敏感匹配，保留原始大小写。
   - 样式：`bg-amber-200 dark:bg-amber-500/40` + 圆角。
   - 集成到 GridView 的 caption（hoverLabelField + captionField2）。
   - 集成到 TableView 的所有列单元格。
   - 验证：搜索 "trend" → caption 中 "trend" 被高亮；搜索 "retrieval" → table 中 "Retrieval" 被高亮。

3. **Cmd+G 行号跳转** (`src/components/dataset/RowJumpDialog.tsx`)
   - ⌘G 打开对话框，输入行号跳转。
   - 输入框 number 类型，min=1 max=filtered.length，显示 "1–N" placeholder。
   - Enter 键确认跳转，Escape 关闭。
   - 跳转后自动打开 Detail 视图 + toast 通知。
   - 无效输入显示 toast error。
   - Store 新增 `showRowJumpDialog` 状态 + `setShowRowJumpDialog` action。
   - AppShell 通过 `RowJumpDialogWithStore` 包装组件连接 store。
   - 快捷键 cheatsheet 新增 "⌘G Jump to row number" 条目。
   - 验证：⌘G 打开 → 输入 5 → Go → 跳到第 5 行（全局第 13 行）。

### Store 变更
- 新增字段：`showRowJumpDialog: boolean`。
- 新增 action：`setShowRowJumpDialog`。

### 验证结果（agent-browser）
- ✅ Demo 加载 → Grid 虚拟滚动渲染（96 rows · virtual scroll）。
- ✅ 搜索 "trend" → caption 中 `<mark>` 高亮可见。
- ✅ 搜索 "retrieval" → table 中 `<mark>` 高亮可见。
- ✅ ⌘G 打开行跳转对话框 → 输入 5 → Go → 跳到 Detail 视图第 5 行。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 1 warning（TanStack Virtual 良性警告）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告**：`useVirtualizer` 返回的函数无法被 React Compiler 安全 memoize，导致 "Compilation Skipped" 警告。这是库的已知限制，不影响功能。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前四轮已知）。
3. **ZoomableImage 的 bbox overlay 不跟随缩放**：bbox 用百分比定位，缩放后略有偏移（前轮已知）。

### 建议下一阶段优先事项
1. **Grid hover 放大预览**：hover 缩略图 500ms 后显示放大预览浮层（跟随鼠标）。
2. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
3. **数据集对比模式**：同时加载两个数据集并排比较。
4. **图片缩放时 bbox/annotation 跟随**：将 overlay 应用相同 transform 或改用 SVG/Canvas。
5. **Table 视图虚拟滚动**：TableView 仍用分页，可同样集成 react-virtual。
6. **可视化打磨**：更多动画过渡、渐变点缀、空状态插画。
7. **搜索高亮扩展到 Detail 视图字段**：当前只在 Grid/Table 高亮，Detail 视图字段也应高亮。
8. **多文件对比**：同时打开多个文件时支持文件间对比。
9. **搜索历史**：记录最近搜索词，支持快速重用。
10. **行号跳转增强**：支持跳转到书签/标注行。

### 产物
- 新增文件：`src/components/dataset/Highlight.tsx`、`src/components/dataset/RowJumpDialog.tsx`。
- 修改文件：`src/components/dataset/GridView.tsx`（+虚拟滚动+高亮）、`src/components/dataset/TableView.tsx`（+高亮）、`src/components/dataset/AppShell.tsx`（+RowJumpDialog）、`src/components/dataset/ShortcutsCheatsheet.tsx`（+⌘G）、`src/lib/dataset/store.ts`（+showRowJumpDialog）。
- 新增依赖：`@tanstack/react-virtual`。
- Lint：0 errors / 1 warning（良性）。Dev server：HTTP 200，无 console error。
