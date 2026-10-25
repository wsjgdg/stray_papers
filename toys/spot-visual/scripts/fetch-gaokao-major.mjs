/**
 * 下载 GaokaoCompass 专业级录取数据（major-admission），按省生成懒加载文件。
 *
 * 用法：node scripts/fetch-gaokao-major.mjs [--year 2025] [--prov henan]
 * 输出：public/data/gaokao-major/{slug}.json
 *   结构：{ v, year, cats: { 科类: { 院校名: [ [专业组, 专业名, 选科要求, 最低分, 最低位次], ... ] } } }
 *
 * 处理规则：只保留本科普通批；同（院校×专业组×专业×选科）取最低分；位次缺失用一分一段回填。
 * 数据源：HuggingFace choucsan/Gaokao-Compass-11M（MIT，经 hf-mirror.com 访问）
 */
import fs from "node:fs";
import path from "node:path";

const BASE =
  "https://hf-mirror.com/datasets/choucsan/Gaokao-Compass-11M/resolve/main";
const YEAR = Number(argValue("--year") ?? 2025);
const ONLY_PROV = argValue("--prov");
const CACHE = ".cache/gaokao";

const SLUGS = {
  anhui: "安徽", beijing: "北京", chongqing: "重庆", fujian: "福建",
  gansu: "甘肃", guangdong: "广东", guangxi: "广西", guizhou: "贵州",
  hainan: "海南", hebei: "河北", heilongjiang: "黑龙江", henan: "河南",
  hubei: "湖北", hunan: "湖南", jiangsu: "江苏", jiangxi: "江西",
  jilin: "吉林", liaoning: "辽宁", neimenggu: "内蒙古", ningxia: "宁夏",
  shaanxi: "陕西", shandong: "山东", shanghai: "上海", sichuan: "四川",
  tianjin: "天津", xinjiang: "新疆", yunnan: "云南", zhejiang: "浙江",
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function fetchCsv(slug, file, year = YEAR) {
  const cachePath = path.join(CACHE, `${year}-${slug}-${file}.csv`);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0)
    return fs.readFileSync(cachePath, "utf8");
  const url = `${BASE}/data/${year}/${slug}/${file}.csv`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cachePath, text);
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (cell !== "" || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) =>
    Object.fromEntries(head.map((h, j) => [h, (r[j] ?? "").trim()])),
  );
}

const isKeepBatch = (b) =>
  (b.includes("本科") && !b.includes("艺术") && !b.includes("体育")) ||
  b.includes("一段");
const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function rankFromCurve(curve, score) {
  if (!curve.length) return null;
  if (score >= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [s1, r1] = curve[i - 1],
      [s2, r2] = curve[i];
    if (score >= s2)
      return Math.round(r1 + ((s1 - score) / (s1 - s2)) * (r2 - r1));
  }
  return curve[curve.length - 1][1];
}

const stats = [];

for (const [slug, provName] of Object.entries(SLUGS)) {
  if (ONLY_PROV && slug !== ONLY_PROV) continue;
  const text = await fetchCsv(slug, "major-admission");
  if (!text) {
    console.warn(`skip ${slug}: no major-admission`);
    continue;
  }
  const curveText = await fetchCsv(slug, "score-range");
  const curves = {};
  if (curveText) {
    const byCat = {};
    for (const r of parseCsv(curveText)) {
      if (!isKeepBatch(r.batch)) continue;
      const s = num(r.score),
        c = num(r.cumulative_count);
      if (s === null || c === null) continue;
      (byCat[r.category] ??= []).push([s, c]);
    }
    for (const [cat, pts] of Object.entries(byCat)) {
      pts.sort((a, b) => b[0] - a[0]);
      curves[cat] = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0]);
    }
  }

  const best = new Map(); // cat\0uni\0group\0major\0subj -> [score, rank]
  for (const r of parseCsv(text)) {
    if (!isKeepBatch(r.batch)) continue;
    const minScore = num(r.min_score);
    if (minScore === null) continue;
    let minRank = num(r.min_rank);
    if (minRank === null)
      minRank = rankFromCurve(curves[r.category] ?? [], minScore);
    if (minRank === null) continue;
    const k = [
      r.category,
      r.university_name,
      r.major_group || "",
      r.major_name,
      r.subject_req || "",
    ].join("\u0000");
    const prev = best.get(k);
    if (!prev || minScore < prev[0]) best.set(k, [minScore, minRank]);
  }

  const cats = {};
  const reqs = [];
  const reqIdx = new Map();
  for (const [k, [score, rank]] of best) {
    const [cat, uni, group, major, subj] = k.split("\u0000");
    let ri = reqIdx.get(subj);
    if (ri === undefined) {
      ri = reqs.push(subj) - 1;
      reqIdx.set(subj, ri);
    }
    (cats[cat] ??= {})[uni] ??= [];
    cats[cat][uni].push([group, major, ri, score, rank]);
  }
  let total = 0;
  for (const c of Object.values(cats)) {
    for (const arr of Object.values(c)) {
      arr.sort((a, b) => b[3] - a[3]);
      total += arr.length;
    }
  }

  stats.push({ prov: provName, slug, unis: Object.values(cats).reduce((s, c) => s + Object.keys(c).length, 0), majors: total });
  if (ONLY_PROV) continue;

  const outPath = path.join("public/data/gaokao-major", `${slug}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ v: 1, year: YEAR, reqs, cats }),
  );
}

console.table(stats);
if (!ONLY_PROV) {
  const dir = "public/data/gaokao-major";
  const size = fs
    .readdirSync(dir)
    .reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  console.log(
    `written ${fs.readdirSync(dir).length} files → ${dir} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
}
