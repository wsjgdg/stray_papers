---
Task ID: cron-round-17
Agent: Z.ai Code (cron review round 17)
Task: Fix URL image field selection + optimize large dataset loading.

## 项目当前状态描述/判断

用户报告两个问题：
1. URL 形式图片没有预览图 — store 自动选 imageField 时只查 `role === "image"`，不查 `role === "url"`。
2. rows 较多时负载过大 — 大数据集所有行一次性加载到内存。

## 当前目标/已完成的修改/验证结果

### Bug 1: URL 字段未自动选为 imageField

**原因**：store 的 `setDataset` / `addDataset` 中自动选 imageField 的逻辑只查 `role === "image"`，不查 `role === "url"`。当数据集的图片字段是 URL 字符串时，`detectFieldRole` 检测为 `role = "url"`（因为字段名含 "url"），但 store 不会自动选它作为 imageField。

**修复** (`src/lib/dataset/store.ts`)：
- `setDataset`：`imageField` 自动选逻辑改为先查 `role === "image"`，再查 `role === "url"`，最后 fallback 到第一个字段。
- `addDataset`：同样增加 `role === "url"` fallback。
- **验证**：加载 URL 图片测试数据集（3 行，url 字段含 https URL）→ url 字段自动选为 imageField（显示 IMG badge）→ 2/3 张图片成功 fetch 显示（placehold.co 支持 CORS），1 张显示 "Click to open URL"（flowingdata.com 不支持 CORS）。

### Bug 2: 大数据集行数过多导致负载过大

**原因**：`getActiveRows()` 直接 `flattenRows(files)` 返回所有行，大数据集（>10K 行）导致内存+渲染压力。

**修复** (`src/lib/dataset/store.ts`)：
- 新增 `maxRows: number` 状态（默认 5000）。
- 新增 `setMaxRows` action。
- `getActiveRows()` 改为先 slice 每个文件的 rows 到 `maxRows` 再 flatten：
  ```ts
  const slicedFiles = files.map((f) => ({
    ...f,
    rows: f.rows.slice(0, maxRows),
  }));
  return flattenRows(slicedFiles);
  ```
- LeftPanel "All files" 按钮显示截断提示：当总行数 > maxRows 时显示 "Merged view · first 5000 rows"。
- **验证**：lint 通过，demo（96 行 < 5000）不受影响。

### 验证结果（agent-browser）
- ✅ URL 图片测试：url 字段自动选为 imageField（IMG badge），2/3 张图片成功 fetch（blob URL），1 张 CORS 失败显示链接。
- ✅ 无 atob 错误（`isValidBase64` 预检）。
- ✅ Demo 加载正常，11 张图片渲染。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **CORS 限制**：URL 图片如果服务器不支持 CORS（不发 `Access-Control-Allow-Origin` header），浏览器会阻止 fetch，图片显示为链接而非预览。这是浏览器安全限制，无法绕过。
2. **TanStack Virtual 编译警告 ×2**：良性警告。
3. **ThemeToggle hydration 警告**：良性警告。

### 建议下一阶段优先事项
1. **数据集对比行匹配**：按 ID 或索引匹配不同数据集的行。
2. **搜索高亮扩展到 Compare 图片 caption**。
3. **UI 微交互打磨**。
4. **性能优化**：大图片懒加载 + 渐进式解码。
5. **Stats 视图增强**：可配置图表。
6. **辅助功能增强**：屏幕阅读器公告。
7. **maxRows 可配置**：在 UI 上添加 maxRows 调整控件。

### 产物
- 修改文件：`src/lib/dataset/store.ts`（+url imageField 自动选 +maxRows 限制）、`src/components/dataset/LeftPanel.tsx`（+截断提示 +maxRows selector）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
