---
Task ID: cron-round-10
Agent: Z.ai Code (cron review round 10)
Task: QA the existing app, fix bugs, and add new features (card stagger animation, keyboard toast feedback).

## 项目当前状态描述/判断

应用整体稳定，前九轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏、Grid/Table 虚拟滚动、搜索高亮全视图、Cmd+G 行跳转、Grid hover 预览、搜索历史、导出进度 toast+进度条、`[``]``{``}` `n` `f` `t` `d` 快捷键、缩放感知 overlay、空状态+hover 光晕、framer-motion 视图切换、Compare 对齐表格、Thumbnail shimmer）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 2 个功能模块。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Grid 视图渲染正常（stagger 入场动画）。
- ✅ Detail 视图正常。
- ✅ `j` 键导航正常（Row 1 → Row 2）。
- ✅ `f` 键快捷键正常（跳转到下一个有图片的行）。
- ✅ 视图切换动画正常。
- ✅ 无错误。

### 新增功能（2 个）

1. **Grid 卡片 stagger 入场动画** (`src/components/dataset/GridView.tsx`)
   - 卡片 `<div>` 改为 `framer-motion` 的 `<motion.div>`。
   - 入场动画：`initial={{ opacity: 0, y: 12 }}` → `animate={{ opacity: 1, y: 0 }}`。
   - stagger delay：`Math.min((rowIdx % colsPerRow) * 0.03, 0.15)`，每列延迟 30ms，最大 150ms。
   - transition: `duration: 0.2`。
   - hover 动画：`whileHover={{ y: -4, transition: { duration: 0.15 } }}`（替代 CSS `hover:-translate-y-1`）。
   - CSS transition 改为 `transition-[box-shadow,border-color]`（移除 transform，由 framer-motion 管理）。
   - 验证：Grid 视图渲染正常，卡片有淡入上滑入场效果。

2. **键盘导航 toast 反馈** (`src/lib/dataset/useKeyboardNav.ts`)
   - 所有导航快捷键现在显示 toast 通知：
     - `[` / `]`：切换文件时显示 `File: {filename}`。
     - `{` / `}`：切换书签时显示 `Bookmark X/N`，无书签时显示 "No bookmarks to navigate"。
     - `n`：跳转失败行时显示 `Jumped to failure: row #N`，wrap-around 时显示 `Wrapped to failure`，无失败时显示提示。
     - `f`：跳转有图片行时显示 `Next with image: row #N`，wrap-around 时显示 `Wrapped to row #N`。
     - `t`：跳转标注行时显示 `Next annotated: row #N`，无标注时显示提示。
     - `d`：跳转书签行时，无书签显示 "No bookmarks to navigate"。
   - 使用 `toast.success` / `toast.info` 区分成功和信息提示。
   - 验证：`j` 导航正常，`f` 快捷键执行无错误。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ Grid stagger 动画：卡片渲染正常。
- ✅ 键盘导航 toast：`j` `f` 快捷键执行无错误。
- ✅ Detail 视图正常。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前九轮已知）。

### 建议下一阶段优先事项
1. **Compare 视图联动缩放**：并排图片缩放联动（一张缩放时另一张同步）。
2. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
3. **数据集对比模式**：同时加载两个数据集并排比较。
4. **ARIA 标签 + 辅助功能**：屏幕阅读器支持、键盘焦点管理。
5. **多文件对比**：同时打开多个文件时支持文件间对比。
6. **行号跳转增强**：支持跳转到书签/标注行。
7. **搜索高亮扩展到 Compare 图片 caption**。
8. **UI 打磨**：更多微交互动画、渐变点缀、加载 skeleton。
9. **性能优化**：大图片懒加载 + 渐进式解码。
10. **Stats 视图增强**：更多图表类型（散点图、热力图、直方图）。

### 产物
- 修改文件：`src/components/dataset/GridView.tsx`（+stagger 动画）、`src/lib/dataset/useKeyboardNav.ts`（+toast 反馈）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
