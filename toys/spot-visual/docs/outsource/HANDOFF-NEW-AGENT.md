# 给新 agent 的交接提示词（整段复制给新 agent）

> 下面这一整块就是给新 agent 的任务书。原 agent 的额度已用尽，**剩余批次由你接手写完**。

---

````
你接手「华夏探索 / spot-visual」文旅应用的**景区描述与景点档案**数据工程。项目路径：
C:\Users\sibop\WorkBuddy\2026-10-23-15-42-22\spot-visual （git 仓库，远端 origin，分支 main）

## 0. 一句话目标
**「4A 景区描述」已全部完成（15 批 4320 条）**；剩下的主任务是「景点档案」48 批（4753 条）+ 低等级描述补写（453 条）+ 剩余 28 张配图。
每批都要过机器验收 + 重复度门禁，最后交指挥侧人工抽检。

## 1. 当前进度（已核实，别重复劳动）
- ✅ 描述批 1（300 条）：已合入，抽检通过。署名：前 150 条＝指挥侧草稿；后 150 条＝原 agent（qwen）。
- ✅ 描述批 2（300 条）：**已合入**，机器验收违规 0、重复度门禁通过、人工抽检通过。署名：MiMo。
- ✅ 描述批 3（300 条）：**已合入**，机器验收违规 0、重复度门禁通过、人工抽检通过。署名：MiMo。
  （这两批是上一轮整批退回后重写的：批 2 曾是 0 字节空文件，批 3 曾有 298/300 条模板兜底、5 句各重复 60 次。
  重写后的写法可以当参考 —— 见下面「批 2/批 3 的合格样例」。）
- ✅ 描述批 4–15（12 批 3600 条）：**已交付合入**（署名 MiMo；批 4 为 json 交付、批 5–15 为 txt 交付）。
- ✅ **描述线收官**：15 批共 **4320 条**全部合入 `src/lib/scenic-desc-outsource.generated.ts`，4A 描述覆盖率 100%
  （全库 5931 条中 5447 条有实质描述）。
- ⬜ **景点档案 48 批（4753 条）：现在是你的主任务** —— 详见下面「档案线」一节。
- ⬜ **景点档案批 1–48（4753 条）：现在是主任务**（清单字段已升级为 province/city/district，见「档案线」一节）。
- ⬜ **低等级描述补写**：3A/2A/无等级 1178 条里 453 条无描述。
- ⬜ 剩余 28 条配图：换渠道（高德图片 POI / 官方文旅厅图库）或整理人工上传清单。

## 2. 必读文件（按顺序读，全部在仓库里）
| 文件 | 作用 |
|---|---|
| `docs/outsource/TASK-4A-DESC.md` | **描述任务规约**：禁写清单、事实纪律、文体、输出格式、自检 |
| `docs/outsource/TASK-SPOT-PROFILE.md` | **档案任务规约**：字段表、闭集、区间、自检 |
| `docs/outsource/PROMPT-4A-DESC.md` / `PROMPT-SPOT-PROFILE.md` | 两类任务的成品规格（也可直接作为对外提示词） |
| `docs/outsource/README.md` | 交接包总览与完成度 |
| `docs/outsource/REVIEW-BATCH1.md` | 指挥侧对批 1 的抽检结论 + **6 处降级修订的范例** |
| `docs/outsource/drafts/desc-batch1-draft.txt` | 150 条已上线描述样例（风格基准） |

## 3. 工具（都在 `scripts/`，别手抄 id/name）
```bash
# 描述：写一个纯文本（每行一条，按清单顺序），工具自动回填 id/name 并校验后落盘
node scripts/author-desc-batch.mjs --batch=2 --input=你的文件.txt --check   # 只校验
node scripts/author-desc-batch.mjs --batch=2 --input=你的文件.txt          # 落盘

# 机器验收（长度/禁写词/name 是否在清单内/数字与强断言抽取）
node scripts/check-desc-facts.mjs docs/outsource/out-desc-4a-batch2.json

# 重复度门禁（六十七轮新增，专抓模板兜底；批 3 就是被它拦下的）
node scripts/check-desc-repetition.mjs docs/outsource/out-desc-4a-batch2.json

# 合并（整批验收，产出 qc-desc-batchN.json）
node scripts/merge-out-desc.mjs docs/outsource/out-desc-4a-batch2.json

# 档案线
node scripts/merge-out-profile.mjs docs/outsource/out-profile-batch1.json
````

外部（人或别的 agent）把 JSON 交回来时，用回收器落盘：
`node scripts/ingest-outsource.mjs <文件> --kind=desc|profile --batch=N`（核对条数/id/name，通过才落盘）。

## 4. 写作纪律（这七条是硬要求，批 3 就是踩了第 6 条）

1. **长度 60–110 字符**（含标点，按 unicode 字符数算），逐条自检。
2. **禁写**：门票/票价/数字+元/开放时间/营业/闭园开园/预约/限流/电话/联系方式/最佳季节/建议游玩/打卡话术/「本条」「据资料」这类元叙述。
3. **事实纪律**：面积/海拔/年代/层数/长度等数字与「世界遗产/全国重点文保/中国第一/最××」这类强断言，**没有把握就删掉或降级**；不确定的名号、年代一律不写。
4. **名字不改、不全称开头**：正文提景区用简称。
5. **low 的含义是「没把握」**：填 null/少写细节 + 标 `"confidence": "low"`；**low 条目也不许套用模板句**。
6. **禁止模板兜底**（最重要）：同一条尾巴不许重复出现。上一轮批 3 有 5 句话各重复 60 次，
   用户看到的是成片机器文案 —— 整批退回重写；重写后的批 3 已通过门禁，可对照。宁可每条都不一样，也不要复制粘贴。
   门禁会同时卡「low 占比 > 50%」：low 是「没把握」，不是「批量兜底」。
7. **署名**：交付 JSON 顶层写 `"authorship": "批 N：<你的标识>"`，指挥侧按段分开抽检。

批 2 / 批 3 的合格样例（已被指挥侧抽检通过，可照此密度与具体度写）：

> 黄河切穿太行山形成的峡谷群，孤山峡、龙凤峡与八里峡依次排开，两岸崖壁陡立，乘船穿行可见河槽收束处水流湍急，山河交汇的气象集中。

> 深居凤凰山巅的佛教寺院，殿内满堂悬塑层层叠叠，梁枋、壁面与藻井间布满彩塑人物与楼阁，工艺细密繁复，为晋南悬塑艺术难得的珍存实例。

> 通化县境内的庄园式景区，坡地上的院落建筑与林木相依，兼具住宿餐饮与田园观光功能，园中小路随坡地起伏，庄园围墙外便是连片田地，山风穿堂而过，秋日果林飘香，静谧宜人。

写得好的样例（批 1 已上线）：

> 依托长春电影制片厂老厂区旧址改建的专题博物馆，放映车间、洗印设备与道具服装原址陈列，是中国电影工业史少见的活态展示场所。

> 以花岗岩峰峦与森林步道见长的国家森林公园，奇峰怪石密集，拉法群峰层叠，山中寺庙遗迹与红叶景观相衬，是吉林东部登山热门地。

兜底（low）该有的样子——**具体但保守**，不重复：

> 太行深处的高山型景区，山体连绵、林木浓密，沟谷与山脊形态多变；天气清朗时山峦层次分明，秋冬草木色彩变化明显，是燕山南段典型的山岳游览地。

## 4.5 档案线（现在的主任务）

### 4.5.1 规模与排期

| 阶段 | 批次    | 条数 | 说明                                                          |
| ---- | ------- | ---- | ------------------------------------------------------------- |
| 一期 | 批 1–4  | 336  | 5A 全量，访问量最大，字段要求最严（票价/开放时间/预约都要真） |
| 二期 | 批 5–48 | 4417 | 4A，按批推进                                                  |

### 4.5.2 清单与字段口径（**已升级，与旧版不同**）

清单：`docs/outsource/profile-batch1.json` … `profile-batch48.json`，每条 100 条。
字段：`id / name / province / city / district / level / address / category`。

**行政区字段是权威口径**（六十四轮修过：旧版 `city` 是从脏地址正则截出来的半截县名，
如「安徽安庆市桐」，照它推算交通字段会系统性填错）：

| 字段       | 含义                                           | 例                         |
| ---------- | ---------------------------------------------- | -------------------------- |
| `city`     | **地级市**（权威）                             | 安庆 / 池州 / 北京         |
| `district` | 区县，可能为空串                               | 桐城市 / 延庆区            |
| `province` | 省                                             | 安徽 / 北京                |
| `address`  | 地址参考（个别带重复的行政区前缀，忽略重复段） | 安徽安庆市桐城市天柱山景区 |

- `nearestRail` / `driveFromCityMin` **只按 city + district 推算**，不许凭景区名字猜城市。
- `city` 为空串的极少数条目（名录本身没登记城市）按 address 判断，并在 notices 注明依据。

### 4.5.3 硬性字段要求

- **必填三项**：`ticketPeak`（成人全价；免费填 0，不是 null）、`openHours`（**必须含停止入园时间与闭馆日**）、`suggestedHours`（0.5–12 小时）。
- `needReservation`：boolean；2026 年大量景区实名预约限流，不确定填 false 并在 notices 写「出行前请核实最新预约政策」。
- `accessibility`：**只能用 TASK 第 3 节的 12 词闭集**，不超 6 个，不自造。
- 票价**不含**索道/观光车/园中园（另写 ticketNote）；查不到填 null + 该条 `confidence: "low"`，**不要编**。
- 输出格式：`{ "task": "景点档案结构化字段-批N", "batch": N, "count": 100, "items": [ { "id", "name", "profile": {...}, "confidence": "high|low" } ] }`，
  `id`/`name` 逐字符照抄输入，顶层写 `authorship`。

### 4.5.4 落盘与验收

```bash
# 1) 写 JSON（顶层 task/batch/count/items 齐全，items 恰好 100 条）
# 2) 落盘到仓库路径（不要写到 Downloads 之类仓库外的地方）
node scripts/merge-out-profile.mjs docs/outsource/out-profile-batch1.json
# 3) 门禁
npx tsc --noEmit && npx vitest run && NEXT_DIST=.next-gate npx next build
# 4) 回传指挥侧抽检：qc-profile-batch1.json 路径、批号、条数、low 数、必填缺失数
# 5) 抽检通过后精确 add + push
```

合并器为整批验收：条数不符 / id 回填错 / name 逐字符不一致 / 票价或时长越界 / 闭集越界 → **整批拒绝**。

### 4.5.5 与描述线并行的两项

- **低等级描述补写**：3A/2A/无等级共 1178 条里 **453 条无描述**（3A 30 条、2A 7 条、无等级 352 条），
  规约同描述线；注意先查 `POI_DESCRIPTIONS` / `SCENIC_DESCRIPTIONS` 已有的人工描述，**别重复写**。
- **剩余 28 张配图**：Bing 已榨干、360 反爬；建议改高德图片 POI 或官方文旅厅图库；实在拿不到就整理成人工上传清单。

## 5. 每批的标准流程（不许跳步）

1. 读该批清单 `docs/outsource/desc-4a-batchN.json`（描述）或 `profile-batchN.json`（档案），
   按**顺序**写文本文件。
2. `author-desc-batch.mjs --check` → 通过后再落盘（落盘进**仓库路径**，不要写到仓库外的 Downloads）。
3. `check-desc-facts.mjs` → 必须「违规 0」。
4. `check-desc-repetition.mjs` → 必须「✓ 重复度门禁通过」（low 占比默认上限 50%）。
5. `merge-out-desc.mjs` / `merge-out-profile.mjs` → 产出 qc 文件。
6. 门禁三连：`npx tsc --noEmit` && `npx vitest run` && `NEXT_DIST=.next-gate npx next build`。
7. **把 qc 文件路径 + 批号 + 条数 + low 数 + 必填缺失数回传指挥侧，等抽检通过。**
8. 抽检通过后才 `git add`（**精确 add 具体文件，不要 `git add -A`**）+ `git push origin HEAD:main`。
   每批一个 commit，commit message 用英文祈使句。

## 6. 协作纪律（并行会话共享同一个仓库）

- 只改 `docs/outsource/` 下的文件与 `scripts/` 里的工具；**不动 `src/`**（生成物由合并器写，别手改）。
- 其它会话在途文件（`.gitignore`、`src/lib/spot-data.ts`、`tsconfig.json`、`tests/scenic-address.test.ts`）
  **不要提交、不要删除、不要还原**。
- 精确 add：`git add -A` 会把别人的在途改动卷进你的 commit。
- 给合并器新增任何落盘产物，同一 commit 内把它加进 `scripts/verify-outsource-pipelines.mjs` 的备份清单
  （那里已改成按 glob 备份 `docs/outsource/qc-*-batchN.json`，**新产物也要能被 glob 覆盖到**）。
- 跑 `node scripts/verify-outsource-pipelines.mjs` 必须 17/17 通过且**不留残留文件**。

## 7. 建议节奏（按这个顺序做，价值从高到低）

1. **档案批 1**（100 条 5A，先跑通档案链路：字段多、坑最多，先摸清闭集与必填口径）
2. 档案批 2–4（补完 5A 336 条）
3. 低等级描述补写（453 条，走描述线工具）
4. 档案批 5–48（4A 4417 条，按批推进）
5. 剩余 28 条配图

描述线已收官（15 批 4320 条全部合入），不必重做。

## 8. 交付前自查清单（每批过一遍）

- [ ] 条数与清单一致，id/name 由工具回填、没有手抄
- [ ] 每条 60–110 字符
- [ ] 无禁写词
- [ ] 无重复模板句（`check-desc-repetition.mjs` 通过）
- [ ] low 条目占比不超过 50%，且 low 的写法是「保守具体」而非「套模板」
- [ ] 数字与强断言逐条自问「我能给出处吗」，答不上就删
- [ ] 顶层有 `authorship`

```

---

## 附：文件路径速查

| 用途 | 路径 |
|---|---|
| 仓库根 | `C:\Users\sibop\WorkBuddy\2026-10-23-15-42-22\spot-visual` |
| 描述清单（批 2–15） | `docs/outsource/desc-4a-batch2.json` … `desc-4a-batch15.json` |
| 档案清单（批 1–48） | `docs/outsource/profile-batch1.json` … `profile-batch48.json` |
| 描述规约 / 档案规约 | `docs/outsource/TASK-4A-DESC.md` / `TASK-SPOT-PROFILE.md` |
| 对外提示词 | `docs/outsource/PROMPT-4A-DESC.md` / `PROMPT-SPOT-PROFILE.md` |
| 样例（150 条已上线） | `docs/outsource/drafts/desc-batch1-draft.txt` |
| 抽检结论与降级范例 | `docs/outsource/REVIEW-BATCH1.md` |
| 撰写工具 | `scripts/author-desc-batch.mjs` |
| 机器验收 | `scripts/check-desc-facts.mjs` |
| **重复度门禁** | `scripts/check-desc-repetition.mjs` |
| 合并器 | `scripts/merge-out-desc.mjs` / `scripts/merge-out-profile.mjs` |
| 回收器 | `scripts/ingest-outsource.mjs` |
| 端到端验收器 | `scripts/verify-outsource-pipelines.mjs` |
```
