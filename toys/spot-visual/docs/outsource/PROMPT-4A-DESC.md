# 给外部 AI 的提示词（直接整段复制）

```
你是中文文旅内容作者，现在要为一个景区数据库补写简介。

## 你要读的文件
仓库：https://github.com/wsjgdg/spot-visual （public，可直接 clone 或拉取）
- 任务规则（先读，逐条遵守）：docs/outsource/TASK-4A-DESC.md
- 本批待写清单（300 条）：docs/outsource/desc-4a-batch1.json

## 你要做的事
为 desc-4a-batch1.json 里的 300 条景区各写一段 60–110 字的中文简介。

## 三条最容易翻车的地方，务必自查
1. 长度：每条 60–110 汉字。写完逐条数一遍，不要靠感觉。
2. 禁写：门票/价格/开放时间/预约/电话/最佳季节/建议游玩时长/打卡话术。这些在应用里是独立字段，写进文案会和真实数据打架。
3. 事实：数字（面积、海拔、年代、层数、长度）和强断言（世界遗产、全国重点文保、中国最大/唯一/第一、国家级）——不能确认就删掉或降级表述。宁可少写一个数字，也不要编一个。

## 文体
一段话，不分点。第三人称客观陈述。不要用景区全名开头重复（名字已在标题上）。不要出现「本条」「据资料」等元叙述。

## 输出
只输出一个 JSON 文件：out-desc-4a-batch1.json
{
  "task": "4A-描述补写-批1",
  "count": 300,
  "items": [ { "name": "逐字符照抄输入里的 name", "desc": "……" } ]
}
- items 必须正好 300 条，一条都不许跳过。信息少的条目写通用型描述，并在该条加 "confidence": "low"。
- 如果你发现输入名有错字，照抄原名写 desc，另在 "nameIssues": [{"name","suggest","reason"}] 里单列。

## 不要做的事
- 不要修改仓库里的任何源文件（src/ 下一个字都不要动）。
- 不要写 extra 字段、不要加注释、不要在 JSON 外包裹 Markdown 代码块之外的说明文字。

交付前按 TASK-4A-DESC.md 第 5 节做自检，然后在回复里贴：总条数、长度最小/最大值、你标记为 low confidence 的条数。
```

---

## 项目方（我）收到后的验收动作

1. 机器验收：`node scripts/check-desc-facts.mjs <path>/out-desc-4a-batch1.json`
   —— 校验长度区间、禁写词、`name` 是否在目标清单内、数字断言与强断言抽取。
2. 人工抽检：按 `confidence` 与断言密度抽样 20 条，逐条核对事实。
3. 合入：写进 `src/lib/poi-descriptions.ts` 的 `SCENIC_DESCRIPTIONS`（键用 `name`，与现有 297 条同表）。
4. 回归：`npx vitest run` + `npx tsc --noEmit`。

## 后续批次
批 1 验收通过后再放批 2（同样 300 条）。全量缺口 4420 条，约 15 批。
