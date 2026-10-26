/**
 * 生产启动器：能复用已有构建就绝不再构建一次。
 *
 * 为什么需要：部署沙箱上传的是**源码**（不含 .next），startCmd 里带 build 意味着
 * 每次冷启动都要把整个 Next 项目重编译一遍——本机实测干净构建 12.6s，这段时间
 * 用户只能干等。而沙箱磁盘通常是持久的：只要 `.next` 还在、且源码内容没变，
 * 就没必要重建（实测降回 0.9s）。
 *
 * 判定一律用**内容哈希**（scripts/lib/source-hash.mjs），不用 mtime：
 * 平台上传源码会保留原始时间戳，旧 .next 的 mtime 常常比新源码还新，
 * 按时间判断会把新代码误判成「无需重建」，直接端出旧页面（已踩过）。
 *
 * 任何异常都保守回退到「重新构建」——宁可慢，也不端出过期构建。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sourceHash } from "./lib/source-hash.mjs";

const BUILD_ID = path.join(".next", "BUILD_ID");
const STAMP = path.join(".next", ".build-stamp");

function buildIsFresh() {
  if (
    !fs.existsSync(BUILD_ID) ||
    !fs.existsSync(STAMP) ||
    !fs.existsSync(path.join(".next", "server"))
  ) {
    return { fresh: false, why: "缺少 .next 构建产物或构建戳" };
  }
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(STAMP, "utf8"));
  } catch {
    return { fresh: false, why: "构建戳损坏" };
  }
  if (!stamp?.hash) return { fresh: false, why: "构建戳里没有源码指纹" };
  const { hash } = sourceHash();
  if (hash !== stamp.hash) {
    return { fresh: false, why: `源码已变化（${stamp.hash} → ${hash}）` };
  }
  return { fresh: true, at: stamp.iso };
}

const state = buildIsFresh();
if (state.fresh) {
  console.log(`[start] 复用已有构建（${state.at}），跳过 next build`);
} else {
  console.log(`[start] 需要重新构建：${state.why}`);
  const t0 = Date.now();
  const r = spawnSync("npm", ["run", "build:deploy"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error("[start] 构建失败，退出");
    process.exit(r.status ?? 1);
  }
  console.log(
    `[start] 构建完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

// 复用项目已有的 server.mjs（它负责把文档响应的 Cache-Control 收口成 no-store，
// 否则网关会把 HTML 缓存一年，重新发布后 chunk 哈希变化导致白屏）。
// 直接 import 而不是 spawn：不产生父子进程，部署平台停服务时不会留下孤儿。
await import("../server.mjs");
