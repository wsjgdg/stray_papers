/**
 * 构建时烘焙真实名山路线高程：Open-Meteo Elevation API（免费、无 key）
 * → src/lib/mountain-routes.generated.ts。
 *
 * 路线为关键节点（近似坐标）折线按弧长均分插值 ~72 个采样点（每段按长度比例分配），
 * 非 GPS 轨迹；距离按相邻采样点 haversine 累计 × 1.25 绕行系数。
 * 每条路线 maxElevation 与公开真值对比，偏差 >80m 时 console.warn 标记（仍输出）。
 *
 * 用法：node scripts/fetch-mountain-routes.mjs（需联网；每批 ≤100 坐标，失败重试 2 次后线性补）
 */
import fs from "node:fs";
import path from "node:path";

const EARTH_R = 6371; // km
const SAMPLES = 72;
const WIND_FACTOR = 1.25; // 路线非直线，折线长 × 1.25 估实际里程
const BATCH = 100; // Open-Meteo elevation 单次最多 100 个坐标
const API = "https://api.open-meteo.com/v1/elevation";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  {
    id: "taishan",
    name: "泰山 · 红门经典线",
    city: "泰安",
    spots: ["泰山风景区"],
    durationHours: 6,
    truthMaxEle: 1545, // 玉皇顶
    summary:
      "泰山为五岳之首，红门经典线是最传统的登山道，从红门出发经中天门、十八盘拾级而上，历代摩崖石刻与古庙宇沿途不断。登顶玉皇顶海拔约 1545 米，「五岳独尊」石刻与日出云海是全程的最好回报。",
    waypoints: [
      { name: "红门", lat: 36.2364, lng: 117.1056 },
      { name: "斗母宫", lat: 36.241, lng: 117.108 },
      { name: "中天门", lat: 36.2452, lng: 117.113 },
      { name: "云步桥", lat: 36.25, lng: 117.112 },
      { name: "十八盘底", lat: 36.254, lng: 117.1108 },
      { name: "南天门", lat: 36.2558, lng: 117.1093 },
      { name: "玉皇顶", lat: 36.2566, lng: 117.106 },
    ],
  },
  {
    id: "huangshan",
    name: "黄山 · 前山慈光阁线",
    city: "黄山",
    spots: ["黄山风景区"],
    durationHours: 5,
    truthMaxEle: 1860, // 光明顶
    summary:
      "黄山以奇松、怪石、云海、温泉「四绝」闻名，前山慈光阁线经半山寺至玉屏楼，可近观迎客松与天都峰险峻的山体。再经莲花峰脚登临光明顶（海拔约 1860 米），地势平缓开阔，是观日出与云海的经典位置。",
    waypoints: [
      { name: "慈光阁", lat: 30.131, lng: 118.17 },
      { name: "半山寺", lat: 30.126, lng: 118.168 },
      { name: "玉屏楼", lat: 30.1215, lng: 118.1665 },
      { name: "莲花峰", lat: 30.118, lng: 118.1655 },
      { name: "光明顶", lat: 30.13, lng: 118.157 },
    ],
  },
  {
    id: "emei",
    name: "峨眉山 · 报国寺至金顶",
    city: "乐山",
    spots: ["峨眉山风景区"],
    durationHours: 10,
    truthMaxEle: 3079, // 金顶
    summary:
      "峨眉山是中国四大佛教名山之一，从报国寺出发的传统徒步线经清音阁、洪椿坪、洗象池一路穿林而上，山路悠长而清幽。终点的金顶海拔约 3079 米，十方普贤金像、云海与佛光让整日攀登物超所值。",
    waypoints: [
      { name: "报国寺", lat: 29.562, lng: 103.345 },
      { name: "清音阁", lat: 29.548, lng: 103.354 },
      { name: "洪椿坪", lat: 29.533, lng: 103.348 },
      { name: "洗象池", lat: 29.526, lng: 103.34 },
      { name: "雷洞坪", lat: 29.518, lng: 103.336 },
      { name: "接引殿", lat: 29.5195, lng: 103.3335 },
      { name: "金顶", lat: 29.521, lng: 103.332 },
    ],
  },
  {
    id: "huashan",
    name: "华山 · 玉泉院至东峰",
    city: "渭南",
    spots: ["华山风景区"],
    durationHours: 7,
    truthMaxEle: 2090, // 东峰（约）
    summary:
      "华山素有「奇险天下第一山」之称，从玉泉院沿「自古华山一条路」经回心石攀上北峰，再过苍龙岭、金锁关登临东峰。东峰即朝阳峰，海拔约 2090 米，是华山观日出的最经典位置。",
    waypoints: [
      { name: "玉泉院", lat: 34.475, lng: 110.08 },
      { name: "回心石", lat: 34.478, lng: 110.083 },
      { name: "北峰", lat: 34.48, lng: 110.087 },
      { name: "苍龙岭", lat: 34.477, lng: 110.091 },
      { name: "金锁关", lat: 34.474, lng: 110.093 },
      { name: "南峰", lat: 34.4752, lng: 110.0695 },
      { name: "西峰", lat: 34.4758, lng: 110.0735 },
      { name: "东峰", lat: 34.476, lng: 110.097 },
    ],
  },
];

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

// 折线按弧长均分 n 个采样点（每段按长度比例分配采样密度），首尾采样点即首尾关键节点
function samplePolyline(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const samples = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const segLen = cum[seg + 1] - cum[seg] || 1e-12;
    const t = Math.min(1, Math.max(0, (s - cum[seg]) / segLen));
    samples.push({
      lat: pts[seg].lat + (pts[seg + 1].lat - pts[seg].lat) * t,
      lng: pts[seg].lng + (pts[seg + 1].lng - pts[seg].lng) * t,
    });
  }
  return { samples, vertexKm: cum, polylineKm: total };
}

// Open-Meteo elevation：分批 ≤100 坐标，失败重试 2 次，仍失败该批置 null（后续线性补）
async function fetchElevations(points, label) {
  const out = new Array(points.length).fill(null);
  const batches = Math.ceil(points.length / BATCH);
  for (let b = 0; b < batches; b++) {
    const batch = points.slice(b * BATCH, (b + 1) * BATCH);
    const lat = batch.map((p) => p.lat.toFixed(4)).join(",");
    const lng = batch.map((p) => p.lng.toFixed(4)).join(",");
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`${API}?latitude=${lat}&longitude=${lng}`, {
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!Array.isArray(j.elevation) || j.elevation.length !== batch.length)
          throw new Error("响应缺 elevation 数组");
        j.elevation.forEach((v, k) => (out[b * BATCH + k] = Number(v)));
        break;
      } catch (e) {
        if (attempt === 2)
          console.warn(
            `  ⚠ ${label} 批次 ${b + 1} 三次尝试失败（${e.message}），用相邻点线性补`,
          );
        else await sleep(800 * (attempt + 1));
      }
    }
    await sleep(250); // 控制请求频率
  }
  return out;
}

// 缺失海拔：取两侧最近已知值线性插值（边界侧取最近已知值）
function fillMissing(eles) {
  if (!eles.some((v) => v !== null)) return eles;
  for (let i = 0; i < eles.length; i++) {
    if (eles[i] !== null) continue;
    let lo = i;
    let hi = i;
    while (lo >= 0 && eles[lo] === null) lo--;
    while (hi < eles.length && eles[hi] === null) hi++;
    const a = lo >= 0 ? eles[lo] : eles[hi];
    const b = hi < eles.length ? eles[hi] : eles[lo];
    eles[i] =
      lo >= 0 && hi < eles.length ? a + ((b - a) * (i - lo)) / (hi - lo) : a;
  }
  return eles;
}

const results = [];
let realCount = 0;
let filledCount = 0;

for (const route of ROUTES) {
  console.log(`▲ ${route.name}`);
  const { samples, vertexKm, polylineKm } = samplePolyline(
    route.waypoints,
    SAMPLES,
  );
  // 采样点 + 原始关键节点一起查海拔（关键节点取坐标处的真实值）
  const query = [...samples, ...route.waypoints];
  const raw = await fetchElevations(query, route.id);
  const real = raw.filter((v) => v !== null).length;
  filledCount += raw.length - real;
  realCount += real;
  if (real === 0) {
    console.error(
      `✗ ${route.id}: Open-Meteo 连续失败（0/${raw.length} 点成功），终止不输出`,
    );
    process.exit(1);
  }
  const eles = fillMissing(raw);
  const sampleEle = eles.slice(0, samples.length);
  const wpEle = eles.slice(samples.length);

  // 累计距离：相邻采样点 haversine 之和 × 1.25（profile km 与 distanceKm 同源，保证末点一致）
  let dist = 0;
  const sampleKm = samples.map((s, i) => {
    if (i > 0) dist += haversine(samples[i - 1], s);
    return Number((dist * WIND_FACTOR).toFixed(2));
  });
  const distanceKm = Number((dist * WIND_FACTOR).toFixed(2));
  let gain = 0;
  for (let i = 1; i < sampleEle.length; i++)
    gain += Math.max(0, sampleEle[i] - sampleEle[i - 1]);
  const maxElevation = Math.max(...sampleEle);

  const diff = Math.round(maxElevation - route.truthMaxEle);
  if (Math.abs(diff) > 80)
    console.warn(
      `  ⚠ sanity：maxElevation ${Math.round(maxElevation)}m 与真值 ${route.truthMaxEle}m 相差 ${diff > 0 ? "+" : ""}${diff}m（>80m），请核对关键节点坐标`,
    );
  console.log(
    `  max ${Math.round(maxElevation)}m（真值 ${route.truthMaxEle}m，偏差 ${diff > 0 ? "+" : ""}${diff}m）· ` +
      `${distanceKm.toFixed(1)}km · 爬升 ${Math.round(gain)}m · ${samples.length} 采样` +
      (real < raw.length ? ` · ${raw.length - real} 点线性补` : ""),
  );

  // 90m 网格对窄脊峰顶有平滑低估——统计卡用官方公布峰顶（公知事实），
  // 剖面曲线保留真实采样值，前端注脚说明分辨率。
  const officialMax = route.truthMaxEle;
  results.push({
    id: route.id,
    name: route.name,
    city: route.city,
    summary: route.summary,
    distanceKm,
    elevationGain: Math.round(officialMax - Math.min(...sampleEle)),
    maxElevation: officialMax,
    durationHours: route.durationHours,
    spots: route.spots,
    profile: samples.map((s, i) => ({
      km: sampleKm[i],
      ele: Math.round(sampleEle[i]),
    })),
    waypoints: route.waypoints.map((w, i) => ({
      name: w.name,
      km: Number((vertexKm[i] * WIND_FACTOR).toFixed(2)),
      ele: Math.round(wpEle[i]),
    })),
  });
}

const ts = `// GENERATED by scripts/fetch-mountain-routes.mjs — Open-Meteo Elevation 真实高程采样
// 路径为关键节点直线插值（非 GPS 轨迹），距离含 1.25 绕行系数。不要手改。
export interface MountainRoute {
  id: string; name: string; city: string; summary: string;
  distanceKm: number; elevationGain: number; maxElevation: number; durationHours: number;
  spots: string[];
  profile: { km: number; ele: number }[];
  waypoints: { name: string; km: number; ele: number }[];
}
export const MOUNTAIN_ROUTES: MountainRoute[] = ${JSON.stringify(results, null, 2)};
`;
const outPath = path.resolve("src/lib/mountain-routes.generated.ts");
fs.writeFileSync(outPath, ts, "utf8"); // utf8 无 BOM
console.log(
  `\n${results.length} 条路线（${realCount} 点真实海拔${filledCount ? `，${filledCount} 点线性补` : ""}）→ src/lib/mountain-routes.generated.ts`,
);
