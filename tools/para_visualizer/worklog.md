---
Task ID: cron-round-14
Agent: Z.ai Code (cron review round 14)
Task: Add multi-dataset comparison + multi-file comparison support.

## 项目当前状态描述/判断

应用整体稳定，前十三轮已实现完整功能。本轮新增数据集对比 + 多文件对比功能，这是用户明确要求的最后两项剩余功能。所有功能通过 agent-browser 验证，无 console error。

## 当前目标/已完成的修改/验证结果

### QA 结果（agent-browser）
- ✅ 页面加载 200，无 console error。
- ✅ Demo 数据集加载正常。
- ✅ 多数据集加载（Add as new dataset 模式）正常。
- ✅ LeftPanel 数据集切换器正常显示。
- ✅ 数据集对比选择（CMP badge）正常。
- ✅ Compare 视图数据集对比模式正常。
- ✅ 无错误。

### 新增功能（2 个）

1. **多数据集加载 + 切换** (`src/lib/dataset/store.ts` + `src/components/dataset/LoadDialog.tsx` + `LeftPanel.tsx`)
   - **Store 重构**：
     - `dataset: LoadedDataset | null` → `datasets: LoadedDataset[]` + `activeDatasetIndex: number`。
     - 新增 `compareDatasetIndices: number[]`（用于数据集对比）。
     - 新增 actions：`addDataset`（添加到列表 + 切换）、`setActiveDatasetIndex`（切换激活）、`removeDataset`（删除 + 调整索引）、`toggleCompareDataset`（切换对比选择）、`clearCompareDatasets`。
     - `getActiveRows`/`getSchema` 从 `datasets[activeDatasetIndex]` 读取。
     - 所有组件的 `s.dataset` → `s.datasets[s.activeDatasetIndex]`（全局替换）。
   - **LoadDialog 增强**：
     - 新增 `loadMode` 状态（"replace" | "add"）。
     - 当已有数据集时显示单选切换：Replace current / Add as new dataset (for comparison)。
     - "Add" 模式显示 "Will have N datasets total" 预览。
     - 按钮文本动态切换：Load / Add。
     - `handleDemo` 和 `handleLoad` 都支持 add 模式。
   - **LeftPanel 数据集切换器**：
     - 当 `datasets.length > 1` 时显示 "DATASETS" section。
     - 每个数据集显示名称 + 行数 + 文件数。
     - 当前激活的数据集有 primary 高亮。
     - 每个数据集有 CMP 切换按钮（GitCompareArrows 图标）+ 删除按钮（X 图标）。
     - 选中对比时显示 CMP badge。
     - ≥2 个数据集选中对比时显示提示 "N datasets selected for comparison — use Compare view"。
   - 验证：加载 2 个 demo 数据集 → LeftPanel 显示 "DATASETS" + 2 个数据集 + CMP 按钮 + 提示。

2. **数据集对比模式** (`src/components/dataset/CompareView.tsx`)
   - 当 `compareDatasetIndices.length >= 2` 时，Compare 视图自动切换到数据集对比模式。
   - **布局**：
     - 顶部 sticky header："Dataset comparison · N datasets · first row from each"。
     - 数据集卡片行：每个数据集名称 + 行数 + 文件数 + 渐变 header。
     - 字段对比表格：所有数据集的字段并排，差异高亮（amber 背景 + ● 指示符）。
   - **差异高亮**：
     - 字段名列：amber 加粗 + ● 指示符（当值不同时）。
     - 差异值单元格：amber 背景 + 文字。
     - 收集所有数据集的唯一字段名，缺失的显示 "—"。
   - **空状态增强**：提示可以加载多个数据集进行对比。
   - 验证：加载 2 个 demo 数据集 → 选中对比 → Compare 视图显示 "Dataset comparison" + 63 个 td + 差异高亮。

### Store 变更
- `dataset` → `datasets` + `activeDatasetIndex`。
- 新增 `compareDatasetIndices`。
- 新增 actions：`addDataset`、`setActiveDatasetIndex`、`removeDataset`、`toggleCompareDataset`、`clearCompareDatasets`。
- `reset` 清空 `datasets` + `compareDatasetIndices`。

### 验证结果（agent-browser）
- ✅ 多数据集加载：LoadDialog "Add as new dataset" 模式 → 加载第二个 demo。
- ✅ LeftPanel 切换器：显示 "DATASETS" + 2 个数据集 + CMP badges。
- ✅ 数据集对比选择：点击 CMP 按钮 → 显示 "2 datasets selected for comparison"。
- ✅ Compare 视图数据集对比：切换到 Compare → 显示 "Dataset comparison" + 表格 + 63 个 td。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：GridView + TableView 的 `useVirtualizer` 返回函数无法被 React Compiler memoize，良性警告。
2. **ThemeToggle hydration 警告**：SSR 时 `localStorage` 不可用导致良性警告（前十三轮已知）。
3. **数据集对比只显示首行**：当前只比较每个数据集的第一行，未来可扩展为行对行匹配。

### 建议下一阶段优先事项
1. **数据集对比行匹配**：按 ID 或索引匹配不同数据集的行，实现行级对比。
2. **搜索高亮扩展到 Compare 图片 caption**。
3. **UI 微交互打磨**：卡片选择动画、面板 resize 反馈、更多过渡。
4. **性能优化**：大图片懒加载 + 渐进式解码。
5. **Stats 视图增强**：可配置图表（选择字段/图表类型）。
6. **辅助功能增强**：屏幕阅读器公告、跳转链接。
7. **Parquet 写入**：支持导出为 .parquet 格式。

### 产物
- 修改文件：`src/lib/dataset/store.ts`（多数据集重构）、`src/components/dataset/LoadDialog.tsx`（+add 模式）、`src/components/dataset/LeftPanel.tsx`（+数据集切换器）、`src/components/dataset/CompareView.tsx`（+数据集对比模式）、全局 `s.dataset` → `s.datasets[s.activeDatasetIndex]` 替换（10 个文件）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
