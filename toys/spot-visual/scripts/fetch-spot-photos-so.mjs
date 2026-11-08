/**
 * 景点照片采集 · 360 图片（image.so.com）通道 —— 与 Bing 通道同产出格式
 *
 * 为什么需要第二条通道：
 *   Bing 抓过 2–3 轮仍拿不到图的冷门 4A（只有导览图/拼贴图/ <420px 缩略图），
 *   换索引比换查询词更有效——360 的图源池与 Bing 不同，实测同一景点能补到不同的图。
 *   连通性实测（2026-10-30）：百度图片 302 → 安全验证页（不可用）；
 *   Wikimedia Commons / DuckDuckGo 本机 000 超时；360 图片首几个查询 200 且可下原图，
 *   **但连发约 50 次后转为 verify 反爬页**（响应从 191KB 掉到 1.6KB），之后再查全部 0 候选。
 *   本通道需要节流或换出口 IP 才可持续；目前它没能替 Bing 补上任何一条。
 *
 * 用法：
 *   node scripts/fetch-spot-photos-so.mjs <景点名...> [--per=3] [--force]
 *   node scripts/fetch-spot-photos-so.mjs --names=<名单文件> --per=3
 *
 * 产出：与 Bing 通道完全同构 —— public/spots/_candidates/<名>-N.jpg + 追加进 _report.json，
 *       之后照常 `npm run spots` 烘焙（build-spot-photos.mjs 不需要知道图来自哪条通道）。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const OUT_DIR = path.resolve("public/spots/_candidates");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

const namesFile = (process.argv.find((a) => a.startsWith("--names=")) || "").split("=")[1];
const PER = Number(process.argv.find((a) => a.startsWith("--per="))?.split("=")[1] ?? 3);
const FORCE = process.argv.includes("--force");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 名录里有名字带 / 的条目，直接当文件名会 ENOENT 并中断整批
const safeName = (s) => s.replace(/[/\\:*?"<>|]/g, "-");

/** 付费图库/水印站，直接跳过 */
const BAD =
  /588ku|qiantucdn|huaban|nipic|tukuppt|58pic|veer|hellorf|vcg|699pic|dfic|gaoding|ibaotu|nximg|zhituwang/i;

/** 来源页域名权重（与 Bing 通道同一张表，保证两条通道烘焙时排序口径一致） */
const PREFERRED = [
  { re: /c-ctrip\.com|ctrip\.com/, s: 30 },
  { re: /mafengwo/, s: 30 },
  { re: /qunar\.com/, s: 26 },
  { re: /cantontower\.com|official|gov\.cn/, s: 28 },
  { re: /zhimg\.com/, s: 24 },
  { re: /(sohu|163|qq|ifeng)\.(com|net)|sinaimg\.cn/, s: 20 },
  { re: /xinhuanet|people\.com\.cn/, s: 20 },
  { re: /pconline|zol-img|bendibao/, s: 14 },
  { re: /baike|wikipedia/, s: 14 },
];
function domainScore(host) {
  for (const p of PREFERRED) if (p.re.test(host)) return p.s;
  return 0;
}

function curlText(url) {
  return execFileSync("curl", ["-sS", "-m", "25", "-A", UA, "--compressed", url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 360 图片结果页把列表塞在 JSON 里：thumb 是原图直链，link 是来源页 */
function soImages(spotName) {
  const q = encodeURIComponent(`${spotName} 风景`);
  const url = `https://image.so.com/i?q=${q}&pn=0&correct=${q}`;
  const html = curlText(url);
  const thumbs = [...html.matchAll(/"thumb":"(https:[^"]+)"/g)].map((m) =>
    m[1].replace(/\\\//g, "/"),
  );
  const links = [...html.matchAll(/"link":"(https?:[^"]+)"/g)].map((m) =>
    m[1].replace(/\\\//g, "/"),
  );
  const items = [];
  const n = Math.min(thumbs.length, links.length);
  for (let i = 0; i < n; i++) {
    const murl = thumbs[i];
    const purl = links[i];
    if (BAD.test(murl) || BAD.test(purl)) continue;
    let host = "";
    try {
      host = new URL(purl).host;
    } catch {
      continue;
    }
    items.push({ murl, purl, host, score: domainScore(host) });
  }
  return items.sort((a, b) => b.score - a.score);
}

const REPORT_FILE = path.join(OUT_DIR, "_report.json");
const seenHash = new Set();
const report = fs.existsSync(REPORT_FILE)
  ? JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"))
  : [];
for (const r of report) seenHash.add(r.image);

function flushReport() {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let dishes = [];
if (namesFile) {
  dishes = fs
    .readFileSync(namesFile, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ prov: "extra", dish: name }));
} else if (args.length) {
  dishes = args.map((name) => ({ prov: "extra", dish: name }));
} else {
  console.error(
    "用法: node scripts/fetch-spot-photos-so.mjs <名...> | --names=<文件> [--per=3]",
  );
  process.exit(2);
}

for (const { prov, dish } of dishes) {
  const already = fs.readdirSync(OUT_DIR).some((f) => f.startsWith(safeName(dish) + "-"));
  if (already && !FORCE) {
    console.log(`-- ${dish} 已有`);
    continue;
  }
  console.log(`── ${prov} / ${dish} ──`);
  let items = [];
  try {
    items = soImages(dish);
  } catch (e) {
    console.log("  ✗ 搜索失败", String(e.message).slice(0, 40));
  }
  console.log(`  候选 ${items.length} 条`);
  let saved = 0;
  for (const it of items) {
    if (saved >= PER) break;
    let buf = null;
    try {
      buf = execFileSync(
        "curl",
        ["-sS", "-m", "25", "-A", UA, "-e", "https://image.so.com/", it.murl],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
    } catch {
      continue;
    }
    if (!buf || buf.length < 20000) continue;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isWebp = buf.subarray(8, 12).toString() === "WEBP";
    if (!isJpg && !isPng && !isWebp) continue;
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    if (seenHash.has(hash)) continue;
    seenHash.add(hash);

    const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
    const file = path.join(OUT_DIR, `${safeName(dish)}-${saved + 1}.${ext}`);
    fs.writeFileSync(file, buf);
    saved += 1;
    report.push({
      dish,
      prov,
      file: path.relative("public", file),
      image: it.murl,
      page: it.purl,
      host: it.host,
      sizeKB: Math.round(buf.length / 1024),
    });
    console.log(`  ✓ ${path.basename(file)}  ${Math.round(buf.length / 1024)}KB  ← ${it.host}`);
  }
  if (!saved) console.log("  ✗ 没有可用图");
  await sleep(150);
}

flushReport();
console.log(`\n共 ${report.length} 条记录 → public/spots/_candidates/`);
console.log("跑 npm run spots 烘焙（与 Bing 通道同一套）");
