// ════════════════════════════════════════════════════════════════════════
// 省级下钻：按需加载市级矢量边界
//
// 数据源：DataV GeoAtlas（阿里）地级行政区边界，随项目打包在 public/geo/。
// 合规说明：与省级图同源，均为矢量静态可视化，非在线地图服务，不请求境外瓦片。
// 台湾省（710000）目前上游未提供市级边界，加载失败时由调用方降级提示。
// ════════════════════════════════════════════════════════════════════════

import { PROVINCE_ADCODE } from './china-geo';
import { cityLabel } from './food-city';
import { withSharecode } from './share-link';

export interface CityFeature {
  /** 展示简称，同时作为 ECharts feature name */
  label: string;
  /** 行政区全称 */
  fullName: string;
  /** 中心点 [lng, lat]（GCJ-02），缺失为 null */
  center: [number, number] | null;
}

export interface CityGeo {
  /** ECharts registerMap 使用的名称 */
  mapName: string;
  /** 已把 feature name 改写为简称的 GeoJSON */
  geo: unknown;
  cities: CityFeature[];
}

type RawGeo = {
  features?: Array<{
    properties?: { name?: string; center?: number[]; centroid?: number[] };
  }>;
};

/** 省级简称 → ECharts 市级地图名 */
export function cityMapName(province: string): string {
  return `cn-city-${PROVINCE_ADCODE[province] ?? province}`;
}

const cache = new Map<string, CityGeo>();
const inflight = new Map<string, Promise<CityGeo>>();

async function fetchCityGeo(province: string): Promise<CityGeo> {
  const adcode = PROVINCE_ADCODE[province];
  if (!adcode) throw new Error('未知省份');

  // 部署环境对 /geo/*.json 同样校验 sharecode，必须透传，否则线上 403
  const res = await fetch(withSharecode(`/geo/${adcode}.json`), { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = (await res.json()) as RawGeo;
  const features = raw.features ?? [];
  if (!features.length) throw new Error('边界数据为空');

  const cities: CityFeature[] = [];
  const geo = JSON.parse(JSON.stringify(raw)) as RawGeo & { features: NonNullable<RawGeo['features']> };

  geo.features.forEach((f, i) => {
    const full = f.properties?.name ?? '';
    const label = cityLabel(full);
    if (f.properties) f.properties.name = label;
    const c = f.properties?.center || f.properties?.centroid;
    cities.push({
      label,
      fullName: full,
      center: Array.isArray(c) && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null,
    });
    // 极端情况下若出现重名，追加序号保证 ECharts feature name 唯一
    if (cities.slice(0, i).some((x) => x.label === label)) {
      if (f.properties) f.properties.name = `${label}(${i})`;
      cities[i].label = `${label}(${i})`;
    }
  });

  const payload: CityGeo = { mapName: cityMapName(province), geo, cities };
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
