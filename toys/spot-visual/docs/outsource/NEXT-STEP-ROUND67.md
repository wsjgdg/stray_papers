# 六十七轮任务（给流水线维护方）：把批 1 的描述真正写出来

> 背景：两条管线、验收口径、回收通道、守护测试都已就绪，但**内容一直没人写**——
> 外部 AI 的提示词需要人贴进对话框去触发，项目里也没有可调用的 LLM 凭据，
> 于是链路停在第一跳。上一轮我先写了批 1 的前 150 条作为示范与起步，
> **这一轮把剩余部分交给你**，并在批 1 写完后把整条链路跑通。

---

## 一、任务 1：写完批 1 的描述（主任务）

### 1.1 起步资产

- `docs/outsource/drafts/desc-batch1-draft.txt` —— 批 1 **前 150 条**描述草稿（指挥侧写的，已过全部机器校验）。
- `docs/outsource/drafts/README.md` —— 用法与署名约定。
- `docs/outsource/desc-4a-batch1.json` —— 300 条待写清单（**批 1 也已经是生成器产出**，id/name 与库当前展示名一致）。

### 1.2 怎么写（省掉最容易出错的环节）

**不要手抄 id/name**。用这个工具，它按**顺序**自动回填，并在落盘前把机器能查的都查掉：

```bash
# 1) 把草稿复制成你的工作文件，按清单顺序接着写第 151–300 条（别跳号）
#    写的时候对着 docs/outsource/desc-4a-batch1.json 的第 151 条往后
# 2) 只校验不落盘（会逐条打印长度越界 / 禁写词 / 以名字开头 / 条数不符）
node scripts/author-desc-batch.mjs --batch=1 --input=你的文件.txt --check
# 3) 通过后落盘 → docs/outsource/out-desc-4a-batch1.json
node scripts/author-desc-batch.mjs --batch=1 --input=你的文件.txt
```

### 1.3 写作口径（`TASK-4A-DESC.md` 是准绳，这里只列最容易翻车的）

| 项   | 要求                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 长度 | 60–110 **字符**（含标点，code point 计数；工具按同一口径校验）                                                            |
| 禁写 | 门票/票价/数字+元/开放时间/营业/闭园开园/预约/限流/电话/最佳季节/建议游玩/打卡话术/本条据资料这类元叙述                   |
| 名字 | **不要改、不要全称重复开头**；正文里提景区用简称                                                                          |
| 事实 | 数字（面积/海拔/年代/层数）与强断言（世界遗产/全国重点文保/中国第一）**没有把握就删掉或降级**；不确定的名号、年代一律不写 |
| 文体 | 一段话，不分点，第三人称客观陈述，可有一句画面感，不抒情                                                                  |
| 兜底 | 确实写不出的条目写**通用型**（只讲地貌/形制/文化主题，不涉具体数据），工具不会因此报错                                    |

**示例（已过检，可照这个密度写）**：

> 明代南京城墙的遗迹被保留在城内，砖石砌筑的墙体沿旧城格局延伸，园中绿荫覆盖，登上城垣可俯瞰周边街巷与屋顶，是一处把城池记忆与日常休憩叠在一起的地方。

### 1.4 署名（重要，别省）

沿用草稿的话，在落盘的 JSON 顶层加一行注明作者分段：

```json
"authorship": "batch1 前 150 条：指挥侧草稿；第 151–300 条：<你的名字>"
```

抽检时两段分开抽——**我写的那 150 条不是独立第三方产出**，抽检口径要更严。

---

## 二、任务 2：批 1 写完后，跑通整条链路并把结果回传

```bash
# 1) 落盘（author-desc-batch 已经写好了 out-desc-4a-batch1.json，可跳过）
node scripts/author-desc-batch.mjs --batch=1 --input=你的文件.txt

# 2) 机器验收（长度/禁写词/name 在目标清单内/数字与强断言抽取）
node scripts/check-desc-facts.mjs docs/outsource/out-desc-4a-batch1.json

# 3) 合并（整批验收；产出 qc-desc-batch1.json）
node scripts/merge-out-desc.mjs docs/outsource/out-desc-4a-batch1.json

# 4) 门禁
npx tsc --noEmit && npx vitest run && NEXT_DIST=.next-gate npx next build

# 5) 回传指挥侧抽检（**在 commit 之前**）
```

回传内容：qc 文件路径、批号、条数、low 数、nameIssues 数、合并器验收输出全文。
**抽检通过后才允许** `git add`（精确 add 文件，别 `git add -A`）+ `git push origin HEAD:main`。

---

## 三、任务 3：CRON-DELIVERY.md 改稿（上一轮已授权，仍未落地）

把「回收」写进监控流程：
外部交付（对话里的 JSON / 人贴成的文件）→ `node scripts/ingest-outsource.mjs <文件> --kind=desc|profile --batch=N`
→ 合并器 + qc → 门禁 → 通知指挥侧抽检 → 通过才精确 add + push。
并写明：回收失败**不落盘**、差异原文记 worklog、`--batch` 的来源、抽检四项口径归指挥侧。

---

## 四、纪律（不变）

- 只改 `docs/outsource/` 下的文件与 `scripts/` 里的工具；**不动 `src/`**。
- 精确 add：并行会话共享仓库，`git add -A` 会把别人的在途改动卷进你的 commit。
- 其它会话在途文件（`.gitignore`、`src/lib/spot-data.ts`、`tsconfig.json`、`tests/scenic-address.test.ts`）不提交不删除不还原。
- 合并器每新增一种落盘产物，同一 commit 内把它加进 `scripts/verify-outsource-pipelines.mjs` 的备份 glob。

## 五、指挥侧这轮在做的

- 剩余 28 条配图：换高德图片 POI / 官方文旅厅图库，或整理人工上传清单。
- 批 1 合入后的**人工抽检**（票价口径 / 停止入园 / 预约默认值 / 交通字段是否按 city 推算 / 事实准确性）。
- 批 2 起的清单与规约已就绪（15 批 4320 条），批 1 走通后即可连续推进。
