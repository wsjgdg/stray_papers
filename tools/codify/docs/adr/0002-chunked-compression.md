# ADR-0002: 大文本外置分片 + 自描述压缩（lz4 活动档 / zstd-19 归档档）

状态：已接受（2026-09）

## 背景

转写稿动辄数百 KB 到数 MB。整存单条 IDB 记录会让「打开就读全部会议」的首屏
装载背上所有大文本；不压缩则配额消耗翻倍。压缩算法的选择又受运行时约束：
主线程不能卡（同步算法要快），归档可以慢（换压缩率）。

## 决策

`src/lib/compression.ts` + `src/lib/idbStore.ts`：

- 大文本按 **800KB UTF-8 安全边界**切分片（`CHUNK_MAX_BYTES`，`splitUtf8Chunks`
  保证不切断多字节字符），每片一条 IDB 记录，`[docId, index]` 复合键；
- **双档压缩**：活动档（读写频繁）用 lz4——同步、~GB/s 级，主线程兜底与 Worker
  共用同一实现；归档档（低频读写）用 zstd level 19（`ZSTD_ARCHIVE_LEVEL`）——
  异步 wasm，换最高压缩率；zstd wasm 加载失败退 fflate deflate level 9，仍显著优于不压缩；
- **< 512B 不压缩**（`MIN_COMPRESS_BYTES`）：小载荷压缩收益抵不过 codec 开销；
- **每分片自带 codec 标记**（raw/lz4/zstd/deflate）：解压只认标记、与会议当前
  归档状态无关——会议从活动转归档不需要重写已有分片；
- 压缩/解压 > 64KB 走 Worker（`textWorkerClient.ts`），主线程只收发字节；
  Worker 不可用（SSR/测试环境）自动同步兜底，同一份编解码实现；
- 档案加密开启时**先压缩后加密**（密文不可压缩，顺序反了压缩率归零）。

## 考虑过的替代方案

- 全用 zstd：主线程同步路径缺失，活动档每次击键落盘都要过异步 wasm，延迟不可接受；
- 全用 deflate：压缩率比 zstd-19 差 ~20-30%，归档档（存的是最冷的数据）不划算；
- gzip（CompressionStream API）：浏览器原生但只有 deflate 级压缩率，且流式 API
  与 IDB 的字节块存取不合拍；
- 不分片、整字段单记录：一场 3MB 转写稿就是一条 3MB 记录，读取粒度和事务内存都失控。

## 何时重新评估

- zstd wasm 资产（~数百 KB）成为首屏负担的显著部分（当前是动态 import，不阻塞首屏）；
- 出现单场 > 100MB 的转写稿（分片数上千，需要分片索引缓存）；
- 浏览器原生 CompressionStream 支持 zstd（可去掉 wasm 依赖）。
