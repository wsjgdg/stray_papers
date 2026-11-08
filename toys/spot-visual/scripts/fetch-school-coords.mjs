/**
 * 生成院校坐标表（地级市精度）→ src/lib/school-coords.generated.ts
 *
 * 为什么需要：地图上的院校散点原先全部落在「省会中心点 + 名字哈希抖动」，
 * 同省几十所学校堆成一坨，看起来像坐标坏了。实际上是因为我们只拿到了
 * 省级数据，没有任何院校级坐标。
 *
 * 数据来源（全部为构建时一次性拉取，运行时零请求）：
 *   1) 掌上高考公开静态 CDN www/2.0/school/list_v2.json
 *      —— 2989 所院校的 { name, p(省), c(市) }，与本站已用的省份/院校口径一致；
 *   2) public/geo/{省adcode}.json（仓库内已有的 DataV 地级边界）
 *      —— 取每个地级市的 properties.center 作为该市坐标。
 *
 * 精度说明：地级市。掌上高考的 info.json 只有 city_id / county_id，**没有经纬度**，
 * 本项目也没有高德 key，所以不做门牌级地理编码。同城院校仍会靠固定抖动展开。
 * 直辖市（北京/上海/天津/重庆）在省内 geo 里是区级要素，匹配不到「北京市」，
 * 回落到省级中心点。
 *
 * 用法：node scripts/fetch-school-coords.mjs
 * 缓存：.cache/gaokao/schools-list.json（重跑不重复下载）
 */
import fs from "node:fs";
import path from "node:path";

const CACHE = path.join(".cache", "gaokao", "schools-list.json");
const LIST_URL = "https://static-data.gaokao.cn/www/2.0/school/list_v2.json";
const OUT = path.resolve("src/lib/school-coords.generated.ts");
const GEO_DIR = path.resolve("public/geo");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
  Referer: "https://www.gaokao.cn/",
};

/** 去掉行政级别后缀，便于「长沙市」↔「长沙」互通 */
function bare(name) {
  return String(name || "")
    .replace(/(特别行政区|自治州|地区|盟|市|县|区)$/g, "")
    .trim();
}

async function fetchList() {
  if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 1000) {
    console.log(`用缓存 ${CACHE}`);
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  }
  console.log(`下载 ${LIST_URL}`);
  const res = await fetch(LIST_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`school list ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, text, "utf8");
  return JSON.parse(text);
}

/** 从仓库内已有的地级边界里取 省简称 → { 市名 → center } */
function loadCityCenters() {
  const byProvince = new Map();
  const files = fs.readdirSync(GEO_DIR).filter((f) => /^\d{6}\.json$/.test(f));
  for (const f of files) {
    let geo;
    try {
      geo = JSON.parse(fs.readFileSync(path.join(GEO_DIR, f), "utf8"));
    } catch {
      continue;
    }
    const cities = new Map();
    for (const feat of geo.features ?? []) {
      const p = feat.properties ?? {};
      const name = p.name;
      const center = p.center ?? p.centroid;
      if (!name || !Array.isArray(center) || center.length < 2) continue;
      cities.set(bare(name), [Number(center[0]), Number(center[1])]);
    }
    if (cities.size) byProvince.set(f.replace(/\.json$/, ""), cities); // 键是 6 位 adcode
  }
  return byProvince;
}

/** 省简称 → adcode（与 src/lib/china-adcodes.ts 同源，这里内联一份避免引入 TS 依赖） */
const PROV_ADCODE = {
  北京: 110000,
  天津: 120000,
  河北: 130000,
  山西: 140000,
  内蒙古: 150000,
  辽宁: 210000,
  吉林: 220000,
  黑龙江: 230000,
  上海: 310000,
  江苏: 320000,
  浙江: 330000,
  安徽: 340000,
  福建: 350000,
  江西: 360000,
  山东: 370000,
  河南: 410000,
  湖北: 420000,
  湖南: 430000,
  广东: 440000,
  广西: 450000,
  海南: 460000,
  重庆: 500000,
  四川: 510000,
  贵州: 520000,
  云南: 530000,
  西藏: 540000,
  陕西: 610000,
  甘肃: 620000,
  青海: 630000,
  宁夏: 640000,
  新疆: 650000,
  台湾: 710000,
  香港: 810000,
  澳门: 820000,
};

const INFO_CACHE = path.join(".cache", "gaokao", "school-info");

function loadGeoFeatures(adcode) {
  const file = path.join(GEO_DIR, `${adcode}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const geo = JSON.parse(fs.readFileSync(file, "utf8"));
    const m = new Map();
    for (const feat of geo.features ?? []) {
      const p = feat.properties ?? {};
      const center = p.center ?? p.centroid;
      if (typeof p.adcode !== "number" || !Array.isArray(center)) continue;
      m.set(p.adcode, [Number(center[0]), Number(center[1])]);
    }
    return m;
  } catch {
    return null;
  }
}

/** 拉单校 info.json（区县 adcode 在这里；带磁盘缓存 + 3 QPS 礼貌间隔） */
async function fetchInfo(id) {
  const cacheFile = path.join(INFO_CACHE, `${id}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } catch {
      /* 缓存坏了就重拉 */
    }
  }
  try {
    const res = await fetch(
      `https://static-data.gaokao.cn/www/2.0/school/${id}/info.json`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data ?? null;
    if (data) {
      fs.mkdirSync(INFO_CACHE, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(data), "utf8");
    }
    await new Promise((r) => setTimeout(r, 320));
    return data;
  } catch {
    return null;
  }
}

const main = async () => {
  const list = await fetchList();
  const schools = list.data ?? {};
  const cityCentersByAdcode = loadCityCenters();

  // 省名 → { 市名 → center }
  const cityOfProvince = new Map();
  for (const [prov, adcode] of Object.entries(PROV_ADCODE)) {
    const m = cityCentersByAdcode.get(String(adcode));
    if (m) cityOfProvince.set(prov, m);
  }
  console.log(`地级市中心表：${cityOfProvince.size} 个省`);

  // 本站用到的院校名（enrich 是「院校维度」的唯一来源）
  const enrich = JSON.parse(
    fs.readFileSync(path.resolve("public/data/gaokao-enrich.json"), "utf8"),
  );
  const wanted = Object.keys(enrich.unis ?? {});
  console.log(`本站院校：${wanted.length}`);

  // 名字 → { p, c }（同名取第一条）
  const meta = new Map();
  for (const [id, v] of Object.entries(schools)) {
    if (!v?.name || meta.has(v.name)) continue;
    meta.set(v.name, { p: v.p, c: v.c, id });
  }

  const out = {};
  let cityHit = 0;
  const noCityMatch = [];
  const notInList = [];

  // 同名歧义兜底：我们的数据里常有「中国石油大学」，掌上高考里是
  // 「中国石油大学(北京)」「中国石油大学(华东)」—— 只有唯一前缀命中时才采纳，
  // 有两个及以上候选就当没匹配到，交回省级中心点，绝不瞎猜。
  const prefixIndex = new Map();
  for (const n of meta.keys()) {
    const cut = n.indexOf("(") >= 0 ? n.indexOf("(") : n.indexOf("（");
    if (cut <= 0) continue;
    const base = n.slice(0, cut);
    const list = prefixIndex.get(base);
    if (list) list.push(n);
    else prefixIndex.set(base, [n]);
  }

  for (const name of wanted) {
    let m = meta.get(name);
    if (!m) {
      const cands = prefixIndex.get(name) ?? [];
      if (cands.length === 1) m = meta.get(cands[0]);
    }
    if (!m) {
      notInList.push(name);
      continue;
    }
    const cities = cityOfProvince.get(m.p);
    const coord = cities?.get(bare(m.c));
    if (!coord) {
      noCityMatch.push(`${name}(${m.p}/${m.c})`);
      continue;
    }
    // 四舍五入到 3 位小数（≈100m），足够省级视野，也让文件更小
    out[name] = [
      Math.round(coord[0] * 1000) / 1000,
      Math.round(coord[1] * 1000) / 1000,
    ];
    cityHit++;
  }

  // ── 直辖市兜底：地理上它们没有「地级市」这一层，geo 里是区级要素，
  // 所以市名匹配不上（c = 「北京市」）。这些院校改走 info.json 的 county_id
  // 再去本省 geo 里按 adcode 找区中心，得到区级精度。
  const districtFallback = (
    await Promise.all(
      noCityMatch.slice().map(async (entry) => {
        const name = entry.replace(/\(.*$/, "");
        const m = meta.get(name);
        if (!m?.id) return null;
        const adcode = Object.entries(PROV_ADCODE).find(
          ([k]) => k === m.p,
        )?.[1];
        const geo = adcode ? loadGeoFeatures(adcode) : null;
        if (!geo) return null;
        const info = await fetchInfo(m.id);
        const countyId = info?.county_id ?? info?.city_id;
        if (!countyId) return null;
        const feat = geo.get(Number(countyId));
        if (!feat) return null;
        return [name, feat];
      }),
    )
  ).filter(Boolean);

  for (const [name, coord] of districtFallback) {
    out[name] = [
      Math.round(coord[0] * 1000) / 1000,
      Math.round(coord[1] * 1000) / 1000,
    ];
    cityHit++;
  }
  const districtHit = districtFallback.length;

  const body = Object.entries(out)
    .sort(([a], [b]) => a.localeCompare(b, "zh"))
    .map(([k, v]) => `  ${JSON.stringify(k)}: [${v[0]}, ${v[1]}],`)
    .join("\n");

  const ts = `// GENERATED by scripts/fetch-school-coords.mjs
// 院校坐标（地级市精度）：掌上高考 school/list_v2.json 的 p(省)/c(市)
// ＋ 仓库内 public/geo 的地级市中心点。运行时零请求。
// 不要手改；本机重跑 node scripts/fetch-school-coords.mjs 刷新。
//
// 精度：地级市。掌上高考没有院校经纬度，本项目也没有高德 key，
// 因此不做门牌级地理编码——同城院校在地图上用固定抖动展开。
export const SCHOOL_COORDS: Record<string, [number, number]> = {
${body}
};

/** 覆盖到的院校数（用于数据来源页展示） */
export const SCHOOL_COORD_COUNT = ${cityHit};
`;

  fs.writeFileSync(OUT, ts, "utf8");
  console.log(`\n命中地级市坐标：${cityHit}/${wanted.length}`);
  console.log(
    `未在 school list 中找到：${notInList.length}（${notInList.slice(0, 5).join("、")}…）`,
  );
  console.log(
    `市名匹配不上（直辖市）：${noCityMatch.length} → 其中 ${districtHit} 所按区县 adcode 兜底成功`,
  );
  console.log(`→ ${path.relative(process.cwd(), OUT)}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
