"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Check, Share2, Plus, Download } from "lucide-react";
import { getSchool, type MajorDataset } from "@/lib/gaokao-data";
import { tierOf, TIER_COLOR, TIER_LABEL, type Tier } from "./shared";

interface WishItem {
  name: string;
  group: string;
  major: string;
}

// ═══ 志愿表模拟：有序院校专业组清单 ═══
export function WishTable({
  items,
  admByName,
  majors,
  prov,
  cat,
  score,
  year,
  onMove,
  onRemove,
  onClear,
  onOpen,
}: {
  items: WishItem[];
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
  majors: MajorDataset | null;
  prov: string;
  cat: string;
  score: number;
  year: number;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
  onClear: () => void;
  onOpen: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // ── 梯度体检：把「冲/稳/保/区间外/未知」数出来，并给出风险提示 ──
  // 志愿表最容易出的问题不是分数算错，而是结构失衡（全冲没有保底）。
  // 注意「区间外」和「未知」是两回事：前者有投档分但差太多（占着名额不会命中），
  // 后者查不到投档分（跨批次/跨年/该校无专业数据），不能混成一个数。
  const ladder = useMemo(() => {
    const c = { reach: 0, match: 0, safe: 0, out: 0, unknown: 0 };
    for (const w of items) {
      const row = majors?.cats[cat]?.[w.name]?.find(
        (r) => r[0] === w.group && r[1] === w.major,
      );
      const minScore = row?.[3] ?? admByName.get(w.name)?.minScore;
      if (minScore == null) {
        c.unknown++;
        continue;
      }
      const t = tierOf(score - minScore);
      if (t === "none") c.out++;
      else c[t]++;
    }
    const known = items.length - c.unknown;
    const actionable = known - c.out;
    const warnings: { level: "danger" | "warn"; text: string }[] = [];
    if (known >= 3) {
      if (c.safe === 0)
        warnings.push({
          level: "danger",
          text: "没有保底志愿：一旦今年位次波动，整张表可能全落空，建议至少留 2 个「保」。",
        });
      else if (c.safe === 1)
        warnings.push({
          level: "warn",
          text: "保底只有 1 个，建议再加 1~2 个招生计划多的院校兜底。",
        });
      if (actionable > 0 && c.reach / actionable > 0.5)
        warnings.push({
          level: "warn",
          text: `冲的比例偏高（${c.reach}/${actionable}）：前面留 20%~35% 就够，把名额让给稳和保。`,
        });
      if (c.match === 0)
        warnings.push({
          level: "warn",
          text: "没有「稳」档：稳是主力命中区，建议补 2~4 个。",
        });
    }
    if (c.out > 0)
      warnings.push({
        level: "warn",
        text: `${c.out} 个志愿的投档线离你的分数太远（区间外），基本不会命中，建议替换成够得着的院校。`,
      });
    if (c.unknown > 0)
      warnings.push({
        level: "warn",
        text: `${c.unknown} 个志愿查不到投档分（跨批次/跨年或该专业无数据），无法判断梯度。`,
      });
    return { ...c, total: items.length, actionable, warnings };
  }, [items, admByName, majors, cat, score]);

  const exportImage = async () => {
    const { downloadWishCard } = await import("@/lib/wish-card");
    const rows = items.map((w) => {
      const school = getSchool(w.name);
      const row = majors?.cats[cat]?.[w.name]?.find(
        (r) => r[0] === w.group && r[1] === w.major,
      );
      return {
        name: w.name,
        major: w.major,
        group: w.group,
        minScore: row?.[3],
        rank: school?.rank,
      };
    });
    downloadWishCard({ prov, cat, year, score, items: rows });
  };

  const copyText = () => {
    const lines = items.map((w, i) => {
      const school = getSchool(w.name);
      const row = majors?.cats[cat]?.[school?.name ?? ""]?.find(
        (r) => r[0] === w.group && r[1] === w.major,
      );
      const s = w.name;
      const g = w.group ? ` ${w.group.replace(/[（）()]/g, "")}组` : "";
      return `${i + 1}. ${s}${g} ${w.major}${row ? `（最低 ${row[3]} 分）` : ""}`;
    });
    navigator.clipboard
      .writeText(
        `志愿表（${prov}·${cat}）\n${lines.join("\n")}\n—— 来自华夏探索·志愿探索`,
      )
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
        <ClipboardList className="w-4 h-4 text-indigo-500 shrink-0" />
        <h3 className="text-sm font-bold text-gray-800">
          我的志愿表（{items.length}）
        </h3>
        {items.length > 0 && (
          <>
            <button
              onClick={copyText}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              {copied ? "已复制" : "复制文本"}
            </button>
            <button
              onClick={exportImage}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              导出图片
            </button>
            <button
              onClick={onClear}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              清空
            </button>
          </>
        )}
      </div>
      {items.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-gray-400">梯度体检</span>
            {(
              [
                ["reach", "冲"],
                ["match", "稳"],
                ["safe", "保"],
              ] as [Tier, string][]
            ).map(([k, label]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 text-gray-600"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: TIER_COLOR[k] }}
                />
                {label} {ladder[k]}
              </span>
            ))}
            {ladder.out > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-400">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                区间外 {ladder.out}
              </span>
            )}
            {ladder.unknown > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-300">
                <span className="w-2 h-2 rounded-full border border-gray-300" />
                未知 {ladder.unknown}
              </span>
            )}
            <span className="text-gray-300">|</span>
            <span className="text-gray-400">共 {ladder.total} 个志愿</span>
          </div>
          {ladder.warnings.map((w) => (
            <p
              key={w.text}
              className={`text-[11px] leading-relaxed ${w.level === "danger" ? "text-rose-600" : "text-amber-600"}`}
            >
              {w.level === "danger" ? "⚠ " : "· "}
              {w.text}
            </p>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <div className="py-14 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600 mb-1">
            志愿表还是空的
          </p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
            在「专业反查」结果行、院校详情的专业列表里点{" "}
            <Plus className="w-3 h-3 inline -mt-0.5" />
            ，把「院校 + 专业组 +
            专业」加入志愿表；上下箭头调整顺序。多数省份本科批可填 45~96
            个院校专业组志愿，以本省规则为准。
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((w, i) => {
            const school = getSchool(w.name);
            const adm = admByName.get(w.name);
            const row = majors?.cats[cat]?.[school?.name ?? ""]?.find(
              (r) => r[0] === w.group && r[1] === w.major,
            );
            const minScore = row?.[3] ?? adm?.minScore;
            const gap = minScore != null ? score - minScore : null;
            const t = gap != null ? tierOf(gap) : "none";
            return (
              <li
                key={`${w.name}-${w.major}-${i}`}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <button
                  onClick={() => onOpen(w.name)}
                  className="text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline truncate max-w-[150px]"
                >
                  {w.name}
                </button>
                {school?.rank && (
                  <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0 hidden sm:inline">
                    软科{school.rank}
                  </span>
                )}
                <span className="text-xs text-gray-500 truncate flex-1">
                  {w.major}
                  {w.group && (
                    <span className="text-gray-300 ml-1 text-[10px]">
                      {w.group.replace(/[（）()]/g, "")}组
                    </span>
                  )}
                  {row ? (
                    <span className="text-gray-400 ml-1.5">{row[3]} 分</span>
                  ) : (
                    <span
                      className="text-amber-400 ml-1.5"
                      title="切到该省后可显示实时分差"
                    >
                      分数待查
                    </span>
                  )}
                </span>
                {gap != null && (
                  <span
                    className="text-xs font-semibold shrink-0"
                    style={{ color: t === "none" ? "#94A3B8" : TIER_COLOR[t] }}
                  >
                    {gap <= 0 ? `差 ${-gap}` : `超 ${gap}`}
                  </span>
                )}
                <span className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    className="w-5 h-5 rounded border border-gray-200 text-gray-400 text-[10px] disabled:opacity-30 hover:bg-gray-50"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMove(i, 1)}
                    disabled={i === items.length - 1}
                    className="w-5 h-5 rounded border border-gray-200 text-gray-400 text-[10px] disabled:opacity-30 hover:bg-gray-50"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onRemove(i)}
                    className="w-5 h-5 rounded border border-gray-200 text-gray-400 text-[10px] hover:text-rose-500 hover:border-rose-200"
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
