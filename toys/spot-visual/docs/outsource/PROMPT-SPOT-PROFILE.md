# 给外部 AI 的提示词（直接整段复制）

````
你是中文文旅数据采集员，现在要为一个景区数据库补齐「景点档案」结构化字段。

## 你要读的文件
仓库：https://github.com/wsjgdg/spot-visual （public，可直接 clone，路径 spot-visual）
- 任务规则（先读，逐条遵守）：docs/outsource/TASK-SPOT-PROFILE.md
- 本批清单（100 条）：docs/outsource/profile-batch1.json

## 你要做的事
为这 100 个景区各填一份档案，字段见 TASK-SPOT-PROFILE.md 第 3 节的表格。
必填三项：ticketPeak（成人全价，免费填0）、openHours（含停止入园时间）、suggestedHours（小时）。
其余字段查得到就填，查不到填 null。

## 清单里的行政区字段（重要，填交通字段全靠它）
每条现在带 province / city / district / address 四个字段：
- province：省（如「安徽」「北京」）
- city：地级市（如「安庆」「池州」），**这是权威城市**；
- district：区县（如「桐城市」「延庆区」），可能为空串（该景区确实没有区县级信息）；
- address：地址参考，个别条目地址里带重复的行政区前缀，忽略重复段即可。

nearestRail / driveFromCityMin 只按 city（地级市）+ district 推算，不要凭景区名字猜城市。
city 为空串的少数条目（名录本身没登记城市），按 address 里的行政区判断，并在 notices 里注明依据。

## 五条最容易翻车的地方
1. 票价只算成人大门票全价。索道、观光车、船票、园中园一律不算进票价，另写进 ticketNote。
   免费开放的景区 ticketPeak 填 0，不要填 null。
2. 开放时间必须写出「停止入园/停止售票」的时间，以及闭馆日（如周一闭馆）。
3. 预约：2026 年大量景区实名预约限流。不确定就填 needReservation: false，
   并在 notices 里写「出行前请核实最新预约政策」——不要默认不需要预约。
4. 查不到就填 null 并给该条标 "confidence": "low"。绝对不要编票价和电话——编错比空着危害大得多。
   尤其偏远景区的「最近机场」常常是几百公里外的省会机场，宁可空着也别填一个近的。
5. name 与 id 必须逐字符照抄输入，一个字都不要改。

## 输出（交付方式，二选一）
首选：把完整 JSON 贴进回复，放在一个 ```json 代码块里，前后不要有别的说明文字。
备选：如果你的环境能写文件，直接写成仓库里的 docs/outsource/out-profile-batch1.json。

格式：
{
  "task": "景点档案结构化字段-批1（5A）",
  "batch": 1,
  "count": 100,
  "items": [ { "id": "输入里的 id 原样", "name": "输入里的 name 原样", "profile": { ... }, "confidence": "high" } ]
}

### 硬性要求
- items 必须正好 100 条，一条都不许跳过。合并器按整批验收，少一条整批拒收。
- 实在查不到的字段：填 null 并给该条标 "confidence": "low"。**绝不允许少交**。
- accessibility 只能用闭集里的词，不要自造。

## 不要做的事
- 不要修改仓库里的任何源文件（src/ 下一个字都不要动），也不要动 docs/outsource/ 下除上面那个交付文件以外的任何东西。
- 不要编造数据。不允许用"一般""大概""通常"这类模糊词搪塞任何字段。

## 交付前自检（不需要跑脚本，按这个清单人工过一遍）
1. items 正好 100 条，id 与 name 与输入逐字符一致（逐行 diff 输入清单）。
2. 必填三项：ticketPeak 必填（免费填 0，其余填数字或 null+low）；openHours 必含停止入园时间；suggestedHours ∈ [0.5, 12]。
3. accessibility 全部落在闭集内（见 TASK 第 3 节），不超过 6 个。
4. driveFromCityMin ∈ [1, 600] 或 null。
5. 查不到的字段没有编造，且对应条目标了 low。

然后在回复里贴：总条数、必填项为空的条数、你标 low confidence 的条数。
````

---

## 项目方（我）收到后的验收动作

0. 回收落盘：`node scripts/ingest-outsource.mjs <你贴的JSON文件> --kind=profile --batch=1`
   —— 核对条数/id/name/profile 非空，通过后写入 `docs/outsource/out-profile-batch1.json`；任一项不符直接拒收。
1. `node scripts/merge-out-profile.mjs docs/outsource/out-profile-batch1.json`
   —— 条数一致 / id 回填 / name 逐字符一致 / 票价与时长区间 / 闭集校验；任一硬违规整批拒绝。
2. 通过后按 `id` 落键累积到 `docs/outsource/out-profile-merged.json`，生成 `src/lib/spot-profiles.generated.ts`，
   同时产出 qc 抽检文件（20 个固定种子样本 id）。
3. 人工抽检 15–20 条：重点看票价口径（是否含园中园）、开放时间（是否有停止入园）、预约（是否误判）、
   交通字段是否按 city/district 推算（不是按名字猜）。
4. 回归：`npx tsc --noEmit` + `npx vitest run`。

## 批次编排（48 批，清单已全部生成，直接轮着取）

| 阶段 | 批次    | 内容                            |
| ---- | ------- | ------------------------------- |
| 一期 | 批 1–4  | 5A 336 条（访问量最大，先见效） |
| 二期 | 批 5–48 | 4A 4417 条                      |

每批 100 条。推进节奏建议每天 1–2 批，一期约 3 天即可上线，二期约一个半月。

## 清单行政区字段的生成与守护

`tests/gen-profile-batches.test.ts` 是常驻生成器（`GEN_PROFILE_BATCHES=1` 重写 48 批清单），
清单里的 province/city/district 由脚本从「id 城市 + 地址」解析得出；守护测试会按 id 回库重算并逐字段比对，
库一改就会把测试打红，提醒重跑生成器。所以清单字段永远是跟库一致的，不会漂移。

## 与描述任务（D）的关系

两个任务互不依赖，可任意顺序并行；合入时都用 `id` 落键，不按名字合并。
若同一轮同时有描述批和档案批，先跑描述、再跑档案，两者都要出独立的 commit。
