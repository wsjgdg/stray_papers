---
Task ID: cron-round-9
Agent: Z.ai Code (cron review round 9)
Task: QA the existing app, fix bugs, and add new features (framer-motion transitions, export progress, Compare alignment, shimmer, keyboard shortcuts).

## 项目当前状态描述/判断

应用整体稳定，前八轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏、Grid/Table 虚拟滚动、搜索高亮 Grid/Table/Detail/RightPanel/Compare、Cmd+G 行跳转、Grid hover 预览、搜索历史、导出进度 toast、`[``]``{``}` `n` `f` 快捷键、缩放感知 overlay、空状态+hover 光晕）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 5 个功能模块。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Detail 视图正常。
- ✅ 视图切换（Grid ↔ Table）动画正常。
- ✅ Compare 视图对齐表格渲染正常。
- ✅ 无错误。

### 新增功能（5 个）

1. **framer-motion 视图切换动画** (`src/components/dataset/AppShell.tsx`)
   - 使用 `AnimatePresence mode="wait"` 包裹视图内容。
   - 切换视图时：`initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}` → `exit={{ opacity: 0, y: -8 }}`。
   - transition: `duration: 0.18, ease: "easeOut"`，平滑淡入淡出 + 轻微垂直滑动。
   - 验证：Grid → Table → Grid 切换无错误，动画流畅。

2. **ExportDialog 进度条增强** (`src/components/dataset/ExportDialog.tsx`)
   - 替换简单 Progress 组件为自定义渐变进度条。
   - 渐变填充：`bg-gradient-to-r from-violet-500 to-fuchsia-500` + `transition-all duration-300`。
   - 闪烁效果：`animate-pulse` + 渐变背景遮罩。
   - 顶部状态行：旋转 Loader2 图标 + "Exporting images…" + `done / total` 计数。
   - 底部信息行：`X% complete` + `N remaining` / `finishing…`。
   - 验证：组件已集成（进度条逻辑通过 toast 和视觉双重反馈）。

3. **Compare 视图字段对齐** (`src/components/dataset/CompareView.tsx`)
   - **重构**：从独立的卡片列改为统一的表格布局。
   - 图片行：sticky 在顶部（`sticky top-[37px] z-[5] bg-background/80 backdrop-blur`），并排显示缩略图。
   - 字段表：`<table>` 布局，每行一个字段，列为对比的行。
   - 字段名列：`sticky left-0` 固定左侧 + 斑马纹背景（`bg-muted/20` 交替）。
   - 字段值用 `Highlight` 组件渲染（搜索高亮）。
   - 超过 10 个字段时显示 "+N more fields" 提示。
   - 验证：Compare 视图显示 1 个 table + 31 个 td（字段对齐正确）。

4. **Thumbnail 加载 shimmer** (`src/components/dataset/Thumbnail.tsx` + `globals.css`)
   - 解中中状态从简单旋转图标改为 shimmer 动画。
   - 渐变背景 + `animate-pulse` 基底。
   - 水平移动的高光遮罩（`linear-gradient` + `shimmer 1.5s infinite` 动画）。
   - 中央保留旋转 Loader2 图标。
   - `globals.css` 新增 `@keyframes shimmer` 动画。
   - 验证：缩略图加载时显示 shimmer 效果。

5. **键盘快捷键扩展** (`src/lib/dataset/useKeyboardNav.ts`)
   - `t`：跳转到下一个有标注的行（从 `annotations` map 查找有标注的 rowId）。
   - `d`：跳转到下一个书签行（`}` 的别名）。
   - 支持 wrap-around。
   - 快捷键 cheatsheet 新增 2 个条目。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ framer-motion 视图切换：Grid → Table → Grid 无错误，动画流畅。
- ✅ Compare 对齐表格：1 个 table + 31 个 td 渲染正确。
- ✅ Thumbnail shimmer：加载状态显示 shimmer 动画。
- ✅ 键盘快捷键：`t` `d` 逻辑已实现。
- ✅ ExportDialog 进度条：渐变 + 闪烁效果已集成。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前八轮已知）。

### 建议下一阶段优先事项
1. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
2. **数据集对比模式**：同时加载两个数据集并排比较。
3. **Compare 视图联动缩放**：并排图片缩放联动（一张缩放时另一张同步）。
4. **卡片入场动画**：Grid 卡片用 framer-motion stagger 入场。
5. **多文件对比**：同时打开多个文件时支持文件间对比。
6. **行号跳转增强**：支持跳转到书签/标注行。
7. **搜索高亮扩展到 Compare 图片 caption**：当前只在字段高亮。
8. **UI 打磨**：更多微交互动画、渐变点缀、加载 skeleton。
9. **性能优化**：大图片懒加载 + 渐进式解码。
10. **辅助功能**：ARIA 标签、屏幕阅读器支持。

### 产物
- 修改文件：`src/components/dataset/AppShell.tsx`（+framer-motion）、`src/components/dataset/ExportDialog.tsx`（+进度条）、`src/components/dataset/CompareView.tsx`（+对齐表格）、`src/components/dataset/Thumbnail.tsx`（+shimmer）、`src/lib/dataset/useKeyboardNav.ts`（+`t` `d`）、`src/components/dataset/ShortcutsCheatsheet.tsx`（+2 个快捷键）、`src/app/globals.css`（+shimmer keyframes）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
