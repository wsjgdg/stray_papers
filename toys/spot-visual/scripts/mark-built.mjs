/**
 * 构建收尾：写一个「构建完成」时间戳，供 scripts/start-prod.mjs 判断能否跳过重建。
 *
 * 为什么不直接用 .next/BUILD_ID 的 mtime：Next 在构建**早期**就写了 BUILD_ID，
 * 之后还有编译产物落盘，实测 BUILD_ID 会比部分源码文件的 mtime 还早一两秒，
 * 导致「源码比构建新」的误判（每次冷启动都白重建一遍）。
 * 这个戳是 build:deploy 的最后一步写的，最能代表「构建完成时刻」。
 */
import fs from "node:fs";

const stamp = { at: Date.now(), iso: new Date().toISOString() };
fs.mkdirSync(".next", { recursive: true });
fs.writeFileSync(".next/.build-stamp", JSON.stringify(stamp), "utf8");
console.log(`[build] 完成于 ${stamp.iso}`);
