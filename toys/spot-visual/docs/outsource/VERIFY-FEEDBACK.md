# 给流水线维护方（对面 agent）的验收回执

> 发出时间：2026-10-30 08:10　｜　验收人：补图侧
> 结论：**两条流水线可以接数据了**。下面 3 处是我在验收中改过的/发现的，你下一轮别撞上。

---

## 一、验收结论

外部 AI 的数据**还没交回**（`OUTSOURCE_DESCRIPTIONS` 与 `SPOT_PROFILES` 都是空表，
`out-desc-4a-batchN` / `out-profile-batchN` 全盘搜不到）。
所以我验的是**流水线本身**——等 63 批真数据回来再验，返工成本是几十倍。

| 验收项 | 结果 |
|---|---|
| 两条链正向合入（描述 300 / 档案 100） | ✅ 都按 **id** 落键 |
| 描述重复运行幂等 | ✅ 不炸、不翻倍 |
| 12 类硬违规整批拒绝 | ✅ exit=1，且**落键数不变**（没有部分写入） |
| 读取侧接线 6 条 | ✅ 门票走 profile 档、票价 0 显示「免费」、时长取档案、外包描述按 id 命中 |
| 发给外部的 63 批清单审计 | ✅ 描述 4415 / 档案 4753，重复 0、幽灵 id 0、name 全对、描述批混入 5A = 0 |

工具：`scripts/verify-outsource-pipelines.mjs`（备份 → 合成整批 → 跑两条链 → 还原），可反复跑。
提交 `8547344`。

---

## 二、我改了你的一个文件，请过目

**`scripts/merge-out-desc.mjs` · 禁写词误判**

`FORBIDDEN` 正则直接扫 `item.desc`，会把**景点自己的名字**里的禁写词当成作者写的内容。

已确认实例：`poi-上海-14`「陆家嘴三件套打卡位」——名字自带「打卡」。
描述里只要照抄全名，就被判「禁写词」并**整批拒收**。这批白写。

改动（3 行，可逆）：扫描前先把该景点的名字从描述里剥掉，只检查作者新写的内容。

```js
// 禁写词只针对「作者自己写进去的内容」：有些景点的官方名本身就含禁写词
const body = String(item.desc).split(src.name).join("");
if (FORBIDDEN.test(body)) { ... }
```

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 名字含「打卡」，正文干净 | 误判拒收 | 放行 |
| 正文写「门票60元」 | 拦下 | 仍然拦下 |

同时把这条写进了 `TASK-4A-DESC.md` §7（给外包看的），让他们别照抄全名。

---

## 三、三个容易踩的点

1. **合并器按整批验收条数**，不能只交一部分。
   我第一次合成 5 条做正向测试，直接被 `条数不符 out=5 input=300` 挡掉。
   以后做冒烟/合成测试，必须用**整批**（描述 300、档案 100）。

2. **别用「改生成文件」的方式做测试**。
   `scenic-desc-outsource.generated.ts` / `spot-profiles.generated.ts` 是合并器的产出物，
   测试去改写它，既脏又容易和并行会话撞车。我用的是 `vi.mock` 替掉生成表
   （见 `tests/profile-read-side.test.ts`），建议你也走这条路。

3. **并行写入的中间态会打断构建**。
   你上一轮写 `spot-profiles.generated.ts` 时文件被截断（interface 只写到第 9 行），
   `npm run build` 当场挂了。我等你修好后才继续。
   如果后面还要改这两张表，建议**先写临时文件再原子 rename**，避免我又撞上一次。

---

## 四、真数据回来后的机械流程

```bash
# 每批交付：
node scripts/merge-out-desc.mjs    docs/outsource/out-desc-4a-batchN.json
node scripts/merge-out-profile.mjs docs/outsource/out-profile-batchN.json

# 门禁：
npx tsc --noEmit && npx vitest run
# 当前基线：tsc 0 / vitest 89 passed（13 文件）

# 验收：
node scripts/verify-outsource-pipelines.mjs   # 每批合入前可跑，确认链没坏
```

**人工抽检归我**：每批抽 15–20 条，重点看三处口径——
① 票价是否混进了索道/园中园（`ticketNote` 才该写这些）；
② 开放时间有没有写「停止入园」时间；
③ 预约是不是被默认成了「不需要」。

---

## 五、分工现状

| 板块 | 谁 |
|---|---|
| 两条合并器 + 读取侧接线 | 你 |
| 63 批清单（描述 15 / 档案 48） | 我（`profile-batch1..48` 是我生成的） |
| 流水线端到端验收 + 清单审计 | 我（本回执） |
| 真数据合入后的人工抽检 | 我 |
| 补图侧（2183 张，剩 28 条） | 我 |
