---
Task ID: cron-round-11
Agent: Z.ai Code (cron review round 11)
Task: QA the existing app, fix bugs, and add new features (Stats scatter+histogram, visual polish).

## 项目当前状态描述/判断

应用整体稳定，前十轮已实现完整功能（3 面板布局、5 视图、多策略解码、筛选、搜索、排序、bbox、导出、字段映射、持久化、命令面板、书签面板、键盘导航+toast、标注、深色模式、CSV/TSV、拖拽加载、图片缩放/平移、多选+批量栏、快捷键 cheatsheet、标注导出 COCO/YOLO、HTML 报告、右键菜单、加载骨架屏、Grid/Table 虚拟滚动、搜索高亮全视图、Cmd+G 行跳转、Grid hover 预览+stagger 动画、搜索历史、导出进度 toast+进度条、`[``]``{``}` `n` `f` `t` `d` 快捷键、缩放感知 overlay、空状态+hover 光晕、framer-motion 视图切换、Compare 对齐表格、Thumbnail shimmer）。本轮 QA 未发现功能性 bug，控制台无 error。本轮新增 2 个功能模块 + 视觉打磨。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ Stats 视图新增散点图 + 直方图渲染正常。
- ✅ 无错误。

### 新增功能（2 个 + 视觉打磨）

1. **Stats 视图散点图** (`src/components/dataset/StatsView.tsx`)
   - 新增 `ScatterChart` + `Scatter` + `ZAxis` 导入。
   - 当有 ≥2 个 numeric 字段时显示散点图：前两个 numeric 字段的值作为 x/y。
   - 最多 500 个数据点（防止过密），96 行 demo 全显示。
   - CartesianGrid + XAxis + YAxis + ZAxis + Tooltip 完整配置。
   - 标题显示字段名 + 数据点数。
   - 填充色 `#6366f1`（indigo）+ 0.6 透明度。
   - 验证：96 个散点符号（`.recharts-scatter-symbol`）渲染正常。

2. **Stats 视图直方图** (`src/components/dataset/StatsView.tsx`)
   - 当有 ≥1 个 numeric 字段时显示直方图。
   - 12 个 bin，自动计算 bin 范围（min-max 均分）。
   - 每个 bin 显示范围标签（如 "10–18"）+ count。
   - XAxis 标签倾斜 -30° + textAnchor end。
   - 填充色 `#f59e0b`（amber）+ 圆角顶部。
   - 标题显示字段名 + 值数 + bin 数。
   - 验证：19 个 bar rectangle（分类柱状图 + 直方图柱）渲染正常。

3. **视觉打磨** (`src/components/dataset/AppShell.tsx` + `StatusBar.tsx`)
   - **Header 渐变强调线**：顶部 1px 渐变线（`from-violet-500 via-fuchsia-500 to-rose-500`），opacity 60%。
   - **Logo 阴影**：`shadow-sm shadow-violet-500/30`（紫色光晕）。
   - **标题渐变**：`bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text`。
   - **StatusBar 数字**：所有计数改为 `font-mono tabular-nums`，对齐更整齐。
   - **StatusBar 图标着色**：
     - 过滤图标：`text-amber-600 dark:text-amber-400`。
     - 书签图标：有书签时 `text-amber-500`。
     - Compare 图标：有 compare 时 `text-amber-500`。
   - **StatusBar 文案**：从 "N bookmarks" / "N in compare" 简化为 "N bookmarks" / "N compare"。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ Stats 散点图：96 个散点符号渲染正常，标题 "Numeric scatter: data_points vs max_value 96 points"。
- ✅ Stats 直方图：标题 "Histogram: data_points 96 values · 12 bins"，19 个 bar rectangle。
- ✅ Header 渐变强调线 + logo 阴影 + 标题渐变。
- ✅ StatusBar 数字 tabular-nums + 图标着色。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前十轮已知）。

### 建议下一阶段优先事项
1. **Compare 视图联动缩放**：并排图片缩放联动（一张缩放时另一张同步）。
2. **Parquet WASM 解析**：集成 `parquet-wasm` 实现浏览器端直接读取 .parquet。
3. **数据集对比模式**：同时加载两个数据集并排比较。
4. **ARIA 标签 + 辅助功能**：屏幕阅读器支持、键盘焦点管理。
5. **多文件对比**：同时打开多个文件时支持文件间对比。
6. **行号跳转增强**：支持跳转到书签/标注行。
7. **搜索高亮扩展到 Compare 图片 caption**。
8. **Stats 视图增强**：热力图、箱线图、更多可配置图表。
9. **性能优化**：大图片懒加载 + 渐进式解码。
10. **UI 打磨**：更多微交互动画、加载 skeleton。

### 产物
- 修改文件：`src/components/dataset/StatsView.tsx`（+散点图+直方图）、`src/components/dataset/AppShell.tsx`（+渐变 header）、`src/components/dataset/StatusBar.tsx`（+数字 tabular-nums+图标着色）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
