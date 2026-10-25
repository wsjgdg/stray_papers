"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Target,
  AlertTriangle,
  MapPin,
  ListFilter,
  Map as MapIcon,
  School as SchoolIcon,
  Share2,
  Check,
  Download,
  Palette,
  Heart,
  Scale,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import {
  GAOKAO_DATA_URL,
  GAOKAO_ENRICH_URL,
  activeProvinces,
  activeSchools,
  admissionsFor,
  controlLine,
  dataYear,
  dataSource,
  fetchHistory,
  getSchool,
  loadEnrichDataset,
  loadFullDataset,
  type HistoryDataset,
  rankForScore,
  type School,
} from "@/lib/gaokao-data";
import {
  provinceCats,
  recommend,
  type RecommendItem as RecommendItemT,
} from "@/lib/gaokao";
import { downloadGaokaoShareCard } from "@/lib/gaokao-share-card";
import { PROVINCE_CENTERS } from "@/lib/china-geo";
import ChinaMap from "@/components/map/china-map";

type Tier = "reach" | "match" | "safe";

// 院校筛选 chips
type FilterKey = "all" | "is985" | "is211" | "isDFC" | "top100";
const FILTERS: [FilterKey, string][] = [
  ["all", "全部"],
  ["is985", "985"],
  ["is211", "211"],
  ["isDFC", "双一流"],
  ["top100", "软科前100"],
];
function matchFilter(s: School | undefined, f: FilterKey): boolean {
  if (!s) return false;
  if (f === "all") return true;
  if (f === "is985") return s.is985;
  if (f === "is211") return s.is211;
  if (f === "isDFC") return s.isDFC;
  return (s.rankNum ?? 9999) <= 100; // top100
}

const TIER_COLOR: Record<Tier, string> = {
  reach: "#F59E0B", // 冲
  match: "#10B981", // 稳
  safe: "#3B82F6", // 保
};
const TIER_LABEL: Record<Tier, string> = {
  reach: "冲一冲",
  match: "稳一稳",
  safe: "保一保",
};
const TIERS: Tier[] = ["reach", "match", "safe"];

// 院校层次着色（地图第二种着色模式）
const LEVEL_COLOR = {
  is985: "#DC2626",
  is211: "#2563EB",
  isDFC: "#D97706",
  normal: "#64748B",
} as const;
const LEVEL_LEGEND: [keyof typeof LEVEL_COLOR, string][] = [
  ["is985", "985"],
  ["is211", "211"],
  ["isDFC", "双一流"],
  ["normal", "其他"],
];

function tierOf(gap: number): Tier | "none" {
  if (gap >= -18 && gap <= 0) return "reach";
  if (gap > 0 && gap <= 22) return "match";
  if (gap > 22 && gap <= 55) return "safe";
  return "none";
}

function jitter(code: string): [number, number] {
  let h = 0;
  for (let i = 0; i < code.length; i++)
    h = (h * 31 + code.charCodeAt(i)) % 100000;
  const dx = ((h % 100) / 100 - 0.5) * 1.1;
  const dy = ((((h / 100) | 0) % 100) / 100 - 0.5) * 1.1;
  return [dx, dy];
}

function levelColor(s: {
  is985: boolean;
  is211: boolean;
  isDFC: boolean;
}): string {
  if (s.is985) return LEVEL_COLOR.is985;
  if (s.is211) return LEVEL_COLOR.is211;
  if (s.isDFC) return LEVEL_COLOR.isDFC;
  return LEVEL_COLOR.normal;
}

const LS_KEY = "gaokao:last";

export default function GaoKaoPage() {
  const [dataState, setDataState] = useState<"loading" | "ready" | "fail">(
    "loading",
  );
  const [prov, setProv] = useState("");
  const [cat, setCat] = useState("");
  const [score, setScore] = useState(600);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list" | "compare">("map");
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<"tier" | "level">("tier");
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [enriched, setEnriched] = useState(false); // 增强数据（排名/学科）到达后触发重算
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"gap" | "rank" | "score">("gap");

  const ready = dataState === "ready";
  const provinces = useMemo(() => (ready ? activeProvinces() : []), [ready]);
  const schools = useMemo(() => (ready ? activeSchools() : []), [ready]);

  // ── 加载数据文件（主数据必须；增强数据可选，失败不阻塞） ──
  useEffect(() => {
    let alive = true;
    fetch(GAOKAO_DATA_URL)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => {
        if (alive && loadFullDataset(d)) {
          setDataState("ready");
          fetch(GAOKAO_ENRICH_URL)
            .then((r) => (r.ok ? r.json() : null))
            .then((e) => {
              if (alive && e && loadEnrichDataset(e)) setEnriched(true);
            })
            .catch(() => {});
        } else if (alive) setDataState("fail");
      })
      .catch(() => alive && setDataState("fail"));
    return () => {
      alive = false;
    };
  }, []);

  // ── 数据就绪后还原位置：URL 参数 > localStorage > 默认 ──
  useEffect(() => {
    if (!ready) return;
    const provs = activeProvinces();
    if (!provs.length) {
      setDataState("fail");
      return;
    }
    let p = "",
      c = "",
      s = NaN;
    try {
      const sp = new URLSearchParams(window.location.search);
      p = sp.get("prov") ?? "";
      c = sp.get("cat") ?? "";
      s = Number(sp.get("score"));
    } catch {}
    if (!p || !provs.some((x) => x.name === p)) {
      p = "";
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null");
        if (saved?.prov && provs.some((x) => x.name === saved.prov)) {
          p = saved.prov;
          c = saved.cat ?? "";
          s = Number(saved.score);
        }
      } catch {}
    }
    const hit = provs.find((x) => x.name === p) ?? provs[0];
    const cats = hit.cats;
    setProv(hit.name);
    setCat(cats.includes(c) ? c : cats[0]);
    if (Number.isFinite(s) && s >= 200 && s <= 750) setScore(Math.round(s));
  }, [ready]);

  // ── 位置变化：同步 URL + localStorage ──
  useEffect(() => {
    if (!ready || !prov) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ prov, cat, score }));
      const sp = new URLSearchParams(window.location.search);
      sp.set("prov", prov);
      if (cat) sp.set("cat", cat);
      sp.set("score", String(score));
      window.history.replaceState(null, "", `?${sp.toString()}`);
    } catch {}
  }, [ready, prov, cat, score]);

  // ── 收藏对比名单（localStorage 持久化，跨省保留） ──
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("gaokao:shortlist") ?? "[]",
      );
      if (Array.isArray(saved))
        setShortlist(saved.filter((c) => typeof c === "string"));
    } catch {}
  }, []);
  const toggleShort = (code: string) => {
    setShortlist((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code].slice(-6); // 最多对比 6 所
      try {
        localStorage.setItem("gaokao:shortlist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const cats = useMemo(() => (ready ? provinceCats(prov) : []), [ready, prov]);

  // ── 小屏检测（地图降高） ──
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ── 键盘：←→ 切省，↑↓ 切科类（输入框聚焦时不劫持） ──
  useEffect(() => {
    if (!ready) return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const names = activeProvinces().map((p) => p.name);
        const i = names.indexOf(prov);
        const next =
          e.key === "ArrowRight"
            ? (i + 1) % names.length
            : (i - 1 + names.length) % names.length;
        setProv(names[next]);
        setCat(provinceCats(names[next])[0] ?? "");
        setSelectedCode(null);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const list = provinceCats(prov);
        const i = list.indexOf(cat);
        if (list.length > 1) {
          const next =
            e.key === "ArrowDown"
              ? (i + 1) % list.length
              : (i - 1 + list.length) % list.length;
          setCat(list[next]);
          setSelectedCode(null);
        }
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ready, prov, cat]);

  const userRank = useMemo(
    () => (ready ? rankForScore(prov, cat, score) : 0),
    [ready, prov, cat, score],
  );
  const ctrl = useMemo(
    () => (ready ? controlLine(prov, cat) : undefined),
    [ready, prov, cat],
  );

  const admByCode = useMemo(() => {
    const m = new Map<
      string,
      {
        minScore: number;
        minRank: number;
        batch: string;
        planCount?: number;
        scoreDelta?: number;
        planDelta?: number;
      }
    >();
    if (!ready) return m;
    for (const a of admissionsFor(prov, cat))
      m.set(a.schoolCode, {
        minScore: a.minScore,
        minRank: a.minRank,
        batch: a.batch,
        planCount: a.planCount,
        scoreDelta: a.scoreDelta,
        planDelta: a.planDelta,
      });
    return m;
  }, [ready, prov, cat]);

  const points = useMemo(() => {
    if (!ready) return [];
    return schools
      .map((s) => {
        const adm = admByCode.get(s.code);
        if (!adm) return null;
        const gap = score - adm.minScore;
        const tier = tierOf(gap);
        if (tier === "none") return null; // 地图只画冲稳保三档内的院校
        if (!matchFilter(s, filter)) return null;
        const center = PROVINCE_CENTERS[s.prov];
        if (!center) return null;
        const [dx, dy] = jitter(s.code);
        const active = s.code === selectedCode;
        const levelText = s.is985
          ? "985"
          : s.is211
            ? "211"
            : s.isDFC
              ? "双一流"
              : "其他";
        return {
          name: s.name,
          value: [center[0] + dx, center[1] + dy] as [number, number],
          schoolCode: s.code,
          gap,
          tier,
          levelText,
          rank: s.rank,
          planCount: adm.planCount,
          symbolSize: active ? 22 : 14,
          itemStyle: {
            color: colorMode === "tier" ? TIER_COLOR[tier] : levelColor(s),
            borderColor: active ? "#0F172A" : "#ffffff",
            borderWidth: active ? 2.5 : 1.2,
            shadowBlur: 5,
            shadowColor: "rgba(15,23,42,0.28)",
          },
        };
      })
      .filter(Boolean);
  }, [
    ready,
    schools,
    admByCode,
    score,
    selectedCode,
    colorMode,
    filter,
    enriched,
  ]);

  const counts = useMemo(() => {
    const c: Record<Tier, number> = { reach: 0, match: 0, safe: 0 };
    for (const p of points as any[]) c[p.tier as Tier]++;
    return c;
  }, [points]);

  const rec = useMemo(
    () =>
      ready ? recommend(score, prov, cat, (s) => matchFilter(s, filter)) : null,
    [ready, score, prov, cat, filter, enriched],
  );

  // ── 院校搜索（限当前省·科类的投档线名单） ──
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q || !ready) return [];
    const out: {
      code: string;
      name: string;
      minScore: number;
      tier: Tier | "none";
      rank?: string;
    }[] = [];
    for (const a of admissionsFor(prov, cat)) {
      const s = getSchool(a.schoolCode);
      if (!s || !s.name.includes(q)) continue;
      out.push({
        code: s.code,
        name: s.name,
        minScore: a.minScore,
        tier: tierOf(score - a.minScore),
        rank: s.rank,
      });
      if (out.length >= 8) break;
    }
    return out;
  }, [query, ready, prov, cat, score]);

  const sortList = (list: RecommendItemT[]) => {
    const arr = [...list];
    if (sortKey === "rank")
      arr.sort((a, b) => (a.rankNum ?? 9999) - (b.rankNum ?? 9999));
    else if (sortKey === "score")
      arr.sort((a, b) => b.admission.minScore - a.admission.minScore);
    return arr;
  };

  // ── 历史投档线（按省懒加载，用于详情面板趋势图） ──
  const [history, setHistory] = useState<HistoryDataset | null>(null);
  useEffect(() => {
    if (!ready || !prov) return;
    let alive = true;
    setHistory(null);
    fetchHistory(prov).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [ready, prov]);

  // ── 分享文案（URL 客户端挂载后再取，避免预渲染不一致） ──
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(window.location.href);
  }, [prov, cat, score]);
  const shareText = `我在「志愿探索」查了 ${prov}·${cat} ${score} 分（位次约 ${
    userRank ? `#${userRank.toLocaleString()}` : "未知"
  }）：冲 ${counts.reach} / 稳 ${counts.match} / 保 ${counts.safe} 所。${shareUrl}`;

  const copyShare = () => {
    navigator.clipboard
      .writeText(shareText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const exportCard = () => {
    downloadGaokaoShareCard({
      prov,
      cat,
      score,
      rank: userRank,
      ctrl,
      year: dataYear() ?? 2025,
      counts,
    });
  };

  const option = useMemo<EChartsOption>(() => {
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p.data;
          if (!d || !d.tier) return String(p.name ?? "");
          const gapText = d.gap <= 0 ? `差 ${-d.gap} 分` : `超 ${d.gap} 分`;
          const rankText = d.rank ? ` · 软科${d.rank}` : "";
          const planText = d.planCount != null ? ` · 招${d.planCount}人` : "";
          return colorMode === "tier"
            ? `<b>${d.name}</b>${rankText}${planText}<br/>${TIER_LABEL[d.tier as Tier]} · ${gapText}`
            : `<b>${d.name}</b>${rankText}${planText}<br/>${d.levelText} · ${gapText}`;
        },
      },
      geo: {
        map: "china-compliant",
        roam: true,
        layoutCenter: ["50%", "52%"],
        layoutSize: "130%",
        label: { show: false },
        itemStyle: {
          areaColor: "#E9EEF4",
          borderColor: "#AFBCCD",
          borderWidth: 0.7,
        },
        emphasis: {
          itemStyle: { areaColor: "#DEE6F0" },
          label: { show: false },
        },
      },
      series: [
        {
          type: "scatter",
          coordinateSystem: "geo",
          symbolSize: 14,
          data: points as any[],
          emphasis: { scale: 1.5, label: { show: false } },
          label: { show: false },
          zlevel: 2,
        },
      ],
    };
  }, [points, colorMode]);

  const onSelect = (p: any) => {
    if (p?.seriesType === "scatter" && p?.data?.schoolCode) {
      setSelectedCode(
        p.data.schoolCode === selectedCode ? null : p.data.schoolCode,
      );
    }
  };

  const selSchool = selectedCode ? getSchool(selectedCode) : undefined;
  const selAdm = selectedCode ? admByCode.get(selectedCode) : undefined;
  const selGap = selAdm ? score - selAdm.minScore : 0;
  const selTier = selAdm ? tierOf(selGap) : "none";

  if (dataState === "loading") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 h-[420px] flex flex-col items-center justify-center gap-3 text-gray-400">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
          <p className="text-sm">正在加载 {dataYear() ?? 2025} 年投档线数据…</p>
        </div>
      </div>
    );
  }

  if (dataState === "fail") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-red-200 h-[300px] flex flex-col items-center justify-center gap-2 text-center px-6">
          <AlertTriangle className="w-8 h-8 text-red-300" />
          <p className="text-sm font-medium text-gray-700">
            投档线数据加载失败
          </p>
          <p className="text-xs text-gray-400">
            请刷新重试；数据文件位于 public/data/，需随站点一同部署。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">
            志愿探索 · 院校地图
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          输入分数估算位次；院校点位按冲稳保着色，点击查看详情。
          <span className="text-gray-400">
            （{dataYear()} 年 · {provinces.length} 省市 · {schools.length}{" "}
            所院校 · GaokaoCompass 非官方数据）
          </span>
        </p>
      </div>

      {/* 输入卡片 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm mb-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">招生省份</span>
            <select
              value={prov}
              onChange={(e) => {
                setProv(e.target.value);
                setCat(provinceCats(e.target.value)[0] ?? "");
                setSelectedCode(null);
              }}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              {provinces.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">科类</span>
            <select
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setSelectedCode(null);
              }}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">
              高考分数（{dataYear()}）
            </span>
            <input
              type="number"
              value={score}
              min={200}
              max={750}
              onChange={(e) => setScore(Number(e.target.value) || 0)}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <div className="text-xs text-indigo-500">
                你的预估位次（{prov}·{cat}）
              </div>
              <div className="text-2xl font-bold text-indigo-700">
                {userRank
                  ? `#${userRank.toLocaleString()}`
                  : "该科类暂无一分一段表"}
              </div>
            </div>
          </div>
          {ctrl != null && (
            <div className="text-xs text-gray-500">
              本科线 <b className="text-gray-700">{ctrl}</b>
              <span className="text-gray-400">
                （你的分数超线 {score - ctrl >= 0 ? "+" : ""}
                {score - ctrl} 分）
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: TIER_COLOR.reach }}
              />
              冲 {counts.reach}
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: TIER_COLOR.match }}
              />
              稳 {counts.match}
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: TIER_COLOR.safe }}
              />
              保 {counts.safe}
            </span>
          </div>
        </div>
      </div>

      {/* 分享（双视图共用） */}
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-[1fr_210px] sm:items-end">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1">
            <Share2 className="w-3.5 h-3.5 text-indigo-500" /> 分享卡 ·
            #WorkBuddy #1024程序员节
          </div>
          <pre className="text-[11px] text-gray-500 whitespace-pre-wrap font-sans leading-relaxed max-h-[72px] overflow-y-auto">
            {shareText}
          </pre>
        </div>
        <div className="grid gap-2">
          <button
            onClick={copyShare}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
            {copied ? "已复制分享文案" : "复制分享文案"}
          </button>
          <button
            onClick={exportCard}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors border border-gray-300"
          >
            <Download className="w-4 h-4" />
            导出分享卡图片
          </button>
        </div>
      </div>

      {/* 地图 / 清单切换 + 院校搜索 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(
            [
              ["map", MapIcon, "院校地图", 0],
              ["list", ListFilter, "冲稳保清单", 0],
              ["compare", Scale, "对比", shortlist.length],
            ] as const
          ).map(([v, Icon, label, n]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${view === v ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "text-gray-500 hover:text-gray-800"}`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {n > 0 && (
                <span className="text-[10px] px-1 rounded-full bg-indigo-600 text-white">
                  {n}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索本省院校，如 郑州大学"
            className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          {query.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {searchResults.length ? (
                searchResults.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => {
                      setSelectedCode(r.code);
                      setQuery("");
                      setView("map");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900 truncate">
                      {r.name}
                    </span>
                    {r.rank && (
                      <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                        软科{r.rank}
                      </span>
                    )}
                    <span
                      className="ml-auto text-xs shrink-0"
                      style={{
                        color:
                          r.tier === "none" ? "#94A3B8" : TIER_COLOR[r.tier],
                      }}
                    >
                      {r.tier === "none"
                        ? "超区间"
                        : `${TIER_LABEL[r.tier]} · ${r.minScore}分`}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2.5 text-xs text-gray-400">
                  当前省份·科类下没有匹配的院校
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 院校筛选 + 清单排序 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-400 mr-1">筛选</span>
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${filter === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
          >
            {label}
          </button>
        ))}
        <span className="text-gray-300 mx-1">|</span>
        <span className="text-gray-400 mr-1">清单排序</span>
        {(
          [
            ["gap", "按分差"],
            ["rank", "按排名"],
            ["score", "按投档线"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${sortKey === k ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
          >
            {label}
          </button>
        ))}
        {enriched && (
          <span className="text-gray-400 ml-1 hidden sm:inline">
            含软科排名 · 学科评估 · 官方层次标签
          </span>
        )}
      </div>

      {view === "map" ? (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          {/* 院校地图 */}
          <section className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <ChinaMap
              option={option}
              onSelect={onSelect}
              height={isMobile ? 380 : 560}
              className="w-full"
            />
            <div className="absolute left-3 bottom-3 flex flex-wrap gap-2 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2.5 py-2">
              {colorMode === "tier"
                ? TIERS.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-[11px] text-gray-600"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: TIER_COLOR[t] }}
                      />
                      {TIER_LABEL[t]}
                    </span>
                  ))
                : LEVEL_LEGEND.map(([k, label]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 text-[11px] text-gray-600"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: LEVEL_COLOR[k] }}
                      />
                      {label}
                    </span>
                  ))}
            </div>
            <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
              <button
                onClick={() =>
                  setColorMode(colorMode === "tier" ? "level" : "tier")
                }
                className="flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2 py-1 hover:bg-gray-50 transition-colors"
              >
                <Palette className="w-3 h-3" />
                {colorMode === "tier" ? "冲稳保" : "院校层次"}着色
              </button>
              <span className="text-[10px] text-gray-400 bg-white/80 rounded px-1.5 py-0.5">
                可滚轮缩放 / 拖拽
              </span>
            </div>
          </section>

          {/* 详情面板 */}
          <aside className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-[68px]">
            {selSchool && selAdm ? (
              <motion.div
                key={selSchool.code}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    {selSchool.name}
                  </h2>
                  {selSchool.is985 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                      985
                    </span>
                  )}
                  {selSchool.is211 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                      211
                    </span>
                  )}
                  {selSchool.isDFC && !selSchool.is211 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                      双一流
                    </span>
                  )}
                  {selSchool.isPrivate && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">
                      民办
                    </span>
                  )}
                  <button
                    onClick={() => toggleShort(selSchool.code)}
                    title={
                      shortlist.includes(selSchool.code)
                        ? "移出对比"
                        : "加入对比"
                    }
                    className={`ml-auto w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${shortlist.includes(selSchool.code) ? "bg-rose-50 text-rose-500 border-rose-200" : "bg-white text-gray-300 border-gray-200 hover:text-rose-400"}`}
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      fill={
                        shortlist.includes(selSchool.code)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {selSchool.prov} · {prov}招生 · {selAdm.batch}
                  {selSchool.category ? ` · ${selSchool.category}` : ""}
                </p>

                {(selSchool.rank || selSchool.aClass) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {selSchool.rank && (
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-400">软科排名</div>
                        <div className="text-lg font-bold text-indigo-700">
                          第 {selSchool.rank} 名
                          {selSchool.rankScore != null && (
                            <span className="text-xs font-medium text-gray-400 ml-1">
                              {selSchool.rankScore} 分
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {selSchool.aClass ? (
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-400">
                          学科评估（第四轮）
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          A+ {selSchool.aPlus} 项
                          <span className="text-xs font-medium text-gray-400 ml-1">
                            A 类共 {selSchool.aClass} 项
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="text-xs text-gray-400">
                          学科评估（第四轮）
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          无 A 类学科
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {selSchool.topDisc?.length ? (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {selSchool.topDisc.map((d) => (
                      <span
                        key={d}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100"
                      >
                        {d} A+
                      </span>
                    ))}
                  </div>
                ) : null}

                <div
                  className="rounded-xl px-4 py-3 mb-4 text-white"
                  style={{
                    backgroundColor:
                      selTier === "none" ? "#94A3B8" : TIER_COLOR[selTier],
                  }}
                >
                  <div className="text-xs opacity-90">
                    {selTier === "none"
                      ? "超出冲稳保区间"
                      : TIER_LABEL[selTier]}
                  </div>
                  <div className="text-2xl font-bold">
                    {selGap <= 0 ? `差 ${-selGap} 分` : `超 ${selGap} 分`}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="text-xs text-gray-400">投档线</div>
                    <div className="text-lg font-bold text-gray-900">
                      {selAdm.minScore}
                    </div>
                    {selAdm.scoreDelta != null && (
                      <div
                        className={`text-[11px] font-medium mt-0.5 ${selAdm.scoreDelta > 0 ? "text-rose-500" : selAdm.scoreDelta < 0 ? "text-emerald-600" : "text-gray-400"}`}
                      >
                        较去年 {selAdm.scoreDelta > 0 ? "+" : ""}
                        {selAdm.scoreDelta} 分
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="text-xs text-gray-400">最低位次</div>
                    <div className="text-lg font-bold text-gray-900">
                      {selAdm.minRank.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-3 col-span-2">
                    <div className="text-xs text-gray-400">
                      招生计划（{prov}·{cat}·本科批合计）
                    </div>
                    {selAdm.planCount != null ? (
                      <>
                        <div className="text-lg font-bold text-gray-900">
                          {selAdm.planCount} 人
                          {selAdm.planDelta != null &&
                            selAdm.planDelta !== 0 && (
                              <span
                                className={`text-xs font-semibold ml-2 ${selAdm.planDelta > 0 ? "text-emerald-600" : "text-rose-500"}`}
                              >
                                较去年 {selAdm.planDelta > 0 ? "+" : ""}
                                {selAdm.planDelta} 人
                              </span>
                            )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {selAdm.planDelta != null && selAdm.planDelta < 0
                            ? "计划缩减，报考需谨慎"
                            : selAdm.planCount <= 5
                              ? "名额极少，投档线易大起大落"
                              : selAdm.planCount <= 20
                                ? "名额偏少，存在波动风险"
                                : "名额较充裕"}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400 mt-1">
                        暂无计划数据
                      </div>
                    )}
                  </div>
                </div>

                {(() => {
                  const tv = history?.cats[cat]?.[selSchool.name];
                  if (!history || !tv || tv.filter((v) => v != null).length < 2)
                    return null;
                  return (
                    <div className="rounded-xl border border-gray-200 p-3 mb-4">
                      <TrendSpark years={history.years} values={tv} />
                    </div>
                  );
                })()}

                <div className="text-xs text-gray-500 leading-relaxed">
                  你的分数 {score} 分（位次{" "}
                  {userRank ? `#${userRank.toLocaleString()}` : "未知"}
                  ），报考该校
                  {selGap <= 0
                    ? "为冲一冲，存在一定风险"
                    : selGap <= 22
                      ? "较稳妥，属于稳一稳区间"
                      : selGap <= 55
                        ? "把握较大，可作为保底"
                        : "超出常规范畴，请谨慎参考"}
                  。
                </div>
              </motion.div>
            ) : (
              <div className="text-center py-10">
                <SchoolIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600 mb-1">
                  点击地图上的院校点位
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  点位按「冲 / 稳 /
                  保」着色，右侧显示投档线与位次详情；完整清单请切到「冲稳保清单」。
                </p>
                <div className="mt-5 space-y-2 text-left">
                  {TIERS.map((t) => (
                    <div
                      key={t}
                      className="flex items-center justify-between text-xs text-gray-500"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: TIER_COLOR[t] }}
                        />
                        {TIER_LABEL[t]}
                      </span>
                      <span className="text-gray-700 font-semibold">
                        {counts[t]} 所
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : view === "list" ? (
        /* 冲稳保清单 */
        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="space-y-4">
            {rec &&
              TIERS.map((t) => {
                const list = rec[t];
                if (!list.length) return null;
                return (
                  <section
                    key={t}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-2 px-4 py-3 border-b border-gray-100"
                      style={{ backgroundColor: `${TIER_COLOR[t]}14` }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: TIER_COLOR[t] }}
                      />
                      <h3 className="text-sm font-bold text-gray-800">
                        {TIER_LABEL[t]}
                      </h3>
                      <span className="text-xs text-gray-400">
                        投档线在{" "}
                        {t === "reach"
                          ? `你的分数之上 0~18 分`
                          : t === "match"
                            ? "你的分数之下 0~22 分"
                            : "你的分数之下 23~55 分"}
                      </span>
                      <span className="ml-auto text-xs text-gray-500">
                        {counts[t]} 所·展示前 {list.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-50">
                      {sortList(list).map((item) => (
                        <li key={item.admission.schoolCode}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedCode(item.admission.schoolCode);
                              setView("map");
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <span className="text-sm font-medium text-gray-900 w-44 truncate">
                              {item.schoolName}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleShort(item.admission.schoolCode);
                              }}
                              title={
                                shortlist.includes(item.admission.schoolCode)
                                  ? "移出对比"
                                  : "加入对比"
                              }
                              className={`shrink-0 ${shortlist.includes(item.admission.schoolCode) ? "text-rose-500" : "text-gray-200 hover:text-rose-400"}`}
                            >
                              <Heart
                                className="w-3.5 h-3.5"
                                fill={
                                  shortlist.includes(item.admission.schoolCode)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                            {item.rank && (
                              <span className="text-[10px] px-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                                软科{item.rank}
                              </span>
                            )}
                            <span className="flex gap-1 shrink-0">
                              {item.is985 && (
                                <span className="text-[10px] px-1 rounded bg-red-50 text-red-600 border border-red-100">
                                  985
                                </span>
                              )}
                              {item.is211 && (
                                <span className="text-[10px] px-1 rounded bg-blue-50 text-blue-600 border border-blue-100">
                                  211
                                </span>
                              )}
                              {item.isDFC && !item.is211 && (
                                <span className="text-[10px] px-1 rounded bg-amber-50 text-amber-600 border border-amber-100">
                                  双一流
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto hidden sm:inline">
                              {item.schoolProv} · 位次{" "}
                              {item.admission.minRank.toLocaleString()}
                              {item.planCount != null
                                ? ` · 招${item.planCount}人`
                                : ""}
                            </span>
                            {item.scoreDelta != null && (
                              <span
                                className={`text-[11px] shrink-0 ${item.scoreDelta > 0 ? "text-rose-500" : item.scoreDelta < 0 ? "text-emerald-600" : "text-gray-400"}`}
                                title="投档线较去年"
                              >
                                {item.scoreDelta > 0 ? "+" : ""}
                                {item.scoreDelta}
                              </span>
                            )}
                            <span
                              className="text-sm font-semibold shrink-0"
                              style={{ color: TIER_COLOR[t] }}
                            >
                              {item.gap <= 0
                                ? `差 ${-item.gap} 分`
                                : `超 ${item.gap} 分`}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            {rec &&
              !rec.reach.length &&
              !rec.match.length &&
              !rec.safe.length && (
                <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-sm text-gray-400">
                  当前分数下 ±55 分内没有院校投档线，试试调整分数或省份。
                </div>
              )}
          </div>

          {/* 清单视图的详情面板 */}
          <aside className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-[68px]">
            {selSchool && selAdm ? (
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-lg font-bold text-gray-900">
                  {selSchool.name}
                </h2>
                {selSchool.is985 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                    985
                  </span>
                )}
                {selSchool.is211 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                    211
                  </span>
                )}
                {selSchool.isDFC && !selSchool.is211 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                    双一流
                  </span>
                )}
                <p className="w-full text-xs text-gray-400">
                  投档线 {selAdm.minScore} · 位次{" "}
                  {selAdm.minRank.toLocaleString()} ·
                  已在地图上标出，切到「院校地图」查看。
                </p>
              </div>
            ) : (
              <div className="text-center py-10">
                <ListFilter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600 mb-1">
                  冲稳保推荐清单
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  按「你的分数 − 投档线」分档，每档取分差最近的 12
                  所；点击任一行可在地图上定位。
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        /* 对比视图 */
        <CompareTable
          shortlist={shortlist}
          admByCode={admByCode}
          prov={prov}
          cat={cat}
          score={score}
          onRemove={toggleShort}
          onLocate={(code) => {
            setSelectedCode(code);
            setView("map");
          }}
        />
      )}

      <div className="mt-6 flex gap-2 items-start text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          本页投档线与一分一段来自{" "}
          <b className="text-gray-500">GaokaoCompass</b>（{dataSource()}）
          {dataYear()} 年数据， 为第三方整理的
          <strong className="text-gray-500">非官方数据</strong>
          ，按院校专业组最低分归并；院校排名与层次标签来自软科中国大学排名，
          学科评估为教育部学位中心第四轮（2017）结果；均仅供演示与参考，
          正式填报请以省级教育考试院官方数据为准。位次由一分一段表线性插值估算。
          地图为 DataV 省级矢量边界（含台湾、南海诸岛），非在线地图服务。
        </span>
      </div>
    </div>
  );
}

// ═══ 对比视图：收藏院校并排比较 ═══
function CompareTable({
  shortlist,
  admByCode,
  prov,
  cat,
  score,
  onRemove,
  onLocate,
}: {
  shortlist: string[];
  admByCode: Map<
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

  const cols = shortlist.map((code) => ({
    code,
    school: getSchool(code),
    adm: admByCode.get(code),
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
            {cols.map(({ code, school }) => (
              <th key={code} className={th}>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onLocate(code)}
                    className="font-semibold text-gray-900 text-sm hover:text-indigo-600 hover:underline truncate max-w-[130px]"
                  >
                    {school?.name ?? code}
                  </button>
                  <button
                    onClick={() => onRemove(code)}
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
            {cols.map(({ code, school }) => (
              <td key={code} className={td}>
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
            {cols.map(({ code, school }) => (
              <td key={code} className={td}>
                {school?.rank ? (
                  `第 ${school.rank} 名`
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-gray-50">
            <td className={td + " text-gray-400 text-xs"}>投档线（较去年）</td>
            {cols.map(({ code, adm }) => (
              <td key={code} className={td}>
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
            {cols.map(({ code, adm }) => {
              if (!adm)
                return (
                  <td key={code} className={td}>
                    <span className="text-gray-300">—</span>
                  </td>
                );
              const gap = score - adm.minScore;
              const tier = tierOf(gap);
              return (
                <td
                  key={code}
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
            {cols.map(({ code, adm }) => (
              <td key={code} className={td}>
                {adm ? (
                  adm.minRank.toLocaleString()
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
            {cols.map(({ code, adm }) => (
              <td key={code} className={td}>
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
            {cols.map(({ code, school }) => (
              <td key={code} className={td}>
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
            {cols.map(({ code, school }) => (
              <td key={code} className={td}>
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

// ═══ 近四年投档线迷你趋势（纯 SVG，无 echarts 依赖） ═══
function TrendSpark({
  years,
  values,
}: {
  years: number[];
  values: (number | null)[];
}) {
  const pts = years
    .map((y, i) => ({ y, v: values[i] }))
    .filter((p): p is { y: number; v: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = 320;
  const H = 76;
  const PAD = 14;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(max - min, 10); // 分差太小也保留可见波动
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const yy = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = pts.map((p, i) => `${x(i)},${yy(p.v)}`).join(" ");
  const delta = pts[pts.length - 1].v - pts[0].v;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xs text-gray-400">
          近四年投档线（{pts.length} 年可比）
        </span>
        <span
          className={`text-xs font-semibold ${delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-600" : "text-gray-400"}`}
        >
          {pts[0].y}–{pts[pts.length - 1].y} 年 {delta > 0 ? "+" : ""}
          {delta} 分
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]">
        <polyline
          points={line}
          fill="none"
          stroke="#6366F1"
          strokeWidth="1.5"
        />
        {pts.map((p, i) => (
          <g key={p.y}>
            <circle cx={x(i)} cy={yy(p.v)} r={3} fill="#6366F1" />
            <text
              x={x(i)}
              y={yy(p.v) - 7}
              textAnchor="middle"
              fontSize="9"
              fill="#475569"
            >
              {p.v}
            </text>
            <text
              x={x(i)}
              y={H - 1}
              textAnchor="middle"
              fontSize="9"
              fill="#94A3B8"
            >
              {p.y}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
