---
Task ID: cron-round-16
Agent: Z.ai Code (cron review round 16)
Task: Fix URL image preview + atob error + Parquet null pointer error.

## 项目当前状态描述/判断

用户报告两个问题：
1. URL 形式图片没有预览图 + `atob` 错误（非 base64 字符串传入 `atob`）。
2. Parquet 解析报错 "null pointer passed to rust"（WASM 未正确初始化）。

## 当前目标/已完成的修改/验证结果

### Bug 1: URL 图片无预览 + atob 错误

**原因**（两个子问题）：
1. URL 引用的图片之前只是显示"Click to open URL"链接，没有尝试 fetch 图片显示预览。
2. 非法 base64 字符串（如 URL 路径或普通文本）被传入 `atob()`，导致 `Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.`

**修复** (`src/lib/dataset/decode.ts`)：

1. **URL 图片自动 fetch**：新增 `fetchUrlImage()` 函数：
   - 当图片值是 URL（`http://`/`https://`）时，自动 fetch 图片。
   - 10 秒超时（`AbortController`）。
   - 成功：创建 Blob URL → 显示预览图。
   - 失败（CORS/超时/网络错误）：显示错误信息 + URL 链接。
   - 支持 HTTP 状态码检查 + 空响应检查。
   - 格式嗅探（从 Blob 前 12 字节）+ 尺寸探测。

2. **Base64 验证**：新增 `isValidBase64()` 函数：
   - 在调用 `atob()` 前验证字符串是否为合法 base64。
   - 检查：长度 ≥ 100 + 正则匹配 `^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`。
   - 非法 base64 字符串不再传入 `atob()`，避免崩溃。
   - 如果字符串看起来像文件路径（包含 `/` 或 `\`），显示 "Local path not resolvable"。
   - 否则显示 "String is not valid base64, data URL, or URL"。

**验证**：
- ✅ Demo 加载正常，11 张图片全部渲染（blob URL），无 atob 错误。
- ✅ Detail 视图正常（1 张图片 + 6 个 bbox）。
- ✅ 无 console error。

### Bug 2: Parquet "null pointer passed to rust"

**原因**：
- parquet-wasm 的 `esm` 入口需要手动初始化 WASM（`await initWasm()`）。
- `initWasm()` 尝试从相对路径 fetch WASM 文件，在 Next.js/Turbopack 环境下找不到文件。
- WASM 未正确初始化 → 内存未分配 → `readParquet()` 传入数据时 Rust 收到 null 指针。

**修复** (`src/lib/dataset/parsers.ts`)：

1. **优先使用 bundler 入口**：`import("parquet-wasm/bundler")` — 不需要手动初始化。
2. **Fallback 到 esm + CDN**：如果 bundler 失败，用 esm 入口 + CDN URL 初始化。
3. **PAR1 魔数验证**：解析前检查文件头 4 字节是否为 `PAR1`（0x50 0x41 0x52 0x31），提前拒绝非 Parquet 文件。
4. **空文件检查**：`uint8.length === 0` 提前返回错误。
5. **null 检查**：`readParquet()` 返回后检查 `if (!wasmTable) throw`。
6. **finally 块**：确保 WASM Table 被释放（`wasmTable.free()`）。

**验证**：
- ✅ Lint 通过。
- ✅ Demo 加载正常（非 Parquet 路径不受影响）。
- ✅ Parquet 代码逻辑正确：bundler 入口 → `readParquet(uint8)` → `intoIPCStream()` → `tableFromIPC()`。

### Store 无变更
本轮未修改 store。

### 验证结果（agent-browser）
- ✅ Demo 加载：96 行正常渲染，11 张图片（blob URL），无 atob 错误。
- ✅ Detail 视图：1 张图片 + 6 个 bbox overlay。
- ✅ 无 console error。
- ✅ ESLint 0 errors / 2 warnings（TanStack Virtual 良性）。

## 未解决问题或风险，建议下一阶段优先事项

### 已知小问题
1. **TanStack Virtual 编译警告 ×2**：良性警告。
2. **ThemeToggle hydration 警告**：良性警告。
3. **Parquet bundler 入口兼容性**：如果 Turbopack 不支持 parquet-wasm/bundler 的 WASM 解析，需要用 CDN fallback。用户实际 Parquet 文件测试待验证。
4. **URL 图片 CORS**：fetch URL 图片可能被 CORS 阻止，此时显示错误信息 + 链接。

### 建议下一阶段优先事项
1. **数据集对比行匹配**：按 ID 或索引匹配不同数据集的行。
2. **搜索高亮扩展到 Compare 图片 caption**。
3. **UI 微交互打磨**。
4. **性能优化**：大图片懒加载 + 渐进式解码。
5. **Stats 视图增强**：可配置图表。
6. **辅助功能增强**：屏幕阅读器公告。

### 产物
- 修改文件：`src/lib/dataset/decode.ts`（+fetchUrlImage +isValidBase64）、`src/lib/dataset/parsers.ts`（+bundler 入口 +PAR1 验证 +null 检查）。
- Lint：0 errors / 2 warnings（良性）。Dev server：HTTP 200，无 console error。
