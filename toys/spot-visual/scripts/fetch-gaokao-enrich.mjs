/**
 * 下载志愿探索院校增强数据（排名 / 官方层次标签 / 学科评估）。
 *
 * 用法：node scripts/fetch-gaokao-enrich.mjs
 * 输出：public/data/gaokao-enrich.json
 *
 * 数据源：
 *   1. 软科中国大学排名（主榜）— www.shanghairanking.cn 公开 API
 *      提供排名、得分、官方 985/211/双一流标签
 *   2. 教育部第四轮学科评估（2017）— GitHub Johnnydaszhu/2017ChinaUniversityDisciplineAssessment
 *      聚合出各校 A+/A/A- 学科数与 A+ 学科名称
 */
import fs from "node:fs";
import path from "node:path";

const OUT = "public/data/gaokao-enrich.json";
const CACHE = ".cache/gaokao";
const BCUR =
  "https://www.shanghairanking.cn/api/pub/v1/bcur?bcur_type=11&year=2025";
const DISC_CSV =
  "https://raw.githubusercontent.com/Johnnydaszhu/2017ChinaUniversityDisciplineAssessment/master/" +
  encodeURIComponent("2017教育部第四轮学科评估.csv");

async function cachedFetch(url, cacheName) {
  const cachePath = path.join(CACHE, cacheName);
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, "utf8");
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cachePath, text);
  return text;
}

/** 名称归一化：去掉全角/半角括号内容与空白，供跨源匹配 */
export function normName(n) {
  return String(n)
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, "");
}

// ── 1. 软科排名 ──
const bcur = JSON.parse(await cachedFetch(BCUR, "bcur-2025.json"));
const unis = {};
let ranked = 0;
for (const it of bcur.data.rankings) {
  const rank = parseInt(it.ranking, 10); // "500+" → 500
  const key = normName(it.univNameCn);
  const entry = {
    name: it.univNameCn,
    rank: Number.isFinite(rank) ? it.ranking : null, // 原样保留（含 500+）
    rankNum: Number.isFinite(rank) ? rank : null,
    score: it.score ?? null,
    tags: it.univTags ?? [],
    category: it.univCategory ?? "",
    prov: it.province ?? "",
  };
  // 同键碰撞（如「中国矿业大学」vs「中国矿业大学（北京）」）：保留无括号的本部条目
  const prev = unis[key];
  const prefer =
    !prev || (/[（(]/.test(prev.name) && !/[（(]/.test(it.univNameCn));
  if (prefer) unis[key] = entry;
  if (Number.isFinite(rank)) ranked++;
}
console.log(`软科主榜: ${Object.keys(unis).length} 所（有确切排名 ${ranked}）`);

// ── 2. 第四轮学科评估 ──
const csv = await cachedFetch(DISC_CSV, "disc-eval-4th.csv");
const lines = csv
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter(Boolean);
const head = lines[0].split(",");
const evals = {}; // normName → { aPlus, a, aMinus, topDisc:[] }
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(",");
  const disc = cols[1],
    grade = cols[2];
  if (!disc || !grade) continue;
  for (let j = 3; j < head.length; j++) {
    const school = (cols[j] ?? "").trim();
    if (!school) continue;
    const e = (evals[normName(school)] ??= {
      aPlus: 0,
      a: 0,
      aMinus: 0,
      topDisc: [],
    });
    if (grade === "A+") {
      e.aPlus++;
      if (e.topDisc.length < 4) e.topDisc.push(disc);
    } else if (grade === "A") e.a++;
    else if (grade === "A-") e.aMinus++;
  }
}
let evalMatched = 0;
for (const k of Object.keys(unis)) {
  if (evals[k]) {
    unis[k].aPlus = evals[k].aPlus;
    unis[k].a = evals[k].a;
    unis[k].aMinus = evals[k].aMinus;
    unis[k].topDisc = evals[k].topDisc;
    evalMatched++;
  }
}
console.log(
  `学科评估: ${Object.keys(evals).length} 所，与主榜交叉命中 ${evalMatched}`,
);

// ── 3. 输出 ──
const out = {
  v: 1,
  rankSrc: "软科中国大学排名（主榜，shanghairanking.cn）",
  evalSrc: "教育部第四轮学科评估（2017，cdgdc.edu.cn）",
  unis,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`written ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);

// 抽样验证
for (const probe of [
  "清华大学",
  "哈尔滨工业大学（深圳）",
  "中国矿业大学（北京）",
  "南方科技大学",
]) {
  console.log(
    probe,
    "→",
    JSON.stringify(unis[normName(probe)] ?? null)?.slice(0, 160),
  );
}
