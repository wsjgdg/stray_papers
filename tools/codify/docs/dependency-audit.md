# 依赖锁定与审计报告

审计日期：2026-09-26 · 审计对象：`package.json` + `pnpm-lock.yaml` + 生产构建产物

方法（可复跑）：

```bash
pnpm audit --json                                  # 已知漏洞
./node_modules/.bin/vite build --sourcemap true --outDir dist-audit   # 带 sourcemap 的构建
# bundle 组成按 sourcemap 的 sourcesContent 逐模块归属到 npm 包聚合
#（未引入 source-map-explorer：为一次性审计新增一个依赖不值当，方法等效、口径如实标注）
```

---

## 一、pnpm audit：95 条公告，按归属拆开看

严重度合计：critical 6 · high 53 · moderate 32 · low 4。**按引入路径归属**后，风险画像和裸数字完全不同：

| 归属 | 路径数 | 是否进浏览器 bundle | 是否在本容器实际运行 | 处置 |
| --- | --- | --- | --- | --- |
| `miniprogram-ci`（平台脚手架自带的小程序发布工具链） | 829 | 否（src 零导入） | 否（仅平台发布流水线在 Node 侧使用） | 版本被平台精确锁定 `2.1.31`，不擅自改动；风险不触达用户浏览器 |
| `typescript-eslint` / `eslint` 系（含传递的 `brace-expansion`、`minimatch`） | ~110 | 否（devDependencies） | 仅本地 lint 进程 | 随平台工具链升级自然消化 |
| `tailwindcss` / `autoprefixer` / `postcss` | ~50 | 否（构建期） | 仅构建进程 | 同上 |
| `vite`（moderate + high 各 1） | 6 | 否（构建期） | **是——开发服务器常驻 8000 端口** | 见下方专项说明 |
| `react-router-dom`（high DoS 等 5 条） | 5 | **否（src 零导入，未进 bundle）** | 否 | 见「未使用依赖」 |

### vite 专项说明（唯一真正在跑的带公告依赖）

- 公告内容：`server.fs.deny` 在 **Windows 备选路径**下可被绕过（high）、launch-editor 的 **Windows UNC 路径** NTLMv2 泄露（moderate）——两条都只在 Windows 上可触发；本服务运行在 Linux 容器内，**实际暴露面≈0**。
- 修复版 `>=8.0.16` 在既有 semver 范围 `^8.0.10` 内，一条 `pnpm update vite` 即可。
- **本次审计没有执行升级**：开发服务器进程正持有 8.0.11 在跑，热替换 node_modules 有把常驻服务打挂的风险，而收益（Linux 上不可触发的公告）不成比例。建议在平台下一次重建容器 / 刷新脚手架时随 `pnpm install` 自然升级，届时本报告复核一遍即可。

### 运行时依赖的漏洞结论

真正进浏览器 bundle 的依赖（react / react-dom / radix 六件套 / cmdk / pocketbase / fflate / lz4js / @bokuweb/zstd-wasm / @huggingface/transformers / lucide-react / tailwind-merge / clsx）：**本次审计零公告**。

---

## 二、未使用依赖（脚手架残留）

以下依赖在 `src/` 中**零导入**——不进 bundle、无运行时暴露，但撑大 lockfile（12740 行）、node_modules（978MB）与审计噪音（miniprogram-ci 一棵树贡献了 87% 的公告路径）：

- 平台工具链：`miniprogram-ci`（精确锁定版本，平台发布流水线可能依赖，**不动**）
- UI 库备货：`recharts`、`embla-carousel-react`、`react-day-picker`、`input-otp`、`vaul`（1 处导入，保留）、`sonner`、`next-themes`、`react-resizable-panels`
- 表单/校验：`react-hook-form`、`@hookform/resolvers`、`zod`
- 路由：`react-router-dom`（本应用是单页工作台，无路由）
- 工具：`date-fns`
- radix 26 个包里 **20 个未使用**（accordion / alert-dialog / avatar / checkbox / dropdown-menu / popover / progress / switch 等；实际只用了 dialog、scroll-area、select、slot、tabs、tooltip）

**处置决策：本次不删除。** 这些是平台脚手架统一铺的货，发布刷新契约（`rh_vc_deploy`）与后续 UI 生成流程可能预期它们在位；删除的收益只是磁盘与审计噪音（bundle 为零），风险却是平台流水线兼容。如实记录在此，等平台明确「web 应用脚手架可按需裁剪」后再清。

---

## 三、bundle 组成（生产构建实测）

```
dist/assets/index-*.js                 784 KB（gzip 238 KB）  ← 首屏唯一 JS
dist/assets/EvalBenchDialog-*.js      17.9 KB（gzip 6.0 KB）  ← 打开评估台时才拉取
dist/assets/MeetingHistoryDialog-*.js  8.7 KB（gzip 3.7 KB）  ← 打开会议历史时才拉取
dist/assets/utils-*.js                36.3 KB（gzip 12.2 KB） ← 上述两个懒块共享
dist/assets/search.worker-*.js         3.6 KB                 ← 关键词检索 Worker
dist/assets/text.worker-*.js          18.2 KB                 ← 压缩/大 JSON Worker
dist/assets/embedding.worker-*.js      550 KB                 ← 语义索引开启时才创建
dist/assets/ort-wasm-*.wasm         26.9 MB（gzip 6.8 MB）    ← 语义索引开启时才下载
dist/assets/zstd-*.wasm              252 KB（gzip 81 KB）     ← 归档层解压时才实例化
dist/assets/index-*.css               43 KB（gzip 8.6 KB）
```

首屏主包（784KB）按 sourcemap 归属（占比为 minify 前源码口径，相对份额可信、绝对值偏大）：

| 份额 | 包 | 说明 |
| --- | --- | --- |
| 49% | 应用源码 | 50+ 组件/hook/lib，单页应用无路由可切 |
| 27.5% | react-dom | 不可分割的底座 |
| 5.2% | tailwind-merge | 类名合并的校验表，天然重；用量极大（每个 cn() 调用），不值得替换 |
| 4.6% | fflate | 主线程**同步**压缩兜底路径（Worker 超时/熔断时接管）——同步兜底决定了它必须留在主包，这是设计取舍不是疏忽 |
| 2.7% | lucide-react | 已按导入 tree-shake（只打包用到的 ~40 个图标） |
| 2.1% | pocketbase | 平台账号/LLM 通道客户端 |
| <1% 各 | react / tslib / lz4js / radix 六件套 / cmdk / scheduler | 正常水位 |

### 延迟加载现状（本批新增两项）

- **既有**：三个 Web Worker（检索 / 文本压缩 / embedding）天然独立 chunk；26.9MB 的 onnxruntime wasm 只在用户开启语义索引后下载；zstd wasm 按需实例化；三个大对话框（设置 / 评估台 / 命令面板）关闭时不挂载组件树。
- **本批新增**：评估台与会议历史两个低频对话框改为 `React.lazy` 代码分割——宿主在关闭态渲染 `null`，lazy 组件不挂载、chunk 不拉取；首屏主包从 846KB 降到 784KB（-62KB，gzip -18KB）。
- **评估过但不做**：设置对话框保持静态导入（高频入口，懒加载的首开延迟伤体验）；应用源码不做「页签级分割」（八个页签共享大量组件与 lib，切分后共享 chunk 反而多一次往返）。

---

## 四、结论与后续动作

1. 运行时依赖零公告；95 条公告全部归属构建工具链与未上架的平台脚手架依赖，浏览器侧无暴露。
2. `pnpm update vite`（8.0.11 → ≥8.0.16）挂起至下次容器重建——Linux 环境下两条公告不可触发，热更常驻服务风险大于收益。
3. 未使用依赖清单已列明，等平台确认脚手架裁剪策略后一次性清理（预计可减 ~600MB node_modules 与 87% 审计噪音）。
4. bundle 侧本批已落地两项懒加载；下一个值得盯的点是应用源码自身（占主包 49%），若继续增长优先审视 Workbench 静态导入的页签组件。
5. 复审节奏：每次批量升级依赖或平台刷新脚手架后重跑上方两条命令，对照本报告更新。

---

## 五、精确版本锁定与 golden set（2026-09-26 补充）

- **全部依赖已在 `package.json` 锁为精确版本**（去掉 `^` / `~`）：精确版本号即「最后一次
  通过全套验证的版本」，`package.json` 顶层 `lastVerified.date` 登记验证日期。lockfile 的
  importers specifier 已同步（`--frozen-lockfile` 校验不会因范围符漂移而失败）。
- **golden set 回归套件**：`scripts/golden-set.mjs`（`pnpm golden`）——fake-indexeddb +
  vite `ssrLoadModule` 直跑 `src` 的 TS，覆盖数据不丢不错的全部命门：schema 迁移链 /
  备份导出导入保真 / 存储往返（大文本分片+压缩）/ 压缩编解码（raw·lz4·zstd·deflate）/
  事件日志差异与时间点回滚 / 档案加密（开启→静态密文→改密旧钥失效→关闭回明文）/
  安全删除覆写。当前 **50 条断言全绿**。
- **升级铁律**：一次只升一个依赖 → `pnpm golden` → `tsc -b` / `eslint src` / `vite build`
  → 全绿才更新 `lastVerified.date` 并提交；任一红灯先定位（依赖破坏 or 套件过期），
  绝不带红灯升下一个。完整流程与冻结清单见 `docs/freeze-list.md`。
