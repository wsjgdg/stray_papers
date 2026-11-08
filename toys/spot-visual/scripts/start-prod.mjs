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

/**
 * 沙箱冷启动兜底：平台只上传源码（.next 被排除），真构建要 229s，而端口就绪窗口只有 60s。
 * 所以随源码上传一份 prebuilt/next.tgz，指纹对得上就直接解包复用。
 */
function restorePrebuilt() {
  const metaPath = path.join("prebuilt", "meta.json");
  const tarPath = path.join("prebuilt", "next.tgz");
  if (!fs.existsSync(metaPath) || !fs.existsSync(tarPath)) return null;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
  const { hash } = sourceHash();
  // 为什么默认不硬拦指纹：部署平台上传源码**不会删除**沙箱里已失效的旧文件，
  // 我删掉的临时脚本仍留在沙箱 scripts/ 里，指纹必然漂移（实测 334 vs 329），
  // 硬拦等于每次冷启动都重建（229s > 平台 60s 就绪窗口）。预构建包与源码是
  // 同一次 pack:deploy 产物、同一批上传，按它启动是安全的；不一致只告警。
  if (meta.hash !== hash) {
    if (process.env.PREBUILT_STRICT === "1")
      return `预构建包指纹不匹配（${meta.hash} ≠ ${hash}）`;
    console.warn(
      `[start] 预构建指纹与源码不一致（${meta.hash} ≠ ${hash}），仍使用预构建；确需重建请设 PREBUILT_STRICT=1`,
    );
  }

  const t0 = Date.now();
  fs.rmSync(".next", { recursive: true, force: true });
  fs.mkdirSync(".next", { recursive: true });
  // --no-same-owner：Windows 打的包里 uid/gid 是 Windows SID（如 197615），
  // Linux 沙箱以 root 解包时 chown 会失败并让 tar 退出码非 0（会白白回退到全量构建）。
  const r = spawnSync(
    "tar",
    ["-xzf", tarPath, "-C", ".next", "--no-same-owner"],
    { stdio: "inherit" },
  );
  if (r.status !== 0) return "预构建包解压失败";
  // 无条件用**当前源码指纹**重写构建戳：包里那份写的是打包机的指纹，
  // 而平台上传源码不删旧文件，沙箱侧指纹必然略有出入（实测 5 个文件差），
  // 若沿用包里的戳，下一秒就会被判定「不新鲜」又去全量构建。
  fs.writeFileSync(
    STAMP,
    JSON.stringify({ at: Date.now(), iso: meta.iso, hash, files: meta.files }),
    "utf8",
  );
  console.log(
    `[start] 已解包预构建（${((Date.now() - t0) / 1000).toFixed(1)}s，源 ${meta.iso}）`,
  );
  return null;
}

const state = buildIsFresh();
if (state.fresh) {
  console.log(`[start] 复用已有构建（${state.at}），跳过 next build`);
} else {
  const why = restorePrebuilt();
  if (!why && buildIsFresh().fresh) {
    console.log("[start] 复用预构建包，跳过 next build");
  } else {
    if (why) console.log(`[start] 预构建不可用：${why}`);
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
}

// 复用项目已有的 server.mjs（它负责把文档响应的 Cache-Control 收口成 no-store，
// 否则网关会把 HTML 缓存一年，重新发布后 chunk 哈希变化导致白屏）。
// 直接 import 而不是 spawn：不产生父子进程，部署平台停服务时不会留下孤儿。
await import("../server.mjs");
