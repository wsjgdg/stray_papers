# ADR-0010: 翻译作为第五类 Provider（translate kind），默认引擎复用 LLM 通道

状态：已接受（2026-09）

## 背景

整稿翻译此前没有独立通道：要么临时拼一个 LLM prompt（绕过 Provider 体系，
设置页不可见、账本不可归因、换引擎无接口），要么不做。用户点名要「翻译独立
服务商类型」——问题不是「要不要翻译功能」，而是翻译该不该成为与 ASR / TTS /
LLM / Embedding 并列的一等能力位：外部翻译引擎（DeepL / 自托管）与 LLM 翻译
在质量、计价、术语一致性上互有胜负，绑死在 LLM 通道上就把选择权焊死了。

## 决策

- **`ProviderKind` 扩为五类**：`asr | tts | llm | embed | translate`
  （`src/lib/providers.ts`）。`TranslateProvider` 契约 = `meta + supported() +
  translate(text, config, opts)`；opts 携带 `targetLang / model / agentPrompt /
  hotwords / onProgress`，外部引擎可如实忽略 LLM 系字段（口径同
  `AsrStartOptions.contextText` 的「不假装生效」原则）；
- **默认引擎「大模型翻译」在 `src/lib/translate.ts` 运行时注册**
  （`registerTranslateProvider`，口径同 embeddingClient）——不放 providers.ts
  是因为它依赖 ai.ts 的分块 + 降级链，而 ai.ts 依赖 providers.ts，同文件会成环；
- **翻译是旁路产物**：译文写 `meeting.translation`（独立副本层，
  `TranslationLayer = { text, lang, engine, generatedAt }`），转写原文永不被
  覆盖；转写稿后改过按 `transcriptUpdatedAt` 对比标记「可能过时」；
- **新增可选字段不升 schema 版本**（ADR-0009 政策：宽容解析天然兼容）；
- **翻译 Agent 是第五个角色**（`agents.ts` 的 `translate`）：独立章程
  （忠实转述 + 结构保留）、独立模型与附加指令配置；账本 kind `translate`
  按此归组，用量面板自动出现；
- **长稿按行分块**（6000 字符/块，`ai.ts splitTranslateChunks`）：每块独立走
  模型降级链，避免单次输出超 max_tokens 截断；token 用量跨块求和记账，
  全缺省不造假账；
- 设置页「服务商」出现翻译分区（configSchema 驱动，目标语言可配），
  连接测试 = 真实试译一句（消耗极少量 token，如实标注）。

## 考虑过的替代方案

- 翻译留在 LLM kind 里当普通任务：设置页无法单独换引擎、账本无法区分
  「纪要生成」与「翻译」消耗、DeepL 类引擎无接入位——正是要解决的问题，否；
- 实现直接写进 providers.ts：与 ai.ts 成环（见上），否；
- 静态注册（providers.ts import translate.ts）：同样成环，运行时注册是本仓库
  已有先例（embedding），否；
- 译文覆盖转写稿或替换 prePolish 机制：翻译不是整理，覆盖原文违反
  「转写稿是用户原始资产」的域不变量，否。

## 何时重新评估

- 平台沙箱放开第三方 http(s) 直连（或用户自托管部署）：注册真 DeepL /
  OpenAI-compatible 翻译 Provider，验证 configSchema 的 password 字段轮换
  与备份脱敏在真实密钥下工作；
- 分块翻译出现跨块术语漂移（同一专有名词前后译法不一致）达到可感知频率：
  评估「全稿术语表两阶段翻译」是否进主线（当前只靠热词表注入缓解）；
- 翻译调用量在账本里占比持续超过纪要生成：评估是否需要独立的成本确认阈值
  （当前与其他付费操作共用 costConfirm 文案机制）。
