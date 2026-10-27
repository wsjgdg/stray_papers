"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

// ═══ 完整一分一段表 ═══
// 顶部迷你曲线只表达「形状」，这个视图给的是可以逐分对照的原表：
// 分数 → 本段人数 → 累计位次，并把「你的分数」「本科线」两行钉出来。
export function RankTable({
  curve,
  ctrl,
  score,
  rank,
  prov,
  cat,
  year,
  equiv,
}: {
  curve: [number, number][];
  ctrl?: number;
  score: number;
  rank: number;
  prov: string;
  cat: string;
  year: number;
  /** 另一年份的等位分（位次相同折算出来的分数） */
  equiv?: { year: number; score: number } | null;
}) {
  const [range, setRange] = useState<"all" | "above" | "around">("above");

  const rows = useMemo(() => {
    // curve 按分数降序、累计位次递增；本段人数 = 相邻两档累计位次差
    return curve.map(([s, cumulative], i) => {
      const next = curve[i + 1]?.[1];
      return {
        score: s,
        cumulative,
        band: next != null ? Math.max(0, next - cumulative) : cumulative,
      };
    });
  }, [curve]);

  const view = useMemo(() => {
    if (range === "all") return rows;
    if (range === "above") {
      return ctrl == null ? rows : rows.filter((r) => r.score >= ctrl);
    }
    return rows.filter((r) => Math.abs(r.score - score) <= 30);
  }, [rows, range, ctrl, score]);

  if (!curve.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
        <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-600 mb-1">
          {year} 年 {prov} · {cat} 没有一分一段表
        </p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-md mx-auto">
          该省该科类未公布一分一段统计（或本年数据未收录）。位次相关的功能
          （预估位次、位次反推、跨年等位分）在这一组合下不可用。
        </p>
      </div>
    );
  }

  const total = curve[curve.length - 1][1];
  const top = curve[0][0];
  const bottom = curve[curve.length - 1][0];
  const percentile = rank
    ? Math.round(((total - rank) / total) * 1000) / 10
    : null;

  const stat = "rounded-xl border border-gray-200 px-3 py-2.5 bg-white";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={stat}>
          <div className="text-xs text-gray-400">你的分数</div>
          <div className="text-xl font-bold text-gray-900">{score}</div>
        </div>
        <div className={stat}>
          <div className="text-xs text-gray-400">你的位次</div>
          <div className="text-xl font-bold text-indigo-700">
            {rank ? `#${rank.toLocaleString()}` : "—"}
          </div>
          {percentile != null && (
            <div className="text-[11px] text-gray-400">
              击败 {percentile}% 考生
            </div>
          )}
        </div>
        <div className={stat}>
          <div className="text-xs text-gray-400">本科线 / 你的分差</div>
          <div className="text-xl font-bold text-gray-900">
            {ctrl ?? "—"}
            {ctrl != null && (
              <span className="text-xs font-medium text-gray-400 ml-1">
                {score - ctrl >= 0 ? `+${score - ctrl}` : score - ctrl}
              </span>
            )}
          </div>
        </div>
        <div className={stat}>
          <div className="text-xs text-gray-400">等位分（同位次折算）</div>
          <div className="text-xl font-bold text-emerald-700">
            {equiv ? equiv.score : "—"}
          </div>
          <div className="text-[11px] text-gray-400">
            {equiv ? `相当于 ${equiv.year} 年` : "需另一年数据就绪"}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-800">
            {year} 年 {prov} · {cat} 一分一段
          </h3>
          <span className="text-[11px] text-gray-400">
            {top}–{bottom} 分，{curve.length} 个分数档，累计{" "}
            {total.toLocaleString()} 人
          </span>
          <div className="ml-auto inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[11px]">
            {(
              [
                ["above", "本科线以上"],
                ["around", "我的分数 ±30"],
                ["all", "全部"],
              ] as ["above" | "around" | "all", string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                aria-pressed={range === k}
                className={`px-2 py-1 rounded-md transition-colors ${
                  range === k
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
              <tr className="text-[11px] text-gray-500">
                <th className="px-4 py-2 text-left font-medium">分数</th>
                <th className="px-4 py-2 text-right font-medium">本段人数</th>
                <th className="px-4 py-2 text-right font-medium">累计位次</th>
                <th className="px-4 py-2 text-right font-medium">较本科线</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const mine = r.score === score;
                const isCtrl = ctrl != null && r.score === ctrl;
                return (
                  <tr
                    key={r.score}
                    className={`border-t border-gray-50 ${
                      mine
                        ? "bg-indigo-50 font-semibold"
                        : isCtrl
                          ? "bg-amber-50/60"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-1.5 text-gray-800">
                      {r.score}
                      {mine && (
                        <span className="ml-1.5 text-[10px] text-indigo-600">
                          你的分数
                        </span>
                      )}
                      {isCtrl && (
                        <span className="ml-1.5 text-[10px] text-amber-600">
                          本科线
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right text-gray-600 tabular-nums">
                      {r.band.toLocaleString()}
                    </td>
                    <td className="px-4 py-1.5 text-right text-gray-800 tabular-nums">
                      {r.cumulative.toLocaleString()}
                    </td>
                    <td className="px-4 py-1.5 text-right text-gray-400 tabular-nums">
                      {ctrl != null ? r.score - ctrl : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          本段人数 =
          相邻两档累计位次之差；「累计位次」为该分数及以上的考生总数。
          数据为第三方整理的公开一分一段表，非官方口径。
        </p>
      </div>
    </div>
  );
}
