# 六十六轮任务（给流水线维护方）

> 背景：外部的首批数据（4A 描述批 1 / 景点档案批 1）要开始交付了。
> 指挥侧已把三处堵点补齐并推送（`8df45e7`）：**交付通道**、**清单行政区字段**、**验收口径**。
> 这一轮的任务：把交付链路真正跑通一遍，并准备好后续 62 批的节奏。

---

## 一、先对齐（只读操作）

```bash
git fetch origin main && git log --oneline origin/main -3
git show --stat 8df45e7
```

读完这几份（**都已由指挥侧改好并推送**）：

| 文件                                                      | 内容                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `docs/outsource/VERDICT-ROUND65.md`                       | 指挥侧对外部 8 条问题的逐条裁决与依据（哪些成立、哪些不成立、为什么） |
| `docs/outsource/PROMPT-4A-DESC.md`                        | 批 1 描述提示词（**可直接整段复制**发给外部 AI）                      |
| `docs/outsource/PROMPT-SPOT-PROFILE.md`                   | 批 1 档案提示词（**可直接整段复制**发给外部 AI）                      |
| `docs/outsource/TASK-4A-DESC.md` / `TASK-SPOT-PROFILE.md` | 两份任务书（交付方式、自检口径、行政区权威口径已更新）                |
| `docs/outsource/README.md`                                | 交接包总览（新增任务 H 行）                                           |

**这些文件由指挥侧维护，不要改**；确需改动先在回执里提出，等指挥侧确认。

---

## 二、本轮四项任务

### 任务 1：把「回收」写进 CRON-DELIVERY.md 的监控流程（当前缺失的一环）

外部 AI 的交付物在**对话回复里**，不在 `docs/outsource/`。现在的 CRON 流程第一步就是
「扫 `docs/outsource/` 下的 `out-*` 文件」，扫不到对话里的东西 → 永远发现不了新批次。
新流程：

```
外部 AI 交付（对话里的 JSON / 或用户放好的 .json）
  → node scripts/ingest-outsource.mjs <文件> --kind=desc|profile --batch=N
      （抠 JSON → 核对条数/id/name/payload → 原子落盘 docs/outsource/out-<kind>-batchN.json）
  → node scripts/merge-out-desc.mjs / merge-out-profile.mjs <落盘文件>
      （整批验收；产出 qc-<kind>-batchN.json）
  → tsc + vitest + 隔离 build
  → 通知指挥侧抽检 → 抽检通过才 commit + push
```

把这段写进 `docs/outsource/CRON-DELIVERY.md`，并明确：

- 回收脚本的 `--batch` 从哪来（交付文件名里的批号 / 提示词里写明的批号）；
- 回收失败（条数/id/name 不符）时**不落盘**，把差异原样记进 worklog，等外部重写；
- 抽检归指挥侧（票价口径 / 停止入园时间 / 预约默认值 / 交通字段是否按 city 推算），你只负责把 qc 文件与统计回传。

### 任务 2：把批 1 的两份提示词交给外部 AI（由指挥侧或用户触发）

两份 PROMPT 已按裁决改好（交付通道二选一、count 硬要求、确切验收命令、行政区权威口径）。
请**只做校验，不做改写**：

- 通读一遍两份 PROMPT，确认与 TASK 的口径一致（长度 60–110 code point、禁写词、必填三项、闭集）；
- 确认「交付方式」那段在外部 AI 看得懂的位置（现在在「## 输出（交付方式，二选一）」标题下）；
- 确认提示词里引用的仓库路径与文件真实存在（`docs/outsource/desc-4a-batch1.json`、
  `docs/outsource/profile-batch1.json`、两个 TASK）——**这两份清单本轮已被重生成**，
  `profile-batch1.json` 的字段变成 `province/city/district/address`，与旧版不同，
  若外部 AI 手上有旧清单副本，提醒它重新拉取。

### 任务 3：外部交回后跑完整链路，并把 qc 文件回传指挥侧

第一批交回后按上面第二节的流程走一遍，**在 commit 之前**把下列信息回传指挥侧：

- `docs/outsource/qc-desc-batch1.json` / `qc-profile-batch1.json` 的路径；
- 批号、条数、low 数、必填缺失数；
- 合并器的验收输出（含被拒批次的原因原文）。

指挥侧抽检通过后才允许 `git add`（**精确 add 文件，不要 `git add -A`**）+ `git push origin HEAD:main`。

### 任务 4：合并器每新增一种落盘产物，同步更新验收器的还原清单

六十四轮的教训：`scripts/verify-outsource-pipelines.mjs` 的还原清单只覆盖两张生成表 + 两份累积存档，
不覆盖六十四轮新增的 qc 抽检文件 → 跑一次验收就在 `docs/outsource/` 留下
`qc-desc-batch1.json` / `qc-profile-batch1.json`（内容是合成数据的 id），
足以让任何人误判「批 1 已交付」并去抽检假数据。
指挥侧已修（两份 qc 文件纳入备份/还原，复跑 17/17 无残留）。
**规则**：给合并器加任何新的落盘产物，同步把该文件加进验收器的 `BACKUPS`。

---

## 三、纪律

- 合并器 / 检查器 / CRON 文档改动后必须过：`npx tsc --noEmit` && `npx vitest run` &&
  `NEXT_DIST=.next-gate npx next build`（隔离构建，别动 3000/3100 在服务的 `.next`）。
- 流程纪律不变：**合入 → qc → 通知指挥侧抽检 → 抽检通过才 commit + push**。
- 不要动 `src/` 下的文件（合并器/检查器都在 `scripts/`）；`src/` 是指挥侧与另一会话的地盘。
- 工作区里其它会话的在途文件（`.gitignore`、`src/lib/spot-data.ts`、`tsconfig.json`、
  `tests/scenic-address.test.ts`）**不要提交、不要删除、不要还原**。
- 精确 add：并行会话共享仓库，`git add -A` 会把别人的在途改动卷进你的 commit。

## 四、指挥侧这轮在做的（你不用重复）

- 真数据回来后的**人工抽检**（票价口径 / 停止入园时间 / 预约默认值 / 交通字段按 city 推算）。
- 剩余 28 条配图：换高德图片 POI 或官方文旅厅图库，或整理人工上传清单。
- `check-desc-facts.mjs` 与合并器口径已对齐（认 `desc` 字段、扫禁写词前剥景点名、
  目标清单按文件名自动推断），沙盒 7/7 通过——你不必重复改。
