# 档案续写 · 交付说明（给并行会话 A / B）

- 发包日期：2026-11-01
- 任务：「景点档案」续写，剩余池 933 条 / 10 批，全 4A（**没有 5A**，别写 5A）
- 本包批次与条数见下表；批次编号与任何旧清单无关，**契约是 id**（id/name 逐字符照抄）

## 一、本包内容

| 会话 | 批次 | 条数 | 清单文件 |
|---|---|---|---|
| A | 批1 批2 批3 批4 | 400 | profile-batch1.json … profile-batch4.json |
| B | 批5 批6 批7 | 300 | profile-batch5.json … profile-batch7.json |

- 包内文件：上述清单 + 撰写提示词 PROMPT-SPOT-PROFILE.md + 规约 TASK-SPOT-PROFILE.md + 自验工具 validate-batch.mjs
- 每批写完后交 `out-profile-batchN.json`（N=批号）

## 二、清单字段（8 字段，行政区是权威口径）

`id / name / province / city / district / level / address / category`

- `city` = **地级市（权威）**；`district` = 区县（可能为空串）；`address` 仅作参考（个别带重复行政区前缀，忽略重复段）。
- `nearestRail` / `nearestAirport` / `driveFromCityMin` **只按 city + district 推算**，不许凭景区名字猜城市。
- `city` 为空串的条目按 address 判断，并在 notices 注明依据。

## 三、输出格式（每批一个文件，顶层恰 5 键）

```json
{
  "task": "景点档案结构化字段-批N",
  "batch": N,
  "count": <清单条数>,
  "authorship": "批N：<你的会话标识>",
  "items": [ { "id": "...", "name": "...", "profile": { 16键 }, "confidence": "high|low" } ]
}
```

- items 条数必须与清单完全一致，一条不许少；id/name 与清单**逐字符**一致（清单里有「·」「﹒」等特殊字符，照抄）。

## 四、字段硬规约（合并器整批验收，任一违规整批拒收）

1. **必填三项**：
   - `ticketPeak`：成人大门票全价（不含索道/观光车/船票/园中园，这些写进 ticketNote）；免费景区填 **0** 不是 null；查不到填 null 且该条标 low。
   - `openHours`：**必须含停止入园/停止售票时间与闭馆日**（如「约08:00-17:00，16:30停止入园；周一闭馆（法定节假日顺延）」）；查不到用保守表述 + low。
   - `suggestedHours`：0.5–12 的数字。
2. `needReservation`：必须 boolean。2026 年大量景区实名预约限流；不确定填 false 并在 notices 写「出行前请核实最新预约政策」。
3. `accessibility`：只能用 12 词闭集（无障碍通道/轮椅租借/母婴室/适老步道/老年人优惠/儿童游乐区/无障碍卫生间/观光车电瓶车/索道扶梯/医疗服务点/寄存柜/停车场，其中「观光车/电瓶车」「索道/扶梯」是整体词），≤6 个，不自造。
4. `driveFromCityMin` ∈ [1, 600] 或 null；海岛型条目按到码头车程填，notices 注明船票另购。
5. **null 必须 low**：ticketPeak/openHours/suggestedHours 任一为 null 的条目，confidence 必须 "low"；绝不许 null+high。
6. 票价不编造；核实的写 ticketNote「参考价，以现场公示为准」。机场同理：偏远景区最近机场可能几百公里外，拿不准填 null。

## 五、写作纪律

- 具体但保守；low 是「没把握」不是「批量兜底」——low 条目也不许互相套模板，同批 notices 零重复。
- 拿不准的数字、名号、年代一律不写。编错比空着危害大。
- 已交付的 3820 条不要重写；不要动仓库其他文件。

## 六、自验（每批必跑）

```bash
node validate-batch.mjs out-profile-batchN.json .
```

- 退出码 0 = 通过（同时产出 qc-profile-batchN.json 抽检文件，一并回传）。
- 报错信息逐条修复后重跑；不许带病交付。

## 七、回传方式

- 打包 zip 回传，**zip 内文件名全部 ASCII**（out-profile-batchN.json / qc-profile-batchN.json / 一份说明 md）。
- 说明里写：各批条数、low 条数、三件套缺失条数、核实过的关键票价列表、工作区事故（如有）。
- 合并由指挥侧统一执行（官方合并器/importer 按 id 落键），你不需要动 out-profile-merged.json。
