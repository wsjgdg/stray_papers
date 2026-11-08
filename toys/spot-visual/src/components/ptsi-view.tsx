"use client";

// ═══ PTSI 出行指数 · 标准化出行适宜指数 ═══
// D2.2: PTSI 主视图
// Personal Travel Suitability Index

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Thermometer, Sun, Heart, TrendingUp, Clock } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  calcPTSI,
  calcPTSIHourly,
  getUVByHour,
  calcPTSIForSpots,
} from "@/lib/ptsi-calculator";
import { getStaminaCost, type PTSIResult } from "@/lib/spot-data";
import { SPOT_PROFILES } from "@/lib/spot-profiles.generated";
import SevenDayWindow from "./ptsi-seven-day";

/* ═══ 身体条件选项 ═══ */
const CONDITIONS = [
  { id: "knee", label: "膝盖不适", emoji: "🦵" },
  { id: "heart", label: "心脏负担", emoji: "❤️" },
  { id: "heat", label: "怕热中暑", emoji: "🌡️" },
];

/* ═══ 时段显示 ═══ */
const PERIOD_LABELS = ["凌晨", "清晨", "上午", "正午", "下午", "傍晚", "夜间"];

function getPeriodLabel(hour: number): string {
  if (hour < 5) return "凌晨";
  if (hour < 8) return "清晨";
  if (hour < 11) return "上午";
  if (hour < 13) return "正午";
  if (hour < 17) return "下午";
  if (hour < 19) return "傍晚";
  return "夜间";
}

/* ═══ 判定配色 ═══ */
const VERDICT_STYLE: Record<
  string,
  { bg: string; text: string; emoji: string }
> = {
  go: {
    bg: "bg-emerald-100 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-400",
    emoji: "✅",
  },
  caution: {
    bg: "bg-amber-100",
    text: "text-amber-700 dark:text-amber-400",
    emoji: "⚠️",
  },
  nogo: {
    bg: "bg-red-100",
    text: "text-red-700 dark:text-red-400",
    emoji: "🚫",
  },
};

/* ═══ 当前时刻PTSI ═══ */
function CurrentPTSI({ conditions }: { conditions: string[] }) {
  const now = new Date();
  const hour = now.getHours();
  const uv = getUVByHour(hour);
  const ptsi = calcPTSI(uv, conditions);
  const vs = VERDICT_STYLE[ptsi.verdict];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
        <Clock className="w-3 h-3 inline mr-1" />
        当前 · {hour}:00 · {getPeriodLabel(hour)}
      </div>
      <div
        className="text-6xl font-black mb-2"
        style={{
          color:
            ptsi.score >= 80
              ? "#10B981"
              : ptsi.score >= 50
                ? "#F59E0B"
                : "#EF4444",
        }}
      >
        {ptsi.score}
      </div>
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${vs.bg} ${vs.text} mb-3`}
      >
        <span>{vs.emoji}</span>
        <span>
          {ptsi.verdict === "go"
            ? "适宜出行"
            : ptsi.verdict === "caution"
              ? "谨慎出行"
              : "不宜出行"}
        </span>
      </div>
      {/* 分项扣分明细：让 100 = 无扣分 一目了然。这里只算「人」的维度（UV + 身体条件），
          景点维度（体力消耗 / 游玩时长）在下方排行榜里逐景点计入。 */}
      <div className="text-left text-xs bg-gray-50 dark:bg-gray-900 rounded-xl p-3 mb-3 space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">
            紫外线扣分（当前 UV 估算 {uv}）
          </span>
          <span className="font-bold text-gray-700 dark:text-gray-200">
            -{ptsi.uvScore}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-gray-400">身体条件扣分</span>
          <span className="font-bold text-gray-700 dark:text-gray-200">
            -{ptsi.bodyScore}
          </span>
        </div>
        <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">
            100 - 扣分合计
          </span>
          <span className="font-bold text-gray-900 dark:text-gray-100">
            {ptsi.score}
          </span>
        </div>
      </div>
      {ptsi.reasons.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {ptsi.reasons.map((r, i) => (
            <p key={i}>• {r}</p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
        UV 为按时段估算曲线（非实时预报）；身体条件来自你的勾选。
        所有分项都来自库内真实字段或你的勾选，<b>不含客流估算</b>
        （本项目没有实时客流数据源）。想看真实天气，用下方「7 日出行窗口」。
      </p>
    </div>
  );
}

/* ═══ 24小时PTSI曲线 ═══ */
function HourlyChart({ conditions }: { conditions: string[] }) {
  const data = useMemo(() => calcPTSIHourly(conditions), [conditions]);

  const W = 600,
    H = 200,
    PAD = { top: 20, right: 10, bottom: 30, left: 35 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: 220 }}
    >
      {/* 阈值线 */}
      {[50, 80].map((v) => {
        const y = PAD.top + plotH - (v / 100) * plotH;
        return (
          <g key={v}>
            <line
              x1={PAD.left}
              y1={y}
              x2={PAD.left + plotW}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth="0.5"
              strokeDasharray="4 3"
            />
            <text
              x={PAD.left + plotW + 2}
              y={y + 3}
              fontSize="8"
              fill="#9CA3AF"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* 时段色带 */}
      {[
        { start: 6, end: 8, color: "#FEF3C7" },
        { start: 11, end: 13, color: "#FED7AA" },
        { start: 17, end: 19, color: "#FFEDD5" },
      ].map((zone) => {
        const x1 = PAD.left + (zone.start / 24) * plotW;
        const x2 = PAD.left + (zone.end / 24) * plotW;
        return (
          <rect
            key={zone.start}
            x={x1}
            y={PAD.top}
            width={x2 - x1}
            height={plotH}
            fill={zone.color}
            opacity="0.3"
          />
        );
      })}

      {/* 折线 */}
      <path
        d={data
          .map((d, i) => {
            const x = PAD.left + (d.hour / 24) * plotW;
            const y = PAD.top + plotH - (d.ptsi.score / 100) * plotH;
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ")}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 数据点 */}
      {data
        .filter((_, i) => i % 2 === 0)
        .map((d) => {
          const x = PAD.left + (d.hour / 24) * plotW;
          const y = PAD.top + plotH - (d.ptsi.score / 100) * plotH;
          const color =
            d.ptsi.score >= 80
              ? "#10B981"
              : d.ptsi.score >= 50
                ? "#F59E0B"
                : "#EF4444";
          return (
            <circle
              key={d.hour}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
            />
          );
        })}

      {/* X轴标签 */}
      {[0, 6, 12, 18, 24].map((h) => {
        if (h === 24) return null;
        const x = PAD.left + (h / 24) * plotW;
        return (
          <text
            key={h}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize="8"
            fill="#9CA3AF"
          >
            {h}:00
          </text>
        );
      })}

      {/* 轴标签 */}
      <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="9" fill="#6B7280">
        时段
      </text>
      <text
        x={8}
        y={H / 2}
        textAnchor="middle"
        fontSize="9"
        fill="#6B7280"
        transform={`rotate(-90, 8, ${H / 2})`}
      >
        PTSI
      </text>
    </svg>
  );
}

/* ═══ 景点排行榜 ═══ */
function SpotRanking({ conditions }: { conditions: string[] }) {
  const { spots } = useAppStore();
  const [sortBy, setSortBy] = useState<"rating" | "ptsi">("rating");
  const ranking = useMemo(() => {
    // 池 = 「真热门景区」：有评分 + A 级 + 评分≥4.6。
    //  - 无评分的 1600+ 条会把 top10 变成随机抽样
    //  - 不限 A 级会混进社区小园子，对出行决策没意义
    //  - 评分门槛 4.6：库里 4.4/4.5 的只有 10 条，卡在 4.6 才是真正「大概率会去」的地方
    const pool = spots.filter(
      (s) =>
        typeof s.rating === "number" &&
        s.rating >= 4.6 &&
        (s.level === "5A" || s.level === "4A"),
    );
    const ratingOf = new Map(pool.map((s) => [s.name, s.rating]));
    // 逐景点代入**真实字段**：档案建议游玩时长 → 暴露时长，体力消耗值 → 体力扣分。
    // 这里不再估算客流（旧实现用「评分−4.0」反推排队分钟，既没数据来源，
    // 又让高分名景区因为「越热门越挤」被排到榜尾，方向是反的）。
    const enriched = pool.map((s) => ({
      id: s.id,
      name: s.name,
      rating: s.rating,
      level: s.level,
      suggestedHours: SPOT_PROFILES[s.id]?.suggestedHours ?? null,
      stamina: getStaminaCost(s),
    }));
    const results = calcPTSIForSpots(enriched, conditions);
    // 两种排序口径，用户自己切：
    //  - rating：评分优先（默认）。「值得去的地方里，今天哪个最省力」
    //  - ptsi：适宜度优先。「今天最省力的地方」，但榜首必然是一堆 0.5h 打卡位，
    //    因为不存在客流维度后，越省力越靠前是数学必然，不是 bug。
    results.sort(
      sortBy === "rating"
        ? (a, b) =>
            (ratingOf.get(b.name) ?? 0) - (ratingOf.get(a.name) ?? 0) ||
            b.ptsi.score - a.ptsi.score
        : (a, b) =>
            b.ptsi.score - a.ptsi.score ||
            (ratingOf.get(b.name) ?? 0) - (ratingOf.get(a.name) ?? 0),
    );
    // 把展示字段挂回结果（等级/评分是排序与展示用，不参与扣分）
    const meta = new Map(enriched.map((s) => [s.name, s]));
    return results.map((r) => ({
      ...r,
      // 带 id 出去：以前点击排行行是按**名字**去库里 find，同名景区（多个「古城」）
      // 会跳到错的那个详情页。名字只用于展示与 tiebreak，身份用 id。
      id: meta.get(r.name)?.id ?? null,
      rating: meta.get(r.name)?.rating ?? null,
      level: meta.get(r.name)?.level ?? null,
    }));
  }, [spots, conditions, sortBy]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {sortBy === "rating" ? "热门景区排行" : "今日最省力排行"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {(
            [
              ["rating", "按评分"],
              ["ptsi", "按适宜度"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              aria-pressed={sortBy === k}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                sortBy === k
                  ? "bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200"
                  : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 leading-relaxed">
        5A/4A 且评分≥4.6 · 分项只含体力消耗/建议时长，<b>不含客流</b>
        （本项目没有实时客流数据）。
        {sortBy === "ptsi"
          ? "按适宜度排时，榜首必然是短时低强度的小点——这是没有客流维度后的必然结果。"
          : "按评分排：值得去的地方里，谁今天更省力。"}
      </p>
      <div className="space-y-2">
        {ranking.slice(0, 10).map((item, i) => {
          const vs = VERDICT_STYLE[item.ptsi.verdict];
          const hit = item.id
            ? useAppStore.getState().spots.find((s) => s.id === item.id)
            : undefined;
          return (
            <div
              key={item.name}
              onClick={() => {
                if (!hit) return;
                useAppStore.getState().setSelectedSpot(hit);
                useAppStore.getState().setActiveView("spots");
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 ${
                hit ? "cursor-pointer" : ""
              }`}
              role={hit ? "button" : undefined}
              aria-label={hit ? `查看 ${item.name} 详情` : undefined}
            >
              <span
                className={`w-6 text-center font-bold text-sm ${i < 3 ? "text-amber-500" : "text-gray-400 dark:text-gray-500"}`}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-700 dark:text-gray-200 truncate">
                  {item.name}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                  {item.level} · 建议玩 {item.hours ?? "—"}h · 体力{" "}
                  {item.stamina ?? "—"}
                  {sortBy === "rating"
                    ? ` · 今日 ${item.ptsi.score} 分`
                    : ` · 评分 ${item.rating ?? "—"}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* 右侧大数字始终等于当前排序键：按评分排就显示评分，
                    按适宜度排就显示 PTSI。避免「第 9 名的数字比第 1 名还高」的困惑。 */}
                <motion.div
                  key={`${sortBy}-${item.ptsi.score}`}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-sm font-bold"
                  style={{
                    color:
                      sortBy === "rating"
                        ? "#6B7280"
                        : item.ptsi.score >= 80
                          ? "#10B981"
                          : item.ptsi.score >= 50
                            ? "#F59E0B"
                            : "#EF4444",
                  }}
                >
                  {sortBy === "rating" ? item.rating : item.ptsi.score}
                </motion.div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${vs.bg} ${vs.text}`}
                >
                  {vs.emoji}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PTSI 主页面
   ═══════════════════════════════════════════════════ */
export default function PTSIView() {
  const { bodyConditions: conditions, toggleBodyCondition: toggleCondition } =
    useAppStore();

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-900/50 dark:bg-gray-950/50">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-8">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg">
            <Thermometer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              PTSI 出行指数
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Personal Travel Suitability Index ·
              综合紫外线、身体条件、体力消耗、降水与游玩时长
            </p>
          </div>
        </div>

        {/* 身体条件 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              你的身体条件
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
              选中的条件会降低 PTSI 分数
            </span>
          </div>
          <div className="flex gap-3">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => toggleCondition(c.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  conditions.includes(c.id)
                    ? "bg-rose-100 text-rose-700 dark:text-rose-400 ring-2 ring-rose-300"
                    : "bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
            分项口径：紫外线（按时段估算 UV）· 身体条件（你的勾选）·
            体力消耗（景点体力值 0–100）· 降水概率（7 日窗口用 Open-Meteo
            实况）· 建议游玩时长（景点档案）。
            拥挤/排队维度已移除——本项目没有实时客流数据，不编造数值。
          </p>
        </div>

        {/* 7 日出行窗口（真实天气预报 + PTSI 逐日评分） */}
        <SevenDayWindow conditions={conditions} />

        {/* 当前PTSI + 24h曲线 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="md:col-span-1">
            <CurrentPTSI conditions={conditions} />
          </div>
          <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1.5 mb-3">
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                PTSI 日变化曲线
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                浅色区 = 清晨/正午/黄昏
              </span>
            </div>
            <HourlyChart conditions={conditions} />
          </div>
        </div>

        {/* 景点排行榜 */}
        <SpotRanking conditions={conditions} />
      </div>
    </div>
  );
}
