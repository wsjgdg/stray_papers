/**
 * 源码内容指纹：给 scripts/start-prod.mjs 判断「已有构建是否对应当前源码」。
 *
 * 为什么不用 mtime：部署平台上传源码时常常保留原始时间戳，沙箱里已有的 .next
 * 反而比新上传的源码"更新"，于是被误判成可复用 —— 线上就会跑旧代码。
 * 用内容哈希才不受时间戳、时区、文件系统精度影响。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** 参与指纹的路径（相对项目根） */
const TARGETS = [
  "src",
  "public/data",
  "next.config.ts",
  "package.json",
  "server.mjs",
  "scripts",
];

/** 递归收集文件；跳过构建自己产出的目录与文件 */
function collect(target, out) {
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(target).sort()) {
      if (name === "node_modules" || name === ".next" || name === ".cache")
        continue;
      collect(path.join(target, name), out);
    }
    return;
  }
  out.push(target);
}

/**
 * 计算源码内容哈希。
 * 只哈希「路径 + 内容」，不哈希 mtime/size —— 同一份代码无论何时拷进来，
 * 哈希都一致；代码一改，哈希必变。
 */
export function sourceHash(root = process.cwd()) {
  const files = [];
  for (const t of TARGETS) collect(path.resolve(root, t), files);
  files.sort();
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(root, f).replace(/\\/g, "/"));
    h.update("\0");
    h.update(fs.readFileSync(f));
    h.update("\0");
  }
  return { hash: h.digest("hex").slice(0, 32), count: files.length };
}
