"use client";

import { useMemo, useState } from "react";
import { Search, Check, Plus } from "lucide-react";
import {
  activeSchools,
  getSchool,
  type MajorDataset,
  type MajorRow,
} from "@/lib/gaokao-data";
import { tierOf, TIER_COLOR, TIER_LABEL, type Tier } from "./shared";

interface WishItem {
  name: string;
  group: string;
  major: string;
}

// ═══ 按专业反查院校：跨校搜专业名，按可达性排序 ═══
export function MajorSearch({
  majors,
  q,
  setQ,
  prov,
  cat,
  score,
  year,
  hasMajors,
  majorsTried,
  onOpen,
  onAddWish,
  hasWish,
}: {
  majors: MajorDataset | null;
  q: string;
  setQ: (v: string) => void;
  prov: string;
  cat: string;
  score: number;
  year: number;
  hasMajors: boolean; // 专业级数据仅 2025
  /** 已尝试拉取过专业数据（用于区分「加载中」与「本省无数据」） */
  majorsTried: boolean;
  onOpen: (name: string) => void;
  onAddWish: (w: WishItem) => void;
  hasWish: (name: string, group: string, major: string) => boolean;
}) {
  const [chipOffset, setChipOffset] = useState(0);

  // 推荐池：该省科类开设的全部专业名，按「用户分数可达的学校数」降序，
  // 再按开设学校数；池子通常数百项，5 个一批循环展示。
  const pool = useMemo(() => {
    if (!majors) return [];
    const agg = new Map<
      string,
      { reach: number; count: number; minScore: number }
    >();
    for (const rows of Object.values(majors.cats[cat] ?? {})) {
      for (const r of rows) {
        const e = agg.get(r[1]) ?? { reach: 0, count: 0, minScore: 1e9 };
        e.count++;
        e.minScore = Math.min(e.minScore, r[3]);
        const gap = score - r[3];
        if (gap >= -18 && gap <= 55) e.reach++;
        agg.set(r[1], e);
      }
    }
    return [...agg.entries()]
      .sort((a, b) => b[1].reach - a[1].reach || b[1].count - a[1].count)
      .map(([name]) => name);
  }, [majors, cat, score]);

  const chips = useMemo(
    () =>
      pool.length
        ? Array.from(
            { length: Math.min(5, pool.length) },
            (_, i) => pool[(chipOffset + i) % pool.length],
          )
        : [],
    [pool, chipOffset],
  );

  const results = useMemo(() => {
    const kw = q.trim();
    if (!kw || !majors) return null;
    const catData = majors.cats[cat] ?? {};
    const out: {
      uni: string;
      hits: MajorRow[];
      best: MajorRow;
    }[] = [];
    for (const [uni, rows] of Object.entries(catData)) {
      const hits = rows.filter((r) => r[1].includes(kw));
      if (!hits.length) continue;
      if (!getSchool(uni)) continue; // 画像缺失（如院校已不在招生表）也允许展示
      const best = hits.reduce((a, b) => (b[3] < a[3] ? b : a));
      out.push({ uni, hits, best });
    }
    out.sort((a, b) => b.best[3] - a.best[3]); // 难度优先（最低分高的在前）
    return out;
  }, [q, majors, cat]);

  const kw = q.trim();

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        {year !== 2025 && hasMajors && (
          <p className="mb-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
            {year} 年专业级数据未覆盖：以下基于 2025
            年专业目录（专业设置基本稳定），分数线为 2025 年口径。
          </p>
        )}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入专业关键词，如 计算机 / 法学 / 临床"
            className="flex-1 h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hasMajors && (
            <span className="text-[11px] text-gray-400">
              {year === 2025 ? "试试：" : "试试（2025 目录）："}
            </span>
          )}
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setQ(c)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              {c}
            </button>
          ))}
          {pool.length > 5 && (
            <button
              onClick={() => setChipOffset((o) => (o + 5) % pool.length)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 border border-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              换一批
            </button>
          )}
          <span className="text-[10px] text-gray-300">
            共 {pool.length} 个专业名
          </span>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          在 {prov}·{cat}{" "}
          的全部院校专业（组）中匹配（本科批口径），按最易达匹配专业的最低分排序；点行进详情，点
          + 把该系最易达的专业加入志愿表。
        </p>
      </div>
      {!hasMajors && !majorsTried ? (
        <div className="py-14 text-center text-sm text-gray-400">
          正在加载专业目录（2025 年口径）…
        </div>
      ) : !hasMajors ? (
        <div className="py-14 px-8 text-center text-sm text-gray-400 leading-relaxed">
          {prov}暂无专业级投档数据
          <br />
          <span className="text-[11px] text-gray-300">
            专业级数据集仅覆盖 28 个省份（缺山西 / 青海 /
            西藏等）。院校级投档与一分一段不受影响。
          </span>
        </div>
      ) : !kw ? (
        <div className="py-14 text-center text-sm text-gray-400">
          输入专业关键词开始反查
        </div>
      ) : !majors ? (
        <div className="py-14 text-center text-sm text-gray-400">
          正在加载专业数据…
        </div>
      ) : !results?.length ? (
        <div className="py-14 text-center text-sm text-gray-400">
          本省本科批没有院校开设名称含「{kw}」的专业
        </div>
      ) : (
        <>
          <div className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
            {results.length} 所院校开设相关专业
            {year !== 2025 && (
              <span className="text-amber-500">（2025 年数据）</span>
            )}
          </div>
          <ul className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {results.slice(0, 60).map(({ uni, hits, best }) => {
              const gap = score - best[3];
              const t = tierOf(gap);
              const color = t === "none" ? "#94A3B8" : TIER_COLOR[t];
              const school = getSchool(uni);
              return (
                <li
                  key={uni}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(uni)}
                  className="flex items-center gap-3 px-4 py-2.5 text-left hover:bg-indigo-50/40 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[170px]">
                    {uni}
                  </span>
                  {school?.rank && (
                    <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                      软科{school.rank}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 truncate flex-1 hidden sm:inline">
                    {hits
                      .slice()
                      .sort((a, b) => a[3] - b[3])
                      .slice(0, 3)
                      .map((r) => `${r[1]} ${r[3]}`)
                      .join(" · ")}
                    {hits.length > 3 ? ` · +${hits.length - 3}` : ""}
                  </span>
                  <span
                    className="text-sm font-semibold shrink-0"
                    style={{ color }}
                  >
                    {best[3]} 分
                    <span className="text-[11px] font-normal ml-1">
                      {t === "none" ? "超区间" : TIER_LABEL[t]}
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddWish({ name: uni, group: best[0], major: best[1] });
                    }}
                    title="把最易达的匹配专业加入志愿表"
                    className={`shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors ${hasWish(uni, best[0], best[1]) ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white text-gray-300 border-gray-200 hover:text-emerald-500"}`}
                  >
                    {hasWish(uni, best[0], best[1]) ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
