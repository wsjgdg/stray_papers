// ════════════════════════════════════════════════════════════════════════
// 省级下钻：按需加载市级矢量边界
//
// 数据源：
// - 33 个省级行政区：DataV GeoAtlas（阿里）地级边界，areas_v3/bound/{adcode}_full.json
// - 台湾省：DataV 未提供县市级拆分（v3 404、v2 只有整省 1 个要素），
//   取自 GeoJSON.cn 的台湾 20 县市边界，已转成与 DataV 同构的 FeatureCollection
// 合规说明：与省级图同源思路，均为矢量静态可视化，非在线地图服务，不请求境外瓦片。
//
// 视野计算（重要）：
//   ECharts 默认按整个 FeatureCollection 的包围盒适配。海南下辖三沙市，其岛礁
//   一直延伸到北纬 3.84°（南海诸岛），会导致海南本岛被压缩到画布顶部。
//   因此这里用「离群要素剔除」计算建议视野 viewBounds，并交由图表的
//   boundingCoords 使用；被剔除的要素仍在数据里（可被清单/详情访问），
//   只是不在初始视野内，由调用方给出提示。
// ════════════════════════════════════════════════════════════════════════

// 注意：必须从 china-adcodes 取（纯字面量）。若从 china-geo 取，会把该文件顶层的
// 582KB 全国 GeoJSON 一并打进本模块的调用方 bundle（/food 首屏曾因此变重）。
import { PROVINCE_ADCODE } from './china-adcodes';
import { cityLabel } from './food-city';
import { withSharecode } from './share-link';

export interface CityFeature {
  /** 展示简称，同时作为 ECharts feature name */
  label: string;
  /** 行政区全称 */
  fullName: string;
  /** 中心点 [lng, lat]，缺失为 null */
  center: [number, number] | null;
}

export type Bounds = [[number, number], [number, number]];

export interface CityGeo {
  /** ECharts registerMap 使用的名称 */
  mapName: string;
  /** 已把 feature name 改写为简称的 GeoJSON */
  geo: unknown;
  cities: CityFeature[];
  /** 建议初始视野（经纬度包围盒），已剔除让主陆地失衡的离群岛屿 */
  viewBounds: Bounds;
  /** 被剔除出初始视野的要素（如海南三沙市） */
  offscreen: CityFeature[];
}

type RawFeature = {
  properties?: { name?: string; center?: number[]; centroid?: number[] };
  geometry?: { type?: string; coordinates?: unknown };
};
type RawGeo = { features?: RawFeature[] };
type Box = [number, number, number, number]; // minLng, minLat, maxLng, maxLat

export function cityMapName(province: string): string {
  return `cn-city-${PROVINCE_ADCODE[province] ?? province}`;
}

const cache = new Map<string, CityGeo>();
const inflight = new Map<string, Promise<CityGeo>>();

function walkBox(coords: unknown, box: Box) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') {
    const [x, y] = coords as [number, number];
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
    return;
  }
  for (const c of coords) walkBox(c, box);
}

function geometryBox(f: RawFeature): Box | null {
  if (!f.geometry?.coordinates) return null;
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  walkBox(f.geometry.coordinates, box);
  return Number.isFinite(box[0]) ? box : null;
}

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

function polygonArea(rings: number[][][]): number {
  if (!Array.isArray(rings) || !rings.length) return 0;
  let a = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]);
  return Math.max(a, 0);
}

function geometryArea(g?: { type?: string; coordinates?: unknown }): number {
  if (!g?.coordinates) return 0;
  if (g.type === 'Polygon') return polygonArea(g.coordinates as number[][][]);
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as number[][][][]).reduce((s, p) => s + polygonArea(p), 0);
  }
  return 0;
}

/**
 * 计算初始视野，剔除「散布型远海岛礁」。
 *
 * 判据不是「离中心远」——那会误伤大兴安岭、阿里、榆林这些正常的大区域——
 * 而是「包围盒跨 4° 以上、但实际占地不到包围盒 2%」：这种要素是散落在大洋上的
 * 岛礁（典型即海南三沙市，包围盒 8.4°×15.7°、填充率仅 0.29%），用它的包围盒
 * 定视野会把主陆地压成一条。
 * 实测全库 475+ 个要素中只有三沙命中此判据（昆玉 1.57%、大兴安岭/阿里等地填充率均远高）。
 */
function computeView(
  boxes: (Box | null)[],
  features: RawFeature[],
): { bounds: Bounds; offscreenIdx: number[] } {
  const union = (idxs: number[]): Box => {
    const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of idxs) {
      const bx = boxes[i];
      if (!bx) continue;
      b[0] = Math.min(b[0], bx[0]);
      b[1] = Math.min(b[1], bx[1]);
      b[2] = Math.max(b[2], bx[2]);
      b[3] = Math.max(b[3], bx[3]);
    }
    return Number.isFinite(b[0]) ? b : [0, 0, 0, 0];
  };
  const all = () => features.map((_, i) => i);

  const offscreenIdx: number[] = [];
  features.forEach((f, i) => {
    const box = boxes[i];
    if (!box) return;
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    const fill = geometryArea(f.geometry) / Math.max(w * h, 1e-12);
    if ((w > 4 || h > 4) && fill < 0.02) offscreenIdx.push(i);
  });

  const keep = all().filter((i) => !offscreenIdx.includes(i));
  const useIdx = keep.length >= 3 ? keep : all();
  const b = union(useIdx);
  // 4% 留白，避免边缘要素贴边
  const padLng = Math.max((b[2] - b[0]) * 0.04, 0.01);
  const padLat = Math.max((b[3] - b[1]) * 0.04, 0.01);
  return {
    bounds: [[b[0] - padLng, b[1] - padLat], [b[2] + padLng, b[3] + padLat]],
    offscreenIdx: useIdx === keep ? offscreenIdx : [],
  };
}

async function fetchCityGeo(province: string): Promise<CityGeo> {
  const adcode = PROVINCE_ADCODE[province];
  if (!adcode) throw new Error('未知省份');

  // 部署环境对 /geo/*.json 同样校验 sharecode，必须透传，否则线上 403
  const res = await fetch(withSharecode(`/geo/${adcode}.json`), { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = (await res.json()) as RawGeo;
  const features = raw.features ?? [];
  if (!features.length) throw new Error('边界数据为空');

  const geo = JSON.parse(JSON.stringify(raw)) as { features: RawFeature[] };

  // 先算简称，出现重名（如新竹市/新竹县、嘉义市/嘉义县）时全部退回全称，保证唯一且可读
  const rawNames = features.map((f) => f.properties?.name ?? '');
  const labels = rawNames.map((n) => cityLabel(n));
  const count = new Map<string, number>();
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1);

  const cities: CityFeature[] = features.map((f, i) => {
    const label = (count.get(labels[i]) ?? 0) > 1 ? rawNames[i] : labels[i];
    if (geo.features[i]?.properties) geo.features[i].properties!.name = label;
    const c = f.properties?.center || f.properties?.centroid;
    return {
      label,
      fullName: rawNames[i],
      center: Array.isArray(c) && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null,
    };
  });

  const boxes = features.map(geometryBox);
  const { bounds, offscreenIdx } = computeView(boxes, features);

  const payload: CityGeo = {
    mapName: cityMapName(province),
    geo,
    cities,
    viewBounds: bounds,
    offscreen: offscreenIdx.map((i) => cities[i]),
  };
  cache.set(province, payload);
  return payload;
}

/** 带内存缓存 + 并发去重的市级边界加载 */
export function loadCityGeo(province: string): Promise<CityGeo> {
  const hit = cache.get(province);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(province);
  if (running) return running;

  const task = fetchCityGeo(province)
    .then((g) => {
      inflight.delete(province);
      return g;
    })
    .catch((e: unknown) => {
      inflight.delete(province);
      throw e;
    });

  inflight.set(province, task);
  return task;
}

export function getCachedCityGeo(province: string): CityGeo | undefined {
  return cache.get(province);
}
