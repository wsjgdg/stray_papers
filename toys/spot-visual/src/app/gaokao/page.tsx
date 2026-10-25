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
  Search,
  Plus,
  ClipboardList,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import {
  BATCH_GROUPS,
  GAOKAO_BATCHES_URL,
  GAOKAO_DATA_URL,
  GAOKAO_ENRICH_URL,
  activeProvinces,
  activeSchools,
  admissionsFor,
  controlLine,
  dataYear,
  dataSource,
  fetchHistory,
  fetchMajors,
  getSchool,
  isBatchesLoaded,
  loadBatchesDataset,
  type MajorDataset,
  type MajorRow,
  loadEnrichDataset,
  loadFullDataset,
  type BatchGroup,
  type HistoryDataset,
  rankForScore,
  type School,
} from "@/lib/gaokao-data";
import {
  provinceCats,
  recommend,
  type RecommendItem as RecommendItemT,
} from "@/lib/gaokao";
import { withSharecode } from "@/lib/share-link";
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
  if (!s) return f === "all" ? true : false;
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

/** 志愿表条目：院校 + 专业组 + 专业（minScore 运行时从专业数据实时取，保证与当前分差同步） */
interface WishItem {
  name: string; // 院校名（全局键；招生代码跨省冲突不可用）
  group: string;
  major: string;
}

export default function GaoKaoPage() {
  const [dataState, setDataState] = useState<"loading" | "ready" | "fail">(
    "loading",
  );
  const [prov, setProv] = useState("");
  const [cat, setCat] = useState("");
  const [score, setScore] = useState(600);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [batchGroup, setBatchGroup] = useState<BatchGroup>("benke");
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [view, setView] = useState<
    "map" | "list" | "compare" | "major" | "wish"
  >("map");
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<"tier" | "level">("tier");
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [enriched, setEnriched] = useState(false); // 增强数据（排名/学科）到达后触发重算
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"gap" | "rank" | "score">("gap");
  const [majorQuery, setMajorQuery] = useState("");

  // ── 志愿表（localStorage 持久化；条目 = 院校专业组×专业） ──
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("gaokao:wishlist") ?? "[]");
      if (Array.isArray(saved))
        setWishlist(
          saved.filter(
            (w): w is WishItem =>
              w && typeof w.name === "string" && typeof w.major === "string",
          ),
        );
    } catch {}
  }, []);
  const addWish = (item: WishItem) => {
    setWishlist((prev) => {
      if (
        prev.some(
          (w) =>
            w.name === item.name &&
            w.group === item.group &&
            w.major === item.major,
        )
      )
        return prev;
      const next = [...prev, item].slice(0, 96);
      try {
        localStorage.setItem("gaokao:wishlist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const removeWish = (i: number) => {
    setWishlist((prev) => {
      const next = prev.filter((_, j) => j !== i);
      try {
        localStorage.setItem("gaokao:wishlist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const moveWish = (i: number, dir: -1 | 1) => {
    setWishlist((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      try {
        localStorage.setItem("gaokao:wishlist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const clearWishes = () => {
    setWishlist(() => {
      try {
        localStorage.setItem("gaokao:wishlist", "[]");
      } catch {}
      return [];
    });
  };
  const hasWish = (name: string, group: string, major: string) =>
    wishlist.some(
      (w) => w.name === name && w.group === group && w.major === major,
    );

  const ready = dataState === "ready";
  const provinces = useMemo(() => (ready ? activeProvinces() : []), [ready]);
  const schools = useMemo(() => (ready ? activeSchools() : []), [ready]);
  // 去重院校数：同一高校在各省有独立招生代码，schools 按代码计数会重复
  const uniqueSchoolCount = useMemo(
    () => new Set(schools.map((s) => s.name)).size,
    [schools],
  );

  // ── 加载数据文件（主数据必须；增强数据可选，失败不阻塞） ──
  useEffect(() => {
    let alive = true;
    fetch(withSharecode(GAOKAO_DATA_URL))
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => {
        if (alive && loadFullDataset(d)) {
          setDataState("ready");
          fetch(withSharecode(GAOKAO_ENRICH_URL))
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
  const toggleShort = (name: string) => {
    setShortlist((prev) => {
      const next = prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name].slice(-6); // 最多对比 6 所
      try {
        localStorage.setItem("gaokao:shortlist", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const cats = useMemo(() => (ready ? provinceCats(prov) : []), [ready, prov]);

  // ── 批次切换：非本科批首次切换时懒加载批次文件 ──
  const switchBatch = async (g: BatchGroup) => {
    if (g === batchGroup || batchesLoading) return;
    if (g !== "benke" && !isBatchesLoaded()) {
      setBatchesLoading(true);
      try {
        const r = await fetch(withSharecode(GAOKAO_BATCHES_URL));
        if (r.ok) loadBatchesDataset(await r.json());
      } catch {}
      setBatchesLoading(false);
    }
    setBatchGroup(g);
    setSelectedName(null);
  };

  // 顶部搜索联动专业：校名命中不足时拉专业数据补结果
  useEffect(() => {
    if (!ready || !prov || majors) return;
    const q = query.trim();
    if (!q) return;
    let alive = true;
    fetchMajors(prov).then((m) => alive && setMajors(m));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, prov, query.trim().length > 0]);

  // ── 分数防抖：输入框即时响应，地图/清单等重计算延迟 150ms ──
  const [scoreDelayed, setScoreDelayed] = useState(score);
  useEffect(() => {
    const t = setTimeout(() => setScoreDelayed(score), 150);
    return () => clearTimeout(t);
  }, [score]);

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
        setSelectedName(null);
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
          setSelectedName(null);
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

  const admByName = useMemo(() => {
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
    for (const a of admissionsFor(prov, cat, batchGroup))
      m.set(a.schoolName, {
        minScore: a.minScore,
        minRank: a.minRank,
        batch: a.batch,
        planCount: a.planCount,
        scoreDelta: a.scoreDelta,
        planDelta: a.planDelta,
      });
    return m;
  }, [ready, prov, cat, batchGroup]);

  // 地图画当前省·科类·批次的全部招生院校：区间内按冲稳保着色，
  // 区间外（分数够不着/高出太多）以灰色小点保留显示。
  const points = useMemo(() => {
    if (!ready) return [];
    return admissionsFor(prov, cat, batchGroup)
      .map((a) => {
        const s = getSchool(a.schoolName);
        if (!s) return null;
        if (!matchFilter(s, filter)) return null;
        const center = PROVINCE_CENTERS[s.prov];
        if (!center) return null;
        const gap = scoreDelayed - a.minScore;
        const tier = tierOf(gap);
        const [dx, dy] = jitter(s.name);
        const active = s.name === selectedName;
        const levelText = s.is985
          ? "985"
          : s.is211
            ? "211"
            : s.isDFC
              ? "双一流"
              : "其他";
        const out = tier === "none";
        return {
          name: s.name,
          value: [center[0] + dx, center[1] + dy] as [number, number],
          schoolName: s.name,
          gap,
          tier,
          levelText,
          rank: s.rank,
          planCount: a.planCount,
          symbolSize: active ? 22 : out ? 9 : 14,
          itemStyle: {
            color: out
              ? "#94A3B8"
              : colorMode === "tier"
                ? TIER_COLOR[tier]
                : levelColor(s),
            opacity: out ? 0.95 : 1,
            borderColor: active ? "#0F172A" : "#ffffff",
            borderWidth: active ? 2.5 : out ? 0.8 : 1.2,
            shadowBlur: out ? 0 : 5,
            shadowColor: "rgba(15,23,42,0.28)",
          },
        };
      })
      .filter(Boolean);
  }, [
    ready,
    prov,
    cat,
    batchGroup,
    scoreDelayed,
    selectedName,
    colorMode,
    filter,
    enriched,
  ]);

  const counts = useMemo(() => {
    const c: Record<Tier, number> = { reach: 0, match: 0, safe: 0 };
    let out = 0;
    for (const p of points as any[]) {
      if (p.tier === "none") out++;
      else c[p.tier as Tier]++;
    }
    return { ...c, out };
  }, [points]);

  const rec = useMemo(
    () =>
      ready
        ? recommend(
            scoreDelayed,
            prov,
            cat,
            (s) => matchFilter(s, filter),
            batchGroup,
          )
        : null,
    [ready, scoreDelayed, prov, cat, filter, enriched, batchGroup],
  );

  // ── 专业级录取数据（按省懒加载，展开详情面板时取） ──
  const [majors, setMajors] = useState<MajorDataset | null>(null);
  const [majorsOpen, setMajorsOpen] = useState(false);
  useEffect(() => {
    if (!ready || !prov || (!majorsOpen && view !== "major" && view !== "wish"))
      return;
    let alive = true;
    setMajors(null);
    fetchMajors(prov).then((m) => alive && setMajors(m));
    return () => {
      alive = false;
    };
  }, [ready, majorsOpen, prov, view]);

  // ── 院校搜索（限当前省·科类的投档线名单） ──
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q || !ready) return [];
    const out: {
      name: string;
      minScore: number;
      tier: Tier | "none";
      rank?: string;
      isMajor?: boolean;
      majorName?: string;
    }[] = [];
    for (const a of admissionsFor(prov, cat, batchGroup)) {
      if (!a.schoolName.includes(q)) continue;
      const s = getSchool(a.schoolName);
      out.push({
        name: a.schoolName,
        minScore: a.minScore,
        tier: tierOf(scoreDelayed - a.minScore),
        rank: s?.rank,
      });
      if (out.length >= 8) break;
    }
    // 专业名命中（如「智能」）：数据未加载时由 effect 触发拉取
    if (majors && out.length < 8) {
      const kw = q;
      const catData = majors.cats[cat] ?? {};
      outer: for (const [uni, rows] of Object.entries(catData)) {
        for (const r of rows) {
          if (!r[1].includes(kw)) continue;
          out.push({
            name: uni,
            minScore: r[3],
            tier: tierOf(scoreDelayed - r[3]),
            isMajor: true,
            majorName: r[1],
          });
          if (out.length >= 8) break outer;
          break; // 每校只取一个匹配专业
        }
      }
    }
    return out;
  }, [query, ready, prov, cat, batchGroup, scoreDelayed, majors]);

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
    if (p?.seriesType === "scatter" && p?.data?.schoolName) {
      setSelectedName(
        p.data.schoolName === selectedName ? null : p.data.schoolName,
      );
    }
  };

  const selSchool = selectedName ? getSchool(selectedName) : undefined;
  const selAdm = selectedName ? admByName.get(selectedName) : undefined;
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
            （{dataYear()} 年（数据集最新）· {provinces.length} 省市 · 覆盖高校{" "}
            {uniqueSchoolCount} 所 · GaokaoCompass 非官方数据）
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
                setSelectedName(null);
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
                setSelectedName(null);
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
            <span className="inline-flex items-center gap-1 text-gray-400">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              区间外 {counts.out}
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
              ["major", Search, "专业反查", 0],
              ["wish", ClipboardList, "志愿表", wishlist.length],
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
            placeholder="搜院校或专业，如 郑州大学 / 智能"
            className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
          {query.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {searchResults.length ? (
                searchResults.map((r) => (
                  <button
                    key={r.name + (r.majorName ?? "")}
                    onClick={() => {
                      setSelectedName(r.name);
                      if (r.isMajor) setMajorsOpen(true);
                      setQuery("");
                      setView("map");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-colors"
                  >
                    {r.isMajor ? (
                      <span className="text-[10px] px-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
                        专业
                      </span>
                    ) : null}
                    <span className="font-medium text-gray-900 truncate">
                      {r.isMajor ? r.majorName : r.name}
                    </span>
                    {r.isMajor && (
                      <span className="text-xs text-gray-400 truncate">
                        {r.name}
                      </span>
                    )}
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
                  当前省份·科类下没有匹配的院校或专业
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 批次切换 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-400 mr-1">批次</span>
        {BATCH_GROUPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchBatch(key)}
            disabled={batchesLoading}
            className={`px-2.5 py-1 rounded-full border transition-colors ${batchGroup === key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"} ${batchesLoading ? "opacity-50" : ""}`}
          >
            {label}
          </button>
        ))}
        {batchGroup !== "benke" &&
          admissionsFor(prov, cat, batchGroup).length === 0 && (
            <span className="text-amber-500 ml-1">
              该省没有独立的
              {batchGroup === "tiqian"
                ? "提前"
                : batchGroup === "zhuanxiang"
                  ? "专项计划"
                  : "专科"}
              批次（相关计划多并入其他批次），换省或切回本科批查看
            </span>
          )}
        {batchGroup !== "benke" &&
          admissionsFor(prov, cat, batchGroup).length > 0 && (
            <span className="text-amber-500 ml-1">
              {batchGroup === "tiqian"
                ? "提前批含军警/公费师范等，录取多需政审体检面试"
                : batchGroup === "zhuanxiang"
                  ? "专项计划面向农村户籍等特定资格考生"
                  : "专科批；冲稳保区间基于你的本科分数会大量超出区间"}
            </span>
          )}
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
                ? [
                    ...TIERS.map((t) => ({
                      label: TIER_LABEL[t],
                      color: TIER_COLOR[t],
                    })),
                    { label: "区间外", color: "#94A3B8" },
                  ].map(({ label, color }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 text-[11px] text-gray-600"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {label}
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
                key={selSchool.name}
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
                    onClick={() => toggleShort(selSchool.name)}
                    title={
                      shortlist.includes(selSchool.name)
                        ? "移出对比"
                        : "加入对比"
                    }
                    className={`ml-auto w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${shortlist.includes(selSchool.name) ? "bg-rose-50 text-rose-500 border-rose-200" : "bg-white text-gray-300 border-gray-200 hover:text-rose-400"}`}
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      fill={
                        shortlist.includes(selSchool.name)
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
                      {selAdm.minRank ? selAdm.minRank.toLocaleString() : "—"}
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

                {batchGroup === "benke" &&
                  (() => {
                    const tv = history?.cats[cat]?.[selSchool.name];
                    if (
                      !history ||
                      !tv ||
                      tv.filter((v) => v != null).length < 2
                    )
                      return null;
                    return (
                      <div className="rounded-xl border border-gray-200 p-3 mb-4">
                        <TrendSpark years={history.years} values={tv} />
                      </div>
                    );
                  })()}

                {/* 专业级录取数据（折叠懒加载；专业数据仅本科批口径） */}
                {batchGroup === "benke" && (
                  <div className="mb-4 rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setMajorsOpen(!majorsOpen)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      专业录取数据（{prov}·{cat}·本科批）
                      <span className="ml-auto text-gray-400">
                        {majorsOpen ? "收起" : "展开"}
                      </span>
                    </button>
                    {majorsOpen && (
                      <div className="border-t border-gray-100">
                        {!selSchool
                          ? null
                          : (() => {
                              const rows = majors?.cats[cat]?.[selSchool.name];
                              if (majors == null)
                                return (
                                  <div className="px-3 py-4 text-xs text-gray-400">
                                    正在加载专业数据…
                                  </div>
                                );
                              if (!rows?.length)
                                return (
                                  <div className="px-3 py-4 text-xs text-gray-400">
                                    该校在本省本科批暂无专业级数据
                                  </div>
                                );
                              const cleared = rows.filter(
                                (r) => score >= r[3],
                              ).length;
                              return (
                                <div>
                                  <div className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
                                    共 {rows.length} 个专业（组）·你的分数够得着{" "}
                                    <b className="text-emerald-600">
                                      {cleared}
                                    </b>{" "}
                                    个 · 按最低分排序
                                  </div>
                                  <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                                    {rows.map((r, i) => {
                                      const gap = score - r[3];
                                      const t = tierOf(gap);
                                      const color =
                                        t === "none"
                                          ? "#CBD5E1"
                                          : TIER_COLOR[t];
                                      const req = majors.reqs[r[2]];
                                      return (
                                        <li
                                          key={i}
                                          className="flex items-center gap-2 px-3 py-1.5 text-xs"
                                          style={{
                                            borderLeft: `3px solid ${color}`,
                                          }}
                                        >
                                          <span
                                            className="font-medium text-gray-800 truncate flex-1"
                                            title={req || undefined}
                                          >
                                            {r[1]}
                                            {req && (
                                              <span className="text-gray-300 ml-1.5 text-[10px]">
                                                {req}
                                              </span>
                                            )}
                                          </span>
                                          {r[0] && (
                                            <span className="text-[10px] px-1 rounded bg-slate-50 text-slate-500 border border-slate-100 shrink-0">
                                              组{r[0].replace(/[（）()]/g, "")}
                                            </span>
                                          )}
                                          <span className="font-semibold text-gray-900 shrink-0">
                                            {r[3]}
                                          </span>
                                          <span className="text-gray-400 shrink-0 w-16 text-right">
                                            {r[4] ? r[4].toLocaleString() : "—"}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              );
                            })()}
                      </div>
                    )}
                  </div>
                )}

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
                        <li key={item.admission.schoolName}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedName(item.admission.schoolName);
                              setView("map");
                            }}
                            className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <span className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0 sm:flex-none sm:w-44">
                              {item.schoolName}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleShort(item.admission.schoolName);
                              }}
                              title={
                                shortlist.includes(item.admission.schoolName)
                                  ? "移出对比"
                                  : "加入对比"
                              }
                              className={`shrink-0 ${shortlist.includes(item.admission.schoolName) ? "text-rose-500" : "text-gray-200 hover:text-rose-400"}`}
                            >
                              <Heart
                                className="w-3.5 h-3.5"
                                fill={
                                  shortlist.includes(item.admission.schoolName)
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
                              {item.admission.minRank
                                ? item.admission.minRank.toLocaleString()
                                : "—"}
                              {item.planCount != null
                                ? ` · 招${item.planCount}人`
                                : ""}
                            </span>
                            <span className="w-full text-[11px] text-gray-400 sm:hidden">
                              {item.schoolProv} · 位次{" "}
                              {item.admission.minRank
                                ? item.admission.minRank.toLocaleString()
                                : "—"}
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
                  {selAdm.minRank ? selAdm.minRank.toLocaleString() : "—"} ·
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
      ) : view === "compare" ? (
        /* 对比视图 */
        <CompareTable
          shortlist={shortlist}
          admByName={admByName}
          prov={prov}
          cat={cat}
          score={scoreDelayed}
          onRemove={toggleShort}
          onLocate={(name) => {
            setSelectedName(name);
            setView("map");
          }}
        />
      ) : view === "major" ? (
        /* 按专业反查院校 */
        <MajorSearch
          majors={majors}
          q={majorQuery}
          setQ={setMajorQuery}
          prov={prov}
          cat={cat}
          score={scoreDelayed}
          onOpen={(code) => {
            setSelectedName(code);
            setMajorsOpen(true);
            setView("map");
          }}
          onAddWish={addWish}
          hasWish={hasWish}
        />
      ) : (
        /* 志愿表模拟 */
        <WishTable
          items={wishlist}
          admByName={admByName}
          majors={majors}
          prov={prov}
          cat={cat}
          score={scoreDelayed}
          onMove={moveWish}
          onRemove={removeWish}
          onClear={clearWishes}
          onOpen={(code) => {
            setSelectedName(code);
            setMajorsOpen(true);
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
  admByName,
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

// ═══ 按专业反查院校：跨校搜专业名，按可达性排序 ═══
function MajorSearch({
  majors,
  q,
  setQ,
  prov,
  cat,
  score,
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
  onOpen: (name: string) => void;
  onAddWish: (w: WishItem) => void;
  hasWish: (name: string, group: string, major: string) => boolean;
}) {
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
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-500 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入专业关键词，如 计算机 / 法学 / 临床"
            className="flex-1 h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          在 {prov}·{cat}{" "}
          的全部院校专业（组）中匹配，按最易达匹配专业的最低分排序；点行进详情，点
          + 把该系最易达的专业加入志愿表。
        </p>
      </div>
      {!kw ? (
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

// ═══ 志愿表模拟：有序院校专业组清单 ═══
function WishTable({
  items,
  admByName,
  majors,
  prov,
  cat,
  score,
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
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
  onClear: () => void;
  onOpen: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
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
              onClick={onClear}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              清空
            </button>
          </>
        )}
      </div>
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
