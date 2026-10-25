"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Route,
  Calculator,
  TrendingUp,
  Crown,
  Wallet,
  Sparkles,
  MapPin,
  ChevronDown,
  Zap,
  Feather,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  getStaminaCost,
  getProjectStaminaFactor,
  guessPrice,
} from "@/lib/spot-data";

/* ═══ 三档预算倍率 ═══ */
const BUDGET_TIERS = [
  {
    id: "budget",
    label: "穷游",
    icon: "🎒",
    color: "#10B981",
    bg: "bg-emerald-50",
    multiplier: 0.6,
  },
  {
    id: "comfort",
    label: "舒适",
    icon: "🏠",
    color: "#3B82F6",
    bg: "bg-blue-50",
    multiplier: 1.0,
  },
  {
    id: "luxury",
    label: "土豪",
    icon: "👑",
    color: "#F59E0B",
    bg: "bg-amber-50",
    multiplier: 2.5,
  },
];

/* ═══════════════════════════════════════════════════
   单个景点预算卡片
   价格为按项目名推断的估算值；用户点击价格可改为实际票价（localStorage 持久化）
   ═══════════════════════════════════════════════════ */
function SpotBudgetCard({
  spotId,
  name,
  category,
  projects,
  onSubtotalChange,
  index,
  getPrice,
  isCustom,
  setCustomPrice,
}: {
  spotId: string;
  name: string;
  category: string;
  projects: string[];
  onSubtotalChange: (spotId: string, subtotal: number) => void;
  index: number;
  getPrice: (p: string) => number;
  isCustom: (p: string) => boolean;
  setCustomPrice: (key: string, price: number) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const staminaCost = getStaminaCost({
    id: "",
    name,
    image: "",
    address: "",
    facilities: [],
    projects,
    category,
    description: "",
  });

  const items = projects.map((p, i) => ({
    name: p,
    price: getPrice(p),
    index: i,
  }));

  const subtotalOf = (sel: Set<number>) =>
    items
      .filter((it) => sel.has(it.index))
      .reduce((sum, it) => sum + it.price, 0);
  const subtotal = subtotalOf(selected);

  const toggleItem = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelected(next);
    onSubtotalChange(spotId, subtotalOf(next));
  };

  const commitPrice = (idx: number) => {
    const item = items.find((it) => it.index === idx)!;
    const num = Number(draft);
    setEditingIdx(null);
    if (!Number.isFinite(num) || num < 0) return;
    setCustomPrice(`${spotId}::${item.name}`, Math.round(num));
    // 改价后若该项目已勾选，同步上报新小计
    if (selected.has(idx)) onSubtotalChange(spotId, subtotalOf(selected));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 truncate">{name}</h4>
          <p className="text-xs text-gray-400">
            {category} · {projects.length} 个项目
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* ═══ 体力维度 ═══ */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">
              {staminaCost}
            </span>
          </div>
          <div className="text-right shrink-0">
            <motion.div
              key={subtotal}
              initial={{ scale: 1.2, color: "#EF4444" }}
              animate={{
                scale: 1,
                color: subtotal > 0 ? "#EF4444" : "#9CA3AF",
              }}
              className="text-lg font-black"
            >
              {subtotal > 0 ? `¥${subtotal}` : "-"}
            </motion.div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </motion.div>
      </button>

      {/* 展开的项目列表 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {items.map((item) => {
                const isSelected = selected.has(item.index);
                const isFree = item.price === 0;
                const custom = isCustom(item.name);
                return (
                  <motion.div
                    key={item.index}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleItem(item.index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left cursor-pointer select-none ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    {/* 选择框 */}
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <span className="text-white text-xs font-bold">✓</span>
                      )}
                    </div>

                    {/* 项目名 */}
                    <span
                      className={`flex-1 text-sm ${isSelected ? "text-gray-900 font-medium" : "text-gray-600"}`}
                    >
                      {item.name}
                    </span>

                    {/* 价格（点击可改，估 = 关键词推断的估算值） */}
                    <span
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editingIdx === item.index ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitPrice(item.index)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitPrice(item.index);
                            if (e.key === "Escape") setEditingIdx(null);
                          }}
                          inputMode="decimal"
                          className="w-16 px-1.5 py-0.5 text-sm text-right border border-emerald-300 rounded-md outline-none focus:border-emerald-500"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingIdx(item.index);
                            setDraft(String(item.price));
                          }}
                          title="点击改为实际票价"
                          className={`text-sm font-bold ${isFree ? "text-green-500" : isSelected ? "text-emerald-600" : "text-gray-400"} hover:text-emerald-700 transition-colors`}
                        >
                          {isFree ? "免费" : `¥${item.price}`}
                          <span
                            className={`ml-0.5 text-[9px] font-normal align-top ${custom ? "text-sky-500" : "opacity-50"}`}
                          >
                            {custom ? "改" : "估"}
                          </span>
                        </button>
                      )}
                    </span>
                  </motion.div>
                );
              })}

              {/* 快捷操作 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    const newSet = new Set<number>(
                      items.filter((it) => it.price > 0).map((it) => it.index),
                    );
                    setSelected(newSet);
                    onSubtotalChange(spotId, subtotalOf(newSet));
                  }}
                  className="flex-1 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  全选付费
                </button>
                <button
                  onClick={() => {
                    setSelected(new Set());
                    onSubtotalChange(spotId, 0);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  全部取消
                </button>
                {/* ═══ D1.3 省力快捷操作：自动剔除 factor>1.0 的高体力项目 ═══ */}
                <button
                  onClick={() => {
                    const newSet = new Set<number>();
                    items.forEach((it) => {
                      const factor = getProjectStaminaFactor(it.name);
                      // factor ≤ 1.0 的项目默认可选（含漫步、参观、观景等省力项）
                      // factor ≤ 0.7 的缆车/索道类即使付费也保留（明显省力）
                      if (factor <= 0.7) {
                        newSet.add(it.index);
                      } else if (factor <= 1.0 && it.price === 0) {
                        // 免费且非高体力的省力项
                        newSet.add(it.index);
                      }
                    });
                    setSelected(newSet);
                    onSubtotalChange(spotId, subtotalOf(newSet));
                  }}
                  className="flex-1 py-2 text-xs font-bold text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors flex items-center justify-center gap-1"
                  title="保留低体力/省力项目，自动剔除徒步等高体力项"
                >
                  <Feather className="w-3 h-3" />
                  省力优先
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   预算对比条
   ═══════════════════════════════════════════════════ */
function BudgetBar({
  total,
  tiers,
}: {
  total: number;
  tiers: typeof BUDGET_TIERS;
}) {
  const maxVal = Math.max(
    ...tiers.map((t) => Math.round(total * t.multiplier)),
    1,
  );

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const amount = Math.round(total * tier.multiplier);
        const pct = (amount / maxVal) * 100;
        return (
          <div key={tier.id} className="flex items-center gap-3">
            <span className="text-lg shrink-0">{tier.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">
                  {tier.label}
                </span>
                <motion.span
                  key={amount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-sm font-black"
                  style={{ color: tier.color }}
                >
                  ¥{amount.toLocaleString()}
                </motion.span>
              </div>
              <div className={`h-4 ${tier.bg} rounded-full overflow-hidden`}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   预算沙盘主页面
   ═══════════════════════════════════════════════════ */
export default function BudgetView() {
  const { spots, customPrices, setCustomPrice, clearCustomPrices } =
    useAppStore();

  // 每个景点上报的已勾选小计，total 恒等于各景点小计之和（改价/重置后自动一致）
  const [spotTotals, setSpotTotals] = useState<Record<string, number>>({});
  const total = useMemo(
    () => Object.values(spotTotals).reduce((sum, v) => sum + v, 0),
    [spotTotals],
  );
  const handleSubtotalChange = useCallback((id: string, subtotal: number) => {
    setSpotTotals((prev) => ({ ...prev, [id]: subtotal }));
  }, []);

  // 估价口径：用户改价优先，否则按项目名推断（估算）
  const priceOf = useCallback(
    (spotId: string, p: string) => {
      const custom = customPrices[`${spotId}::${p}`];
      return custom !== undefined ? custom : guessPrice(p);
    },
    [customPrices],
  );
  const isCustom = useCallback(
    (spotId: string, p: string) =>
      customPrices[`${spotId}::${p}`] !== undefined,
    [customPrices],
  );

  // 只显示有 projects 的景点
  const spotItems = useMemo(
    () => spots.filter((s) => s.projects.length > 0),
    [spots],
  );

  // 总预算数据
  const maxPossible = useMemo(
    () =>
      spotItems.reduce(
        (sum, s) =>
          sum + s.projects.reduce((ps, p) => ps + priceOf(s.id, p), 0),
        0,
      ),
    [spotItems, priceOf],
  );

  // 价格分层统计
  const priceLayers = useMemo(() => {
    const free: string[] = [],
      cheap: string[] = [],
      mid: string[] = [],
      pricey: string[] = [];
    spotItems.forEach((s) => {
      s.projects.forEach((p) => {
        const price = priceOf(s.id, p);
        if (price === 0) free.push(p);
        else if (price <= 50) cheap.push(p);
        else if (price <= 150) mid.push(p);
        else pricey.push(p);
      });
    });
    return [
      { label: "免费项目", count: free.length, color: "#10B981", emoji: "🆓" },
      {
        label: "平价 (≤50)",
        count: cheap.length,
        color: "#3B82F6",
        emoji: "💰",
      },
      {
        label: "中档 (50-150)",
        count: mid.length,
        color: "#F59E0B",
        emoji: "💎",
      },
      {
        label: "高端 (>150)",
        count: pricey.length,
        color: "#EF4444",
        emoji: "👑",
      },
    ];
  }, [spotItems, priceOf]);

  if (spotItems.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6"
        >
          <Calculator className="w-10 h-10 text-amber-400" />
        </motion.div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          暂无可预算的景点
        </h3>
        <p className="text-sm text-gray-500">
          景点数据中需要有"推荐项目"才能模拟预算
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-8">
        {/* ═══ 标题 ═══ */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">预算沙盘</h2>
            <p className="text-xs text-gray-500">
              勾选项目，实时模拟旅行花费 · 价格为估算值，点价格可改为实际票价
            </p>
          </div>
          {Object.keys(customPrices).length > 0 && (
            <button
              onClick={clearCustomPrices}
              className="ml-auto text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition-colors shrink-0"
              title="清除所有手动改价，恢复估算值"
            >
              重置改价 ({Object.keys(customPrices).length})
            </button>
          )}
        </div>

        {/* ═══ 行程单作用域提示 ═══ */}
        {trip.length > 0 && (
          <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <Route className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800 flex-1">
              {effectiveScope === "trip"
                ? `已按行程单 ${trip.length} 站计算，未入行程的景点不参与预算`
                : "当前按全部景点计算"}
            </span>
            <button
              onClick={() =>
                setScope(effectiveScope === "trip" ? "all" : "trip")
              }
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 shrink-0"
            >
              {effectiveScope === "trip" ? "改用全部景点" : "改按行程单"}
            </button>
          </div>
        )}

        {/* ═══ 金额汇总卡 ═══ */}
        <motion.div
          className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-2xl p-5 mb-5 text-white shadow-lg"
          layout
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white/80 text-xs font-medium mb-1">
                当前预算总计
              </div>
              <motion.div
                key={total}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-4xl font-black"
              >
                ¥{total.toLocaleString()}
              </motion.div>
              <div className="text-white/60 text-xs mt-1">
                已选 {Object.values(spotTotals).filter((v) => v > 0).length}{" "}
                个景点的部分项目
              </div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs mb-1">满选总价（估算）</div>
              <div className="text-xl font-bold">
                ¥{maxPossible.toLocaleString()}
              </div>
              <div className="text-white/60 text-xs mt-1">
                省了 {Math.round((1 - total / (maxPossible || 1)) * 100)}%
              </div>
            </div>
          </div>
        </motion.div>

        {/* ═══ 三档预算对比 ═══ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">
              预算对比
            </span>
            <span className="text-[10px] text-gray-400 ml-auto">
              基于当前选择
            </span>
          </div>
          <BudgetBar total={total} tiers={BUDGET_TIERS} />
        </div>

        {/* ═══ 价格分层 ═══ */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {priceLayers.map((layer) => (
            <div
              key={layer.label}
              className="bg-white rounded-xl border border-gray-100 p-2.5 text-center"
            >
              <div className="text-lg">{layer.emoji}</div>
              <div
                className="text-base font-black"
                style={{ color: layer.color }}
              >
                {layer.count}
              </div>
              <div className="text-[9px] text-gray-400 leading-tight">
                {layer.label}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ 景点项目列表 ═══ */}
        <div className="flex items-center gap-1.5 mb-3">
          <Wallet className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">景点项目</span>
          <span className="text-[10px] text-gray-400 ml-auto">
            点击展开勾选
          </span>
        </div>
        <div className="space-y-3">
          {spotItems.map((spot, i) => (
            <SpotBudgetCard
              key={spot.id}
              spotId={spot.id}
              name={spot.name}
              category={spot.category}
              projects={spot.projects}
              onSubtotalChange={handleSubtotalChange}
              index={i}
              getPrice={(p) => priceOf(spot.id, p)}
              isCustom={(p) => isCustom(spot.id, p)}
              setCustomPrice={setCustomPrice}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
