# 交付管线定时任务（每 30 分钟）

> 用途：监控 4A 描述（15 批）与景点档案（48 批）的外包交付，自动验收合入；全部交付完成后转为自行优化景点页。
> 创建方式：本会话属于定时任务运行实例，无法内部再建定时任务——请新开一段对话（或 Automations 页面）粘贴下方提示词。
> 旧的 automation-cfb89904（每30分钟自动推进景点览胜页）已 paused，可删除，由本任务替代。

## 提示词（整段粘贴）

维护 spot-visual 的外包交付管线；全部交付完成后转为自行优化景点页。项目路径 C:\Users\sibop\WorkBuddy\2026-10-23-15-42-22\spot-visual（git 仓库，远端 origin，多会话共享——另一会话会直接提交 main，节奏很快）。

### 第一步：对齐与进度检查

1. git fetch origin main && git log --oneline origin/main -3 对齐；git status 确认工作区。
2. 检查 docs/outsource/ 下的外包产物（每 30 分钟一次，多数时候是空的，静默结束即可，不写 worklog 不提交）：
   - **4A 描述**（共 15 批，每批 300）：`out-desc-4a-batchN.json` 交回且尚未合入（判据：docs/outsource/out-desc-4a-merged.json 中无该批条目）→ 运行 `node scripts/merge-out-desc.mjs <文件>`；整批被拒则把拒绝输出原样记入 worklog.md「外包批 N 退回」条目，不得修改外包文件内容，等外包重写。
   - **景点档案**（共 48 批，每批 100）：`out-profile-batchN.json` 交回且 `scripts/merge-out-profile.mjs` 已存在 → 同法运行；若该合并器尚不存在（由指挥建设），只在 worklog 记一行「档案批 N 已到、合并器未就绪」，不要自行实现合并逻辑（避免与指挥的实现冲突）。

### 第二步：有合入动作时（六十四轮约定：合入与抽检同轮，抽检通过才落盘）

1. 运行对应合并器（见第一步）；
2. 合入成功后自动产出 qc 抽检文件（qc-desc-batchN.json / qc-profile-batchN.json：条数、low 数、必填缺失数、固定种子随机 20 个 id）；
3. **npx tsc --noEmit 与 npx vitest run 必须全过**，并跑隔离构建门禁：
   `NEXT_DIST=.next-gate npx next build`（.next-gate 与 3000/3100 端口服务的 .next 物理隔离，不会杀预览服务——这是生成表并行写入高危区的兜底检查，六十四轮起纳入每轮门禁）；
4. npx prettier 格式化改动文件；
5. **到此为止，不 commit**——把 qc 文件路径与统计（条数/low 数/必填缺失数）通知指挥，等指挥人工抽检（抽检归指挥：票价口径/停止入园时间/预约默认值）通过后，才 git add 精确文件 + git push origin HEAD:main；
6. worklog.md 记录本轮（批号、条数、low 数、退回情况、qc 文件路径）。

### 第三步：完成判定 → 转自行优化

- **完成判定**：15 批描述全部合入（out-desc-4a-merged.json 条数 ≥ 4400）且 48 批档案全部合入（档案合并器存档条数 ≥ 4700）。以 docs/outsource/ 里不再有未合入的 out-* 文件为准。
- 全部完成后：自行寻找景点页（/ 路由及其组件）的缺口/可优化/丰富点，实施一轮完成找到的所有项。每轮必须有功能/数据/前端的优化（性能优化不能单独作为一项）。最多同时两个子智能体。禁止动 food/gaokao 模块（另一会话在维护）。必要时启动内置浏览器验证（E2E 交互断言用 element.click()，勿信 CDP 鼠标坐标）。约定细节可读 worklog.md 与 docs/outsource/README.md。

### 真数据合入的机械流程（每批交回时执行）

```bash
node scripts/merge-out-desc.mjs    docs/outsource/out-desc-4a-batchN.json
node scripts/merge-out-profile.mjs docs/outsource/out-profile-batchN.json
npx tsc --noEmit && npx vitest run          # 门禁基线 89+ 测试
node scripts/verify-outsource-pipelines.mjs # 每批合入前可跑，确认链没坏（17/17）
```

避坑三条（来自补图侧验收回执 VERIFY-FEEDBACK.md）：

1. 合并器按整批验收——冒烟测试必须用整批（描述 300 / 档案 100），合成 5 条会被「条数不符」挡掉。
2. 测试用 vi.mock 替生成表（见 tests/profile-read-side.test.ts），不要改写生成文件——并行会话会撞车。
3. 两个合并器已改为「临时文件 + 原子 rename」写盘，并行写入不再产生截断中间态。

### 分工现状（避免两边都做或都不做）

| 板块                                                           | 谁                     |
| -------------------------------------------------------------- | ---------------------- |
| 两条合并器 + 读取侧接线 + 批次清单生成                         | 本会话（流水线维护方） |
| 63 批清单生成（描述 15 / 档案 48）                             | 指挥侧（补图 agent）   |
| 流水线端到端验收 + 清单审计（verify-outsource-pipelines.mjs）  | 指挥侧                 |
| **真数据合入后的人工抽检**（票价口径/停止入园时间/预约默认值） | **指挥侧**             |
| 补图侧（2145 张，剩 28 条）                                    | 指挥侧                 |

### 硬约束（每次都适用）

- **绝不运行 npm run build 或 next build**——3000 端口有常驻预览服务，build 会抢占 .next 把它杀掉。类型检查用 npx tsc --noEmit。
- 发布产物不得含任何 API key（外部数据只在构建/烘焙时取，key 只在本机 .env）。
- 遵循 docs/deploy.md 与 worklog 已记录的约定（sharecode 透传、CRLF、中文路径）。
- 不要动 food/gaokao 模块和另一会话的进行中文件（工作区里的未跟踪文件多半是他们的，不提交不删除）。
- 只在有实际动作（合入/退回记录/完成判定后的优化轮）时才提交；纯检查轮静默结束。
