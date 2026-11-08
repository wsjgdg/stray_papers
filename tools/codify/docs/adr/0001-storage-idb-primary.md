# ADR-0001: 存储架构——IndexedDB 主存储 + localStorage 兜底，加密档案拒绝降级

状态：已接受（2026-09）

## 背景

会议转写稿单场可达数 MB，localStorage 全源配额通常只有 ~5MB，且是同步 API——
大文本写入会卡主线程。但 IndexedDB 在无痕模式 / 被策略禁用时不可用，工具不能
在这种环境里直接白屏。

## 决策

- 主存储 IndexedDB（`src/lib/idbStore.ts`），四个对象库分工：
  `meta`（会议元数据）/ `chunks`（外置大文本分片）/ `kv`（问答历史等杂项）/
  `searchIndex`（检索索引快照）；
- 大文本字段（transcript/cleaned 等，见 `TEXT_FIELDS`）不留在 meta 里，
  外置进 chunks（理由见 ADR-0002）；装载分两阶段：先读 meta 秒开列表，
  大文本按需回填（`hydrateMeetingFields`）；
- IndexedDB 不可用时降级 localStorage 单键整存（`store.ts` 的 loadStore/saveStore），
  并在 UI 上如实告知降级状态；
- **例外**：开启档案加密后拒绝 localStorage 降级（loadStoreData 返回空数据、
  saveStoreData 返回 false 挂横幅）。理由：兜底路径的密文持久化是异步队列，
  无法维持「写入失败绝不静默」的强一致口径——宁可明确失败，不可假成功。

## 考虑过的替代方案

- 纯 localStorage：配额不够，大转写稿必炸，否；
- OPFS（Origin Private File System）：配额更友好，但兼容面与调试工具链不如 IDB 成熟，
  且本工具数据量（个人会议档案）IDB 完全够用——留作数据量级上来后的迁移方向；
- SQLite wasm（wa-sqlite 等）：引入 ~1MB wasm 资产与迁移复杂度，个人单机场景收益不成比例。

## 何时重新评估

- 单用户档案总量常态性逼近 IDB 配额（健康面板的配额可视化会先给出信号）；
- 浏览器对 IDB 的无痕/清理策略收紧，导致「降级路径」成为主路径；
- 档案加密用户中出现无痕模式使用需求（届时需要为兜底路径设计同步加密写入，
  而不是简单放开降级）。
