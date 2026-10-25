"use client";

// ═══ PTSI 7 日出行窗口 ═══
// 回答「周六去合适吗」：取一个带坐标的景点，拉未来 7 天逐日紫外线峰值，
// 按当前身体条件逐日计算 PTSI，标出本周最适合出行的一天。
// 天气走服务端代理 /api/weather（Open-Meteo），客户端保持零外链。

import { useState, useEffect, useMemo, useCallback } from "react";
import { CalendarDays, RefreshCw, MapPin, Crown } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { calcPTSI } from "@/lib/ptsi-calculator";
import { parseCoords } from "@/lib/spot-data";

interface DayRow {
  date: string;
  uvMax: number;
  tMax: number | null;
  tMin: number | null;
  precipProb: number;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const VERDICT_STYLE: Record<
  string,
  { text: string; bar: string; label: string }
> = {
  go: { text: "text-emerald-600", bar: "#10B981", label: "适合" },
  caution: { text: "text-amber-600", bar: "#F59E0B", label: "注意" },
  nogo: { text: "text-rose-500", bar: "#EF4444", label: "劝退" },
};

export default function SevenDayWindow({
  conditions,
}: {
  conditions: string[];
}) {
  const { spots, trip } = useAppStore();

  // 可选景点：有坐标的（行程单内优先排前）
  const geoSpots = useMemo(() => {
    const withGeo = spots.filter((s) => parseCoords(s) !== null);
    return [...withGeo].sort(
      (a, b) => Number(trip.includes(b.id)) - Number(trip.includes(a.id)),
    );
  }, [spots, trip]);

  const [spotId, setSpotId] = useState<string>("");
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeId = spotId || geoSpots[0]?.id || "";

  const load = useCallback(
    async (id: string) => {
      const spot = spots.find((s) => s.id === id);
      const coords = spot ? parseCoords(spot) : null;
      if (!coords) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/weather?lat=${coords.lat}&lng=${coords.lng}`,
        );
        const data = await res.json();
        if (data.error || !data.days) {
          setError(data.message || "天气数据获取失败");
          setDays(null);
        } else {
          setDays(data.days as DayRow[]);
        }
      } catch {
        setError("天气请求失败，请检查网络");
        setDays(null);
      } finally {
        setLoading(false);
      }
    },
    [spots],
  );

  useEffect(() => {
    if (activeId) load(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const rows = useMemo(() => {
    if (!days) return [];
    const scored = days.map((d) => ({
      ...d,
      result: calcPTSI(d.uvMax, conditions),
    }));
    const best = Math.max(...scored.map((s) => s.result.score));
    return scored.map((s) => ({ ...s, isBest: s.result.score === best }));
  }, [days, conditions]);

  if (geoSpots.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
        <Header />
        <p className="text-xs text-gray-400">
          当前数据集中没有带坐标（location
          字段）的景点。用「实时探索」加载一个城市的 OpenStreetMap
          景点后，这里就能预报未来 7 天。
        </p>
      </div>
    );
  }

  const activeSpot = spots.find((s) => s.id === activeId);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
      <Header
        right={
          <button
            onClick={() => load(activeId)}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
            title="刷新预报"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        }
      />

      {/* 景点选择 */}
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <select
          value={activeId}
          onChange={(e) => setSpotId(e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-sky-300"
        >
          {geoSpots.slice(0, 100).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {trip.includes(s.id) ? "（行程内）" : ""}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}

      {loading && !days && (
        <p className="text-xs text-gray-400 mb-3">正在获取 7 天预报…</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-7 gap-1.5">
            {rows.map((d, i) => {
              const style = VERDICT_STYLE[d.result.verdict];
              const dt = new Date(d.date + "T12:00:00");
              const maxScore = 140; // PTSI 满分量级（uv50+body60+crowd30），条形按比例
              return (
                <div
                  key={d.date}
                  className={`relative rounded-xl border p-1.5 text-center ${
                    d.isBest
                      ? "border-emerald-300 bg-emerald-50/70"
                      : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  {d.isBest && (
                    <Crown className="w-3 h-3 text-emerald-500 absolute -top-1.5 left-1/2 -translate-x-1/2" />
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
                    {i === 0 ? "今天" : WEEKDAYS[dt.getDay()]}
                  </div>
                  <div className={`text-sm font-black ${style.text}`}>
                    {d.result.score}
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden my-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (d.result.score / maxScore) * 100)}%`,
                        background: style.bar,
                      }}
                    />
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">
                    UV {Math.round(d.uvMax)}
                    <br />
                    {d.tMax !== null && d.tMin !== null
                      ? `${Math.round(d.tMin)}~${Math.round(d.tMax)}°`
                      : "--"}
                    {d.precipProb > 30 && (
                      <span className="text-sky-500"> 雨{d.precipProb}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
            按每日紫外线峰值（最晒时段）评估，冠军 = 本周相对最适合的一天；
            {activeSpot ? `「${activeSpot.name}」` : ""}
            的拥挤分按默认值计。数据源 Open-Meteo，仅供出行参考。
          </p>
        </>
      )}
    </div>
  );
}

function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <CalendarDays className="w-4 h-4 text-sky-500" />
      <span className="text-sm font-semibold text-gray-700">7 日出行窗口</span>
      <span className="text-[10px] text-gray-400">本周哪天最合适</span>
      <span className="ml-auto">{right}</span>
    </div>
  );
}
