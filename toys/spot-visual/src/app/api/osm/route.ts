import { NextResponse } from "next/server";
import { PROVINCE_CENTERS } from "@/lib/china-centers";
import { CITY_CENTERS } from "@/lib/city-centers.generated";
import { wgs84ToGcj02 } from "@/lib/coord-transform";

// ════════════════════════════════════════════════════════════════════
// OSM 实时景点探索 API
// 数据源：OpenStreetMap（Nominatim 地理编码 + Overpass 兴趣点查询）
// 许可：ODbL（https://www.openstreetmap.org/copyright）
// 设计原则：实时优先 + 内置兜底。任何网络/限流/解析失败都返回 { source:'error' }，
//           由前端保留内置示例景点（spot-data.ts 的 sampleSpots），保证离线可用。
// ════════════════════════════════════════════════════════════════════

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// 多端点降级：主站 interpreter 在部分国内网络被阻断（status 端点通但 POST 不通，实测），
// overpass.osm.ch（瑞士镜像，全量数据）实测可达。逐个尝试直到成功。
// 端点表只保留主站：osm.ch 是瑞士区域镜像（对中国的查询恒返 200 + 0 条，属静默失败，比报错更糟，已移除）。
// 部署环境对主站是 ECONNREFUSED（传输层拒绝）——若平台放行白名单后本链路即刻可用；
// 长期方案：接高德/腾讯 POI（国内直连、免费配额，待 AMAP_KEY）。
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter"];
const UA =
  "HuaxiaExplore/1.0 (1024 Creator Festival demo; contact: festival-demo@example.com)";

// 简单的内存缓存，避免重复打 OSM（限流友好）
const cache = new Map<string, { ts: number; payload: unknown }>();
const TTL = 1000 * 60 * 30; // 30 分钟

// 熔断：Overpass 在当前部署环境不可达（实测 406 / 超时）。失败后冷却期内直接秒回，
// 不再让每个请求都干等 4~8 秒（旧行为：9s 后才报错）。
const DOWN_COOLDOWN = 1000 * 60 * 10; // 10 分钟
let overpassDownUntil = 0;
const downMessage = (msg: string, city: string) => ({
  source: "unavailable",
  message: `实时通道当前不可用（${msg}），已直接用内置景点库。稍后会自动重试，期间不再等待。`,
  city,
  count: 0,
  spots: [],
});

interface OsmTag {
  [k: string]: string;
}

function inferCategory(tags: OsmTag): string {
  const tourism = tags.tourism;
  const amenity = tags.amenity;
  const historic = tags.historic;
  const natural = tags.natural;
  if (historic || tourism === "museum") return "历史人文";
  if (
    tourism === "theme_park" ||
    amenity === "theme_park" ||
    tourism === "zoo" ||
    tourism === "aquarium"
  )
    return "主题乐园";
  if (
    tourism === "viewpoint" ||
    natural === "peak" ||
    natural === "volcano" ||
    natural === "mountain_range"
  )
    return "山岳景区";
  if (
    natural === "beach" ||
    natural === "water" ||
    natural === "coastline" ||
    natural === "bay"
  )
    return "海滨度假";
  if (amenity === "restaurant" || amenity === "cafe" || amenity === "fast_food")
    return "美食小吃";
  if (
    tourism === "attraction" ||
    tourism === "gallery" ||
    tourism === "artwork"
  )
    return "城市地标";
  if (natural) return "自然风光";
  return "城市地标";
}

function buildFacilities(tags: OsmTag): string[] {
  const f: string[] = [];
  if (tags.fee === "yes" || tags.fee === "1") f.push("收费");
  if (tags.wheelchair === "yes") f.push("无障碍");
  if (tags.toilets === "yes") f.push("卫生间");
  if (tags.website) f.push("官网");
  if (tags.opening_hours) f.push("分时段开放");
  return f;
}

// 提取 OSM 实拍图：只收 http(s) 直链；File: 形式与 Wikimedia 域名跳过
// （upload.wikimedia.org 国内不可达，README 实测；失效外链由前端二级降级兜底）
function extractOsmImages(tags: OsmTag): { image: string; photos: string[] } {
  const urls: string[] = [];
  const keys = [
    "image",
    "image:0",
    "image:1",
    "image:2",
    "image:3",
    "photo",
    "photo:0",
  ];
  for (const k of keys) {
    const v = tags[k];
    if (!v) continue;
    const t = v.trim();
    if (
      /^https?:\/\//i.test(t) &&
      !/wikimedia|wikipedia/i.test(t) &&
      !urls.includes(t)
    ) {
      urls.push(t);
    }
  }
  return { image: urls[0] ?? "", photos: urls.slice(1) };
}

function buildDescription(tags: OsmTag, city: string): string {
  if (tags.description) {
    const d = tags.description.trim();
    return d.length > 160 ? d.slice(0, 160) + "…" : d;
  }
  const parts: string[] = [];
  if (tags.website) parts.push("官网：" + tags.website);
  if (tags.opening_hours) parts.push("开放时间：" + tags.opening_hours);
  if (tags.phone) parts.push("电话：" + tags.phone);
  const base = `来自 OpenStreetMap 的实时景点数据（${city}），由社区贡献维护。`;
  return parts.length ? base + " " + parts.join("；") : base;
}

function mapElement(
  el: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: OsmTag;
  },
  city: string,
) {
  const tags = el.tags || {};
  const imgs = extractOsmImages(tags);
  const name = tags.name || tags["name:zh"] || tags["name:en"] || "未命名景点";
  const rawLat = el.lat ?? el.center?.lat;
  const rawLng = el.lon ?? el.center?.lon;
  // OSM 返回 WGS84 坐标；应用内所有坐标出口（ECharts 中国地图渲染、
  // uri.amap.com 导航链接）全部按 GCJ02 火星坐标，进响应前必须统一转换，
  // 否则地图偏 300~500m、导航指到隔壁街。
  const gcj =
    rawLat != null && rawLng != null ? wgs84ToGcj02(rawLng, rawLat) : null;
  const lat = gcj?.lat;
  const lng = gcj?.lng;
  const addressParts = [
    tags["addr:city"] || city,
    tags["addr:district"] || tags["addr:suburb"],
    tags["addr:street"],
  ].filter(Boolean);
  const address = addressParts.length
    ? addressParts.join("")
    : `${city}（OpenStreetMap）`;
  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    image: imgs.image,
    photos: imgs.photos.length ? imgs.photos : undefined,
    imageSource: imgs.image ? "osm" : undefined,
    address,
    facilities: buildFacilities(tags),
    projects: [],
    category: inferCategory(tags),
    description: buildDescription(tags, city),
    location: lat != null && lng != null ? { lat, lng } : undefined,
  };
}

function localBbox(
  lng: number,
  lat: number,
  deg: number,
): { lat: number; lng: number; bbox: [number, number, number, number] } {
  return { lat, lng, bbox: [lat - deg, lng - deg, lat + deg, lng + deg] };
}

// 地理编码本地化：Nominatim 在国内网络不可达（实测超时），而 Overpass 可达。
// 城市坐标查本地表（public/geo 生成的全国市级中心），零网络零延迟；
// 未命中再走省级中心（兜直辖市/省名输入）；最后 Nominatim 短超时兜底县级市等长尾。
async function geocode(city: string): Promise<{
  lat: number;
  lng: number;
  bbox: [number, number, number, number];
}> {
  const raw = city.trim();
  const short =
    raw.replace(
      /(市|地区|自治州|盟|林区|省|特别行政区|维吾尔自治区|回族自治区|自治区)$/,
      "",
    ) || raw;

  // 1) 本地城市表（全称 + 简称双键）
  const cityHit = CITY_CENTERS[raw] ?? CITY_CENTERS[short];
  if (cityHit) return localBbox(cityHit[0], cityHit[1], 0.25);

  // 2) 省级中心（直辖市、省名输入；键为省级简称）
  const prov = PROVINCE_CENTERS[short];
  if (prov) return localBbox(prov[0], prov[1], 0.6);

  // 3) Nominatim 兜底（长尾：县级市/景区名；超时缩到 5s，不可达时快速失败）
  const url = `${NOMINATIM}?q=${encodeURIComponent(raw)}&format=json&limit=1&accept-language=zh-CN`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "zh-CN" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const arr = (await res.json()) as Array<{
    lat: string;
    lon: string;
    boundingbox?: string[];
  }>;
  if (!arr.length) throw new Error("city_not_found");
  const hit = arr[0];
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  let bbox: [number, number, number, number];
  if (hit.boundingbox && hit.boundingbox.length === 4) {
    const [s, n, w, e] = hit.boundingbox.map(Number);
    bbox = [s, w, n, e];
  } else {
    bbox = [lat - 0.2, lng - 0.2, lat + 0.2, lng + 0.2];
  }
  return { lat, lng, bbox };
}

async function queryOverpass(
  bbox: [number, number, number, number],
  limit: number,
): Promise<unknown[]> {
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
  let lastErr: unknown = new Error("no endpoint attempted");
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(q),
        // 4.5s：正常镜像 ~2s；过短会掐死稍慢的正常查询，
        // 过长则纯浪费（本部署环境实测不可达，靠熔断兜住）
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      // Overpass 报错（语法/限流）返回 XML 错误页，res.json() 会抛
      // "Unexpected token '<'" 把真实错误吞掉——先按文本读，透出错误原文
      const text = (await res.text()).trim();
      if (!text.startsWith("{")) {
        const plain = text
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        throw new Error(`Overpass 返回非 JSON：${plain || "空响应"}`);
      }
      const json = JSON.parse(text) as { elements?: unknown[] };
      return json.elements || [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") || "北京").trim();
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 10),
    80,
  );
  const key = `${city.toLowerCase()}|${limit}`;

  // 命中缓存直接返回
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json({ ...(cached.payload as object), cached: true });
  }

  // 熔断期内秒回，不再让用户干等上游超时
  if (Date.now() < overpassDownUntil) {
    return NextResponse.json(downMessage("上游近期不可达，冷却中", city), {
      headers: { "cache-control": "no-store" },
    });
  }

  try {
    const { bbox } = await geocode(city);
    const elements = (await queryOverpass(bbox, limit)) as Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: OsmTag;
    }>;
    // 过滤掉无名称与无坐标的噪声，按名称去重
    const seen = new Set<string>();
    const spots: ReturnType<typeof mapElement>[] = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name || tags["name:zh"] || tags["name:en"];
      if (!name) continue;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      spots.push(mapElement(el, city));
    }
    if (spots.length === 0) {
      const payload = {
        source: "error",
        message: `OpenStreetMap 未返回「${city}」的景点，请尝试其他城市，或继续使用内置示例。`,
        city,
        count: 0,
        spots: [],
      };
      return NextResponse.json(payload);
    }
    const payload = { source: "osm", city, count: spots.length, spots };
    cache.set(key, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    // 分级提示：连接类失败 ≠ 城市无数据，不要误导用户换城市重试
    const connectivity =
      /ECONNREFUSED|fetch failed|aborted|timeout|Overpass|EAI_AGAIN|ENOTFOUND/i.test(
        msg,
      );
    // 上游不可达才熔断；「城市查不到」这类业务错误不冷却
    if (connectivity) overpassDownUntil = Date.now() + DOWN_COOLDOWN;
    return NextResponse.json(
      connectivity
        ? downMessage(msg, city)
        : {
            source: "error",
            message: `实时数据获取失败（${msg}），已保留内置景点库。可换个城市名试试，或直接浏览库内景点。`,
            city,
            count: 0,
            spots: [],
          },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
