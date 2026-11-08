/**
 * 构建时烘「景点地形坡度」：OpenTopography SRTM 30m DEM → 解析 AAIGrid →
 * 算最大坡度 + 陡坡占比 → src/lib/spot-terrain.generated.ts。
 * key 只在本机 .env（OPENTOPOGRAPHY_KEY），绝不进产物。
 *
 * 坡度算法：Horn 3×3 差分，每 cell 对相邻 cell 算 atan(Δele / Δdist)，
 * dist 用 cellsize × 纬度修正（1° 纬度 ≈ 111km，经度按 cos(lat) 修正）。
 *
 * 用法：node scripts/fetch-spot-terrain.mjs [级别5A|4A]（默认 5A）
 * 增量落盘 + 原子写（与 fetch-scenic-details 同模式）。
 */
import fs from "node:fs";
import path from "node:path";

const KEY =
  process.env.OPENTOPOGRAPHY_KEY ||
  (() => {
    for (const p of ["C:/Users/sibop/.secrets/map.env", path.resolve(".env")]) {
      if (!fs.existsSync(p)) continue;
      const m = fs.readFileSync(p, "utf8").match(/^OPENTOPOGRAPHY_KEY=(.+)$/m);
      if (m) return m[1].trim();
    }
    return "";
  })();
if (!KEY) {
  console.error("缺少 OPENTOPOGRAPHY_KEY");
  process.exit(1);
}

const LEVEL = process.argv[2] === "4A" ? "4A" : "5A";
const OUT_TS = path.resolve("src/lib/spot-terrain.generated.ts");
const CACHE = path.resolve("scripts/spot-terrain.cache.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 解析 EXTRA_SCENICS ──
const src = fs.readFileSync(
  path.resolve("src/lib/scenic-enrich.generated.ts"),
  "utf8",
);
const blocks = src
  .slice(src.indexOf("EXTRA_SCENICS"))
  .split(/\{\s*"name":/)
  .slice(1)
  .map((b) => ({
    name: b.match(/^\s*"([^"]+)"/)?.[1] ?? "",
    lng: Number(b.match(/"lng": ([\d.]+)/)?.[1] ?? 0),
    lat: Number(b.match(/"lat": ([\d.]+)/)?.[1] ?? 0),
    level: b.match(/"level": "([^"]+)"/)?.[1] ?? "",
  }))
  .filter((e) => e.name && e.level === LEVEL && e.lng && e.lat);
console.log(`${LEVEL} 条目: ${blocks.length}`);

// ── 缓存 ──
const existing = fs.existsSync(CACHE)
  ? JSON.parse(fs.readFileSync(CACHE, "utf8"))
  : {};
console.log(`已有缓存: ${Object.keys(existing).length}`);

const results = { ...existing };
let hit = 0;
let miss = 0;

// ── AAIGrid 解析 + Horn 坡度 ──
function parseAAIGrid(text) {
  const lines = text.trim().split("\n");
  const header = {};
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\w+)\s+(.+)$/);
    if (m && ["ncols", "nrows", "xllcorner", "yllcorner", "cellsize", "NODATA_value"].includes(m[1])) {
      header[m[1]] = Number(m[2]);
      dataStart = i + 1;
    } else break;
  }
  const { ncols, nrows, cellsize } = header;
  const grid = [];
  for (let i = dataStart; i < lines.length; i++) {
    const row = lines[i].trim().split(/\s+/).map(Number);
    if (row.length === ncols) grid.push(row);
  }
  return { header, ncols, nrows, cellsize, grid };
}

function computeSlope(grid, cellsize, lat) {
  // Horn 3×3 差分；纬度修正经度距离
  const nrows = grid.length;
  const ncols = grid[0].length;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const cellM = cellsize * mPerLat; // cellsize 是纬度度数
  const cellLngM = cellsize * mPerLng;

  let maxSlope = 0;
  let steepCount = 0;
  let totalCount = 0;

  for (let r = 1; r < nrows - 1; r++) {
    for (let c = 1; c < ncols - 1; c++) {
      const dzdx =
        ((grid[r - 1][c + 1] + 2 * grid[r][c + 1] + grid[r + 1][c + 1]) -
          (grid[r - 1][c - 1] + 2 * grid[r][c - 1] + grid[r + 1][c - 1])) /
        (8 * cellLngM);
      const dzdy =
        ((grid[r + 1][c - 1] + 2 * grid[r + 1][c] + grid[r + 1][c + 1]) -
          (grid[r - 1][c - 1] + 2 * grid[r - 1][c] + grid[r - 1][c + 1])) /
        (8 * cellM);
      const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
      if (slope > maxSlope) maxSlope = slope;
      if (slope > 10) steepCount++;
      totalCount++;
    }
  }
  return {
    maxSlope: Math.round(maxSlope * 10) / 10,
    steepPct: totalCount > 0 ? Math.round((steepCount / totalCount) * 100) : 0,
  };
}

async function fetchDEM(lng, lat) {
  const half = 0.05; // ±0.05° ≈ ±5.5km
  const url =
    `https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1` +
    `&south=${(lat - half).toFixed(4)}&north=${(lat + half).toFixed(4)}` +
    `&west=${(lng - half).toFixed(4)}&east=${(lng + half).toFixed(4)}` +
    `&outputFormat=AAIGrid&API_Key=${KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ── 主循环 ──
for (let i = 0; i < blocks.length; i++) {
  const e = blocks[i];
  if (results[e.name]) continue;
  try {
    const demText = await fetchDEM(e.lng, e.lat);
    const dem = parseAAIGrid(demText);
    if (dem.grid.length === 0) throw new Error("empty grid");
    const slope = computeSlope(dem.grid, dem.cellsize, e.lat);
    results[e.name] = {
      maxSlope: slope.maxSlope,
      steepPct: slope.steepPct,
    };
    hit++;
  } catch (err) {
    miss++;
    if (miss <= 5) console.log(`  MISS ${e.name}: ${err}`);
  }
  if ((i + 1) % 30 === 0) {
    flush();
    console.log(`进度 ${i + 1}/${blocks.length} 命中 ${hit} 未中 ${miss}`);
  }
  await sleep(1000); // OpenTopography 限流
}

// ── 原子写 ──
function flush() {
  fs.writeFileSync(CACHE, JSON.stringify(results, null, 2));
  const banner = `// GENERATED by scripts/fetch-spot-terrain.mjs — 景区地形坡度（OpenTopography SRTM 30m DEM，构建时烘焙）
// key 只在本机 .env，绝不进产物。maxSlope = 最大坡度（度），steepPct = 10° 以上 cells 占比。
export interface SpotTerrain {
  maxSlope: number;
  steepPct: number;
}

`;
  const body = `export const SPOT_TERRAIN: Record<string, SpotTerrain> = ${JSON.stringify(results, null, 2)};\n`;
  const tmp = OUT_TS + ".tmp";
  fs.writeFileSync(tmp, banner + body, "utf8");
  fs.renameSync(tmp, OUT_TS);
}
flush();
console.log(
  `完成：命中 ${hit}，未中 ${miss}，总 ${Object.keys(results).length} → ${OUT_TS}`,
);
