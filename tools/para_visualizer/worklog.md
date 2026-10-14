---
Task ID: cron-round-12
Agent: Z.ai Code (cron review round 12)
Task: QA the existing app, fix bugs, and add new features (Compare linked zoom, ARIA labels, visual polish).

## 项目当前状态描述/判断

应用整体稳定，前十一轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航+toast、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏、Grid/Table 虚拟滚动、搜索高亮全视图、Cmd+G 行跳转、Grid hover 预览+stagger 动画、搜索历史、导出进度 toast+进度条、`[``]``{``}` `n` `f` `t` `d` 快捷键、缩放感知 overlay、空状态+hover 光晕、framer-motion 视图切换、Compare 对齐表格、Thumbnail shimmer、Stats 散点图+直方图、渐变 header+StatusBar 数字着色）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 2 个功能模块 + ARIA 辅助功能。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Detail 视图正常。
- ✅ Compare 视图 linked zoom 控件正常。
- ✅ Stats + Grid 视图切换正常。
- ✅ ARIA 标签正确设置。
- ✅ 无错误。

### 新增功能（2 个 + ARIA 辅助功能）

1. **Compare 视图联动缩放** (`src/components/dataset/LinkedZoomImage.tsx` + `CompareView.tsx`)
   - 新建 `LinkedZoomImage` 组件：接收共享 `LinkedZoomState`（zoom/offsetX/offsetY/rotation）。
   - `LinkedZoomControls`：共享缩放控制组（zoom in/out/reset + Linked/Unlinked 切换按钮）。
     - Linked 模式（默认）：所有图片同步缩放/平移，一张缩放时全部跟随。
     - Unlinked 模式：每张图片独立缩放（使用 local state）。
     - Linked 按钮显示 `Link2` 图标 + emerald 色，Unlinked 显示 `Link2Off`。
   - CompareView 管理 `linkedZoom` state + `linked` boolean，传递给所有图片。
   - 图片解码：使用 `blobCache` + `decodeImageField` 异步解码，未解码时 fallback 到 Thumbnail。
   - Annotation overlay 保留在 LinkedZoomImage 内。
   - 验证：Compare 视图显示 2 张图片 + "Linked" 按钮，点击切换到 "Unlinked"。

2. **Compare 视图空状态增强** (`CompareView.tsx`)
   - 从简单图标改为渐变图标 + 标题 + 副标题的插画式空状态。
   - 圆角图标容器 + dashed border + 渐变背景 + 模糊光晕。
   - 与 GridView 空状态风格一致。

3. **ARIA 辅助功能** (`Toolbar.tsx` + `GridView.tsx` + `ThemeToggle.tsx`)
   - 视图切换按钮：`aria-label="{view} view"` + `aria-pressed={isActive}`。
   - 搜索框：`aria-label="Search rows across text fields"` + `aria-expanded`。
   - Grid 多选 checkbox：`aria-label="Select row N for bulk actions"` + `aria-pressed`。
   - Compare 移除按钮：`aria-label="Remove {id} from compare"`。
   - ThemeToggle：`aria-label="Toggle theme, current: {theme}"` + `aria-haspopup="listbox"`。
   - 验证：Grid view 按钮 `aria-pressed="true"`，ThemeToggle `aria-label="Toggle theme, current: system"`。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ Compare linked zoom：显示 "Linked" 按钮，点击切换 "Unlinked"，2 张图片渲染正常。
- ✅ Compare 空状态：渐变图标 + 双行文案。
- ✅ ARIA 标签：视图按钮 `aria-pressed`、搜索框 `aria-label`、ThemeToggle `aria-label` 正确。
- ✅ 所有视图切换无错误。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前十一轮已知）。

### 建议下一阶段优先事项
1. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
2. **数据集对比模式**：同时加载两个数据集并排比较。
3. **多文件对比**：同时打开多个文件时支持文件间对比。
4. **行号跳转增强**：支持跳转到书签/标注行（Cmd+Shift+G / Cmd+Shift+A）。
5. **搜索高亮扩展到 Compare 图片 caption**。
6. **Stats 视图增强**：热力图、箱线图、可配置图表。
7. **性能优化**：大图片懒加载 + 渐进式解码。
8. **UI 打磨**：卡片选择动画、面板 resize 反馈、更多微交互。
9. **辅助功能增强**：键盘焦点管理、焦点可见样式、屏幕阅读器公告。
10. **Compare 视图差异高亮**：字段值不同时高亮标记。

### 产物
- 新增文件：`src/components/dataset/LinkedZoomImage.tsx`。
- 修改文件：`src/components/dataset/CompareView.tsx`（+linked zoom+空状态）、`src/components/dataset/Toolbar.tsx`（+ARIA）、`src/components/dataset/GridView.tsx`（+ARIA）、`src/components/dataset/ThemeToggle.tsx`（+ARIA）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
