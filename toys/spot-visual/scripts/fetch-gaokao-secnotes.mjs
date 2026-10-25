/**
 * 下载 secnotes/gaokao（MIT）2026 年投档线，转成本项目数据格式。
 *
 * 用法：node scripts/fetch-gaokao-secnotes.mjs
 * 输出：public/data/gaokao-2026.json + gaokao-2026-batches.json（仅专科组）
 *
 * 源结构：data/by_province/{slug}/{year}_{cat}_{benke|zhuanke}.json
 *   { province, year, category, batch, count, records: [{
 *       school_code(国标码), school_name, school_province, min_score,
 *       min_rank(可空), major_group, tags[985/211/双一流/民办], origin }] }
 * 注意：secnotes 无一分一段表 → 位次直接用记录值，缺失记 0（未知）；
 * 招生计划/同比不支持（null）。
 */
import fs from "node:fs";
import path from "node:path";

const YEAR = 2026;
const BASE =
  "https://raw.githubusercontent.com/secnotes/gaokao/master/data/by_province";
const CACHE = ".cache/gaokao";

const PROVS = [
  "anhui", "beijing", "chongqing", "fujian", "guangdong", "guangxi",
  "guizhou", "hainan", "hebei", "heilongjiang", "hubei", "hunan",
  "jiangsu", "liaoning", "neimenggu", "shandong", "shanghai", "shanxi",
  "xinjiang", "zhejiang",
];
const CAT_SLUGS = ["physics", "history", "comprehensive"];
const CN = {
  anhui: "安徽", beijing: "北京", chongqing: "重庆", fujian: "福建",
  guangdong: "广东", guangxi: "广西", guizhou: "贵州", hainan: "海南",
  hebei: "河北", heilongjiang: "黑龙江", hubei: "湖北", hunan: "湖南",
  jiangsu: "江苏", liaoning: "辽宁", neimenggu: "内蒙古", shandong: "山东",
  shanghai: "上海", shanxi: "山西", xinjiang: "新疆", zhejiang: "浙江",
};

async function fetchJson(slug, name) {
  const cachePath = path.join(CACHE, `secnotes-${YEAR}-${slug}-${name}.json`);
  if (fs.existsSync(cachePath)) {
    const t = fs.readFileSync(cachePath, "utf8");
    if (t.trim().startsWith("{")) return JSON.parse(t);
  }
  const res = await fetch(`${BASE}/${slug}/${YEAR}_${name}.json`);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim().startsWith("{")) return null;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cachePath, text);
  return JSON.parse(text);
}

const flagsOf = (tags = []) =>
  (tags.includes("985") ? 1 : 0) |
  (tags.includes("211") ? 2 : 0) |
  (tags.includes("民办") ? 4 : 0);

/** records → 院校×科类去重（取专业组最低分） */
function dedupe(records) {
  const best = new Map();
  for (const r of records) {
    if (r.min_score == null) continue; // 山东等省存在 null 分记录
    const k = r.school_name;
    const prev = best.get(k);
    const row = {
      code: r.school_code || r.school_name,
      name: r.school_name,
      score: r.min_score,
      rank: r.min_rank ?? 0,
      loc: r.school_province || "",
      flags: flagsOf(r.tags),
    };
    if (!prev || row.score < prev.score) best.set(k, row);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

const provs = {};
const batchGroups = {}; // 专科
const stats = [];

for (const slug of PROVS) {
  const cats = {};
  const zb = {};
  let unis = 0;
  for (const catSlug of CAT_SLUGS) {
    for (const [suffix, isZk] of [
      ["benke", false],
      ["zhuanke", true],
    ]) {
      const d = await fetchJson(slug, `${catSlug}_${suffix}`);
      if (!d?.records?.length) continue;
      const cat = d.category; // 物理类/历史类/综合
      const rows = dedupe(d.records);
      unis += rows.length;
      const adm = rows.map((r) => [
        r.code, r.name, isZk ? "专科批" : "本科批",
        r.score, r.rank, r.loc, r.flags, null, null, null,
      ]);
      if (isZk) (zb[cat] ??= { adm: [] }).adm.push(...adm);
      else (cats[cat] ??= { adm: [] }).adm.push(...adm);
    }
  }
  if (unis) {
    provs[CN[slug]] = cats; // 直连科类层（勿再包 cats，读取器按 prov→cat 迭代）
    if (Object.keys(zb).length) batchGroups[CN[slug]] = { zhuanke: zb };
  }
  stats.push({ prov: CN[slug], unis, cats: Object.keys(cats).join("/") });
}

fs.mkdirSync("public/data", { recursive: true });
const main = {
  v: 1, year: YEAR,
  src: "secnotes/gaokao (MIT, OCR 自各省考试院官方发布)",
  provs,
};
fs.writeFileSync("public/data/gaokao-2026.json", JSON.stringify(main));
fs.writeFileSync(
  "public/data/gaokao-2026-batches.json",
  JSON.stringify({ v: 1, year: YEAR, provs: batchGroups }),
);
console.table(stats.filter((s) => s.unis));
console.log(
  `gaokao-2026.json ${(fs.statSync("public/data/gaokao-2026.json").size / 1024).toFixed(0)}KB, batches ${(fs.statSync("public/data/gaokao-2026-batches.json").size / 1024).toFixed(0)}KB`,
);
