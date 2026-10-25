/**
 * 下载 GaokaoCompass 数据集（MIT）生成志愿探索真实数据文件。
 *
 * 用法：
 *   node scripts/fetch-gaokao-data.mjs [--year 2025] [--out public/data/gaokao-2025.json]
 *                                     [--prov henan] [--keep-cache]
 *
 * 数据源：HuggingFace choucsan/Gaokao-Compass-11M（经 hf-mirror.com 访问）
 * 处理规则：
 *   - 只保留本科普通批（批次名含「本科」且不含「艺术/体育」，或含「一段」）
 *   - 院校×科类去重，取专业组最低投档分（冲稳保按最保守口径）
 *   - min_rank 缺失时用一分一段表（score-range）插值回填
 *   - flags 位：1=985, 2=211, 4=民办
 */
import fs from "node:fs";
import path from "node:path";

const BASE =
  "https://hf-mirror.com/datasets/choucsan/Gaokao-Compass-11M/resolve/main";
const YEAR = Number(argValue("--year") ?? 2025);
const OUT = argValue("--out") ?? `public/data/gaokao-${YEAR}.json`;
const ONLY_PROV = argValue("--prov");
const CACHE = ".cache/gaokao";

const SLUGS = {
  anhui: "安徽",
  beijing: "北京",
  chongqing: "重庆",
  fujian: "福建",
  gansu: "甘肃",
  guangdong: "广东",
  guangxi: "广西",
  guizhou: "贵州",
  hainan: "海南",
  hebei: "河北",
  heilongjiang: "黑龙江",
  henan: "河南",
  hubei: "湖北",
  hunan: "湖南",
  jiangsu: "江苏",
  jiangxi: "江西",
  jilin: "吉林",
  liaoning: "辽宁",
  neimenggu: "内蒙古",
  ningxia: "宁夏",
  qinghai: "青海",
  shaanxi: "陕西",
  shandong: "山东",
  shanghai: "上海",
  shanxi: "山西",
  sichuan: "四川",
  tianjin: "天津",
  xinjiang: "新疆",
  xizang: "西藏",
  yunnan: "云南",
  zhejiang: "浙江",
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

/** 最小 CSV 解析（处理引号包裹；无多行字段） */
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

/** 一分一段表插值：score → 累计位次 */
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
const provs = {};

for (const [slug, provName] of Object.entries(SLUGS)) {
  if (ONLY_PROV && slug !== ONLY_PROV) continue;
  const admText = await fetchCsv(slug, "school-admission");
  if (!admText) {
    console.warn(`skip ${slug}: no school-admission`);
    continue;
  }
  const curveText = await fetchCsv(slug, "score-range");

  // 一分一段表：cat → [[score, cumRank], ...] 按分降序
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

  // 投档线：过滤 → 回填位次 → 院校×科类去重（取最低分）
  const best = new Map(); // cat\0uni -> row
  for (const r of parseCsv(admText)) {
    if (!isKeepBatch(r.batch)) continue;
    const minScore = num(r.min_score);
    if (minScore === null) continue;
    let minRank = num(r.min_rank);
    if (minRank === null)
      minRank = rankFromCurve(curves[r.category] ?? [], minScore);
    if (minRank === null) continue;
    const row = {
      cat: r.category,
      batch: r.batch,
      score: minScore,
      rank: minRank,
      code: r.university_code || r.university_name,
      name: r.university_name,
      loc: r.school_province || "",
      flags:
        (r.is_985 === "1" ? 1 : 0) |
        (r.is_211 === "1" ? 2 : 0) |
        (r.school_nature === "民办" ? 4 : 0),
    };
    if (row.rank <= 0) continue; // 无位次无法参与冲稳保计算
    const k = `${row.cat}\u0000${row.name}`;
    const prev = best.get(k);
    if (!prev || row.score < prev.score) best.set(k, row);
  }

  // 招生计划：本科批 plan_count 按院校×科类求和（当年 + 去年，用于同比）
  const planByCatUni = new Map();
  const planText = await fetchCsv(slug, "enrollment-plan");
  if (planText) {
    for (const r of parseCsv(planText)) {
      if (!isKeepBatch(r.batch)) continue;
      const p = num(r.plan_count);
      if (p === null) continue;
      const k = `${r.category}\u0000${r.university_name}`;
      planByCatUni.set(k, (planByCatUni.get(k) ?? 0) + p);
    }
  }
  const prevPlanByCatUni = new Map();
  const prevPlanText = await fetchCsv(slug, "enrollment-plan", YEAR - 1);
  if (prevPlanText) {
    for (const r of parseCsv(prevPlanText)) {
      if (!isKeepBatch(r.batch)) continue;
      const p = num(r.plan_count);
      if (p === null) continue;
      const k = `${r.category}\u0000${r.university_name}`;
      prevPlanByCatUni.set(k, (prevPlanByCatUni.get(k) ?? 0) + p);
    }
  }

  // 去年投档线：同规则取院校×科类最低分，用于同比
  const prevScore = new Map();
  const prevText = await fetchCsv(slug, "school-admission", YEAR - 1);
  if (prevText) {
    const prevBest = new Map();
    for (const r of parseCsv(prevText)) {
      if (!isKeepBatch(r.batch)) continue;
      const s = num(r.min_score);
      if (s === null) continue;
      const k = `${r.category}\u0000${r.university_name}`;
      const p = prevBest.get(k);
      if (p === undefined || s < p) prevBest.set(k, s);
    }
    for (const [k, s] of prevBest) prevScore.set(k, s);
  }

  // 近四年投档线（含当年）：per cat per uni [y-3, y-2, y-1, y]，缺年 null
  const histYears = [YEAR - 3, YEAR - 2, YEAR - 1];
  const histByCat = {};
  for (const y of histYears) {
    const t = await fetchCsv(slug, "school-admission", y);
    if (!t) continue;
    const bestY = new Map();
    for (const r of parseCsv(t)) {
      if (!isKeepBatch(r.batch)) continue;
      const sc = num(r.min_score);
      if (sc === null) continue;
      const k = `${r.category}\u0000${r.university_name}`;
      const p = bestY.get(k);
      if (p === undefined || sc < p) bestY.set(k, sc);
    }
    for (const [k, sc] of bestY) {
      const [cat, uni] = k.split("\u0000");
      const m = (histByCat[cat] ??= new Map());
      let arr = m.get(uni);
      if (!arr) {
        arr = [null, null, null, null];
        m.set(uni, arr);
      }
      arr[y - (YEAR - 3)] = sc;
    }
  }
  for (const row of best.values()) {
    const m = (histByCat[row.cat] ??= new Map());
    let arr = m.get(row.name);
    if (!arr) {
      arr = [null, null, null, null];
      m.set(row.name, arr);
    }
    arr[3] = row.score;
  }

  const cats = {};
  for (const row of best.values()) {
    const c = (cats[row.cat] ??= { adm: [] });
    c.adm.push([
      row.code,
      row.name,
      row.batch,
      row.score,
      row.rank,
      row.loc,
      row.flags,
      planByCatUni.get(`${row.cat}\u0000${row.name}`) ?? null, // 在该省该科类的本科招生计划人数
      prevScore.get(`${row.cat}\u0000${row.name}`) != null
        ? row.score - prevScore.get(`${row.cat}\u0000${row.name}`) // 投档线同比（正=涨）
        : null,
      planByCatUni.get(`${row.cat}\u0000${row.name}`) != null &&
        prevPlanByCatUni.get(`${row.cat}\u0000${row.name}`) != null
        ? planByCatUni.get(`${row.cat}\u0000${row.name}`) -
          prevPlanByCatUni.get(`${row.cat}\u0000${row.name}`) // 计划同比（正=扩招）
        : null,
    ]);
  }
  for (const [cat, c] of Object.entries(cats)) {
    c.adm.sort((a, b) => b[3] - a[3]);
    if (curves[cat]) c.curve = curves[cat];
    // 省控线：取该科类一分一段表的 control_score
    if (curveText) {
      const main = parseCsv(curveText).find(
        (r) => r.category === cat && isKeepBatch(r.batch),
      );
      if (main) c.ctrl = num(main.control_score) ?? undefined;
    }
  }

  const uniCount = best.size;
  const curveCount = Object.values(cats).reduce(
    (s, c) => s + (c.curve?.length ?? 0),
    0,
  );
  const batches = [...new Set([...parseCsv(admText)].map((r) => r.batch))];
  stats.push({
    prov: provName,
    slug,
    unis: uniCount,
    cats: Object.keys(cats).join("/"),
    curvePts: curveCount,
    batches: batches.join(","),
  });
  if (uniCount) provs[provName] = { cats };
  else console.warn(`warn ${slug}: 0 admissions after filter, skipped`);

  if (!ONLY_PROV && uniCount) {
    const histOut = {};
    for (const [cat, m] of Object.entries(histByCat)) {
      histOut[cat] = Object.fromEntries(m);
    }
    const histPath = path.join("public/data/gaokao-history", `${slug}.json`);
    fs.mkdirSync(path.dirname(histPath), { recursive: true });
    fs.writeFileSync(
      histPath,
      JSON.stringify({ v: 1, year: YEAR, years: [YEAR - 3, YEAR - 2, YEAR - 1, YEAR], cats: histOut }),
    );
  }
}

if (ONLY_PROV) {
  // 单省调试模式：只打印统计，不写文件
  console.table(stats);
  process.exit(0);
}

const out = {
  v: 1,
  year: YEAR,
  src: "GaokaoCompass (MIT) choucsan/Gaokao-Compass-11M",
  provs,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.table(stats);
console.log(`written ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
