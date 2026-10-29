/**
 * 内置景点照片采集（Bing 图片，无需 API Key）——sampleSpots 离线图包
 * 从 fetch-dish-photos-bing.mjs 移植：搜索词与域名降权表换成景点口径。
 *
 * 为什么走 Bing：
 *   实测国内网络下，Google Custom Search / Exa / DuckDuckGo / Openverse / TheMealDB /
 *   Spoonacular / Flickr / Pixabay 全部不可达（HTTP 000）；
 *   Unsplash、Pexels、SerpAPI、Brave、Bing 的 API 可以连上（401/422 说明只是缺 key），
 *   其中只有 cn.bing.com 的图片搜索**不需要 key**就能拿到中文菜名的结果。
 *
 * 用法：
 *   node scripts/fetch-dish-photos-bing.mjs                  # 全部省级代表菜
 *   node scripts/fetch-dish-photos-bing.mjs 麻婆豆腐 剁椒鱼头  # 指定菜名
 *   node scripts/fetch-dish-photos-bing.mjs --per=4           # 每道菜最多存几张（默认 3）
 *
 * 产出：public/dishes/_candidates/<菜名>-N.jpg + _report.json（含来源页，便于逐一核对）
 * 注意：搜索结果里有一部分来自付费图库（摄图网、昵图网等），通常会带水印，
 *       脚本按域名做了降权，但最终仍需人工过目。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const OUT_DIR = path.resolve("public/spots/_candidates");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PER = Number(
  process.argv.find((a) => a.startsWith("--per="))?.split("=")[1] ?? 3,
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

/** 付费图库/水印站，排后面；真实菜谱与资讯站排前面 */
const DOMAIN_SCORE = [
  { re: /mafengwo\.cn$/, s: 30 },
  { re: /ctrip\.com$/, s: 28 },
  { re: /qunar\.com$/, s: 26 },
  { re: /youimg1\.c-ctrip\.com$/, s: 28 },
  { re: /zhimg\.com$/, s: 20 },
  { re: /(sohu|163|qq|ifeng|xinhuanet|people)\.(com|net)/, s: 16 },
  { re: /baike|wikipedia/, s: 14 },
  { re: /tuchong\.com$/, s: 12 },
  {
    re: /(699pic|nximg|tukuppt|58pic|zhituwang|veer|hellorf|vcg|gaoimg|dfic)\./,
    s: -40,
  },
];

function domainScore(host) {
  for (const d of DOMAIN_SCORE) if (d.re.test(host)) return d.s;
  return 0;
}

function curl(url, opts = {}) {
  return execFileSync(
    "curl",
    ["-sS", "-m", "25", "-A", UA, ...(opts.bin ? [] : ["--compressed"]), url],
    {
      encoding: opts.bin ? "buffer" : "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

/** 从 Bing 图片搜索页提取 murl / purl / title */
function bingImages(spotName) {
  const q = encodeURIComponent(`${spotName} 风景 实拍`);
  const url = `https://cn.bing.com/images/search?q=${q}&qft=+filterui:imagesize-large&form=IRFLTR`;
  let html = "";
  try {
    html = curl(url);
  } catch (e) {
    console.log(`  ! 搜索失败 ${e.message}`);
    return [];
  }
  const items = [];
  // Bing 把结果塞在 m="{...}" 的 JSON 属性里，字段做了 HTML 转义
  const blocks = html.split('m="{').slice(1);
  for (const b of blocks) {
    const raw = "{" + b.split('}"')[0] + "}";
    let j;
    try {
      j = JSON.parse(raw.replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
    } catch {
      continue;
    }
    if (!j.murl) continue;
    let host = "";
    try {
      host = new URL(j.murl).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    items.push({
      murl: j.murl,
      turl: j.turl || "",
      purl: j.purl || "",
      title: (j.t || "").slice(0, 60),
      host,
      score: domainScore(host),
    });
  }
  return items.sort((a, b) => b.score - a.score);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const src = fs.readFileSync("src/lib/spot-data.ts", "utf8");
const seg = src.slice(src.indexOf("sampleSpots"));
const spots = [...seg.matchAll(/name: "([^"]+)"/g)].map((m) => ({
  prov: "sample",
  dish: m[1],
}));
let dishes = spots;
if (args.length)
  // args 直接作为抓图目标（支持任意景点名，如 5A 缺图名录条目），不再限于 sampleSpots
  dishes = args.map((name) => ({ prov: "extra", dish: name }));

// report 合并旧值 + 增量落盘：分批/中断重跑不丢历史，也不覆盖前批记录
const REPORT_FILE = path.join(OUT_DIR, "_report.json");
const seenHash = new Set();
const report = fs.existsSync(REPORT_FILE)
  ? JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"))
  : [];
for (const r of report) seenHash.add(r.image);

function flushReport() {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

for (const { prov, dish } of dishes) {
  const already = fs.readdirSync(OUT_DIR).some((f) => f.startsWith(dish + "-"));
  if (already && !process.argv.includes("--force")) {
    console.log(`-- ${dish} 已有`);
    continue;
  }
  console.log(`\n── ${prov} / ${dish} ──`);
  const items = bingImages(dish);
  console.log(`  候选 ${items.length} 条`);
  let saved = 0;
  for (const it of items) {
    if (saved >= PER) break;
    let buf;
    try {
      buf = curl(it.murl, { bin: true });
    } catch {
      if (!it.turl) continue;
      try {
        buf = curl(it.turl, { bin: true });
      } catch {
        continue;
      }
    }
    if (!buf || buf.length < 20000) continue;
    // 只认真正的图片（jp/png/webp 魔数）
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isWebp = buf.subarray(8, 12).toString() === "WEBP";
    if (!isJpg && !isPng && !isWebp) continue;
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    if (seenHash.has(hash)) continue;
    seenHash.add(hash);

    const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
    // 文件名安全化：名录里有「扬州市中国雕版印刷博物馆/扬州博物馆」这类带路径分隔符的名字，
    // 直接拿来做文件名会 ENOENT 并中断整批；报告里的 dish 仍保留原名（烘焙靠它回查）。
    const safeDish = dish.replace(/[/\\:*?"<>|]/g, "-");
    const file = path.join(OUT_DIR, `${safeDish}-${saved + 1}.${ext}`);
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
    console.log(
      `  ✓ ${path.basename(file)}  ${Math.round(buf.length / 1024)}KB  ← ${it.host}`,
    );
  }
  if (!saved) console.log("  ✗ 没有可用图");
  if (report.length % 10 === 0) flushReport();
  await sleep(150);
}

flushReport();
console.log(`\n共 ${report.length} 张 → public/dishes/_candidates/`);
console.log(
  "挑好之后改名成「景点名.jpg」移到 public/spots/，再跑 npm run spots",
);
