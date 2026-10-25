// 临时出网探测：确认部署沙箱能否直连外部服务。
// 结果用于判断「实时探索 / 7 日天气窗口」是否被平台出网策略阻断。
export const dynamic = 'force-dynamic';

const TARGETS = [
  { name: 'overpass-api.de', url: 'https://overpass-api.de/api/status' },
  { name: 'overpass.osm.ch', url: 'https://overpass.osm.ch/api/status' },
  { name: 'open-meteo', url: 'https://api.open-meteo.com/v1/forecast?latitude=22.5&longitude=114.1&daily=temperature_2m_max&forecast_days=1' },
  { name: 'unsplash', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=32' },
  { name: 'pexels', url: 'https://api.pexels.com/v1/search?query=food&per_page=1' },
  { name: 'osm-tiles', url: 'https://tile.openstreetmap.org/0/0/0.png' },
];

async function probe(name: string, url: string) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return { name, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name, ok: false, status: 0, ms: Date.now() - t0, error: e instanceof Error ? e.name : 'ERR' };
  }
}

export async function GET() {
  const results = await Promise.all(TARGETS.map((t) => probe(t.name, t.url)));
  return Response.json(
    { at: new Date().toISOString(), results },
    { headers: { 'cache-control': 'no-store' } },
  );
}
