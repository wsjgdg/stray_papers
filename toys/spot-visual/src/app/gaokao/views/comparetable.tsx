"use client";

import { Heart, Scale } from "lucide-react";
import { getSchool, type School, type HistoryDataset } from "@/lib/gaokao-data";
import { tierOf, TIER_COLOR, TIER_LABEL, type Tier } from "./shared";
import { TrendSpark } from "./trendspark";

// ═══ 对比视图：收藏院校并排比较 ═══
export function CompareTable({
  shortlist,
  admByName,
  history,
  prov,
  cat,
  score,
  onRemove,
  onLocate,
}: {
  shortlist: string[];
  admByName: Map<
    string,
    {
      minScore: number;
      minRank: number;
      batch: string;
      planCount?: number;
      scoreDelta?: number;
      planDelta?: number;
    }
  >;
  prov: string;
  cat: string;
  score: number;
  history?: HistoryDataset | null;
  onRemove: (code: string) => void;
  onLocate: (code: string) => void;
}) {
  if (!shortlist.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
        <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-600 mb-1">还没有收藏院校</p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
          在详情面板或冲稳保清单里点 ❤️ 把院校加入对比（最多 6
          所），这里会并排比较投档线、排名、招生计划与学科实力。
        </p>
      </div>
    );
  }

  const cols = shortlist.map((name) => ({
    name,
    school: getSchool(name),
    adm: admByName.get(name),
  }));

  const th =
    "px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap";
  const td = "px-3 py-2 text-sm text-gray-800 whitespace-nowrap";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>
              对比项（{prov}·{cat}）
            </th>
            {cols.map(({ name, school }) => (
              <th key={name} className={th}>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onLocate(name)}
                    className="font-semibold text-gray-900 text-sm hover:text-indigo-600 hover:underline truncate max-w-[130px]"
                  >
                    {name}
                  </button>
                  <button
                    onClick={() => onRemove(name)}
                    title="移出对比"
                    className="text-gray-300 hover:text-rose-500 shrink-0"
                  >
                    <Heart className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>层次</td>
            {cols.map(({ name, school }) => (
              <td key={name} className={td}>
                <span className="flex gap-1">
                  {school?.is985 && (
                    <span className="text-[10px] px-1 rounded bg-red-50 text-red-600 border border-red-100">
                      985
                    </span>
                  )}
                  {school?.is211 && (
                    <span className="text-[10px] px-1 rounded bg-blue-50 text-blue-600 border border-blue-100">
                      211
                    </span>
                  )}
                  {school?.isDFC && !school?.is211 && (
                    <span className="text-[10px] px-1 rounded bg-amber-50 text-amber-600 border border-amber-100">
                      双一流
                    </span>
                  )}
                  {school?.isPrivate && (
                    <span className="text-[10px] px-1 rounded bg-gray-50 text-gray-500 border border-gray-200">
                      民办
                    </span>
                  )}
                </span>
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>软科排名</td>
            {cols.map(({ name, school }) => (
              <td key={name} className={td}>
                {school?.rank ? (
                  `第 ${school.rank} 名`
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>跨年趋势</td>
            {cols.map(({ name }) => {
              const tv = history?.cats[cat]?.[name];
              const n = tv ? tv.filter((v) => v != null).length : 0;
              return (
                <td key={name} className="px-3 py-1">
                  {n >= 2 ? (
                    <TrendSpark years={history!.years} values={tv!} compact />
                  ) : n === 1 ? (
                    // 单年数据画不出趋势：直出数值，避免误认为「无数据」
                    <span
                      className="text-[11px] text-gray-400"
                      title="仅 1 年可比数据"
                    >
                      {tv!.find((v) => v != null)}
                      <span className="text-gray-300"> 单年</span>
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>投档线（较去年）</td>
            {cols.map(({ name, adm }) => (
              <td key={name} className={td}>
                {adm ? (
                  <>
                    <b>{adm.minScore}</b>
                    {adm.scoreDelta != null && (
                      <span
                        className={`text-[11px] ml-1 ${adm.scoreDelta > 0 ? "text-rose-500" : adm.scoreDelta < 0 ? "text-emerald-600" : "text-gray-400"}`}
                      >
                        {adm.scoreDelta > 0 ? "+" : ""}
                        {adm.scoreDelta}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-300">本省无投档线</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>
              你的分差（{score} 分）
            </td>
            {cols.map(({ name, adm }) => {
              if (!adm)
                return (
                  <td key={name} className={td}>
                    <span className="text-gray-300">—</span>
                  </td>
                );
              const gap = score - adm.minScore;
              const tier = tierOf(gap);
              return (
                <td
                  key={name}
                  className={td + " font-semibold"}
                  style={{
                    color: tier === "none" ? "#94A3B8" : TIER_COLOR[tier],
                  }}
                >
                  {gap <= 0 ? `差 ${-gap} 分` : `超 ${gap} 分`}
                  <span className="text-[11px] font-normal text-gray-400 ml-1">
                    {tier === "none" ? "超区间" : TIER_LABEL[tier]}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>最低位次</td>
            {cols.map(({ name, adm }) => (
              <td key={name} className={td}>
                {adm ? (
                  adm.minRank ? (
                    adm.minRank.toLocaleString()
                  ) : (
                    "—"
                  )
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>
              招生计划（较去年）
            </td>
            {cols.map(({ name, adm }) => (
              <td key={name} className={td}>
                {adm?.planCount != null ? (
                  <>
                    {adm.planCount} 人
                    {adm.planDelta != null && adm.planDelta !== 0 && (
                      <span
                        className={`text-[11px] ml-1 ${adm.planDelta > 0 ? "text-emerald-600" : "text-rose-500"}`}
                      >
                        {adm.planDelta > 0 ? "+" : ""}
                        {adm.planDelta}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>
              学科评估（第四轮）
            </td>
            {cols.map(({ name, school }) => (
              <td key={name} className={td}>
                {school?.aClass ? (
                  <span>
                    A+ {school.aPlus} · A 类共 {school.aClass} 项
                  </span>
                ) : (
                  <span className="text-gray-300">无 A 类</span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className={td + " text-gray-400 text-xs align-top"}>A+ 学科</td>
            {cols.map(({ name, school }) => (
              <td key={name} className={td}>
                {school?.topDisc?.length ? (
                  <span className="flex flex-wrap gap-1">
                    {school.topDisc.map((d) => (
                      <span
                        key={d}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100"
                      >
                        {d}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
