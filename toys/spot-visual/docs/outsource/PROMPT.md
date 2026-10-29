# 外包提示词（景点数据标注）

> 用途：把本目录下的 JSON 交给其他 AI 处理。三个任务相互独立，可分别外包给不同模型。
> 全部产出写入 `docs/outsource/out-*.json`，**不得修改仓库中任何其他文件**。

---

## 任务 A：景区名称规范化（优先级最高）

### 背景
`scenic-name-cleanup.json` 来自《2023 年全国 A 级景区名录》原始数据，名称未清洗：掺杂行政前缀、管理机构后缀、间隔号、错别字，且同一景区可能重复出现多行。这些名称直接用于搜索匹配、省份归类与详情页展示，脏名会导致搜不到、归错省、显示难看。

### 输入
`docs/outsource/scenic-name-cleanup.json`
- `dirty[]`：653 条命中规则的条目，字段 `name` / `province` / `city` / `level` / `issues[]`
- `suspectedDuplicates[]`：48 组疑似同一景区的多条目（`key` + `entries[]`）

### 输出
`docs/outsource/out-name-fixes.json`，结构：

```json
{
  "renames":  [{ "from": "原名", "to": "规范名", "reason": "去掉行政前缀" }],
  "drops":    [{ "name": "要删除的原名", "duplicateOf": "保留的那一条原名", "reason": "与 XX 为同一景区" }],
  "keep":     ["确认无需改动的原名"]
}
```

### 规则
1. **必须是同一个实体**：只做「同一景区」的名称整理，绝不把两个不同景区合并。
2. 规范名 = 去掉省市县行政前缀、去掉「管理委员会 / 管委会」、去掉与结尾重复的「景区/旅游区」、修正明显错别字（如「施游」→「旅游」、「公团」→「公园」、「受旗」→「曼旗」）。
3. 保留原名称中有辨识度的部分：括号补充（如「（津门故里）」）、间隔号品牌（如「小五台·金河景区」）可以保留，不要为「变短」而删掉有效信息。
4. **拿不准就放进 `keep`**，不要强行改名。宁可少改，不可改错。
5. `renames[].from` 必须与输入 `name` 完全一致（逐字符，含全角括号）。
6. `to` 不得与任何其他条目重名；若与已有条目重名，说明二者可能是同一景区 → 走 `drops`。
7. `dirty[]` 未出现在 `renames`/`drops` 中的条目，必须出现在 `keep` 中（三者并集 = 输入全集）。
8. 每批最多处理 150 条，分 5 批交付，便于核对。

---

## 任务 B：5A 景区人工描述（质量要求最高）

### 背景
项目里 4619 条 A 级名录条目中，只有 42 条有人工描述，其余走事实句模板（「国家 5A 级景区（2023 年全国 A 级景区名录），位于…」）。模板句信息量低，希望为 **5A** 补齐人工描述。

### 输入
`docs/outsource/scenic-desc-targets-5a.json` → `targets[]`（261 条，字段 `name` / `province` / `city` / `category`）

### 输出
`docs/outsource/out-descriptions.json`：

```json
[{ "name": "与输入逐字符一致", "description": "60-110 字的描述" }]
```

### 写作规则（严格遵守，违反即返工）
1. **只写有把握的事实**。不确定的年代、数字、人物一律不写。
2. **禁止编造或猜测**：不写门票价格、开放时间、预约方式、电话（这些由其他字段提供）。
3. 长度 60–110 个汉字（约 1–2 句）。可写：地貌/建筑/历史地位/核心看点/代表性体验/最佳季节。
4. 不要空话套话（「值得一去」「人间仙境」「不容错过」一律不要）。
5. 不要复制景区官网宣传语，用自己的话概括。
6. `name` 必须**照抄**输入的脏名（例如 `天津古文化街旅游区（津门故里）`），**不要顺手把名字改规范**——键名不一致会导致描述不生效。
7. 若某条实在没有可写的可靠事实，**跳过不写**（宁缺勿滥），不要拿模板句凑数。
8. 每批 30–50 条，写完自检：全部是中文标点、无英文引号、无换行符。

### 参考风格（项目内已有的合格样例）
> 慕田峪长城：慕田峪长城位于北京怀柔，是明代长城的精华段之一，植被覆盖率高，秋季红叶与冬季雪景尤佳。缆车与滑道并存，正北楼至牛角边一段是经典的徒步行程。

> 平遥古城景区：平遥古城保存了明清县城完整的城墙、街巷与铺面格局，是世界文化遗产。日昇昌票号开创中国近代银行业先河，县衙、文庙与明清街串成一条可步行丈量的古城动线。

---

## 任务 C：抓图终检（看图判断）

### 背景
4A 景区配图由脚本从 Bing 图片搜索抓取，按域名权重 + 宽度 ≥600 自动筛选，**无法判断图对不对**。需要人工/多模态模型过目：拼图里某张图是否真的是这个景区。

### 输入
- 拼图：`public/spots/_contact-sheet.jpg`（需先运行 `npm run spots -- --sheet` 生成最新版）
- 清单：`docs/outsource/photo-missing-4a.json` 的补集——即已抓到的条目，见 `public/spots/` 目录下的 `<景区名>.webp` 与 `public/spots/_candidates/_report.json`（含 `dish`=景区名、`host`=来源域名）

### 输出
`docs/outsource/out-photo-qc.json`：

```json
[{ "name": "景区名", "keep": false, "reason": "配图是另一座山，主体不符" }]
```

### 规则
1. 逐张核对：图片主体是否为该景区（看标志性建筑/地貌/牌匾文字）。**看不清就标 `keep: true` 并在 reason 写「无法确认」**，不要凭感觉删图。
2. 以下情况 `keep: false`：主体明显是别的景区、带明显水印/图库 Logo、是地图或门票截图、分辨率极低、纯文字海报。
3. 只输出 `keep: false` 的条目即可（默认保留）。
4. 一次最多核对 120 张。

---

## 通用交付要求

1. 输出**纯 JSON**（UTF-8，无 BOM），不要包 markdown 代码块，不要加解释性文字。
2. 三个任务各自独立交付，不要混在一个文件里。
3. 不要修改 `docs/outsource/` 以外的任何文件；不要重命名、删除或移动仓库文件。
4. 交付前自检：
   - JSON 能被 `JSON.parse` 解析；
   - 任务 A 的 `renames[].from` + `drops[].name` + `keep[]` 并集等于输入 `dirty[]` 全集，且无重复；
   - 任务 B 的每个 `name` 都能在输入 `targets[]` 里逐字符找到；
   - 任务 C 的每个 `name` 都能在 `public/spots/` 下找到同名 `.webp`。
5. 每批交付后停顿，等待确认，不要一次性输出 600 条。

---

## 附：仓库内相关文件位置

| 用途 | 路径 |
|---|---|
| 外包输入（本次生成） | `docs/outsource/scenic-name-cleanup.json`、`scenic-desc-targets-5a.json`、`photo-missing-4a.json` |
| 外包产出（待写入） | `docs/outsource/out-name-fixes.json`、`out-descriptions.json`、`out-photo-qc.json` |
| A 级名录原始数据（不要手改） | `src/lib/scenic-enrich.generated.ts` |
| 人工描述表（描述最终落地处） | `src/lib/poi-descriptions.ts` → `SCENIC_DESCRIPTIONS` |
| 图片清单（抓图结果） | `src/lib/spot-photos.generated.ts` → `SPOT_PHOTOS` |
| 抓图候选与来源记录 | `public/spots/_candidates/`、`_report.json` |
| 终检拼图 | `public/spots/_contact-sheet.jpg` |
| 描述生效守护测试 | `tests/scenic-details.test.ts`（`npx vitest run tests/scenic-details.test.ts`） |
| 构建/抓图脚本 | `scripts/fetch-spot-photos-bing.mjs`、`scripts/build-spot-photos.mjs` |
