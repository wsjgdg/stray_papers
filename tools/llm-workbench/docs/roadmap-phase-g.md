# Phase G — 厂商与数据源扩展（落地方案，2026-09-14 规划）

> 触发：用户反馈「厂商和数据源不够多」，并要求「再思考其他需要增加的地方，生成落地方案」。
> 基线：main `d7c985c` · server 39 文件 · 数据源 2 个（`openrouter` / `artificial-analysis`）· 代理厂商 25 个（`providers.ts`）。
> 工作量：S ≤ 半天，M ≈ 1 天，L ≈ 2-3 天。优先级按「价值 ÷ 成本」排。
> 本文件是**规划**，不直接写业务代码；各子项标注优先级，执行时再逐条落到 `docs/roadmap-2026-09.md` 的落地记录。

---

## 0. 现状盘点（代码核查结论）

| 维度 | 现状 | 缺口 |
|---|---|---|
| 快照数据源 | `server/aggregate.ts:buildSnapshot()` 硬编码调用 `fetchOpenRouterModels` + `fetchArtificialAnalysis` 两个 fetcher；`server/index.ts` 缓存 `SNAPSHOT_TTL = 10min` | 仅 1 个模型目录 + 1 个榜单源；无 HF / LMArena / 国产评测 / 厂商原生定价 |
| 模型目录 | OpenRouter 已聚合 60+ 厂商（见 `openrouter.ts:VENDOR_LABELS`），但只反映「能在 OR 上买的」 | 开源权重模型（HF 独占）、本地模型不在目录内 |
| 评测榜单 | AA 12 张（智能/智能体/知识/速度/Elo/成本/开放度/文生图/语音） | 缺 LMArena（另一主流 Elo）、缺中文评测（SuperCLUE/OpenCompass） |
| 代理厂商 | `providers.ts` 25 个（intl 14 + cn 11） | 缺**本地推理**（Ollama/vLLM/llama.cpp/LM Studio）、缺 讯飞/零一/百川/美团/快手/智源 等国产、缺 Perplexity/Replicate/SambaNova/Cerebras 等 |
| 厂商类型模型 | `ProviderConsole.region: 'intl' | 'cn'`，无 `kind` 区分云端/本地 | 本地厂商无鉴权、baseUrl 默认 `localhost`、`cost=0`，现有 probe/路由假设云端 |
| 多源对齐 | `aggregate.ts` 用 `matchModel(label, aaSlug)` 把 AA 指标回填到 OR 模型；`LlmModel` 仅有 OR 价 + AA 价 | 无跨源价格对账、无「哪些源提到了该模型」标记、无许可/下载量信号 |
| 多源 UI | `Dashboard.tsx:SourceList` 已能渲染 `snapshot.sources[]`（横向扩展 OK）；footer 走 i18n 动态计数 | `Leaderboards.tsx` 写死 `AA_ORIGIN='https://artificialanalysis.ai'`；`Dashboard`「评估榜单」hint 写死 "Artificial Analysis" → 多源榜单需改造 |
| 代理内核 | B1–B6 已落地（路由/fallback/配额/重放/定价外置/统一端点目录） | 新增厂商只是「加数据」，路由/配额逻辑可复用；本地厂商需 `kind` 分支 |

**结论**：数据源是真正「不够多」；代理厂商是「不够全」（尤其本地推理与国产）。架构上 UI 已横向扩展，主要改造点在 `aggregate.ts`（硬接线 → 注册表）与 `Leaderboards.tsx`（写死 origin）。

---

## 1. 设计原则（落地前先定）

1. **先抽「数据源注册表」再扩源**（G0）。当前 `buildSnapshot` 直接调用两个 fetcher；应改为遍历 `server/sources/registry.ts` 的源数组，每个源模块导出统一形态：
   ```ts
   interface SourceDef {
     id: string;
     name: string;
     url: string;
     fetch(): Promise<SourcePayload>; // { models?: Partial<LlmModel>[]; leaderboards?: Leaderboard[]; pricing?: PriceMap }
   }
   ```
   `buildSnapshot` 用 `Promise.allSettled` 并发（现有容错保留），按 `id` 推 `SourceStatus`。**既有的 openrouter / artificialAnalysis 只是注册表里的两个实现，行为不变。**
2. **榜单自带来源标识**（G-R2）。`Leaderboard` 类型加 `sourceId` + `sourceUrl`；fetcher 返回**绝对** `detailsUrl`，删掉 `Leaderboards.tsx` 的 `AA_ORIGIN` 写死。
3. **新增字段全部可选 / 可空**，不破坏既有 `LlmModel` 形状与前端口径（`ModelTable`/`Compare`/`Dashboard` 不强制依赖新字段）。
4. **本地厂商用 `kind: 'local'` 区分**，不动 `region` 枚举；代理层对 `kind==='local'` 跳过鉴权探针、成本记 `$0`。
5. **每项独立 commit + 全门禁**（沿用 `docs/roadmap-2026-09.md` 末尾「统一门禁」）。

---

## 2. Phase G1 — 数据源扩展（核心："数据源不够多"）

| # | 项 | 现状与缺口 | 改法 | 量 | 优先级 |
|---|---|---|---|---|---|
| G0 | **数据源注册表重构** | `buildSnapshot` 硬接线 2 个 fetcher | 抽 `server/sources/registry.ts`（`SourceDef[]`）；`aggregate.ts` 遍历 + 按 `id` 推 `SourceStatus`；既有两源平移为注册表项，行为不变 | M | **P0（前置）** |
| G-DS1 | **Hugging Face 模型目录** | 开源权重模型（Llama/Qwen/GLM 开源版）不在 OR 目录 | `server/sources/huggingface.ts`：拉 `huggingface.co/api/models?sort=downloads&filter=text-generation`，取 `id/downloads/likes/lastModified/tags(license,pipeline_tag)`；回填 `LlmModel.hfDownloads/hfLikes/license`（新增可选字段）；与 OR 用 `bareName()` 模糊匹配补充开源型号 | M | P1 |
| G-DS2 | **LMArena Elo 榜单** | 仅有 AA 单一榜单源，无 LMArena（另一主流人类偏好 Elo） | `server/sources/lmarena.ts`：拉 LMArena 公开数据（先验证端点可用性：`huggingface.co/spaces/lmarena-ai/chatbot-arena-leaderboard` 导出的 JSON 或官方 API）；新增 `leaderboards`（overall + coding/math/… 分类），`sourceId='lmarena'` | M | P1 |
| G-DS3 | **国产评测：SuperCLUE / OpenCompass** | 中文任务评测缺失，Qwen/GLM/DeepSeek 在中文场景无对照 | `server/sources/superclue.ts` + `opencompass.ts`：爬取榜单页结构化数据（需先确认可解析的 JSON/LD 或 API）；补齐中文综合/数学/代码分榜 | M×2 | P2 |
| G-DS4 | **厂商原生定价对账** | 价格只来自 OR + AA，单点来源无交叉校验 | `server/sources/nativePricing.ts`：拉 Together/Fireworks/Groq/DeepSeek/Moonshot 的 `/v1/models` 定价，回填 `LlmModel.priceSources[]`（多源 `{src,input,output,cacheHit}`）；G-R3 做对账 UI | L（先 3 家=M） | P2 |

**G-DS1 风险**：HF API 无 key 限流（~60/min）、结果集大 → 服务端分页 + 复用 `SNAPSHOT_TTL` 缓存；模糊匹配误合并 → 仅当 `bareName` 完全相等才回填，否则作为独立开源条目。
**G-DS2/DS3 风险**：榜单页结构易变 → 先写 `fetchXxx` 的解析单测 + 真实抓取 1 次验证字段；解析失败该源 `ok=false`（不拖垮整快照，已有 `allSettled` 容错）。

---

## 3. Phase G2 — 代理厂商扩展（"厂商不够多"）

| # | 项 | 说明 | 量 | 优先级 |
|---|---|---|---|---|
| G-P1 | **本地推理厂商** | 加 `Ollama`(`http://localhost:11434`)、`LM Studio`(`http://localhost:1234/v1`)、`vLLM`(`http://localhost:8000/v1`)、`llama.cpp`/`Text Generation WebUI`(`http://localhost:5000`)、`KoboldCpp`；`ProviderConsole` 加 `kind:'local'`；代理层对 local 跳过鉴权探针、成本记 `$0`；`modelsEndpoint` 走各自 `/api/tags` 或 `/v1/models` | M | **P1（最高价值）** |
| G-P2 | **国产云补齐** | 讯飞星火 `iFlytek`、零一万物 `01ai`、百川 `baichuan`、美团 `meituan`、快手 `kuaipilot`、智源 `baai`、InclusionAI（`通义` 已=Qwen，跳过） | S×7（批量=M） | P1 |
| G-P3 | **国际云补齐** | `Perplexity`、`Replicate`、`Cloudflare Workers AI`、`SambaNova`、`Cerebras`、`Oracle OCI GenAI`、`IBM watsonx`、`Upstage`（vendor label 已有、provider 缺失） | S×8（批量=M） | P2 |
| G-P4 | **多模态/专用（可选）** | `ElevenLabs`(TTS)、`Black Forest Labs`/`Fal.ai`(图像)——视产品是否要扩到 LLM 之外；建议本期**不做**，留 P3 | — | P3 |

**验收**：新增厂商出现在「本地代理 → 厂商」列表；Ollama 填 `http://localhost:11434` 后连通性探针显示 `ok`（无 key 直达 200）；本地调用成本在浮窗/用量记为 `$0.0000`；`B6 /api/v1/models` 自动包含本地启用模型。

---

## 4. Phase G3 — 多源对齐与能力呈现（"再思考其他需要增加的地方"）

| # | 项 | 现状 | 改法 | 量 | 优先级 |
|---|---|---|---|---|---|
| G-R1 | 注册表重构（同 G0） | — | 见 G0 | M | P0 |
| G-R2 | **榜单来源标识** | `Leaderboards.tsx` 写死 `AA_ORIGIN`，Dashboard hint 写死 "Artificial Analysis" | `Leaderboard` 加 `sourceId/sourceUrl`；fetcher 返回绝对 `detailsUrl`；删 `AA_ORIGIN`；Dashboard「评估榜单」hint 改读 `leaderboards[0]?.sourceName` 或聚合来源数 | S | P1 |
| G-R3 | **跨源价格对账 UI** | 价格只 OR + AA 两列，无冲突提示 | `ModelTable`/详情卡展示 `priceSources[]`，标 Δ%（OR vs 原生 vs AA）；`Dashboard` 加「价格冲突 TOP」小卡 | M | P2 |
| G-R4 | **能力矩阵 / 过滤** | reasoning/tools/structuredOutput/modality 已采集但未作为过滤维度 | `ModelTable` 加能力过滤（推理/工具/结构化/多模态）；新增「能力矩阵」视图（模型 × 能力勾选） | M | P2 |
| G-R5 | **模型新鲜度 / 上新流** | Dashboard「最新上架」仅按 OR `created` 倒序 10 条 | 按周分桶的「上新流」+ 合并多源 `created`/发布时间；支持点击看该周新增 | S–M | P2 |
| G-R6 | **快照导出 / 差分** | 无离线快照 | `GET /api/snapshot/export`（全量 JSON）；「对比两次快照」价格漂移（复用 `priceSources` 历史） | M | P3 |
| G-R7 | **数据源健康增强** | `SourceList` 已渲染，但无趋势/手动刷新 | 每项加「上次成功 / 延迟趋势」；`Dashboard` 加「仅刷新某源」按钮（命中 `invalidate('snapshot')` 后部分重拉） | S | P3 |

---

## 5. Phase G4 — 其他增量（已知债 / 体验）

| # | 项 | 说明 | 量 | 优先级 |
|---|---|---|---|---|
| G-O1 | **i18n 全量抽取**（F6 遗留） | F6 仅落 `App.tsx` 核心串，其余组件仍中文硬编码 | 逐组件抽 `resources/zh\|en`，`t()` 替换；`ResourceKey` 约束 | L（增量） | P3 |
| G-O2 | **本地模型注册表** | 配 Ollama/vLLM 后显示「已装模型」列表（Ollama `GET /api/tags`） | 与 G-P1 同批：本地厂商详情卡展示已装模型 + 显存占用 | M | P2 |
| G-O3 | **评测覆盖矩阵** | 哪些模型上了哪些榜单（现有 `matchedCount` 仅 AA） | 扩为「模型 × 所有榜单」覆盖热力，识别「有目录无评测」的盲区 | S–M | P3 |

---

## 6. 建议执行顺序

```
G0 注册表重构（前置，不增功能、纯解耦） ──┬─> G-DS1 HF 目录  + G-DS2 LMArena 榜单   （数据源 P1）
                                         ├─> G-P1 本地厂商   + G-P2 国产补齐          （厂商 P1）
                                         └─> G-R2 榜单来源标识（配合 DS2/DS3）

第二批（P2）：G-DS3 国产评测 · G-DS4 原生定价对账 · G-P3 国际补齐 · G-R3 价格对账 · G-R4 能力矩阵 · G-O2 本地注册表
第三批（P3）：G-R5 上新流 · G-R6 快照差分 · G-R7 健康增强 · G-O1 i18n 全量 · G-O3 评测覆盖
```

- **第一批建议（≈ 3-4 天，最高 ROI）**：G0 + G-DS1 + G-DS2 + G-P1 + G-P2 + G-R2。
  这一批让「数据源 2→4+」「厂商 25→35+（含本地）」，且架构从硬接线变注册表，后续加源只是「加一个文件 + 注册一行」。
- G-DS2/G-DS3 **先验证端点可用性**再写进路线图（避免规划了抓不到的源）。

---

## 7. 风险登记

| 项 | 风险 | 缓解 |
|---|---|---|
| G0 注册表重构 | 改 `buildSnapshot` 主链路，可能动到现有 2 源行为 | 既有两源平移为注册表项，**单测 `buildSnapshot` 输出 shape 不变**；`allSettled` 容错保留 |
| G-DS1 HF | 限流 + 结果集大 + 模糊匹配误合并 | 服务端分页 + TTL 缓存；仅 `bareName` 全等才回填，否则独立开源条目 |
| G-DS2/D3 榜单 | 页面结构易变 / 端点不稳 | 先真实抓取 1 次验证字段；解析失败时该源 `ok=false`（不拖垮整快照）；加解析单测 |
| G-P1 本地厂商 | 现有 probe/路由假设云端鉴权 | `kind:'local'` 分支：跳过鉴权探针（`state:'ok'` 直达）、成本记 `$0`；`modelsEndpoint` 走各自本地路径 |
| G-DS4 原生定价 | 各厂商定价字段格式不一 | 统一归一为 `PriceTriple`；缺失字段 `null`；与 OR 价差异 >阈值才在 G-R3 标红 |
| G-R2 榜单来源 | 删 `AA_ORIGIN` 后旧 AA 条目 `detailsUrl` 变绝对 | fetcher 改造时把相对路径在抓取期拼成绝对，回归测试覆盖 AA 链接仍可点 |
| G-O1 i18n 全量 | 改动面大、易回归 | 逐组件增量，每组件独立 commit；`ResourceKey` 类型约束，缺译回退原 key |

---

## 8. 验收口径（统一）

- **门禁同源**：`npm run lint` → `prettier --check` → `npm run typecheck` → `npm run test` → `npm run build` → 改 UI 必真实浏览器复测（Edge headless + CDP，见 skill `cdp-headless-smoke`）。
- **数据源新增**：`/api/snapshot` 返回的 `sources[]` 含新源 `id/name`；该源 `ok` 时 `models`/`leaderboards` 数上升；`Dashboard`「数据源状态」出现新行；失败源不影响其他源（`allSettled`）。
- **厂商新增**：`providers` 数组含新 `id`；Ollama 连通性 `ok`、本地调用成本 `$0`；`B6 /api/v1/models` 含本地启用模型。
- **注册表**：新增源只需「加 `server/sources/<x>.ts` + 在 `registry.ts` 注册一行」，无需改 `aggregate.ts` 主逻辑（结构证明）。
- **单测**：每个新 fetcher 带「解析单测」（用样例响应体断言字段映射）；`buildSnapshot` 带「shape 不变」回归。
