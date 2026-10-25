"use client";

// ═══ 行程单：把收藏/景点串成可执行的计划 ═══
// 分天（体力预算自动/手动分段）→ 汇总（预算/体力）→ 出行日体检（/api/weather）
// → 装备清单（按分类推导）→ 导出（文本 / 行程卡 PNG）
// 预算沙盘与体力沙盘会优先按行程单的景点与顺序计算。

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Route,
  MapPin,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  ImageDown,
  Compass,
  Zap,
  Wallet,
  CalendarDays,
  Crown,
  Flag,
  Backpack,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  getStaminaCost,
  guessPrice,
  parseCoords,
  CATEGORY_PACKLIST,
  PACKLIST_UNIVERSAL,
  type Spot,
} from "@/lib/spot-data";
import { calcPTSI } from "@/lib/ptsi-calculator";
import { downloadTripCard } from "@/lib/trip-card";

const PACKLIST_KEY = "trip-packlist-checked";

/* ═══ 行程级 7 日体检：行程内带坐标景点逐日平均 UV → PTSI ═══ */
function TripWeather({ spots }: { spots: Spot[] }) {
  const geoSpots = useMemo(
    () => spots.filter((s) => parseCoords(s) !== null).slice(0, 5),
    [spots],
  );
  const [rows, setRows] = useState<
    { date: string; avgUv: number; score: number; verdict: string }[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (geoSpots.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const perSpot = await Promise.allSettled(
        geoSpots.map(async (s) => {
          const c = parseCoords(s)!;
          const res = await fetch(`/api/weather?lat=${c.lat}&lng=${c.lng}`);
          const data = await res.json();
          if (data.error || !data.days) throw new Error(data.message || "fail");
          return data.days as { date: string; uvMax: number }[];
        }),
      );
      const lists = perSpot
        .filter((r) => r.status === "fulfilled")
        .map(
          (r) =>
            (r as PromiseFulfilledResult<{ date: string; uvMax: number }[]>)
              .value,
        );
      if (lists.length === 0) throw new Error("weather unavailable");
      const n = Math.min(...lists.map((l) => l.length));
      const out: {
        date: string;
        avgUv: number;
        score: number;
        verdict: "go" | "caution" | "nogo";
      }[] = [];
      for (let i = 0; i < n; i++) {
        const avgUv =
          lists.reduce((sum, l) => sum + (l[i]?.uvMax ?? 0), 0) / lists.length;
        const result = calcPTSI(avgUv, []);
        out.push({
          date: lists[0][i]?.date ?? "",
          avgUv,
          score: result.score,
          verdict: result.verdict,
        });
      }
      setRows(out);
    } catch {
      setError("天气服务暂不可用");
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoSpots.map((s) => s.id).join(",")]);

  if (geoSpots.length === 0) return null;

  const best = rows ? Math.max(...rows.map((r) => r.score)) : -1;
  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const STYLE: Record<string, { text: string; bar: string }> = {
    go: { text: "text-emerald-600", bar: "#10B981" },
    caution: { text: "text-amber-600", bar: "#F59E0B" },
    nogo: { text: "text-rose-500", bar: "#EF4444" },
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
      <div className="flex items-center gap-1.5 mb-3">
        <CalendarDays className="w-4 h-4 text-sky-500" />
        <span className="text-sm font-semibold text-gray-700">
          整条行程 · 7 日体检
        </span>
        <span className="text-[10px] text-gray-400">
          {geoSpots.length} 站带坐标，逐日紫外线峰值取平均
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 disabled:opacity-40"
          title="刷新"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}
      {rows && (
        <div className="grid grid-cols-7 gap-1.5">
          {rows.map((r, i) => {
            const style = STYLE[r.verdict] ?? STYLE.caution;
            const dt = new Date(r.date + "T12:00:00");
            return (
              <div
                key={r.date}
                className={`relative rounded-xl border p-1.5 text-center ${
                  r.score === best
                    ? "border-emerald-300 bg-emerald-50/70"
                    : "border-gray-100 bg-gray-50/50"
                }`}
              >
                {r.score === best && (
                  <Crown className="w-3 h-3 text-emerald-500 absolute -top-1.5 left-1/2 -translate-x-1/2" />
                )}
                <div className="text-[10px] text-gray-400 mt-1">
                  {i === 0 ? "今天" : WEEKDAYS[dt.getDay()]}
                </div>
                <div className={`text-sm font-black ${style.text}`}>
                  {r.score}
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden my-1">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (r.score / 140) * 100)}%`,
                      background: style.bar,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ 出行装备清单：按行程内分类推导，勾选存 localStorage ═══ */
function PackList({ spots }: { spots: Spot[] }) {
  const items = useMemo(() => {
    const set = new Set<string>(PACKLIST_UNIVERSAL);
    for (const s of spots) {
      for (const item of CATEGORY_PACKLIST[s.category] ?? []) set.add(item);
    }
    return [...set];
  }, [spots]);

  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(PACKLIST_KEY) ?? "[]"));
    } catch {
      return new Set<string>();
    }
  });
  const toggle = (item: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      try {
        localStorage.setItem(PACKLIST_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const done = items.filter((i) => checked.has(i)).length;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Backpack className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-gray-700">出行装备</span>
        <span className="text-[10px] text-gray-400 ml-auto">
          按行程分类推导 · {done}/{items.length} 已备
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const on = checked.has(item);
          return (
            <button
              key={item}
              onClick={() => toggle(item)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                on
                  ? "bg-amber-50 border-amber-200 text-amber-700 line-through opacity-70"
                  : "bg-white border-gray-200 text-gray-600 hover:border-amber-300"
              }`}
            >
              {on ? "✓ " : ""}
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TripView() {
  const {
    spots,
    trip,
    tripDaySplit,
    addToTrip,
    removeFromTrip,
    moveTripSpot,
    clearTrip,
    splitTripDay,
    mergeTripDay,
    setTripDaySplit,
    setSelectedSpot,
    customPrices,
    setActiveView,
  } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);

  const tripSpots = useMemo(
    () =>
      trip
        .map((id) => spots.find((s) => s.id === id))
        .filter(Boolean) as Spot[],
    [trip, spots],
  );

  // 估价口径与预算沙盘一致：用户改价优先，否则估算
  const priceOf = (s: Spot, p: string) => {
    const custom = customPrices[`${s.id}::${p}`];
    return custom !== undefined ? custom : guessPrice(p);
  };

  const estBudget = useMemo(
    () =>
      tripSpots.reduce(
        (sum, s) => sum + s.projects.reduce((ps, p) => ps + priceOf(s, p), 0),
        0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripSpots, customPrices],
  );
  const estStamina = useMemo(
    () => tripSpots.reduce((sum, s) => sum + getStaminaCost(s), 0),
    [tripSpots],
  );

  // 分天：按分段点切天数
  const days = useMemo(() => {
    const out: Spot[][] = [];
    let cur: Spot[] = [];
    for (let i = 0; i < tripSpots.length; i++) {
      cur.push(tripSpots[i]);
      if (tripDaySplit.includes(i)) {
        out.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) out.push(cur);
    return out;
  }, [tripSpots, tripDaySplit]);

  // 自动分天：贪心按体力预算（100/天）分段
  const autoSplit = () => {
    const splits: number[] = [];
    let acc = 0;
    for (let i = 0; i < tripSpots.length; i++) {
      acc += getStaminaCost(tripSpots[i]);
      if (acc >= 100 && i < tripSpots.length - 1) {
        splits.push(i);
        acc = 0;
      }
    }
    setTripDaySplit(splits);
  };

  const exportText = () => {
    const lines = [
      `📍 我的行程单（${tripSpots.length} 站${days.length > 1 ? ` · ${days.length} 天` : ""}）`,
      "",
      ...days.flatMap((day, d) => [
        ...(days.length > 1 ? [`—— 第 ${d + 1} 天 ——`] : []),
        ...day.map((s) => {
          const gi = tripSpots.indexOf(s);
          const est = s.projects.reduce((ps, p) => ps + priceOf(s, p), 0);
          return `${gi + 1}. ${s.name}\n   ${s.address}${s.projects.length ? `\n   项目：${s.projects.join("、")}` : ""}${est > 0 ? `\n   估算花费：约¥${est}` : ""}`;
        }),
      ]),
      "",
      `估算合计：约¥${estBudget} · 体力合计：${estStamina}`,
      "价格为按项目名推断的估算值，实际以景区公示为准",
      "—— 景点览胜 · 华夏探索",
    ];
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => alert("复制失败，请手动选择文本"));
  };

  // 未入行程的有项目景点（快速添加用）
  const addable = spots.filter((s) => !trip.includes(s.id));

  if (tripSpots.length === 0 && !adding) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-6"
        >
          <Route className="w-10 h-10 text-emerald-500" />
        </motion.div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">行程单还是空的</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          在景点详情里点「加入行程」，就能把预算沙盘、体力沙盘和导出串成一条线
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView("spots")}
            className="px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
          >
            去挑景点
          </button>
          {addable.length > 0 && (
            <button
              onClick={() => setAdding(true)}
              className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              直接添加 ({addable.length})
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
            <Route className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">行程单</h2>
            <p className="text-xs text-gray-500">
              {tripSpots.length} 站
              {days.length > 1 ? ` · ${days.length} 天` : ""} ·
              上下箭头调序，旗帜分天
            </p>
          </div>
          {tripSpots.length > 0 && (
            <button
              onClick={clearTrip}
              className="ml-auto text-xs font-bold text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
            >
              清空行程
            </button>
          )}
        </div>

        {/* 汇总卡 */}
        <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl p-5 mb-5 text-white shadow-lg">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <Compass className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-2xl font-black">{tripSpots.length}</div>
              <div className="text-white/70 text-[11px]">站点</div>
            </div>
            <div>
              <CalendarDays className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-2xl font-black">{days.length}</div>
              <div className="text-white/70 text-[11px]">天数</div>
            </div>
            <div>
              <Wallet className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-2xl font-black">
                ¥{estBudget.toLocaleString()}
              </div>
              <div className="text-white/70 text-[11px]">估算预算</div>
            </div>
            <div>
              <Zap className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-2xl font-black">{estStamina}</div>
              <div className="text-white/70 text-[11px]">体力合计</div>
            </div>
          </div>
        </div>

        {/* 导出 */}
        {tripSpots.length > 0 && (
          <div className="flex gap-2 mb-5">
            <button
              onClick={exportText}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? "已复制 ✓" : "复制文本行程"}
            </button>
            <button
              onClick={() =>
                downloadTripCard({
                  spots: tripSpots.map((s) => ({
                    name: s.name,
                    address: s.address,
                    projects: s.projects,
                  })),
                  customPriceOf: (name, project) => {
                    const s = tripSpots.find((x) => x.name === name);
                    if (!s) return undefined;
                    return customPrices[`${s.id}::${project}`];
                  },
                })
              }
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
            >
              <ImageDown className="w-4 h-4" />
              导出行程卡
            </button>
          </div>
        )}

        {/* 行程级 7 日体检 */}
        <TripWeather spots={tripSpots} />

        {/* 出行装备清单 */}
        <PackList spots={tripSpots} />

        {/* 分天工具条 */}
        {tripSpots.length > 2 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-gray-600">分天</span>
            <button
              onClick={autoSplit}
              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
              title="按每天体力预算 100 贪心分段"
            >
              ⚡ 按体力自动分天
            </button>
            {tripDaySplit.length > 0 && (
              <button
                onClick={() => setTripDaySplit([])}
                className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg hover:bg-gray-200 transition-colors"
              >
                合并为一天
              </button>
            )}
          </div>
        )}

        {/* 行程列表（按天分组） */}
        <div className="space-y-2">
          {days.map((day, d) => {
            const dayBudget = day.reduce(
              (sum, s) =>
                sum + s.projects.reduce((ps, p) => ps + priceOf(s, p), 0),
              0,
            );
            const dayStamina = day.reduce(
              (sum, s) => sum + getStaminaCost(s),
              0,
            );
            const over = dayStamina > 100;
            return (
              <div key={`day-${d}`}>
                {days.length > 1 && (
                  <div className="flex items-center gap-2 mb-2 mt-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-100">
                      <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
                      <span className="text-xs font-black text-teal-700">
                        第 {d + 1} 天 · {day.length} 站
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 flex items-center gap-2">
                      <span>¥{dayBudget.toLocaleString()}</span>
                      <span className={over ? "text-rose-500 font-bold" : ""}>
                        体力 {dayStamina}
                        {over && " · 超预算"}
                      </span>
                    </span>
                    {tripDaySplit[d] !== undefined && (
                      <button
                        onClick={() => mergeTripDay(tripDaySplit[d])}
                        className="ml-auto text-[10px] text-gray-400 hover:text-gray-600"
                        title="与上一天合并"
                      >
                        合并到昨天
                      </button>
                    )}
                  </div>
                )}
                <AnimatePresence mode="popLayout">
                  {day.map((s, di) => {
                    const i = tripSpots.indexOf(s);
                    const isSplit = tripDaySplit.includes(i);
                    return (
                      <div key={s.id}>
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white rounded-xl border border-gray-200/80 p-3 flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-black shrink-0">
                            {i + 1}
                          </div>
                          <button
                            onClick={() => setSelectedSpot(s)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <h4 className="text-sm font-bold text-gray-900 truncate hover:text-emerald-700">
                              {s.name}
                            </h4>
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {s.address}
                              {s.projects.length > 0 && (
                                <span className="text-emerald-600">
                                  · 约¥
                                  {s.projects.reduce(
                                    (ps, p) => ps + priceOf(s, p),
                                    0,
                                  )}
                                </span>
                              )}
                            </p>
                          </button>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              onClick={() => moveTripSpot(s.id, -1)}
                              disabled={i === 0}
                              className="w-6 h-5 rounded bg-gray-50 text-gray-400 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveTripSpot(s.id, 1)}
                              disabled={i === tripSpots.length - 1}
                              className="w-6 h-5 rounded bg-gray-50 text-gray-400 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromTrip(s.id)}
                            className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors"
                            title="移出行程"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                        {/* 站间分天按钮（末站除外） */}
                        {i < tripSpots.length - 1 && (
                          <button
                            onClick={() =>
                              isSplit ? mergeTripDay(i) : splitTripDay(i)
                            }
                            className={`w-full flex items-center justify-center gap-1 py-1 my-0.5 rounded-lg text-[10px] font-bold transition-colors ${
                              isSplit
                                ? "bg-teal-50 text-teal-700 border border-teal-100"
                                : "text-gray-300 hover:text-teal-600 hover:bg-teal-50/50 border border-dashed border-transparent hover:border-teal-200"
                            }`}
                            title="在此处分天"
                          >
                            <Flag className="w-3 h-3" />
                            {isSplit
                              ? `第 ${d + 1} 天在此结束 · 点击合并`
                              : "在此分天"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* 快速添加 */}
        {addable.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setAdding((v) => !v)}
              className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-bold text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
            >
              {adding
                ? "收起添加列表"
                : `＋ 添加景点（${addable.length} 个可选）`}
            </button>
            {adding && (
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                {addable.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      addToTrip(s.id);
                      if (addable.length === 1) setAdding(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                      {s.category}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
