# 当前页缺口清单（除数据外）· 指挥侧审计 → 派活

审计时间：2026-10-30 深夜｜审计对象：spot-visual 当前 HEAD（含 dark mode + 收藏夹）
方法：静态代码审计 + headless Edge CDP 实机巡检（390px 移动端 / 1440px 桌面，12 个视图逐个切换）
**本清单只做诊断与派活，不含改动**；每条都给出定位、复现与验收口径。

---

## 一、结论速览

| #   | 缺口                                                                   | 方向        | 严重度 | 证据                                                                                             | 状态           |
| --- | ---------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------ | -------------- |
| G1  | 移动端分类筛选栏被裁且无法横向滚动                                     | 排版/可用性 | **P0** | 实测：内容宽 1192px，Viewport `overflow-x:hidden` 且**无横向 ScrollBar**，手机上选不到靠后的分类 | 待派活         |
| G2  | 「数据来源」页缺「景区简介」层 → 4320 条新文案来源断链                 | 诚实性      | **P0** | `src/app/sources/page.tsx` 的 ROWS 有 20+ 层，无描述类条目                                       | 待派活         |
| G3  | 18 处 `truncate` 无 `title` → 景点名/地址读不全                        | 可用性      | P1     | 实测：40+ 个被截断文本节点，`title` 全为 null                                                    | 待派活         |
| G4  | OSM 实时探索坐标（WGS84）喂给高德导航 URI（期望 GCJ02）→ 偏移 300–500m | 功能正确性  | P1     | `src/app/api/osm/route.ts` 取 `el.lat/el.lon`；`page.tsx:1228` 统一用 `uri.amap.com/marker`      | 待派活         |
| G5  | 行程单空态只有文字说明，无可点的「去预算沙盘 / 体力沙盘」入口          | 功能闭环    | P2     | `trip-view.tsx:568` 仅文案说明；`setActiveView` 只用于跳回景点                                   | 待派活         |
| G6  | 3A/2A/无等级共 1178 条里 453 条无描述（覆盖 725/1178）                 | 数据        | P2     | 实测按等级统计                                                                                   | 派给数据 agent |
| G7  | 景点档案 4753 条 **0 条已做**（48 批清单齐备）                         | 数据        | P1     | `src/lib/spot-profiles.generated.ts` 为空表                                                      | 派给数据 agent |
| G8  | 剩余 28 条配图                                                         | 数据        | P2     | 交接包 photo 任务剩余                                                                            | 派给数据 agent |
| G9  | 全站无后端：用户态（收藏/行程/账本/收藏夹/笔记）全在 localStorage      | 架构事实    | 说明项 | `store.ts` `persist` name=`spot-app`                                                             | 记录，不改     |

**已核实不是缺口**（避免重复劳动）：

- ✅ 详情弹窗**已有**「导航」按钮（高德 URI，免费免登录）与「分享」（含地址/开放时间/电话/预约/导航链接）—— G4 是它的坐标口径问题，不是缺入口。
- ✅ 导航项单点定义（`NAV_ITEMS`）三处渲染共用，无漂移。
- ✅ 行程单 ↔ 预算沙盘/体力沙盘 **有**数据联动（两沙盘优先按行程单景点与顺序计算），只是空态缺可点入口（G5）。
- ✅ **dark mode 对比度体检通过**：12 个视图实测 0 处低于 WCAG AA（758 处 codemod 补的 `dark:` 变体到位）。
- ✅ 无 `Math.random` 伪造数据、无空 `onClick`、无「敬请期待」占位。

---

## 二、逐条细节（派活用）

### G1（P0）移动端分类筛选栏不可达

- **定位**：`src/app/page.tsx` 分类筛选栏 `<ScrollArea className="max-w-full">` → 内层 `<div className="flex items-center gap-2 pb-1">`（无 `flex-wrap`）；`src/components/ui/scroll-area.tsx` 只渲染纵向 ScrollBar。
- **实测**：Viewport `overflow-x:hidden`、clientWidth 塌缩、scrollWidth 1192、**无横向 ScrollBar** → 右侧「轻运动/3A/2A/1A」等分类在手机上既看不见也滑不动。
- **同类点**：最近浏览栏（第 2622 行）同一模式。
- **建议修法**：① `ScrollArea` 组件补 `<ScrollBar orientation="horizontal" />`；② 两处内层 flex 加 `flex-wrap sm:flex-nowrap`；③ Root 显式 `w-full`（当前 `max-w-full` 在 flex 父容器里宽度塌缩）。
- **验收**：390px 视口下，分类 chips 全部可见或可横向滚动；`check` 无 `right > innerWidth` 的可见元素。

### G2（P0）来源页缺描述来源

- **定位**：`src/app/sources/page.tsx` 的 `ROWS` 数组（20+ 层，无描述类）。
- **为什么要紧**：这个应用的卖点就是「来源可溯 + `imageSource` 标注 + 算法口径写明」。刚合入 4320 条外包描述，用户在页面上看到新文案，但来源页查不到出处 —— 诚实性链条断在这里。
- **建议修法**：新增一层「景区简介（描述文案）」，写明：5A 299 条 + 城市 POI 477 条为自撰；4A 4417 条中 4320 条由外部大模型分批撰写并入；逐批机器验收（长度/禁写词/name 一致/重复度门禁）+ 人工抽检；不确定数字与「最××/中国第一」类断言一律删除或降级；不含门票/开放时间等结构化字段；全库 5931 条中 5447 条有实质描述。
- **验收**：来源页可见该层；数字与 `SCENIC_DESCRIPTIONS(299)` / `POI_DESCRIPTIONS(477)` / `OUTSOURCE_DESCRIPTIONS(4320)` 实测一致。

### G3（P1）18 处 truncate 无 title

- **定位**：`src/app/page.tsx` 卡片标题、列表标题、地址行、网络视图名；`components/trip-view.tsx`、`budget-view.tsx`、`ptsi-view.tsx`、`stamina-sandbox-view.tsx`。
- **实测**：40+ 个被截断文本节点 `title` 为 null → 桌面端悬停看不到全名，移动端完全读不到（景点名 + 完整地址都被截）。
- **建议修法**：承载**动态内容**（景点名/地址/官网）的 truncate 元素补 `title={...}`；固定文案的 chip 不用补。
- **验收**：CDP 扫描 `.truncate` 且 `scrollWidth > clientWidth` 的元素，`title` 非空率 100%。

### G4（P1）坐标系混用导致导航指错

- **定位**：`src/app/api/osm/route.ts:148` 取 `el.lon`（OSM 原生 **WGS84**）；`src/app/page.tsx:1228` 与 `1116`（分享文案）统一用 `uri.amap.com/marker?position=lng,lat`（高德 URI 期望 **GCJ02**）。
- **后果**：实时探索到的 OSM 景点，导航/分享链接的落点**偏移约 300–500 米**（WGS84→GCJ02 偏移量级），表现为「导航把我指到隔壁街」。
- **建议修法**（二选一，推荐前者）：① 对 OSM 来源坐标做 WGS84→GCJ02 转换后再拼 URI；② 或按坐标来源分流：GCJ02 条目走高德 URI，WGS84 条目走 OSM/通用地图链接。**同时要在详情页标注用的是哪种坐标系**，避免"看起来能导航、实际指错"。
- **验收**：抽一个 OSM 来源条目，点导航链接后落点与实际位置偏差 < 50m。

### G5（P2）行程单空态缺可点入口

- **定位**：`src/components/trip-view.tsx:568`（文案）、`:572`（唯一 `setActiveView("spots")`）。
- **现状**：文案说「点『加入行程』就能把预算沙盘、体力沙盘和导出串成一条线」，但用户必须自己切导航。
- **建议修法**：空态加两个次要按钮「去预算沙盘」「去体力沙盘」（`setActiveView` 已有）；有行程时，在行程单头部给同样的快捷入口。
- **验收**：空态与有数据态都能一键跳到两个沙盘。

---

## 三、派活

### 派给「前端 agent」（本清单 G1–G5）

按 G1 → G2 → G3 → G4 → G5 顺序做。每项改完跑：

```bash
npx tsc --noEmit && npx vitest run && NEXT_DIST=.next-gate npx next build
```

外加本清单里各自的验收口径（可用 headless Edge CDP 复核，别只看 build 通过）。
**注意**：`src/lib/spot-data.ts` 是别人在途文件，不要动。

### 派给「数据 agent」

| 任务            | 内容                                                 | 口径                                                                                   |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G7 景点档案     | 48 批 4753 条，优先 5A（批 1–4，336 条）             | `TASK-SPOT-PROFILE.md`；清单字段已升级 province/city/district；`merge-out-profile.mjs` |
| G6 补低等级描述 | 3A/2A/无等级共 453 条无描述                          | 同描述规约；走 `author-desc-batch.mjs`                                                 |
| G8 配图         | 剩 28 条                                             | 换高德图片 POI 或官方文旅厅图库，或整理人工上传清单                                    |
| G2 协作         | 来源页描述层由前端 agent 改，数据 agent 只需提供数字 | 299 / 477 / 4320 / 5447-of-5931                                                        |

### 派给「档案 agent」的档案批细则（已写入 `HANDOFF-NEW-AGENT.md`）

见该文件「档案线」一节：48 批清单路径、字段口径、必填三项、闭集、合并与抽检流程。
