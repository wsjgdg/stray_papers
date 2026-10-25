"use client";

// ═══ 行程单：把收藏/景点串成可执行的行程 ═══
// 排序 → 汇总（预算/体力）→ 导出（文本 / 行程卡 PNG）
// 预算沙盘与体力沙盘会优先按行程单的景点与顺序计算。

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getStaminaCost, guessPrice, type Spot } from "@/lib/spot-data";
import { downloadTripCard } from "@/lib/trip-card";

export default function TripView() {
  const {
    spots,
    trip,
    addToTrip,
    removeFromTrip,
    moveTripSpot,
    clearTrip,
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

  const exportText = () => {
    const lines = [
      `📍 我的行程单（${tripSpots.length} 站）`,
      "",
      ...tripSpots.map((s, i) => {
        const est = s.projects.reduce((ps, p) => ps + priceOf(s, p), 0);
        return `${i + 1}. ${s.name}\n   ${s.address}${s.projects.length ? `\n   项目：${s.projects.join("、")}` : ""}${est > 0 ? `\n   估算花费：约¥${est}` : ""}`;
      }),
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
              {tripSpots.length} 站 · 按先后顺序游玩，上下箭头调整次序
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
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <Compass className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <div className="text-2xl font-black">{tripSpots.length}</div>
              <div className="text-white/70 text-[11px]">站点</div>
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

        {/* 行程列表 */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {tripSpots.map((s, i) => (
              <motion.div
                key={s.id}
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
                        {s.projects.reduce((ps, p) => ps + priceOf(s, p), 0)}
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
            ))}
          </AnimatePresence>
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
