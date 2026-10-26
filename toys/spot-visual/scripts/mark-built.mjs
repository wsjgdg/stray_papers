/**
 * 构建收尾：把「构建完成时刻 + 源码内容指纹」写进 .next/.build-stamp，
 * 供 scripts/start-prod.mjs 判断下次冷启动能否跳过重建。
 *
 * 为什么不能用 .next/BUILD_ID 的 mtime：
 *   1) Next 在构建**早期**就写了 BUILD_ID，之后还有产物落盘，mtime 早于部分源码；
 *   2) 平台上传源码常保留原始时间戳，沙箱里旧的 .next 反而"更新"，
 *      会被误判成可复用，线上就跑旧代码（这次真踩到了）。
 * 所以判定一律以内容哈希为准。
 */
import fs from "node:fs";
import { sourceHash } from "./lib/source-hash.mjs";

const { hash, count } = sourceHash();
const stamp = {
  at: Date.now(),
  iso: new Date().toISOString(),
  hash,
  files: count,
};
fs.mkdirSync(".next", { recursive: true });
fs.writeFileSync(".next/.build-stamp", JSON.stringify(stamp), "utf8");
console.log(`[build] 完成于 ${stamp.iso}，源码指纹 ${hash}（${count} 个文件）`);
