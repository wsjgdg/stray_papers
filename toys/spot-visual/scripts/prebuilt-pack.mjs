/**
 * 部署预构建包：把本地构建好的 `.next` 压成 `prebuilt/next.tgz`，供沙箱冷启动秒开。
 *
 * 为什么需要：部署平台只上传源码（`.next` 属构建产物，会被排除），沙箱每次冷启动
 * 都要 `next build`——本机实测干净构建 229s，而平台的端口就绪窗口只有 60s，
 * 于是必然 SITES_START_FAILED。沙箱磁盘虽然持久，但上传会先清掉旧 `.next`，
 * 指望「上一次构建残留」不可靠。
 *
 * 做法：把构建产物随源码一起上传（`.next` 被排除，`prebuilt/` 不会），
 * start-prod.mjs 发现没有可复用构建时解包并校验指纹；指纹不匹配才回退到真构建。
 *
 * 用法：npm run pack:deploy   （内部先跑 build:deploy）
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sourceHash } from "./lib/source-hash.mjs";

const OUT_DIR = "prebuilt";
const TAR = path.join(OUT_DIR, "next.tgz");
const META = path.join(OUT_DIR, "meta.json");

if (!fs.existsSync(path.join(".next", "BUILD_ID"))) {
  console.error("✗ 缺少 .next/BUILD_ID，先跑 npm run build:deploy");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(TAR)) fs.rmSync(TAR);

// Windows 自带 bsdtar，Linux 亦有 tar；-C 指定根，打包 .next 内容
// 一律用相对路径：Windows 下把绝对路径（C://...）交给 shell 拼进 tar 命令行会被转义坏掉
// 归属归一交给解包侧：Windows bsdtar 不支持 --uid/--gid，硬塞会直接报错退出。
// 沙箱解包用 --no-same-owner，Windows 的 SID 就不会触发 chown 失败。
const r = spawnSync("tar", ["-czf", TAR, "-C", ".next", "."], {
  stdio: "inherit",
});
if (r.status !== 0) {
  console.error("✗ tar 打包失败");
  process.exit(r.status ?? 1);
}

const { hash, count } = sourceHash();
fs.writeFileSync(
  META,
  JSON.stringify(
    {
      hash,
      files: count,
      iso: new Date().toISOString(),
      sizeBytes: fs.statSync(TAR).size,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(
  `[pack] ${TAR}  ${(fs.statSync(TAR).size / 1024 / 1024).toFixed(1)} MB  指纹 ${hash}（${count} 个文件）`,
);
