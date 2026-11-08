---
Task ID: final-optimization
Agent: Z.ai Code (final optimization pass)
Task: Final comprehensive optimization — visual polish, performance, accessibility.

## 项目当前状态描述/判断

应用经过 17 轮迭代开发，功能完整稳定。本轮进行最终优化打磨：视觉细节、性能优化、辅助功能增强。无功能性 bug，控制台无 error。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 加载正常，11 张图片渲染。
- ✅ Detail 视图正常（ZoomableImage + bbox overlay）。
- ✅ `j` 键导航正常（Row 1 → Row 2）。
- ✅ Grid 视图正常。
- ✅ 所有视图切换无错误。

### 优化内容（3 个方面）

1. **StatusBar 视觉优化** (`src/components/dataset/StatusBar.tsx`)
   - 背景改为渐变：`bg-gradient-to-r from-card/40 via-card/30 to-card/40`。
   - Database 图标着色：`text-violet-500/70`（之前无色）。
   - 数据集名称加粗：`font-medium text-foreground/80`（之前与普通文字同色）。
   - 行数高亮：`font-mono tabular-nums font-medium text-foreground/70`。
   - 书签/compare 图标加 `transition-colors` 动画。
   - 失败图标改为 `text-rose-500`（之前 amber）+ 数字也 rose。
   - 所有项目加 `shrink-0`（防止 flex 压缩）。
   - 加 `role="status" aria-live="polite"`（辅助功能）。
   - 简化文案：去掉多余的 "bookmarks"/"compare" 文字，只保留数字。

2. **LandingPage 视觉优化** (`src/components/dataset/LandingPage.tsx`)
   - Hero 描述文案简化：去掉 "InfoChartQA" 特定引用，改为通用描述。
   - 预览网格卡片加 `hover:border-primary/30 hover:shadow-sm transition-all`（hover 效果）。
   - Footer 技术栈更新：加 `parquet-wasm · framer-motion`。

3. **性能优化** (`src/lib/dataset/hooks.ts`)
   - `useActiveRows` 中的 `maxRows` 截断逻辑从 store 的 `getActiveRows()` 移到 hooks 层。
   - 这样 `useMemo` 可以正确 memoize（之前 store 方法每次调用创建新数组）。
   - `maxRows` 加入 `useMemo` 依赖数组。
   - 减少大数据集的内存压力：只 flatten 前 5000 行（可配置）。

### 验证结果（agent-browser）
- ✅ Demo 加载：11 张图片，无错误。
- ✅ Detail 视图：ZoomableImage + bbox 正常。
- ✅ `j` 键导航：Row 1 → Row 2 正常。
- ✅ Grid 视图：卡片渲染正常。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 最终项目总结

### 技术栈
- Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui
- Zustand（状态管理）+ apache-arrow + parquet-wasm（数据解析）
- @tanstack/react-virtual（虚拟滚动）+ framer-motion（动画）
- recharts（统计图表）+ PapaParse（CSV 解析）

### 功能清单（30+ 功能）
1. 3 面板可调整布局（react-resizable-panels）
2. 5 种视图：Grid / Table / Detail / Compare / Stats
3. 多策略图片解码（bytes/base64/data-URL/URL fetch/nested struct）
4. URL 图片自动 fetch 预览（CORS 支持）
5. base64 验证（避免 atob 崩溃）
6. 拖拽文件加载（.arrow/.feather/.parquet/.csv/.tsv/.json）
7. Parquet WASM 解析（bundler 入口 + CDN fallback + PAR1 验证）
8. CSV/TSV 解析（PapaParse）
9. 多数据集加载 + 切换
10. 数据集对比模式（并排字段差异高亮）
11. 多文件对比（文件选择 + 行级对比）
12. Grid 视图虚拟滚动（@tanstack/react-virtual）
13. Table 视图虚拟滚动
14. 全文搜索 + 搜索高亮（Grid/Table/Detail/RightPanel/Compare）
15. 搜索历史（localStorage 持久化）
16. 动态筛选构建器（AND/OR + per-role 操作符）
17. 排序（任意列点击切换）
18. bbox 叠加（InfoChartQA 风格 + 缩放感知）
19. 图片缩放/平移（滚轮缩放 + 拖拽平移 + 旋转 + 双击重置）
20. 标注/标签功能（画框 + 标签 + 6 色调色板 + 持久化）
21. 标注导出（COCO JSON + YOLO txt）
22. 书签 + 书签面板（localStorage 持久化）
23. 多选 + 批量操作栏（Shift+click 范围选择 + Cmd+click 单选）
24. 右键上下文菜单（Grid 卡片）
25. 命令面板（⌘K 模糊搜索）
26. Cmd+G 行号跳转 + Cmd+Shift+G 书签跳转 + Cmd+Shift+A 标注跳转
27. 键盘快捷键（j/k/1-5/b/n/f/t/d/[/]/{/}/x/?/）
28. 深色模式 + 主题切换（light/dark/system）
29. 导出（图片批量 + metadata CSV/JSON + 标注 COCO/YOLO + 进度条 + toast）
30. HTML 概览报告导出
31. Stats 视图（KPI 卡片 + 分类分布饼图/条形图 + 散点图 + 直方图 + 热力图 + 箱线图 + schema 表）
32. 加载骨架屏 + Thumbnail shimmer 动画
33. framer-motion 视图切换动画 + Grid 卡片 stagger 入场
34. Grid hover 放大预览（Portal 浮层）
35. Compare 视图联动缩放（Linked/Unlinked 切换）
36. localStorage 持久化（bookmarks/recent/fieldRoles/view 设置/annotations）
37. maxRows 限制（大数据集行数截断，默认 5000）
38. 辅助功能（ARIA 标签 + focus-visible + aria-pressed）
39. 快捷键 cheatsheet（? 键弹出）
40. 空状态插画（渐变图标 + 模糊光晕 + 双行文案）

### 产物
- 修改文件：`src/components/dataset/StatusBar.tsx`（视觉优化）、`src/components/dataset/LandingPage.tsx`（文案+hover）、`src/lib/dataset/hooks.ts`（maxRows memoize）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
