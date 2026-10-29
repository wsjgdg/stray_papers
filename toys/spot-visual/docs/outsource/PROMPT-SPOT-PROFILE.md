# 给外部 AI 的提示词（直接整段复制）

```
你是中文文旅数据采集员，现在要为一个景区数据库补齐「景点档案」结构化字段。

## 你要读的文件
仓库：https://github.com/wsjgdg/spot-visual （public，可直接 clone，路径 spot-visual）
- 任务规则（先读，逐条遵守）：docs/outsource/TASK-SPOT-PROFILE.md
- 本批清单（100 条，每条含 id / name / city / level / address / category）：
  docs/outsource/profile-batch1.json

## 你要做的事
为这 100 个景区各填一份档案，字段见 TASK-SPOT-PROFILE.md 第 3 节的表格。
必填三项：ticketPeak（成人全价，免费填0）、openHours（含停止入园时间）、suggestedHours（小时）。
其余字段查得到就填，查不到填 null。

## 四条最容易翻车的地方
1. 票价只算成人大门票全价。索道、观光车、船票、园中园一律不算进票价，另写进 ticketNote。
   免费开放的景区 ticketPeak 填 0，不要填 null。
2. 开放时间必须写出「停止入园/停止售票」的时间，以及闭馆日（如周一闭馆）。
3. 预约：2026 年大量景区实名预约限流。不确定就填 needReservation: false，
   并在 notices 里写「出行前请核实最新预约政策」——不要默认不需要预约。
4. 查不到就填 null 并给该条标 "confidence": "low"。绝对不要编票价和电话——编错比空着危害大得多。
   尤其偏远景区的「最近机场」常常是几百公里外的省会机场，宁可空着也别填一个近的。

## 输出
只输出一个 JSON 文件：out-profile-batch1.json
{
  "task": "景点档案结构化字段-批1（5A）",
  "batch": 1,
  "count": 100,
  "items": [ { "id": "输入里的 id 原样", "name": "输入里的 name 原样", "profile": { ... }, "confidence": "high" } ]
}
- items 必须正好 100 条，一条都不许跳过。
- id 和 name 必须逐字符照抄输入（id 是唯一锚点，同名跨市全靠它区分）。
- accessibility 只能用闭集里的词，不要自造。

## 不要做的事
- 不要修改仓库里的任何源文件（src/ 下一个字都不要动）。
- 不要编造数据。不允许用"一般""大概""通常"这类模糊词搪塞任何字段。

交付前按 TASK-SPOT-PROFILE.md 第 5 节逐项自检，然后在回复里贴：
总条数、必填项为空的条数、你标 low confidence 的条数。
```

---

## 项目方（我）收到后的验收动作

1. `node scripts/merge-out-profile.mjs <path>/out-profile-batch1.json`
   —— 条数一致 / id 回填 / name 逐字符一致 / 票价与时长区间 / 闭集校验；任一硬违规整批拒绝。
2. 通过后按 `id` 落键累积到存档，再生成 `src/lib/spot-profiles.generated.ts`。
3. 人工抽检 15 条：重点看票价口径（是否含园中园）、开放时间（是否有停止入园）、预约（是否误判）。
4. 回归：`npx tsc --noEmit` + `npx vitest run`。

## 批次编排（48 批，清单已全部生成，直接轮着取）

| 阶段 | 批次 | 内容 |
|---|---|---|
| 一期 | 批 1–4 | 5A 336 条（访问量最大，先见效） |
| 二期 | 批 5–48 | 4A 4417 条 |

每批 100 条。推进节奏建议每天 1–2 批，一期约 3 天即可上线，二期约一个半月。

## 与描述任务（D）的关系

两个任务互不依赖，可任意顺序并行；合入时都用 `id` 落键，不按名字合并。
若同一轮同时有描述批和档案批，先跑描述、再跑档案，两者都要出独立的 commit。
