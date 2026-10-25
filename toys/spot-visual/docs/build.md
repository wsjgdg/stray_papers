# 怎么构建（给自己 / 其他 agent / CI）

## 方式 1：一键脚本（最快）

```bash
node scripts/build-all.mjs
```

Windows 上也可以直接双击 `build.cmd`。

脚本按顺序执行：**依赖检查 → 类型检查 → next build（含图片清单 + sharecode 注入）→ 产物检查**，最后打印 BUILD_ID。

| 参数 | 作用 |
|---|---|
| `--skip-install` | 跳过依赖检查（node_modules 已在时最快） |
| `--no-tsc` | 跳过类型检查 |
| `--strict` | 类型错误直接终止 |

> 默认配置下类型检查**只警告不阻塞**。原因：线上部署走 `next build`，它本身不因 TS 错误失败；并行开发时别的模块半成品不该挡住整包构建。需要严格把关时加 `--strict`。

## 方式 2：GitHub Actions

`.github/workflows/build.yml` — push 到 main / PR / 手动触发时跑：

```
npm ci → npx tsc --noEmit → npm run build → 产物 smoke check
```

**CI 只验证「能不能构建」，不能发布**：发布必须走托管平台工具（平台侧鉴权），CI 无法代劳。

## 方式 3：手动分步

```bash
npm ci                 # 或 npm install
npx tsc --noEmit       # 可选
npm run build          # next build + 生成图片清单 + 注入 sharecode
node server.mjs        # 本地预览 http://localhost:3000/food
```

## 环境要求

| 项 | 版本 |
|---|---|
| Node | 22.x（开发机 v22.22.2） |
| npm | 10.x |
| 系统 | Windows / Linux 均可 |

Python 脚本（`scripts/*.py`）只用标准库，不需要装包；但 `gen-dish-sodium.py` 等需要读桌面上的 xlsx 原始数据。

## 构建会产出/改写什么

| 文件 | 由谁生成 |
|---|---|
| `.next/` | next build |
| `src/lib/dish-photos.generated.ts` | `scripts/build-dish-manifest.mjs`（build 时自动跑） |
| 页面里的 sharecode 注入 | `scripts/inject-sharecode.mjs`（build 时自动跑） |

这两步都在 `npm run build` 里，单独跑 `next build` 会缺清单和 sharecode，页面会 403 / 缺图。

## 构建失败常见原因

| 现象 | 原因 |
|---|---|
| `useSearchParams() should be wrapped in a suspense boundary` | 新页面直接用了 `useSearchParams`，要包 `<Suspense>` |
| `Module not found` | 忘了 `npm ci`，或新依赖没进 package.json |
| 图片 404 / 页面 403 | 只跑了 `next build`，没跑图片清单和 sharecode 注入 → 用 `npm run build` |
| `BUILD_ID` 缺失 | 构建中途失败，看上面的错误 |
