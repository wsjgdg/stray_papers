// 临时出网探测：确认部署沙箱能否直连外部服务，并找出可用的 Overpass 镜像。
export const dynamic = 'force-dynamic';

const TARGETS = [
  { name: 'open-meteo', url: 'https://api.open-meteo.com/v1/forecast?latitude=22.5&longitude=114.1&daily=temperature_2m_max&forecast_days=1' },
  { name: 'overpass-api.de/status', url: 'https://overpass-api.de/api/status' },
  { name: 'overpass-api.de/interp', url: 'https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(1)%3Bout%3B' },
  { name: 'overpass.kumi.systems', url: 'https://overpass.kumi.systems/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(1)%3Bout%3B' },
  { name: 'overpass.private.coffee', url: 'https://overpass.private.coffee/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(1)%3Bout%3B' },
  { name: 'overpass.osm.jp', url: 'https://overpass.osm.jp/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(1)%3Bout%3B' },
  { name: 'overpass.osm.ch', url: 'https://overpass.osm.ch/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(1)%3Bout%3B' },
  { name: 'nominatim.osm.org', url: 'https://nominatim.openstreetmap.org/search?q=shenzhen&format=json&limit=1' },
  { name: 'unsplash', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=32' },
  { name: 'tile.openstreetmap.org', url: 'https://tile.openstreetmap.org/0/0/0.png' },
];

async function probe(name: string, url: string) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'user-agent': 'spot-visual-netcheck/1.0' },
    });
    clearTimeout(timer);
    return { name, ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    return {
      name,
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      error: err.name,
      cause: err.cause?.code ?? err.cause?.message ?? '',
    };
  }
}

const ovp = (s: string, w: string, n: string, e: string) =>
  encodeURIComponent(`[out:json][timeout:20];node["tourism"="attraction"](${s},${w},${n},${e});out center 5;`);

async function count(url: string) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'spot-visual/1.0' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (!t.trim().startsWith('{')) return { status: r.status, elements: 'non-json', head: t.slice(0, 80) };
    const j = JSON.parse(t);
    return { status: r.status, elements: (j.elements || []).length };
  } catch (e) {
    return { error: (e as Error).name };
  }
}

export async function GET() {
  const results = await Promise.all(TARGETS.map((t) => probe(t.name, t.url)));
  const HK: [string, string, string, string] = ['22.2', '114.05', '22.4', '114.25'];
  const ZH: [string, string, string, string] = ['47.35', '8.5', '47.4', '8.6'];
  const mirrors = {
    'osm.ch 香港': 'https://overpass.osm.ch/api/interpreter?data=' + ovp(...HK),
    'osm.ch 苏黎世': 'https://overpass.osm.ch/api/interpreter?data=' + ovp(...ZH),
    'mail.ru 香港': 'https://maps.mail.ru/osm/tools/overpass/api/interpreter?data=' + ovp(...HK),
    'osm.ch 深圳': 'https://overpass.osm.ch/api/interpreter?data=' + ovp('22.45', '113.95', '22.65', '114.2'),
  };
  const extra: Record<string, unknown> = {};
  for (const [k, u] of Object.entries(mirrors)) extra[k] = await count(u);
  return Response.json({ at: new Date().toISOString(), results, overpass: extra }, { headers: { 'cache-control': 'no-store' } });
}
