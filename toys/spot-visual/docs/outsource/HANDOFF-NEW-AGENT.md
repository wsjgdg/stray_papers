# 给新 agent 的交接提示词（整段复制给新 agent）

> 下面这一整块就是给新 agent 的任务书。原 agent 的额度已用尽，**剩余批次由你接手写完**。

---

````
你接手「华夏探索 / spot-visual」文旅应用的**景区描述与景点档案**数据工程。项目路径：
C:\Users\sibop\WorkBuddy\2026-10-23-15-42-22\spot-visual （git 仓库，远端 origin，分支 main）

## 0. 一句话目标
**「4A 景区描述」4320 条 + 「景点档案」4753 条均已收官（覆盖率 100%）**；剩下主任务只有两项：
**低等级描述补写（3A/2A/无等级共 453 条无描述）** + **剩余 28 张配图**。
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
- ✅ **景点档案已收官：4753/4753 全部合入**（5A 336/336 + 4A 4417/4417 = 100%），
  上轮 3820 + 本轮增量 933（批 1–10，全 4A）；0 硬违规、抽检未发现编造。
  回执：`REVIEW-PROFILE.md`（3820 那轮）+ `REVIEW-PROFILE-4753.md`（收官）。**不要再写档案。**
  待补池现在是 **0 条**，清单生成器按池重写 0 批（`profile-batch*.json` 已清理）。
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

## 4.5 档案线（已收官，仅作参考，不要再写）

**4753/4753 已合入**：`src/lib/spot-profiles.generated.ts` 4753 键，5A 与 4A 覆盖率 100%。
守护测试 `tests/spot-profiles.test.ts` 会守住「id 全命中库 / 非 low 必填与区间 / 5A+4A 覆盖 100%」。

若后续要**修订**既有条目（不是新增）：

```bash
# 1) 只改 out-profile-batchN.json 里对应条目（id 不变）
# 2) 用归档导入器（按 id 池校验，幂等覆盖）
node scripts/import-profile-archive.mjs <归档目录>
# 3) 门禁
npx tsc --noEmit && npx vitest run && NEXT_DIST=.next-gate npx next build
```

口径要点（历史留档）：`city` 是地级市、`district` 是区县、交通字段只按 city+district 推算；
必填 `ticketPeak`（免费填 0）/ `openHours`（含停止入园与闭馆日）/ `suggestedHours`（0.5–12）；
`accessibility` 12 词闭集 ≤6 个；**任一必填为 null 必须 `confidence: "low"`**。

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

## 7. 建议节奏（剩下的活儿，价值从高到低）

1. **低等级描述补写（453 条）**：3A/2A/无等级里没描述的条目，走描述线全部工具（写文本 → `--check` → 事实/重复度门禁 → 合并）。
2. **剩余 28 张配图**：换高德图片 POI 或官方文旅厅图库；拿不到就整理成人工上传清单。
3. 想继续加价值就做**存量数据修缮**（不是新写）：档案里 low 条目的 `ticketPeak` 逐条去官方渠道核实后回填（G10 的根因），走 `import-profile-archive.mjs` 幂等更新。

已收官、不必重做的：描述 4320 条、档案 4753 条、5A 全覆盖。

## 8. 交付前自查清单（每批过一遍）

描述批：

- [ ] 条数与清单一致，id/name 由工具回填、没有手抄
- [ ] 每条 60–110 字符
- [ ] 无禁写词
- [ ] 无重复模板句（`check-desc-repetition.mjs` 通过）
- [ ] low 条目占比不超过 50%，且 low 的写法是「保守具体」而非「套模板」
- [ ] 数字与强断言逐条自问「我能给出处吗」，答不上就删
- [ ] 顶层有 `authorship`

档案修订（若有）：

- [ ] `id`/`name` 与库逐字符一致
- [ ] 必填 `ticketPeak`/`openHours`/`suggestedHours` 齐全；任一 null 必须 `confidence: "low"`
- [ ] `accessibility` 只在 12 词闭集内且 ≤6 个
- [ ] `driveFromCityMin` ∈ [1,600]，交通字段按 city+district 推算
- [ ] 跑过 `node scripts/import-profile-archive.mjs <目录>` 且退出码 0
