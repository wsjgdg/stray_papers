---
Task ID: cron-round-8
Agent: Z.ai Code (cron review round 8)
Task: QA the existing app, fix bugs, and add new features (Compare highlight, zoom-aware overlay, keyboard shortcuts, visual polish).

## 项目当前状态描述/判断

应用整体稳定，前七轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏、Grid/Table 虚拟滚动、搜索高亮 Grid/Table/Detail/RightPanel、Cmd+G 行跳转、Grid hover 预览、搜索历史、导出进度 toast、`[``]``{``}` 快捷键）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 4 个功能模块。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Detail 视图 ZoomableImage 正常，bbox overlay 渲染。
- ✅ 无错误。

### 新增功能（4 个）

1. **Compare 视图搜索高亮** (`src/components/dataset/CompareView.tsx`)
   - CompareView 字段值用 `Highlight` 组件渲染，匹配搜索词高亮。
   - 新增 `search` store selector + `Highlight` import。
   - 验证：搜索 "What" → Compare 视图中 3 个 `<mark>` 高亮可见。

2. **缩放感知的 bbox/annotation overlay** (`src/components/dataset/ZoomableImage.tsx`)
   - **核心改动**：将 `<img>` 和 overlay children 包裹在共享的 transform 容器中。
   - 之前：`<img>` 独立应用 transform（translate + rotate + scale），overlay 是容器的子元素（absolute 定位），不跟随 transform。
   - 现在：`<img>` + overlay 都在同一个 `transform: translate(...) rotate(...) scale(...)` 的 div 内，overlay 容器 `width: nw, height: nh`（图片原始尺寸），百分比定位的 bbox/annotation 正确跟随缩放/平移/旋转。
   - bbox overlay 和 annotation overlay 现在在缩放时位置正确（之前缩放后偏移）。
   - 验证：Detail 视图 bbox（6 个 rose 矩形）渲染正常，缩放后位置跟随。

3. **键盘快捷键扩展** (`src/lib/dataset/useKeyboardNav.ts`)
   - `n`：跳转到下一个解码失败行（从 `failures` 列表查找，支持 wrap-around）。
   - `f`：跳转到下一个有图片的行（`imageField` 值非空）。
   - 通过 `useDatasetStore.getState()` 直接访问 store。
   - 快捷键 cheatsheet 新增 2 个条目。

4. **视觉打磨** (`src/components/dataset/GridView.tsx`)
   - **空状态增强**：从简单文字改为渐变图标 + 标题 + 副标题的插画式空状态。
     - 圆角图标容器 + dashed border + 渐变背景。
     - 模糊光晕效果（`blur-xl` + 渐变背景）。
     - "No rows match the current filters" + "Try adjusting your filters or clearing the search."
   - **卡片 hover 光晕**：`hover:shadow-lg hover:shadow-violet-500/10` + `hover:-translate-y-1`（之前是 `hover:shadow-md` + `hover:-translate-y-0.5`），更强上浮 + 紫色光晕。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ Compare 视图搜索高亮：搜索 "What" → 3 个 `<mark>` 元素可见。
- ✅ Detail 视图 zoom-aware overlay：bbox（6 个矩形）渲染正常，缩放后位置跟随。
- ✅ 键盘快捷键：`n` `f` 逻辑已实现。
- ✅ 空状态：渐变图标 + 双行文案。
- ✅ 卡片 hover：更强上浮 + 紫色光晕。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前七轮已知）。

### 建议下一阶段优先事项
1. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
2. **数据集对比模式**：同时加载两个数据集并排比较。
3. **可视化打磨**：更多动画过渡（framer-motion）、渐变点缀、卡片入场动画、视图切换过渡。
4. **多文件对比**：同时打开多个文件时支持文件间对比。
5. **行号跳转增强**：支持跳转到书签/标注行。
6. **导出进度条增强**：ExportDialog 内进度条 + toast 双重反馈。
7. **Compare 视图增强**：字段对齐、差异高亮、并排图片缩放联动。
8. **搜索高亮扩展到 Compare 图片 caption**：当前只在字段高亮，缩略图 caption 也应高亮。
9. **键盘快捷键扩展**：`t` 跳转到下一个标注行，`d` 跳转到下一个书签行。
10. **UI 打磨**：卡片入场动画、视图切换淡入、加载 shimmer。

### 产物
- 修改文件：`src/components/dataset/CompareView.tsx`（+高亮）、`src/components/dataset/ZoomableImage.tsx`（+transform 容器）、`src/lib/dataset/useKeyboardNav.ts`（+`n` `f` 快捷键）、`src/components/dataset/ShortcutsCheatsheet.tsx`（+2 个快捷键条目）、`src/components/dataset/GridView.tsx`（+空状态+hover 光晕）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
