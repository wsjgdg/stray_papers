import { NextResponse } from 'next/server';

// ════════════════════════════════════════════════════════════════════
// OSM 实时景点探索 API
// 数据源：OpenStreetMap（Nominatim 地理编码 + Overpass 兴趣点查询）
// 许可：ODbL（https://www.openstreetmap.org/copyright）
// 设计原则：实时优先 + 内置兜底。任何网络/限流/解析失败都返回 { source:'error' }，
//           由前端保留内置示例景点（spot-data.ts 的 sampleSpots），保证离线可用。
// ════════════════════════════════════════════════════════════════════

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'HuaxiaExplore/1.0 (1024 Creator Festival demo; contact: festival-demo@example.com)';

// 简单的内存缓存，避免重复打 OSM（限流友好）
const cache = new Map<string, { ts: number; payload: unknown }>();
const TTL = 1000 * 60 * 30; // 30 分钟

interface OsmTag {
  [k: string]: string;
}

function inferCategory(tags: OsmTag): string {
  const tourism = tags.tourism;
  const amenity = tags.amenity;
  const historic = tags.historic;
  const natural = tags.natural;
  if (historic || tourism === 'museum') return '历史人文';
  if (tourism === 'theme_park' || amenity === 'theme_park' || tourism === 'zoo' || tourism === 'aquarium') return '主题乐园';
  if (tourism === 'viewpoint' || natural === 'peak' || natural === 'volcano' || natural === 'mountain_range') return '山岳景区';
  if (natural === 'beach' || natural === 'water' || natural === 'coastline' || natural === 'bay') return '海滨度假';
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food') return '美食小吃';
  if (tourism === 'attraction' || tourism === 'gallery' || tourism === 'artwork') return '城市地标';
  if (natural) return '自然风光';
  return '城市地标';
}

function buildFacilities(tags: OsmTag): string[] {
  const f: string[] = [];
  if (tags.fee === 'yes' || tags.fee === '1') f.push('收费');
  if (tags.wheelchair === 'yes') f.push('无障碍');
  if (tags.toilets === 'yes') f.push('卫生间');
  if (tags.website) f.push('官网');
  if (tags.opening_hours) f.push('分时段开放');
  return f;
}

function buildDescription(tags: OsmTag, city: string): string {
  if (tags.description) {
    const d = tags.description.trim();
    return d.length > 160 ? d.slice(0, 160) + '…' : d;
  }
  const parts: string[] = [];
  if (tags.website) parts.push('官网：' + tags.website);
  if (tags.opening_hours) parts.push('开放时间：' + tags.opening_hours);
  if (tags.phone) parts.push('电话：' + tags.phone);
  const base = `来自 OpenStreetMap 的实时景点数据（${city}），由社区贡献维护。`;
  return parts.length ? base + ' ' + parts.join('；') : base;
}

function mapElement(el: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: OsmTag }, city: string) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:zh'] || tags['name:en'] || '未命名景点';
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const addressParts = [tags['addr:city'] || city, tags['addr:district'] || tags['addr:suburb'], tags['addr:street']].filter(Boolean);
  const address = addressParts.length ? addressParts.join('') : `${city}（OpenStreetMap）`;
  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    image: '', // 实时数据无版权图片，前端自动降级为分类渐变占位
    address,
    facilities: buildFacilities(tags),
    projects: [],
    category: inferCategory(tags),
    description: buildDescription(tags, city),
    location: lat != null && lng != null ? { lat, lng } : undefined,
  };
}

async function geocode(city: string): Promise<{ lat: number; lng: number; bbox: [number, number, number, number] }> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(city)}&format=json&limit=1&accept-language=zh-CN`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const arr = (await res.json()) as Array<{ lat: string; lon: string; boundingbox?: string[] }>;
  if (!arr.length) throw new Error('city_not_found');
  const hit = arr[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  let bbox: [number, number, number, number];
  if (hit.boundingbox && hit.boundingbox.length === 4) {
    const [s, n, w, e] = hit.boundingbox.map(Number);
    bbox = [s, w, n, e];
  } else {
    // 无 boundingbox 时以城市中心 ±0.2° 兜底
    bbox = [lat - 0.2, lng - 0.2, lat + 0.2, lng + 0.2];
  }
  return { lat, lng, bbox };
}

async function queryOverpass(bbox: [number, number, number, number], limit: number): Promise<unknown[]> {
  const [s, w, n, e] = bbox;
  const q = `[out:json][timeout:25];
(
  node["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo|aquarium|artwork|yes)$"](${s},${w},${n},${e});
  way["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo|aquarium)$"](${s},${w},${n},${e});
  node["historic"~"^(monument|castle|ruins|archaeological_site|building|mansion|fort|tower|temple|church|chapel|mosque|shrine|memorial)$"](${s},${w},${n},${e});
  way["historic"~"^(monument|castle|ruins|archaeological_site|building|mansion|fort|tower|temple|church|chapel|mosque|shrine)$"](${s},${w},${n},${e});
  node["natural"~"^(peak|beach|viewpoint|volcano|water|coastline|bay)$"](${s},${w},${n},${e});
);
out center tags ${limit};`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements?: unknown[] };
  return json.elements || [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get('city') || '北京').trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 10), 80);
  const key = `${city.toLowerCase()}|${limit}`;

  // 命中缓存直接返回
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ ...(cached.payload as object), cached: true });
  }

  try {
    const { bbox } = await geocode(city);
    const elements = (await queryOverpass(bbox, limit)) as Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: OsmTag }>;
    // 过滤掉无名称与无坐标的噪声，按名称去重
    const seen = new Set<string>();
    const spots = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name || tags['name:zh'] || tags['name:en'];
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      spots.push(mapElement(el, city));
    }
    if (spots.length === 0) {
      const payload = { source: 'error', message: `OpenStreetMap 未返回「${city}」的景点，请尝试其他城市，或继续使用内置示例。`, city, count: 0, spots: [] };
      return NextResponse.json(payload);
    }
    const payload = { source: 'osm', city, count: spots.length, spots };
    cache.set(key, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    // 内置兜底：返回 error，前端保留内置示例景点
    return NextResponse.json({
      source: 'error',
      message: `实时数据获取失败（${msg}），已保留内置示例景点。部署到公网后 OpenStreetMap 实时数据将自动启用。`,
      city,
      count: 0,
      spots: [],
    });
  }
}
