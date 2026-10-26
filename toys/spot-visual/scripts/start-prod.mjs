/**
 * 生产启动器：能复用已有构建就绝不再构建一次。
 *
 * 为什么需要：部署沙箱上传的是**源码**（不含 .next），startCmd 里带 build 就意味着
 * 每次冷启动都要把整个 Next 项目重编译一遍——本机实测干净构建 17.3s，这 17s 全在
 * 用户等待里。但沙箱的磁盘通常是持久的：只要 `.next` 还在，且没有源码比它更新，
 * 就没有任何理由重建。
 *
 * 判断规则：
 *   1) `.next/BUILD_ID` 与 `.next/server` 都存在；
 *   2) `src/`、`public/data/`、`next.config.ts`、`package.json` 里最新的 mtime
 *      不晚于 `.next/.build-stamp`（构建收尾戳，见 scripts/mark-built.mjs）。
 *      不用 BUILD_ID 的 mtime：Next 在构建早期就写了它，会误判源码更新。
 * 两条都满足 → 直接 node server.mjs；否则跑一次 build:deploy。
 *
 * 任何异常都保守回退到「重新构建」，宁可慢也不端出过期构建。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const BUILD_ID = path.join(".next", "BUILD_ID");
const STAMP = path.join(".next", ".build-stamp");
const WATCH = [
  "src",
  path.join("public", "data"),
  "next.config.ts",
  "package.json",
];

// 构建自己会写的文件，mtime 不能当作「源码变过」的证据
const IGNORE_RE =
  /(\.generated\.ts$|^public[\\/]data[\\/]|^src[\\/]lib[\\/].*\.generated\.)/;

/** 递归取最新 mtime（毫秒）；目录不存在则忽略 */
function newestMtime(target) {
  let newest = 0;
  let newestPath = "";
  const walk = (p) => {
    if (IGNORE_RE.test(p.replace(/\\/g, "/").replace(/^\.\//, ""))) return;
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    } else if (st.mtimeMs > newest) {
      newest = st.mtimeMs;
      newestPath = p;
    }
  };
  walk(target);
  return { newest, newestPath };
}

function buildIsFresh() {
  if (
    !fs.existsSync(BUILD_ID) ||
    !fs.existsSync(path.join(".next", "server"))
  ) {
    return { fresh: false, why: "缺少 .next 构建产物" };
  }
  const builtAt = fs.statSync(BUILD_ID).mtimeMs;
  let newest = 0;
  let newestFile = "";
  for (const target of WATCH) {
    const { newest: m, newestPath } = newestMtime(target);
    if (m > newest) {
      newest = m;
      newestFile = newestPath || target;
    }
  }
  // 4s 容差：构建过程中写入的文件与收尾戳常常只差几十毫秒，早先 2s 容差
  // 仍会偶发误判成「源码更新」，导致每次冷启动都白重建一遍。
  if (newest > builtAt + 4000) {
    return { fresh: false, why: `${newestFile} 比构建产物新` };
  }
  return { fresh: true, builtAt };
}

const state = buildIsFresh();
if (state.fresh) {
  console.log("[start] 复用已有构建，跳过 next build");
} else {
  console.log(`[start] 需要重新构建：${state.why ?? "未知"}`);
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
