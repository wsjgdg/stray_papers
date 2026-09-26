# ADR-0004: LLM 调用链——chat 25s 快路径 → poll 兜底，not_found×3 快速失败

状态：已接受（2026-09）

## 背景

平台 LLM 网关有两种代际：新代支持 chat 直接返回结果（低延迟），老代只支持
poll-first（提交 request_id 后轮询取结果）。同一段前端代码要同时跑在两种后端上，
且要区分「后端没这个模型的路由」（该快速失败）和「模型还在算」（该继续等）——
把前者当后者会无限轮询空转。

## 决策

`src/lib/llm.ts` 的 `callLlmWithFallback`（poll-first 契约）：

- **chat 快路径**：先 POST chat，25s（`CHAT_ABORT_MS`）内返回就直接用；
- **代际探测**：chat 返回 404 → 判定老代后端，改走按模型路由重试一次（`legacyLlmRoutes`
  缓存判定结果，避免每次调用都撞一遍 404）；两种代际都 404 = 后端根本没装这个模型的
  路由 → **立即返回 not_found，不进 poll**；
- **poll 兜底**：chat 快路径超时/失败后，用同一 request_id 轮询 poll 接口，
  3s 一次（`POLL_INTERVAL_MS`）最多 200 次（`POLL_ATTEMPTS`，约 10 分钟上限）；
- **not_found 计数快速失败**：poll 中连续 3 次 not_found 才判定失败（容忍单次抖动），
  一旦拿到非 not_found 状态就清零计数；
- **412 = 需要 RH 登录**：直接返回 needsLogin 让 UI 弹登录，**绝不降级重试**
  （登录/余额问题重试无意义，只会掩盖真实原因）；
- Provider 层（`providers.ts`）：active 模型不可用时 `resolveActive` 落到第一个
  `supported()` 的实现；平台环境 LLM 恒有 rh-llm 兜底。

## 考虑过的替代方案

- 纯 poll-first（不走 chat 快路径）：新代后端下每次问答都多一轮往返延迟，体验退化；
- 纯 chat（不 poll）：老代后端直接不可用，且长任务会被 chat 超时截断；
- 无限轮询直到成功：not_found 类永久失败会空转到天荒地老，必须有快速失败；
- 412 也降级重试：把「没登录」伪装成「暂时失败」，用户永远看不到该去登录的提示。

## 何时重新评估

- 平台统一后端代际（chat 与 poll 二选一），探测逻辑可整段删除；
- 网关支持流式返回（SSE），chat 快路径的 25s 硬超时可换成流式心跳；
- 出现「模型在算但 poll 200 次仍不够」的长任务（当前 10 分钟上限需上调或改异步任务）。
