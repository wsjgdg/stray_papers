// 从掌上高考静态 CDN（static-data.gaokao.cn）补齐一分一段表与省控线。
//
// 背景：仓库原有的 2026 数据集（secnotes OCR）只有投档线、没有一分一段，
// 导致「位次 / 同分去向 / 位次百分位」在 2026 年全部为空。这里直接取 CDN 上
// 的官方分段表补进 public/data/gaokao/{year}/{slug}.json，运行时不需要任何 API。
//
// 端点（无需认证、无需签名）：
//   .../www/2.0/section2021/dicScoreSection.json                       省份×年份×科类的 typeid/levelid
//   .../www/2.0/section2021/{year}/{provId}/{typeId}/{levelId}/lists.json  一分一段明细
//
// 使用：node scripts/fetch-gaokao-rank.mjs [--years=2026] [--force]
//   --force  已有 curve 的省份也覆盖（默认只补缺失）
import fs from "node:fs";
import path from "node:path";

const BASE = "https://static-data.gaokao.cn/www/2.0/section2021";
const QS = "?a=www.gaokao.cn";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const DELAY_MS = 350; // 友好采集：单请求间隔，避免给公共 CDN 压力

const PROV_ID = {
  北京: 11, 天津: 12, 河北: 13, 山西: 14, 内蒙古: 15, 辽宁: 21, 吉林: 22,
  黑龙江: 23, 上海: 31, 江苏: 32, 浙江: 33, 安徽: 34, 福建: 35, 江西: 36,
  山东: 37, 河南: 41, 湖北: 42, 湖南: 43, 广东: 44, 广西: 45, 海南: 46,
  重庆: 50, 四川: 51, 贵州: 52, 云南: 53, 西藏: 54, 陕西: 61, 甘肃: 62,
  青海: 63, 宁夏: 64, 新疆: 65,
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const yearArg = args.find((a) => a.startsWith("--years="));
const YEARS = yearArg
  ? yearArg.split("=")[1].split(",").map(Number)
  : [2026, 2025];

const ROOT = path.resolve(process.cwd(), "public/data/gaokao");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, retry = 2) {
  for (let i = 0; i <= retry; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.code !== "0000") throw new Error(`code ${j.code} ${j.message ?? ""}`);
      return j;
    } catch (e) {
      if (i === retry) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

/** 从 dic 里挑出与本地科类名一致的 typeId / levelId */
function resolveType(dic, provId, year, cat) {
  const y = dic[provId]?.[String(year)];
  if (!y) return null;
  let typeId = null;
  for (const [k, v] of Object.entries(y)) {
    if (k === "level" || k === "kemu") continue;
    if (v?.name === cat) typeId = v.id;
  }
  if (typeId == null) return null;
  const levels = [];
  const rawLevel = y.level;
  if (rawLevel) {
    for (const [k, v] of Object.entries(rawLevel)) {
      if (k === "kemu") continue;
      if (v?.id != null) levels.push({ id: v.id, name: v.name ?? "" });
    }
  }
  const benke = levels.find((l) => l.name.includes("本科"));
  return { typeId, levelId: benke?.id ?? levels[0]?.id ?? 1 };
}

/** lists.json → 曲线（分数降序 + 累计位次）与本科线 */
function toCurve(search) {
  const points = [];
  let ctrl;
  for (const [key, v] of Object.entries(search ?? {})) {
    const score = Number(v.score ?? key);
    const total = Number(v.total);
    if (!Number.isFinite(score) || !Number.isFinite(total)) continue;
    points.push([score, total]);
    if (ctrl == null && String(v.batch_name ?? "").includes("本科"))
      ctrl = Number(v.controlscore) || undefined;
  }
  points.sort((a, b) => b[0] - a[0]);
  return { curve: points, ctrl };
}

const main = async () => {
  console.log("拉取科类目录…");
  const dic = (await getJSON(`${BASE}/dicScoreSection.json${QS}`)).data.data;

  let filled = 0;
  let skipped = 0;
  let failed = 0;

  for (const year of YEARS) {
    const dir = path.join(ROOT, String(year));
    if (!fs.existsSync(dir)) {
      console.log(`${year}: 没有分省目录，跳过`);
      continue;
    }
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "index.json");
    const indexFile = path.join(dir, "index.json");
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));

    for (const file of files) {
      const full = path.join(dir, file);
      const pkg = JSON.parse(fs.readFileSync(full, "utf8"));
      const provId = PROV_ID[pkg.prov];
      if (!provId) {
        console.log(`  ! ${pkg.prov} 无 provinceId，跳过`);
        continue;
      }
      let dirty = false;

      for (const [cat, cd] of Object.entries(pkg.cats)) {
        const hasCurve = Array.isArray(cd.curve) && cd.curve.length > 0;
        if (hasCurve && !force) {
          skipped++;
          continue;
        }
        const t = resolveType(dic, provId, year, cat);
        if (!t) {
          console.log(`  - ${year} ${pkg.prov}/${cat} 目录里没有对应科类`);
          skipped++;
          continue;
        }
        const url = `${BASE}/${year}/${provId}/${t.typeId}/${t.levelId}/lists.json${QS}`;
        try {
          const j = await getJSON(url);
          const { curve, ctrl } = toCurve(j.data?.search);
          if (curve.length < 20) {
            console.log(`  - ${year} ${pkg.prov}/${cat} 数据点过少(${curve.length})，放弃`);
            skipped++;
            continue;
          }
          cd.curve = curve;
          if (ctrl != null) {
            cd.ctrl = ctrl;
            index.provs[pkg.prov].cats[cat].ctrl = ctrl;
          }
          dirty = true;
          filled++;
          console.log(
            `  ✓ ${year} ${pkg.prov}/${cat} ${curve.length} 点 · 本科线 ${ctrl ?? "—"} · 最高 ${curve[0][0]} 分`,
          );
        } catch (e) {
          failed++;
          console.log(`  ✗ ${year} ${pkg.prov}/${cat} ${e.message}`);
        }
        await sleep(DELAY_MS);
      }

      if (dirty) fs.writeFileSync(full, JSON.stringify(pkg));
    }

    fs.writeFileSync(indexFile, JSON.stringify(index));
  }

  console.log(
    `\n完成：补齐 ${filled} 个科类，跳过 ${skipped}，失败 ${failed}`,
  );
  if (failed) process.exitCode = 1;
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
