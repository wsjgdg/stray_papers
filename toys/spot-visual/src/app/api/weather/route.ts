// ═══ 天气预报开放 API ═══
// 服务端代理 Open-Meteo（免费、无 key），延续「客户端零外链」策略。
// GET /api/weather?lat=30.5&lng=114.3
// 返回未来 7 天的逐日紫外线峰值 / 气温 / 降水概率，供 PTSI「7 日出行窗口」使用。

import { NextRequest, NextResponse } from "next/server";

interface OpenMeteoResponse {
  daily?: {
    time: string[];
    uv_index_max: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
  };
  hourly?: {
    time: string[];
    uv_index: (number | null)[];
    sunshine_duration: (number | null)[];
    cloud_cover: (number | null)[];
  };
  reason?: string;
}

// 简单内存缓存（按 0.5° 网格，30 分钟）
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json(
      { error: "BAD_PARAMS", message: "需要有效的 lat/lng 参数" },
      { status: 400 },
    );
  }

  const key = `${Math.round(lat * 2) / 2},${Math.round(lng * 2) / 2}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json(hit.data);
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&hourly=uv_index,sunshine_duration,cloud_cover` +
    `&forecast_days=7&timezone=auto`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const raw = (await res.json()) as OpenMeteoResponse;
    const daily = raw.daily;
    if (!daily?.time?.length) throw new Error("empty daily");

    const days = daily.time.map((date, i) => ({
      date,
      uvMax: daily.uv_index_max[i] ?? 0,
      tMax: daily.temperature_2m_max[i],
      tMin: daily.temperature_2m_min[i],
      precipProb: daily.precipitation_probability_max[i] ?? 0,
    }));

    // 逐小时 UV + 阴影占比（今天）：供劝退指南拨盘等按当前小时展示真实数据。
    // 阴影占比 = 100 - sunshine_duration/3600×100（该小时内实际日照秒数占满员的反面）。
    let uvToday: { hour: string; uv: number; shadow: number }[] | null = null;
    if (raw.hourly?.time?.length) {
      const today = daily.time[0];
      uvToday = raw.hourly.time
        .map((h, i) => ({
          h,
          uv: raw.hourly!.uv_index[i],
          sun: raw.hourly!.sunshine_duration?.[i],
        }))
        .filter(
          ({ h, uv }) =>
            h.startsWith(today) && uv !== null && Number.isFinite(uv),
        )
        .map(({ h, uv, sun }) => {
          const shadow =
            sun != null && Number.isFinite(sun)
              ? Math.round(100 - (sun / 3600) * 100)
              : 100 - (raw.hourly!.cloud_cover?.[Number(h.slice(0, 2))] ?? 0);
          return {
            hour: h.slice(11, 13),
            uv: Math.round((uv as number) * 10) / 10,
            shadow: Math.max(0, Math.min(100, shadow)),
          };
        });
    }

    const data = { source: "open-meteo", days, uvToday };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "UPSTREAM", message: "天气预报服务暂不可用（离线或上游限流）" },
      { status: 502 },
    );
  }
}
