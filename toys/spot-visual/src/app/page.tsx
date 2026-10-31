"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Upload,
  MapPin,
  Star,
  X,
  LayoutGrid,
  List,
  Heart,
  Copy,
  History,
  Scale,
  ArrowUp,
  Moon,
  Sun,
  User,
  Share2,
  Menu,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileText,
  TreePine,
  Landmark,
  Sparkles,
  Building2,
  Waves,
  Mountain,
  HomeIcon,
  Church,
  UtensilsCrossed,
  Bike,
  Globe,
  Phone,
  Compass,
  Clock,
  AlertTriangle,
  Activity,
  Sparkles as SparklesIcon,
  Calculator, // 修复：补充缺失的图标导入，移除未使用的 Camera
  Zap,
  Thermometer,
  BookX, // 新增：体力沙盘、PTSI、劝退日记图标
  Navigation,
  Download,
  Route,
  Dices,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppStore, type ViewType } from "@/lib/store";
import {
  type Spot,
  getCategoryColor,
  CATEGORY_ICON_NAMES,
  CATEGORY_THEME,
  parseImportedSpots,
  sampleSpots,
  LIBRARY_SPOTS,
  getCategoryImageUrl,
  cachePhotoForCategory,
  parseCoords,
  haversineKm,
  DISSUASION_TAGS,
  getPinyinKeys,
  quoteTicket,
  suggestedVisitHours,
  getSpotProfile,
  TICKET_KEY,
  LIBRARY_STATS,
} from "@/lib/spot-data"; // 保留：cachePhotoForCategory 缓存机制
import { loadPoiPhotos, peekPoiPhotos } from "@/lib/poi-photos";
import { withSharecode } from "@/lib/share-link";
import { PROVINCE_FOODS } from "@/lib/food-data";
import Link from "next/link";
import dynamic from "next/dynamic";

const NetworkView = dynamic(() => import("@/components/network-view"), {
  ssr: false,
});
const TripView = dynamic(() => import("@/components/trip-view"), {
  ssr: false,
});
const DeterrentView = dynamic(() => import("@/components/deterrent-view"), {
  ssr: false,
});
const FitnessView = dynamic(() => import("@/components/fitness-view"), {
  ssr: false,
});
const PersonalityView = dynamic(() => import("@/components/personality-view"), {
  ssr: false,
});
const BudgetView = dynamic(() => import("@/components/budget-view"), {
  ssr: false,
});
const StaminaSandboxView = dynamic(
  () => import("@/components/stamina-sandbox-view"),
  { ssr: false },
);
const PTSIView = dynamic(() => import("@/components/ptsi-view"), {
  ssr: false,
});
const DissuasionView = dynamic(() => import("@/components/dissuasion-view"), {
  ssr: false,
});
const DissuasionEditor = dynamic(
  () => import("@/components/dissuasion-editor"),
  { ssr: false },
);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TreePine,
  Landmark,
  Sparkles,
  Building2,
  Waves,
  Mountain,
  HomeIcon,
  Church,
  UtensilsCrossed,
  Bike,
};
const getCategoryIcon = (cat: string) => {
  const name = CATEGORY_ICON_NAMES[cat];
  if (!name || !ICON_MAP[name]) return null;
  const Comp = ICON_MAP[name];
  return <Comp className="w-3.5 h-3.5" />;
};

/* ═══════ 共享配图流程：为缺图景点按分类拉图（OSM 探索与 JSON 导入共用） ═══════ */
async function fillSpotImages(list: Spot[]): Promise<void> {
  const needImages = list.filter((s) => !s.image);
  if (needImages.length === 0) return;

  // 按分类分组，批量请求 API（search-photo 每分类 1 次上游请求，游标去重）
  const byCategory = new Map<string, Spot[]>();
  needImages.forEach((spot) => {
    const cat = spot.category || "其他";
    const arr = byCategory.get(cat) || [];
    arr.push(spot);
    byCategory.set(cat, arr);
  });

  const updates: { id: string; image: string; source?: string }[] = [];
  let noApiKeys = false;
  await Promise.allSettled(
    Array.from(byCategory.entries()).map(async ([cat, items]) => {
      try {
        const res = await fetch(
          withSharecode(
            `/api/search-photo?q=${encodeURIComponent(cat)}&n=${items.length}`,
          ),
        );
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();

        if (data.error === "NO_API_KEYS") {
          noApiKeys = true;
          items.forEach((item) => {
            const fallback = getCategoryImageUrl(item.category);
            if (fallback)
              updates.push({ id: item.id, image: fallback, source: "pool" });
          });
          return;
        }

        const results = data.results || [];
        items.forEach((item, i) => {
          if (results[i] && results[i].url) {
            const url = results[i].url;
            updates.push({ id: item.id, image: url, source: data.source });
            // 自学习缓存：把 API 拉到的真实 URL 写入本地缓存，下次降级优先复用
            cachePhotoForCategory(cat, url);
          } else {
            const fallback = getCategoryImageUrl(cat);
            if (fallback)
              updates.push({ id: item.id, image: fallback, source: "pool" });
          }
        });
      } catch {
        items.forEach((item) => {
          const fallback = getCategoryImageUrl(item.category);
          if (fallback)
            updates.push({ id: item.id, image: fallback, source: "pool" });
        });
      }
    }),
  );

  if (noApiKeys) {
    console.warn("[景点览胜] 图片 API 未配置密钥，已降级使用本地图片池");
  }
  if (updates.length > 0) {
    useAppStore
      .getState()
      .updateSpotImages(updates.map(({ id, image }) => ({ id, image })));
    useAppStore.getState().updateSpotImageSources(updates);
  }
}

/* ═══════ 图片组件（分类主题占位） ═══════ */
function SpotImage({
  src,
  alt,
  className = "",
  category = "",
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  category?: string;
  /** 首屏可见的图用 eager + 高优先级，改善 LCP；其余保持 lazy */
  eager?: boolean;
}) {
  // 二级降级：原图失效 → 本地分类池 → 渐变占位
  const poolSrc = useMemo(
    () => getCategoryImageUrl(category) ?? "",
    [category],
  );
  // 关键：src 为空时直接落「分类池」，不要停在 primary。
  // 否则 effectiveSrc 为空 → noImage 短路 → 1555 条无图景点永远是渐变占位，
  // 而分类池其实有图可用。
  const pickStage = (
    s: string,
    pool: string,
  ): "primary" | "pool" | "gradient" =>
    s ? "primary" : pool ? "pool" : "gradient";
  const [stage, setStage] = useState<"primary" | "pool" | "gradient">(() =>
    pickStage(src, poolSrc),
  );
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setStage(pickStage(src, poolSrc));
    setPrevSrc(src);
  }
  const err = stage === "gradient";
  const effectiveSrc =
    stage === "primary" ? src : stage === "pool" ? poolSrc : "";
  const noImage = !effectiveSrc;
  if (noImage) {
    const theme = CATEGORY_THEME[category] || {
      from: "#F3F4F6",
      to: "#E5E7EB",
      icon: "📍",
    };
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 ${className}`}
        style={{
          background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
        }}
      >
        <span className="text-3xl leading-none select-none">{theme.icon}</span>
        {category && (
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full bg-white dark:bg-gray-900/60 dark:bg-gray-900/60 backdrop-blur-sm">
            {category}
          </span>
        )}
      </div>
    );
  }
  return (
    <img
      src={effectiveSrc}
      alt={alt}
      className={`object-cover ${className}`}
      onError={() =>
        setStage(
          stage === "primary" && poolSrc && poolSrc !== src
            ? "pool"
            : "gradient",
        )
      }
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
    />
  );
}

/* ═══════ 侧边栏 ═══════ */
const NAV_ITEMS: { key: ViewType; label: string; icon: React.ReactNode }[] = [
  { key: "spots", label: "景点览胜", icon: <MapPin className="w-4.5 h-4.5" /> },
  {
    key: "network",
    label: "景点网络",
    icon: <Share2 className="w-4.5 h-4.5" />,
  },
  {
    key: "favorites",
    label: "收藏景点",
    icon: <Heart className="w-4.5 h-4.5" />,
  },
  {
    key: "trip",
    label: "行程单",
    icon: <Route className="w-4.5 h-4.5" />,
  },
  {
    key: "personality",
    label: "旅人测试",
    icon: <SparklesIcon className="w-4.5 h-4.5" />,
  },
  {
    key: "budget",
    label: "预算沙盘",
    icon: <Calculator className="w-4.5 h-4.5" />,
  },
  {
    key: "deterrent",
    label: "劝退指南",
    icon: <AlertTriangle className="w-4.5 h-4.5" />,
  },
  {
    key: "fitness",
    label: "登山账本",
    icon: <Activity className="w-4.5 h-4.5" />,
  },
  {
    key: "stamina-sandbox",
    label: "体力沙盘",
    icon: <Zap className="w-4.5 h-4.5" />,
  },
  {
    key: "ptsi",
    label: "PTSI 指数",
    icon: <Thermometer className="w-4.5 h-4.5" />,
  },
  {
    key: "dissuasion",
    label: "翻车日记",
    icon: <BookX className="w-4.5 h-4.5" />,
  },
  { key: "profile", label: "我的信息", icon: <User className="w-4.5 h-4.5" /> },
];

// 相近视图分组（侧栏标题，纯视觉导航不改变 items）
const NAV_GROUPS: { title: string; keys: ViewType[] }[] = [
  { title: "探索", keys: ["spots", "network", "favorites"] },
  { title: "规划", keys: ["trip", "budget", "stamina-sandbox", "fitness"] },
  { title: "参考", keys: ["deterrent", "ptsi", "dissuasion", "personality"] },
  { title: "我的", keys: ["profile"] },
];

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { activeView, setActiveView, spots, favorites, trip } = useAppStore();
  return (
    <aside
      className={`hidden md:flex flex-col border-r border-gray-200 dark:border-gray-700/80 dark:border-gray-700 bg-white dark:bg-gray-900 transition-all duration-300 ${collapsed ? "w-16" : "w-52"}`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
          <MapPin className="w-4.5 h-4.5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
            景点览胜
          </span>
        )}
      </div>
      {/* Nav（按相近用途分组） */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-1">
            {!collapsed && (
              <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-gray-300 dark:text-gray-600 tracking-widest">
                {group.title}
              </p>
            )}
            {collapsed && (
              <div className="h-px bg-gray-100 dark:bg-gray-800 mx-2 my-1" />
            )}
            {group.keys.map((key) => {
              const item = NAV_ITEMS.find((n) => n.key === key)!;
              const active = activeView === item.key;
              const badge =
                item.key === "favorites" && favorites.length > 0
                  ? favorites.length
                  : item.key === "trip" && trip.length > 0
                    ? trip.length
                    : item.key === "spots"
                      ? spots.length
                      : 0;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveView(item.key)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"}`}
                >
                  <span
                    className={
                      active
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-400 dark:text-gray-500"
                    }
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span
                      className="flex-1 text-left truncate"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  )}
                  {!collapsed && badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 rounded-full ${active ? "bg-emerald-200/60 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {/* Toggle + 主题 */}
      <div className="hidden md:flex border-t border-gray-100 dark:border-gray-800">
        <ThemeToggle />
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-center h-10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

/* ═══════ 主题切换按钮（侧栏 footer 与移动端顶栏共用） ═══════ */
function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useAppStore();
  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
      aria-label={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
      className={`flex items-center justify-center h-10 text-gray-400 dark:text-gray-500 hover:text-emerald-600 transition-colors ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}

/* ═══════ 移动端顶栏 ═══════ */
function MobileHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { activeView, spots, favorites, setActiveView } = useAppStore();
  const currentNav = NAV_ITEMS.find((n) => n.key === activeView);
  const tabsRef = useRef<HTMLDivElement>(null);
  return (
    <header className="md:hidden sticky top-[52px] z-40 bg-white dark:bg-gray-900/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/60">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-1">
          <ThemeToggle className="p-1" />
          <button
            onClick={onMenuOpen}
            className="p-1 text-gray-500 dark:text-gray-400"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500">
            {currentNav?.icon}
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            {currentNav?.label}
          </span>
        </div>
        <div className="w-7" />
      </div>
      {/* Mobile nav tabs（横向滚动展示全部视图，与桌面侧栏对齐） */}
      <div
        ref={tabsRef}
        className="flex border-t border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              ref={(el) => {
                if (active && el)
                  el.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                  });
              }}
              onClick={() => setActiveView(item.key)}
              className={`flex-1 min-w-0 py-2 text-[11px] font-medium text-center transition-colors shrink-0 ${active ? "text-emerald-700 dark:text-emerald-400 border-b-2 border-emerald-600" : "text-gray-400 dark:text-gray-500"}`}
            >
              <span className="block truncate px-0.5" title={item.label}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

/* ═══════ 移动端菜单抽屉 ═══════ */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeView, setActiveView, spots, favorites } = useAppStore();
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div
        initial={{ x: -260 }}
        animate={{ x: 0 }}
        exit={{ x: -260 }}
        className="absolute left-0 top-0 bottom-0 w-60 bg-white dark:bg-gray-900 shadow-xl p-4 pt-6"
      >
        <div className="flex items-center gap-2.5 mb-6 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <MapPin className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
            景点览胜
          </span>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveView(item.key);
                  onClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
              >
                <span
                  className={
                    active
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-gray-400 dark:text-gray-500"
                  }
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </motion.div>
    </div>
  );
}

/* ═══════ 景点卡片（网格） ═══════ */

/** 搜索命中高亮：把 query 在文本中的出现段包上 mark（仅直接子串命中，拼音命中不高亮） */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const hit = lower.indexOf(ql, i);
    if (hit === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (hit > i) parts.push(text.slice(i, hit));
    parts.push(
      <mark
        key={k++}
        className="bg-amber-200/80 dark:bg-amber-400/30 text-gray-900 dark:text-gray-100 rounded-sm px-0.5"
      >
        {text.slice(hit, hit + q.length)}
      </mark>,
    );
    i = hit + q.length;
  }
  return <>{parts}</>;
}

function SpotGrid({
  spots,
  onSelect,
  query = "",
  groups,
  groupOf,
  onAssignGroup,
}: {
  spots: Spot[];
  onSelect: (s: Spot) => void;
  query?: string;
  /** 收藏夹分组（仅在收藏页传入：卡片上显示归属移动控件） */
  groups?: { id: string; name: string }[];
  groupOf?: Record<string, string>;
  onAssignGroup?: (spotId: string, groupId: string | null) => void;
}) {
  const { favorites, toggleFavorite, spotNotes } = useAppStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      <AnimatePresence mode="popLayout">
        {spots.map((spot, i) => {
          const isFav = favorites.includes(spot.id);
          return (
            <motion.div
              key={spot.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              <div className="relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-300 group">
                <button
                  onClick={() => onSelect(spot)}
                  className="w-full text-left"
                >
                  <div className="relative h-44 overflow-hidden">
                    <SpotImage
                      src={spot.image}
                      alt={spot.name}
                      category={spot.category}
                      className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                      eager={i < 6}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={`${getCategoryColor(spot.category)}`}
                      >
                        {getCategoryIcon(spot.category)}
                        <span className="ml-1">{spot.category}</span>
                      </Badge>
                      {(spot.level === "5A" || spot.level === "4A") && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-400/90 text-white text-[10px] font-black shadow-sm">
                          {spot.level}
                        </span>
                      )}
                      {spot.reservation && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-500/90 text-white text-[10px] font-black shadow-sm">
                          需预约
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3
                      title={spot.name}
                      className="font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-emerald-700 transition-colors truncate"
                    >
                      <Highlight text={spot.name} query={query} />
                      {spotNotes[spot.id] && (
                        <FileText className="w-3 h-3 text-amber-500 inline ml-1 -mt-0.5" />
                      )}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={spot.address}>
                        {spot.address}
                      </span>
                      {spot.rating && (
                        <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {spot.rating.toFixed(1)}
                        </span>
                      )}
                      {(() => {
                        const q = quoteTicket(spot);
                        if (q.price == null) return null;
                        return (
                          <span
                            title={`门票来源：${q.label}`}
                            className="ml-auto shrink-0 text-emerald-600 dark:text-emerald-400 font-bold"
                          >
                            {q.price === 0
                              ? "免费"
                              : `¥${q.price}${q.source === "estimate" ? "" : ""}`}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {spot.projects.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-gray-50 dark:bg-gray-900 rounded text-[11px] text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-800"
                        >
                          {p}
                        </span>
                      ))}
                      {spot.projects.length > 3 && (
                        <span className="px-2 py-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                          +{spot.projects.length - 3}
                        </span>
                      )}
                      {groups && onAssignGroup && (
                        <select
                          value={groupOf?.[spot.id] ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            onAssignGroup(spot.id, e.target.value || null);
                            e.currentTarget.blur();
                          }}
                          title="移动到分组"
                          className="ml-auto shrink-0 max-w-24 px-1.5 py-0.5 rounded-md text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 truncate"
                        >
                          <option value="">未分组</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(spot.id);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white dark:bg-gray-900/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${isFav ? "fill-red-500 text-red-500" : "text-gray-400 dark:text-gray-500"}`}
                  />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ═══════ 景点卡片（列表） ═══════ */
function SpotList({
  spots,
  onSelect,
  query = "",
  groups,
  groupOf,
  onAssignGroup,
}: {
  spots: Spot[];
  onSelect: (s: Spot) => void;
  query?: string;
  groups?: { id: string; name: string }[];
  groupOf?: Record<string, string>;
  onAssignGroup?: (spotId: string, groupId: string | null) => void;
}) {
  const { favorites, toggleFavorite, spotNotes } = useAppStore();
  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {spots.map((spot, i) => {
          const isFav = favorites.includes(spot.id);
          return (
            <motion.div
              key={spot.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-300 group flex">
                <button
                  onClick={() => onSelect(spot)}
                  className="flex flex-1 min-w-0 text-left"
                >
                  <div className="w-40 sm:w-48 shrink-0 overflow-hidden">
                    <SpotImage
                      src={spot.image}
                      alt={spot.name}
                      category={spot.category}
                      className="w-full h-full min-h-[120px] group-hover:scale-105 transition-transform duration-500"
                      eager={i < 3}
                    />
                  </div>
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        title={spot.name}
                        className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-emerald-700 transition-colors"
                      >
                        <Highlight text={spot.name} query={query} />
                        {spotNotes[spot.id] && (
                          <FileText className="w-3 h-3 text-amber-500 inline ml-1 -mt-0.5" />
                        )}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] px-1.5 py-0 ${getCategoryColor(spot.category)}`}
                      >
                        {spot.category}
                      </Badge>
                      {(spot.level === "5A" || spot.level === "4A") && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-400/90 text-white text-[10px] font-black">
                          {spot.level}
                        </span>
                      )}
                      {spot.reservation && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-rose-500/90 text-white text-[10px] font-black">
                          需预约
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mb-2">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={spot.address}>
                        {spot.address}
                      </span>
                      {spot.rating && (
                        <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {spot.rating.toFixed(1)}
                        </span>
                      )}
                      {(() => {
                        const q = quoteTicket(spot);
                        if (q.price == null) return null;
                        return (
                          <span
                            title={`门票来源：${q.label}`}
                            className="shrink-0 text-emerald-600 dark:text-emerald-400 font-bold"
                          >
                            {q.price === 0 ? "免费" : `¥${q.price}`}
                          </span>
                        );
                      })()}
                      {groups && onAssignGroup && (
                        <select
                          value={groupOf?.[spot.id] ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            onAssignGroup(spot.id, e.target.value || null);
                            e.currentTarget.blur();
                          }}
                          title="移动到分组"
                          className="ml-auto shrink-0 max-w-24 px-1.5 py-0.5 rounded-md text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 truncate"
                        >
                          <option value="">未分组</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                      {spot.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {spot.projects.slice(0, 4).map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-gray-50 dark:bg-gray-900 rounded text-[11px] text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-800"
                        >
                          {p}
                        </span>
                      ))}
                      {spot.projects.length > 4 && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          +{spot.projects.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(spot.id);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white dark:bg-gray-900/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${isFav ? "fill-red-500 text-red-500" : "text-gray-400 dark:text-gray-500"}`}
                  />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const IMAGE_SOURCE_LABEL: Record<string, string> = {
  amap: "高德地图",
  local: "离线图包",
  osm: "OSM 社区实拍",
  unsplash: "Unsplash",
  pexels: "Pexels",
  pool: "预置图库",
};

/* ═══════ 我的备注编辑器（随输入即时保存到 localStorage） ═══════ */
function SpotNoteEditor({
  spotId,
  value,
  onSave,
}: {
  spotId: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [prevId, setPrevId] = useState(spotId);
  if (spotId !== prevId) {
    setPrevId(spotId);
    setDraft(value);
    setSaved(false);
  }
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5" />
        我的备注
        {saved && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
            已保存 ✓
          </span>
        )}
      </h4>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          onSave(draft);
          if (draft.trim()) setSaved(true);
        }}
        maxLength={300}
        rows={2}
        placeholder="自己的备忘：开放时间核实、同行人约定、门票价格…（仅本机可见）"
        className="w-full px-3 py-2 text-sm bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl outline-none focus:border-amber-300 resize-none placeholder:text-gray-300"
      />
    </div>
  );
}

/* ═══════ 详情弹窗（无重叠关闭按钮 + 多图） ═══════ */
function SpotDetailDialog() {
  const {
    selectedSpot,
    setSelectedSpot,
    favorites,
    toggleFavorite,
    addDissuasionRecord,
    setActiveView,
    spots,
    dissuasionRecords,
    trip,
    addToTrip,
    spotNotes,
    setSpotNote,
    removeFromTrip,
    compareIds,
    toggleCompare,
    customPrices,
    setCustomPrice,
    removeCustomPrice,
  } = useAppStore();
  const [photoIdx, setPhotoIdx] = useState(0);
  // 门票补录：本地编辑态（确认为空则回退到估算/未收录）
  const [ticketEditing, setTicketEditing] = useState(false);
  const [ticketDraft, setTicketDraft] = useState("");
  // 图片查看器：null = 关闭；数字 = 当前查看的相册下标
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showDissuasionEditor, setShowDissuasionEditor] = useState(false);
  // 「分享」按钮复制后的瞬时反馈
  const [copied, setCopied] = useState(false);
  const spot = selectedSpot;
  // 城市包 POI 的相册多图不在主包里（见 lib/poi-photos.ts），打开弹窗时才拉。
  // 拉取失败/未就绪时只显示封面，不阻塞弹窗。
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const photosKey = spot?.photosKey;
  // 门票报价：补录 > 真实收录 > 等级/分类估算（界面标「估」）
  const ticketQuote = spot
    ? quoteTicket(spot, customPrices[`${spot.id}::${TICKET_KEY}`])
    : null;
  /** 提交门票补录：留空 = 撤销补录，回到估算 */
  const commitTicket = () => {
    if (!spot) return;
    const raw = ticketDraft.trim();
    const key = `${spot.id}::${TICKET_KEY}`;
    setTicketEditing(false);
    if (raw === "") {
      removeCustomPrice(key);
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) return;
    setCustomPrice(key, Math.round(num));
  };
  useEffect(() => {
    if (!photosKey) {
      setExtraPhotos([]);
      return;
    }
    let alive = true;
    setExtraPhotos(peekPoiPhotos(photosKey) ?? []);
    loadPoiPhotos().then((m) => {
      if (alive) setExtraPhotos(m[photosKey] ?? []);
    });
    return () => {
      alive = false;
    };
  }, [photosKey]);
  const allPhotos = spot
    ? [spot.image, ...(spot.photos || []), ...extraPhotos].filter(
        (p, i, arr) => p && arr.indexOf(p) === i,
      )
    : [];

  // Reset photo index when spot changes
  const [prevId, setPrevId] = useState<string | null>(null);
  if (spot && spot.id !== prevId) {
    setPhotoIdx(0);
    setTicketEditing(false);
    setLightboxIdx(null);
    setCopied(false);
    setPrevId(spot.id);
  }

  // ═══ 口碑前置：该景点的翻车记录（决策第一现场直接可见） ═══
  const spotId = selectedSpot?.id ?? null;
  const spotReviews = useMemo(
    () =>
      spotId
        ? dissuasionRecords
            .filter((r) => r.spotId === spotId)
            .sort((a, b) => b.timestamp - a.timestamp)
        : [],
    [dissuasionRecords, spotId],
  );
  // ═══ 就近串联：同数据集中 25km 内、带坐标的其他景点 ═══
  const nearbySpots = useMemo(() => {
    if (!selectedSpot) return [];
    const here = parseCoords(selectedSpot);
    if (!here) return [];
    return spots
      .filter((s) => s.id !== selectedSpot.id)
      .map((s) => ({
        spot: s,
        km: haversineKm(here, parseCoords(s) ?? { lat: 999, lng: 999 }),
      }))
      .filter((x) => x.km <= 25)
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
  }, [spots, selectedSpot]);

  // ═══ 同城推荐：统一库里同城的其它景点（大城市包下最多 6 个） ═══
  const sameCitySpots = useMemo(() => {
    if (!selectedSpot) return [];
    const addr = selectedSpot.address;
    // 城市名 = 地址里第一个「市/州/盟」前的区段（如 杭州市/苏州/兴安盟）
    const m = addr.match(/^(.*?(?:市|州|盟))/);
    const city = m ? m[1] : "";
    if (!city || city.length < 2) return [];
    return spots
      .filter((s) => s.id !== selectedSpot.id && s.address.includes(city))
      .slice(0, 6);
  }, [spots, selectedSpot]);

  // ═══ 跨模块联动：地址命中省份时，给「看代表菜」deep link ═══
  const provinceHit = useMemo(() => {
    const addr = selectedSpot?.address ?? "";
    if (!addr) return null;
    return (
      PROVINCE_FOODS.find((pf) => addr.includes(pf.fullName)) ??
      PROVINCE_FOODS.find((pf) => addr.includes(pf.name)) ??
      null
    );
  }, [selectedSpot]);

  if (!spot) return null;
  const isFav = favorites.includes(spot.id);
  const spotCoords = parseCoords(spot);
  const profile = getSpotProfile(spot.id);
  const shareSpot = async () => {
    const c = parseCoords(spot);
    const tq = quoteTicket(spot);
    const nav = c
      ? `\n导航：https://uri.amap.com/marker?position=${c.lng.toFixed(6)},${c.lat.toFixed(6)}&name=${encodeURIComponent(spot.name)}`
      : "";
    const text =
      `【${spot.level ? `${spot.level} · ` : ""}${spot.name}】\n` +
      `地址：${spot.address}\n` +
      (tq.price != null
        ? `门票：¥${tq.price}${tq.source === "estimate" ? "（估）" : ""}\n`
        : "") +
      (spot.rating ? `评分：${spot.rating.toFixed(1)}\n` : "") +
      (spot.openTime ? `开放时间：${spot.openTime}\n` : "") +
      (spot.tel ? `电话：${spot.tel}\n` : "") +
      (spot.tel ? `电话：${spot.tel}\n` : "") +
      (spot.website ? `官网：${spot.website}\n` : "") +
      (spot.reservation ? `预约：${spot.reservation}\n` : "") +
      `${nav}\n—— 来自「华夏探索」景点览胜`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 剪贴板不可用（非安全上下文），静默失败 */
    }
  };

  return (
    <Dialog
      open={!!spot}
      onOpenChange={(open) => !open && setSelectedSpot(null)}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0"
      >
        {/* Photo gallery */}
        <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-gray-100 dark:bg-gray-800">
          <div
            className="w-full h-full cursor-zoom-in"
            onClick={() => setLightboxIdx(photoIdx)}
            title="点击放大查看"
          >
            <SpotImage
              src={allPhotos[photoIdx] || spot.image}
              alt={spot.name}
              category={spot.category}
              className="w-full h-full"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Close button (only one) */}
          <button
            onClick={() => setSelectedSpot(null)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          {/* Favorite button */}
          <button
            onClick={() => toggleFavorite(spot.id)}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${isFav ? "fill-red-400 text-red-400" : "text-white"}`}
            />
          </button>
          {/* Photo nav */}
          {allPhotos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
              <button
                onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
                className="w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center"
              >
                <ChevronLeft className="w-3 h-3 text-white" />
              </button>
              <span className="text-white text-[11px] bg-black/30 rounded-full px-2 py-0.5">
                {photoIdx + 1} / {allPhotos.length}
              </span>
              <button
                onClick={() =>
                  setPhotoIdx((i) => Math.min(allPhotos.length - 1, i + 1))
                }
                className="w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center"
              >
                <ChevronRight className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          {/* Bottom info */}
          <div className="absolute bottom-10 left-5 right-5 z-10">
            <Badge
              variant="outline"
              className={`mb-2 ${getCategoryColor(spot.category)}`}
            >
              {getCategoryIcon(spot.category)}
              <span className="ml-1">{spot.category}</span>
            </Badge>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white drop-shadow-md">
                {spot.name}
              </DialogTitle>
            </DialogHeader>
          </div>
        </div>
        {/* Detail content */}
        <ScrollArea className="max-h-[50vh]">
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">
                {spot.address}
              </span>
              {spotCoords && (
                <a
                  href={`https://uri.amap.com/marker?position=${spotCoords.lng.toFixed(6)},${spotCoords.lat.toFixed(6)}&name=${encodeURIComponent(spot.name)}&src=spot-visual&callnative=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="在高德地图中查看并导航（免费链接，无需登录）"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Navigation className="w-3 h-3" />
                  导航
                </a>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void shareSpot();
                }}
                title="复制景点信息（名称/地址/开放时间/电话/预约提示/导航链接）"
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                  copied
                    ? "text-white bg-emerald-600 border-emerald-600"
                    : "text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <Copy className="w-3 h-3" />
                {copied ? "已复制" : "分享"}
              </button>
            </div>
            {spot.openTime && (
              <p className="flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <Clock className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>
                  {spot.openTime}
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-1">
                    （高德收录，出行前请再核实）
                  </span>
                </span>
              </p>
            )}
            {/* ═══ 门票：已收录 / 估算 / 未收录 三态 + 手动补录 ═══ */}
            <div className="flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              <Ticket className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 text-[10px] px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 align-middle">
                  门票
                </span>
                {ticketEditing ? (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500 dark:text-gray-400">¥</span>
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      value={ticketDraft}
                      onChange={(e) => setTicketDraft(e.target.value)}
                      onBlur={commitTicket}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitTicket();
                        if (e.key === "Escape") setTicketEditing(false);
                      }}
                      placeholder="实际票价"
                      className="w-20 px-2 py-1 text-sm border border-emerald-300 rounded-lg outline-none"
                    />
                    <button
                      onClick={commitTicket}
                      className="text-[11px] font-bold text-white bg-emerald-600 px-2 py-1 rounded-lg"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setTicketEditing(false)}
                      className="text-[11px] text-gray-400 dark:text-gray-500"
                    >
                      取消
                    </button>
                    {ticketQuote?.source === "custom" && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        留空保存 = 恢复估算
                      </span>
                    )}
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setTicketDraft(
                        ticketQuote?.source === "custom"
                          ? String(ticketQuote.price ?? "")
                          : "",
                      );
                      setTicketEditing(true);
                    }}
                    title="官方票价未收录；点击补录你了解的实际票价（仅本机保存）"
                    className="text-left"
                  >
                    {ticketQuote && ticketQuote.price !== null ? (
                      <>
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          ¥{ticketQuote.price}
                        </span>
                        <span
                          className={`ml-1 text-[10px] px-1 py-0.5 rounded ${
                            ticketQuote.source === "estimate"
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20"
                              : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20"
                          }`}
                        >
                          {ticketQuote.source === "estimate"
                            ? "估算"
                            : ticketQuote.label}
                        </span>
                        <span className="ml-1 text-[11px] text-gray-400 dark:text-gray-500">
                          {ticketQuote.source === "estimate"
                            ? "官方票价未收录 · 点击补录"
                            : "仅本机可见"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-gray-400 dark:text-gray-500">
                          未收录
                        </span>
                        <span className="ml-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                          点击补录
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            {spot.website && (
              <p className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                <a
                  href={withSharecode(
                    spot.website.startsWith("http")
                      ? spot.website
                      : `https://${spot.website}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-emerald-700 hover:underline truncate"
                  title={spot.website}
                >
                  官网链接
                </a>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  （高德收录）
                </span>
              </p>
            )}
            {spot.tel && (
              <p className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                <a
                  href={`tel:${spot.tel.replace(/[^\d+]/g, "")}`}
                  className="hover:text-emerald-700 hover:underline"
                >
                  {spot.tel}
                </a>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  （高德收录）
                </span>
              </p>
            )}
            {spot.reservation && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
                <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-400">
                    需要提前预约
                  </p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed mt-0.5">
                    {spot.reservation}
                  </p>
                </div>
              </div>
            )}
            {/* ═══ 景点档案（外包结构化字段，有档案才显示） ═══ */}
            {profile && (
              <div className="rounded-xl border border-sky-100 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 dark:bg-sky-500/10 p-3.5 space-y-1.5">
                <p className="text-[11px] font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  景点档案
                  {profile.low && (
                    <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                      · 部分字段待核实
                    </span>
                  )}
                </p>
                {profile.suggestedHours != null && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    建议游玩：约 {profile.suggestedHours} 小时
                  </p>
                )}
                {profile.bestMonths && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    最佳月份：{profile.bestMonths}
                  </p>
                )}
                {!spot.openTime && profile.openHours && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    开放时间：{profile.openHours}
                  </p>
                )}
                {(profile.nearestAirport || profile.nearestRail) && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    交通：
                    {[profile.nearestAirport, profile.nearestRail]
                      .filter(Boolean)
                      .join(" · ")}
                    {typeof profile.driveFromCityMin === "number" &&
                      ` · 市区车程约 ${profile.driveFromCityMin} 分钟`}
                  </p>
                )}
                {profile.notices && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    注意：{profile.notices}
                  </p>
                )}
                {profile.accessibility && profile.accessibility.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {profile.accessibility.map((a) => (
                      <span
                        key={a}
                        className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-900 border border-sky-200 dark:border-sky-500/30 text-[10px] text-sky-700 dark:text-sky-400"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {spot.level && (
              <p className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 text-xs font-black tracking-wide">
                  {spot.level} 级景区
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  2023 年全国 A 级景区名录
                </span>
              </p>
            )}
            {!spot.tel &&
              !spot.rating &&
              (spot.level === "5A" || spot.level === "4A") && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  建议游玩：{spot.level === "5A" ? "半天至一天" : "2-3 小时"}
                  （按
                  {spot.level} 级规模推断，仅供参考）
                </p>
              )}
            {spot.rating && (
              <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-bold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                {spot.rating.toFixed(1)}
                <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500">
                  高德用户评分
                </span>
              </p>
            )}
            {/* ═══ 同城推荐：库内同城的其它景点 ═══ */}
            {sameCitySpots.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" />
                  同城更多
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {sameCitySpots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSpot(s)}
                      className="px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-100 transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* ═══ 图源标注（数据诚实性：说明这张图是谁提供的） ═══ */}
            {spot.image && spot.imageSource && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                图片来源：
                {IMAGE_SOURCE_LABEL[spot.imageSource] ?? spot.imageSource}
                （失效时自动降级预置图库）
              </p>
            )}
            {/* ═══ 跨模块联动：到中国味道看当地代表菜 ═══ */}
            {provinceHit && (
              <Link
                href={withSharecode(
                  `/food?prov=${encodeURIComponent(provinceHit.name)}`,
                )}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                到「中国味道」看{provinceHit.name}代表菜：{provinceHit.dish} →
              </Link>
            )}
            {/* Photo thumbnails */}
            {allPhotos.length > 1 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  图片 ({allPhotos.length})
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allPhotos.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition-colors ${i === photoIdx ? "border-emerald-500" : "border-transparent opacity-60 hover:opacity-100"}`}
                    >
                      <SpotImage
                        src={p}
                        alt={`${spot.name} ${i + 1}`}
                        category={spot.category}
                        className="w-full h-full"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                景点介绍
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {spot.description}
              </p>
            </div>
            {/* ═══ 口碑前置：翻车记录数 + 高频标签 ═══ */}
            {spotReviews.length > 0 && (
              <div className="rounded-xl border border-rose-100 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-3">
                <button
                  onClick={() => {
                    setSelectedSpot(null);
                    setActiveView("dissuasion");
                  }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-400 mb-1.5 hover:text-rose-800"
                >
                  <BookX className="w-3.5 h-3.5" />
                  {spotReviews.length} 条翻车记录 · 点击查看
                </button>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(spotReviews.flatMap((r) => r.tags)))
                    .slice(0, 5)
                    .map((tagId) => {
                      const t = DISSUASION_TAGS.find((x) => x.id === tagId);
                      return t ? (
                        <span
                          key={tagId}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-gray-900 text-[11px] text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20"
                        >
                          {t.emoji} {t.label}
                        </span>
                      ) : null;
                    })}
                </div>
              </div>
            )}
            {/* ═══ 就近串联：基于坐标的串联建议，点击直达 ═══ */}
            {nearbySpots.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" />
                  就近串联
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {nearbySpots.map(({ spot: s, km }) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSpot(s)}
                      className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      {s.name} ·{" "}
                      {km < 1
                        ? `${Math.round(km * 1000)}m`
                        : `${km.toFixed(1)}km`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Separator />
            {spot.facilities.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2.5">
                  配套设施
                </h4>
                <div className="flex flex-wrap gap-2">
                  {spot.facilities.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs text-gray-600 dark:text-gray-300"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {spot.projects.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2.5">
                  推荐项目
                </h4>
                <div className="space-y-2">
                  {spot.projects.map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ═══ 7 日出行窗口快捷入口（有坐标的景点） ═══ */}
            {parseCoords(spot) && (
              <button
                onClick={() => {
                  try {
                    sessionStorage.setItem("ptsi:focusSpotId", spot.id);
                  } catch {}
                  setSelectedSpot(null);
                  setActiveView("ptsi");
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 text-sm font-bold hover:bg-sky-100 transition-colors border border-sky-100 dark:border-sky-500/20"
              >
                <Thermometer className="w-4 h-4" />看 7
                日出行窗口：本周哪天去最合适 →
              </button>
            )}
            {/* ═══ 我的备注（本地持久化，仅自己可见） ═══ */}
            <SpotNoteEditor
              spotId={spot.id}
              value={spotNotes[spot.id] ?? ""}
              onSave={(v) => setSpotNote(spot.id, v)}
            />
            {/* ═══ 行程单：加入/移出 ═══ */}
            <button
              onClick={() =>
                trip.includes(spot.id)
                  ? removeFromTrip(spot.id)
                  : addToTrip(spot.id)
              }
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-colors border ${
                trip.includes(spot.id)
                  ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                  : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/10"
              }`}
            >
              <Route className="w-4 h-4" />
              {trip.includes(spot.id) ? "已在行程中 · 点击移出" : "加入行程"}
            </button>
            {/* ═══ 对比：加入/移出对比栏 ═══ */}
            <button
              onClick={() => toggleCompare(spot.id)}
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-colors border ${
                compareIds.includes(spot.id)
                  ? "bg-sky-600 text-white border-sky-600 hover:bg-sky-700"
                  : "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-100 dark:border-sky-500/20 hover:bg-sky-100"
              }`}
            >
              <Scale className="w-4 h-4" />
              {compareIds.includes(spot.id)
                ? "已加入对比 · 点击移出"
                : compareIds.length >= 2
                  ? "替换对比第 1 个"
                  : "加入对比"}
            </button>
            {/* ═══ D3.5：劝退入口 ═══ */}
            <Separator />
            <div className="flex gap-2">
              <button
                onClick={() => setShowDissuasionEditor(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-100 dark:hover:bg-rose-500/10 transition-colors border border-rose-100 dark:border-rose-500/20"
              >
                <BookX className="w-4 h-4" />
                举报翻车经历
              </button>
              <button
                onClick={() => {
                  setSelectedSpot(null);
                  setActiveView("dissuasion");
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-100 dark:border-gray-800"
              >
                <BookX className="w-4 h-4" />
                查看翻车日记
              </button>
            </div>
          </div>
        </ScrollArea>
        {lightboxIdx !== null && (
          <Lightbox
            photos={allPhotos}
            index={Math.min(lightboxIdx, allPhotos.length - 1)}
            onIndex={(i) => setLightboxIdx(i)}
            onClose={() => setLightboxIdx(null)}
          />
        )}
      </DialogContent>
      {/* ═══ D3.5：劝退日记编辑器（从详情弹窗发起，预填当前景点） ═══ */}
      {showDissuasionEditor && (
        <DissuasionEditor
          initialSpotId={spot.id}
          onSave={(record) => {
            addDissuasionRecord(record);
            setShowDissuasionEditor(false);
            setSelectedSpot(null);
            setActiveView("dissuasion");
          }}
          onClose={() => setShowDissuasionEditor(false)}
        />
      )}
    </Dialog>
  );
}

/* ═══════ 图片查看器：全屏遮罩，左右切换，Esc/点击关闭（capture 拦截避免连带关弹窗） ═══════ */
function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft")
        onIndex((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={photos[index]}
        alt={`放大查看 ${index + 1}`}
        className="max-w-[94vw] max-h-[92vh] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + photos.length) % photos.length);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white dark:bg-gray-900/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % photos.length);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white dark:bg-gray-900/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-xs bg-black/40 rounded-full px-3 py-1">
            {index + 1} / {photos.length}
          </span>
        </>
      )}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white dark:bg-gray-900/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

/* ═══════ 对比栏：已选 <2 个时浮动在底部，凑满即可打开对比弹窗 ═══════ */
function CompareBar() {
  const { spots, compareIds, toggleCompare, clearCompare } = useAppStore();
  const [open, setOpen] = useState(false);
  const picked = compareIds
    .map((id) => spots.find((s) => s.id === id))
    .filter((s): s is (typeof spots)[number] => !!s);
  if (!picked.length) return null;
  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900/90 backdrop-blur-sm text-white rounded-full pl-4 pr-2 py-2 shadow-xl border border-white/10 max-w-[94vw]">
        <Scale className="w-4 h-4 text-sky-300 shrink-0" />
        <div className="flex items-center gap-2 overflow-hidden">
          {picked.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleCompare(s.id)}
              title="点击移出"
              className="flex items-center gap-1.5 text-xs bg-white dark:bg-gray-900/10 hover:bg-white/20 rounded-full pl-1 pr-2 py-1 shrink-0"
            >
              <span className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 shrink-0">
                {s.image ? (
                  <img
                    src={s.image}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </span>
              <span className="max-w-24 truncate">{s.name}</span>
              <X className="w-3 h-3 opacity-60" />
            </button>
          ))}
          {picked.length === 1 && (
            <span className="text-xs text-white/50 shrink-0">
              再选 1 个即可对比
            </span>
          )}
        </div>
        {picked.length === 2 && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-400 text-xs font-bold transition-colors"
          >
            对比
          </button>
        )}
        <button
          onClick={clearCompare}
          title="清空对比"
          className="shrink-0 w-7 h-7 rounded-full bg-white dark:bg-gray-900/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && picked.length === 2 && (
        <CompareDialog
          a={picked[0]}
          b={picked[1]}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ═══════ 对比弹窗：两景点并排（窄屏上下堆叠） ═══════ */
function CompareDialog({
  a,
  b,
  onClose,
}: {
  a: (typeof LIBRARY_SPOTS)[number];
  b: (typeof LIBRARY_SPOTS)[number];
  onClose: () => void;
}) {
  const ca = parseCoords(a);
  const cb = parseCoords(b);
  const dist = ca && cb ? haversineKm(ca, cb) : null;
  const rows: { label: string; render: (s: typeof a) => React.ReactNode }[] = [
    {
      label: "等级",
      render: (s) =>
        s.level ? (
          <span className="px-1.5 py-0.5 rounded-md bg-amber-400/90 text-white text-[10px] font-black">
            {s.level}
          </span>
        ) : (
          "—"
        ),
    },
    {
      label: "评分",
      render: (s) =>
        s.rating ? (
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            ★ {s.rating.toFixed(1)}
          </span>
        ) : (
          "—"
        ),
    },
    { label: "分类", render: (s) => s.category },
    {
      label: "预约",
      render: (s) =>
        s.reservation ? (
          <span className="text-rose-600 dark:text-rose-400 text-xs">
            {s.reservation}
          </span>
        ) : (
          "未收录（请自行核实）"
        ),
    },
    {
      label: "开放时间",
      render: (s) => s.openTime ?? "—",
    },
    {
      label: "电话",
      render: (s) =>
        s.tel ? (
          <a
            href={`tel:${s.tel.replace(/[^\d+]/g, "")}`}
            className="text-emerald-700 dark:text-emerald-400 underline"
          >
            {s.tel}
          </a>
        ) : (
          "—"
        ),
    },
    {
      label: "门票",
      render: (s) => {
        const q = quoteTicket(s);
        if (q.price == null) return "—";
        return `¥${q.price}${q.source === "estimate" ? "（估）" : ""}`;
      },
    },
    {
      label: "建议游玩",
      render: (s) => `${suggestedVisitHours(s)} 小时`,
    },
    { label: "地址", render: (s) => s.address },
    {
      label: "导航",
      render: (s) => {
        const c = parseCoords(s);
        if (!c) return "—";
        return (
          <a
            href={`https://uri.amap.com/marker?position=${c.lng.toFixed(6)},${c.lat.toFixed(6)}&name=${encodeURIComponent(s.name)}&src=spot-visual&callnative=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Navigation className="w-3 h-3" />
            高德导航
          </a>
        );
      },
    },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[88vh] overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_1fr] gap-x-3 gap-y-3 items-start">
          <div />
          {[a, b].map((s, i) => (
            <div key={s.id} className={i === 0 ? "" : ""}>
              <div className="h-28 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 mb-1.5">
                {s.image ? (
                  <img
                    src={s.image}
                    alt={s.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (() => {
                    const theme = CATEGORY_THEME[s.category] || {
                      from: "#F3F4F6",
                      to: "#E5E7EB",
                      icon: "📍",
                    };
                    return (
                      <div
                        className="w-full h-full flex items-center justify-center text-3xl"
                        style={{
                          background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
                        }}
                      >
                        {theme.icon}
                      </div>
                    );
                  })()
                )}
              </div>
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-snug">
                {s.name}
              </p>
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold pt-0.5">
                {row.label}
              </p>
              {[a, b].map((s) => (
                <p
                  key={s.id}
                  className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed break-words"
                >
                  {row.render(s)}
                </p>
              ))}
            </div>
          ))}
          {dist !== null && (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold pt-0.5">
                直线距离
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-200 font-bold sm:col-span-2">
                两地相距约{" "}
                {dist < 1
                  ? `${Math.round(dist * 1000)} m`
                  : `${dist.toFixed(1)} km`}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════ 景点览胜视图 ═══════ */
function SpotsView() {
  const {
    spots,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    viewMode,
    setViewMode,
    setSelectedSpot,
    favorites,
    toggleFavorite,
    setSpots,
    recentViews,
    recentSearches,
    clearRecentSearches,
  } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // ═══ 城市探索：三级加载——构建时烘好的城市包（即时） → 库内筛选 → /api/osm 休眠兜底 ═══
  const [city, setCity] = useState("北京");
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmMsg, setOsmMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const confirmReplace = () =>
    spots.length === 0 ||
    window.confirm(
      `探索将替换当前 ${spots.length} 个景点（收藏与行程中引用它们的条目会被清理），继续？`,
    );

  const exploreOsm = useCallback(async () => {
    const c = city.trim();
    if (!c || osmLoading) return;
    if (!confirmReplace()) return;
    setOsmLoading(true);
    setOsmMsg(null);
    try {
      const res = await fetch(
        withSharecode(`/api/osm?city=${encodeURIComponent(c)}&limit=50`),
      );
      const data = await res.json();
      if (data.source === "error" || !data.spots || data.spots.length === 0) {
        setOsmMsg({
          type: "err",
          text: data.message || `未获取到「${c}」的实时景点，已保留内置示例。`,
        });
      } else {
        setSpots(data.spots);
        setActiveCategory("全部");
        setSearchQuery("");
        await fillSpotImages(data.spots);
        setOsmMsg({
          type: "ok",
          text: `已加载 ${data.spots.length} 个「${c}」实时景点 · 数据源 OpenStreetMap（ODbL）`,
        });
      }
    } catch {
      setOsmMsg({
        type: "err",
        text: "实时请求失败，已保留内置示例景点。可以点「随便看看」从景点库随机逛逛。",
      });
    } finally {
      setOsmLoading(false);
    }
  }, [city, osmLoading, spots, setSpots, setActiveCategory, setSearchQuery]);

  // 热门城市 chips：城市包城市 + 手工精选城市（去重）
  // ═══ 全国化：chips 改为省份（31 省，覆盖全国库）；城市粒度走搜索框（匹配地址） ═══
  const HOT_PROVINCES = useMemo(() => {
    const PROVS = [
      "北京",
      "天津",
      "河北",
      "山西",
      "内蒙古",
      "辽宁",
      "吉林",
      "黑龙江",
      "上海",
      "江苏",
      "浙江",
      "安徽",
      "福建",
      "江西",
      "山东",
      "河南",
      "湖北",
      "湖南",
      "广东",
      "广西",
      "海南",
      "重庆",
      "四川",
      "贵州",
      "云南",
      "西藏",
      "陕西",
      "甘肃",
      "青海",
      "宁夏",
      "新疆",
    ];
    return PROVS;
  }, []);

  // 每个省份在库内的景点数：chips 上直接显示，避免点进去发现是空的
  const cityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const hc of HOT_PROVINCES) {
      c[hc] = spots.reduce((n, s) => (s.address.includes(hc) ? n + 1 : n), 0);
    }
    return c;
  }, [spots, HOT_PROVINCES]);
  const [citiesExpanded, setCitiesExpanded] = useState(false);

  // ═══ 城市过滤：chips/输入框都是库的过滤器，不再替换 spots（收藏/行程/改价永不丢失） ═══
  // 筛选持久化：cityFilter/levelFilter/searchQuery/activeCategory 都在 store（partialize）
  const cityFilter = useAppStore((s) => s.cityFilter);
  const setCityFilter = useAppStore((s) => s.setCityFilter);

  const handleCityExplore = useCallback(() => {
    const c = city.trim().replace(/市$/, "");
    if (!c) return;
    // 库内有该城市 → 过滤视图；没有 → 实时通道兜底（部分环境不可用）
    const hit = spots.some((s) => s.address.includes(c));
    if (hit) {
      setCityFilter(c);
      setOsmMsg({
        type: "ok",
        text: `已筛选「${c}」的景点（收藏与行程不受影响）`,
      });
    } else {
      setCityFilter(null);
      exploreOsm();
    }
  }, [city, spots, exploreOsm]);

  // ═══ 随便看看：实时探索不可用（离线/限流）时，从景点库随机抽一个直接看 ═══

  const allCategories = useMemo(() => {
    const cats = new Set(spots.map((s) => s.category));
    return ["全部", ...Array.from(cats)];
  }, [spots]);

  // 计数用的中间池：只按省份+搜索过滤（不含分类/等级自身维度），
  // 让分类/等级 chips 的数字随其它筛选联动，而不是恒显全国数
  const countPool = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return spots.filter((s) => {
      if (cityFilter && !s.address.includes(cityFilter)) return false;
      if (!q) return true;
      if (
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      )
        return true;
      return (
        /^[a-z]+$/i.test(q) &&
        (() => {
          const py = getPinyinKeys(s.name);
          return py.full.includes(q) || py.initials.includes(q);
        })()
      );
    });
  }, [spots, cityFilter, searchQuery]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { 全部: countPool.length };
    countPool.forEach((s) => {
      c[s.category] = (c[s.category] || 0) + 1;
    });
    return c;
  }, [countPool]);

  // 等级 chips 计数（与分类计数同一中间池，随省份/搜索联动）
  const levelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    countPool.forEach((s) => {
      if (s.level === "5A" || s.level === "4A")
        c[s.level] = (c[s.level] || 0) + 1;
    });
    return c;
  }, [countPool]);

  // ═══ 排序：默认（库顺序）/ 评分 / 名称 / 距离 ═══
  // 距离依赖定位，userLoc 为空时自动回退默认顺序，不报错。
  // 排序模式在 store（持久化）：刷新后保持排序上下文
  const sortMode = useAppStore((st) => st.sortMode);
  const setSortMode = useAppStore((st) => st.setSortMode);

  // ═══ 离我最近排序（geolocation，拒绝授权优雅降级） ═══
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // ═══ 等级快速过滤：只看 5A / 4A（null = 不过滤） ═══
  const levelFilter = useAppStore((s) => s.levelFilter);
  const setLevelFilter = useAppStore((s) => s.setLevelFilter);
  const [locating, setLocating] = useState(false);

  // ═══ 分页渲染：1200+ 卡片一次性渲染会拖慢首屏，先渲染 60 张，滚动到底自动加载 ═══
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const toggleNearbySort = useCallback(() => {
    if (userLoc) {
      setUserLoc(null);
      if (sortMode === "distance") setSortMode("default");
      return;
    }
    if (!navigator.geolocation) {
      alert("当前浏览器不支持定位");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortMode("distance");
        setLocating(false);
      },
      () => {
        alert("未获得定位授权，已保持原排序");
        setLocating(false);
      },
      { timeout: 8000 },
    );
  }, [userLoc, sortMode, setSortMode]);

  const filteredSpots = useMemo(() => {
    const list = spots.filter((s) => {
      const cc = !cityFilter || s.address.includes(cityFilter);
      const lc = !levelFilter || s.level === levelFilter;
      const mc = activeCategory === "全部" || s.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const mq =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.facilities.some((f) => f.toLowerCase().includes(q)) ||
        s.projects.some((p) => p.toLowerCase().includes(q)) ||
        // 拼音匹配：支持全拼（bj）与首字母（gdg）检索景点名
        (/^[a-z]+$/i.test(q) &&
          (() => {
            const py = getPinyinKeys(s.name);
            return py.full.includes(q) || py.initials.includes(q);
          })());
      return cc && lc && mc && mq;
    });
    if (sortMode === "name") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "zh"));
    }
    if (sortMode === "rating") {
      // 无评分的沉底，同分按名称稳定排序
      return [...list].sort(
        (a, b) =>
          (b.rating ?? -1) - (a.rating ?? -1) ||
          a.name.localeCompare(b.name, "zh"),
      );
    }
    // 门票价：档案/补录/估算统一走 quoteTicket，未收录沉底
    if (sortMode === "ticket") {
      return [...list].sort(
        (a, b) =>
          (quoteTicket(a).price ?? Number.POSITIVE_INFINITY) -
            (quoteTicket(b).price ?? Number.POSITIVE_INFINITY) ||
          a.name.localeCompare(b.name, "zh"),
      );
    }
    // 距离：无坐标的景点排最后；没定位就是默认顺序
    if (sortMode === "distance" && userLoc) {
      return [...list].sort((a, b) => {
        const ca = parseCoords(a);
        const cb = parseCoords(b);
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return haversineKm(userLoc, ca) - haversineKm(userLoc, cb);
      });
    }
    return list;
  }, [
    spots,
    activeCategory,
    searchQuery,
    userLoc,
    cityFilter,
    sortMode,
    levelFilter,
  ]);

  // 筛选条件变化时重置分页
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [spots, activeCategory, searchQuery, cityFilter, userLoc, levelFilter]);

  const randomBrowse = useCallback(() => {
    // 尊重当前筛选：有过滤结果时从过滤池随机，否则全库
    const pool =
      filteredSpots.length > 0
        ? filteredSpots
        : spots.length > 0
          ? spots
          : sampleSpots;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelectedSpot(pick);
  }, [filteredSpots, spots, setSelectedSpot]);

  // 哨兵进入视口 → 加载下一页
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, filteredSpots.length));
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filteredSpots.length, visibleCount]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.endsWith(".json")) {
        alert("请选择 JSON 文件");
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const raw = JSON.parse(ev.target?.result as string);
          const parsed = parseImportedSpots(raw);
          if (parsed.length === 0) {
            alert("未在文件中找到有效的景点数据");
            return;
          }

          // ═══ 名称去重：跳过与已有景点名称完全相同的条目 ═══
          const existingNames = new Set(
            useAppStore.getState().spots.map((s) => s.name.trim()),
          );
          const duplicates: string[] = [];
          const unique = parsed.filter((s) => {
            if (existingNames.has(s.name.trim())) {
              duplicates.push(s.name);
              return false;
            }
            existingNames.add(s.name.trim());
            return true;
          });

          if (unique.length === 0) {
            alert(
              `全部 ${duplicates.length} 个景点已存在，未导入任何新景点：\n${duplicates.join("、")}`,
            );
            return;
          }

          // 先追加到 store（无图景点先显示渐变占位）
          useAppStore.getState().appendSpots(unique);
          setImporting(true);

          // 配图：按分类批量拉图（共享流程，OSM 探索同样复用）
          await fillSpotImages(unique);

          setImporting(false);

          // ═══ 导入完成提示 ═══
          let msg = `成功导入 ${unique.length} 个景点，当前共 ${useAppStore.getState().spots.length} 个`;
          if (duplicates.length > 0) {
            msg += `\n\n以下 ${duplicates.length} 个景点因名称重复已跳过：\n${duplicates.join("、")}`;
          }
          alert(msg);
        } catch {
          alert("JSON 解析失败，请检查文件格式");
          setImporting(false);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [],
  );

  return (
    <div className="space-y-5">
      {/* 城市探索：城市包 → 库内精选 → 实时兜底 */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 dark:bg-emerald-500/10 p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            城市探索
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            全国库 {LIBRARY_SPOTS.length} 景点 · 零外链
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {(citiesExpanded ? HOT_PROVINCES : HOT_PROVINCES.slice(0, 12)).map(
              (hc) => {
                const n = cityCounts[hc] ?? 0;
                const on = cityFilter === hc;
                return (
                  <button
                    key={hc}
                    onClick={() => setCityFilter(on ? null : hc)}
                    aria-pressed={on}
                    title={n ? `${hc} · ${n} 个景点` : `${hc} · 库内无匹配`}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${on ? "bg-emerald-600 text-white border-emerald-600" : n === 0 ? "bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800" : "bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"}`}
                  >
                    {hc}
                    <span
                      className={`ml-1 text-[10px] ${on ? "text-white/70" : "text-gray-400 dark:text-gray-500"}`}
                    >
                      {n}
                    </span>
                  </button>
                );
              },
            )}
            {HOT_PROVINCES.length > 12 && (
              <button
                onClick={() => setCitiesExpanded((v) => !v)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-emerald-300 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
              >
                {citiesExpanded ? "收起" : `展开全部省份`}
              </button>
            )}
          </div>
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") exploreOsm();
              }}
              placeholder="输入城市，如 苏州 / 洛阳 / 大连 / 哈尔滨"
              className="pl-10 h-11 bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-500/30 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
            onClick={randomBrowse}
            title="从景点库随机抽一个看看"
          >
            <Dices className="w-3.5 h-3.5" />
            随便看看
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={osmLoading}
            onClick={handleCityExplore}
          >
            {osmLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            {osmLoading ? "探索中..." : "探索该城市"}
          </Button>
        </div>
        {osmMsg && (
          <p
            className={`text-xs mt-2 ${osmMsg.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}
          >
            {osmMsg.text}
          </p>
        )}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
          库内共 {LIBRARY_STATS.total} 个景点（手工 {LIBRARY_STATS.manual} +
          高德 POI {LIBRARY_STATS.cityPoi}（{LIBRARY_STATS.cityCount} 城）+ 2023
          全国 A 级名录 {LIBRARY_STATS.extras}，构建时烘焙 ·
          零外链）。点省份即过滤，
          收藏与行程不受影响；库外城市走实时通道（上游不稳定时自动回落到库内）。
        </p>
      </div>

      {/* Search + Import */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <Input
          placeholder="搜索名称、地址、介绍、设施、项目，支持拼音（如 gmgy / guangongyu）..."
          className="pl-10 pr-10 h-11 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* ═══ 最近搜索：快捷重搜 chips（无激活搜索词时显示） ═══ */}
      {!searchQuery && recentSearches.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
            最近搜索
          </span>
          {recentSearches.map((t) => (
            <button
              key={t}
              onClick={() => setSearchQuery(t)}
              className="px-2 py-0.5 rounded-full text-[11px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t}
            </button>
          ))}
          <button
            onClick={clearRecentSearches}
            className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-rose-500 transition-colors"
          >
            清空
          </button>
        </div>
      )}
      {/* ═══ 最近浏览：继续浏览横滑条（点开详情即记录，最多 12 个） ═══ */}
      {recentViews.length > 0 &&
        (() => {
          const recents = recentViews
            .map((id) => spots.find((s) => s.id === id))
            .filter((s): s is (typeof spots)[number] => !!s);
          if (!recents.length) return null;
          return (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                <History className="w-3.5 h-3.5" />
                继续浏览
              </p>
              <ScrollArea className="w-full">
                <div className="flex w-max gap-2 pb-1">
                  {recents.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSpot(s)}
                      className="shrink-0 w-28 text-left group"
                    >
                      <div className="h-16 w-28 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 mb-1">
                        <SpotImage
                          src={s.image}
                          alt={s.name}
                          category={s.category}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <p
                        title={s.name}
                        className="text-[11px] text-gray-600 dark:text-gray-300 truncate group-hover:text-emerald-700"
                      >
                        {s.name}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          );
        })()}
      {/* Category filters */}
      <ScrollArea className="w-full">
        <div className="flex w-max items-center gap-2 pb-1">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border ${activeCategory === cat ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              {cat !== "全部" && getCategoryIcon(cat)}
              {cat}
              <span
                className={`ml-0.5 text-[10px] ${activeCategory === cat ? "text-white/70" : "text-gray-400 dark:text-gray-500"}`}
              >
                {categoryCounts[cat] || 0}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
      {/* Toolbar：浏览控制（左）+ 数据操作（右），窄屏自动换行 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(["5A", "4A"] as const).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevelFilter(levelFilter === lv ? null : lv)}
              title={`只看 ${lv} 级景区`}
              className={`px-2 py-1.5 rounded-lg text-xs font-black border transition-colors ${
                levelFilter === lv
                  ? "bg-amber-400 text-white border-amber-400"
                  : "bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10"
              }`}
            >
              {lv}
              <span
                className={`ml-0.5 text-[10px] font-medium ${levelFilter === lv ? "text-white/80" : "text-amber-400"}`}
              >
                {levelCounts[lv] || 0}
              </span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="hidden sm:inline">排序</span>
          <select
            value={sortMode}
            onChange={(e) =>
              setSortMode(
                e.target.value as "default" | "rating" | "name" | "distance",
              )
            }
            title="评分排序用的是高德用户评分（无评价数，5.0 也可能是极少评价）"
            className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 text-xs text-gray-700 dark:text-gray-200 outline-none focus:border-emerald-400"
          >
            <option value="default">默认</option>
            <option value="rating">评分最高</option>
            <option value="distance">离我最近</option>
            <option value="ticket">门票价（低→高）</option>
            <option value="name">名称</option>
          </select>
        </label>
        {/* 离我最近：定位快捷方式（等同把排序切到「离我最近」） */}
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs ${userLoc ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : ""}`}
          disabled={locating}
          onClick={toggleNearbySort}
        >
          <Navigation className="w-3.5 h-3.5" />
          {locating ? "定位中..." : userLoc ? "按距离排序中" : "离我最近"}
        </Button>
        <div className="hidden sm:flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-white dark:bg-gray-900">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        <div className="sm:ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? (
              <span className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {importing ? "拉取图片中..." : "导入"}
          </Button>
          {spots.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-gray-500 dark:text-gray-400"
              onClick={useAppStore.getState().resetSpots}
            >
              恢复完整库
            </Button>
          )}
          {spots.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-red-400 hover:text-red-600"
              onClick={() => {
                if (
                  window.confirm(
                    "将清空全部景点数据（含收藏/行程/备注/翻车记录），不可恢复。确定？",
                  )
                )
                  useAppStore.getState().clearAllSpots();
              }}
            >
              清空全部
            </Button>
          )}
        </div>
      </div>
      {/* Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        共{" "}
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {filteredSpots.length}
        </span>{" "}
        个景点{levelFilter && <span> · {levelFilter}</span>}
        {cityFilter && <span> · {cityFilter}</span>}
        {activeCategory !== "全部" && <span> · {activeCategory}</span>}
        {searchQuery && <span> · &ldquo;{searchQuery}&rdquo;</span>}
        {levelFilter && (
          <button
            onClick={() => setLevelFilter(null)}
            className="ml-1 text-amber-600 dark:text-amber-400 hover:underline"
          >
            清除{levelFilter}
          </button>
        )}
        {cityFilter && (
          <button
            onClick={() => setCityFilter(null)}
            className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            清除
          </button>
        )}
      </p>
      {/* Content */}
      {filteredSpots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            没有找到匹配的景点
          </p>
          {(searchQuery ||
            activeCategory !== "全部" ||
            levelFilter ||
            cityFilter) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("全部");
                setLevelFilter(null);
                setCityFilter(null);
              }}
              className="gap-2 mb-2"
            >
              <X className="w-4 h-4" />
              一键清空全部筛选
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            导入 JSON
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <SpotGrid
          spots={filteredSpots.slice(0, visibleCount)}
          onSelect={setSelectedSpot}
          query={searchQuery}
        />
      ) : (
        <SpotList
          spots={filteredSpots.slice(0, visibleCount)}
          onSelect={setSelectedSpot}
          query={searchQuery}
        />
      )}
      {/* 无限加载哨兵：进入视口再渲染下一页，首屏只挂 60 张卡片 */}
      {visibleCount < filteredSpots.length && (
        <div
          ref={sentinelRef}
          className="py-8 text-center text-xs text-gray-400 dark:text-gray-500"
        >
          正在加载更多景点…（{visibleCount}/{filteredSpots.length}）
        </div>
      )}
    </div>
  );
}

/* ═══════ 收藏景点视图 ═══════ */
function FavoritesView() {
  const {
    spots,
    favorites,
    setSelectedSpot,
    toggleFavorite,
    addToTrip,
    setActiveView,
    spotNotes,
    favGroups,
    favGroupOf,
    createFavGroup,
    deleteFavGroup,
    setFavGroup,
  } = useAppStore();
  // 分组筛选：null=全部，"__none"=未分组，其余=文件夹 id
  const [favGroupFilter, setFavGroupFilter] = useState<string | null>(null);
  const favSpots = useMemo(
    () => spots.filter((s) => favorites.includes(s.id)),
    [spots, favorites],
  );
  const [favQuery, setFavQuery] = useState("");
  const [favLevel, setFavLevel] = useState<"5A" | "4A" | null>(null);
  // 分类记忆（sessionStorage）：会话内切走再回来不重置
  const [favCat, setFavCat] = useState(() => {
    try {
      return sessionStorage.getItem("favCat") ?? "全部";
    } catch {
      return "全部";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("favCat", favCat);
    } catch {}
  }, [favCat]);
  const favCats = useMemo(() => {
    const cats = new Set(favSpots.map((s) => s.category));
    return ["全部", ...Array.from(cats)];
  }, [favSpots]);
  const shownFavs = useMemo(() => {
    let list =
      favCat === "全部"
        ? favSpots
        : favSpots.filter((s) => s.category === favCat);
    if (favLevel) list = list.filter((s) => s.level === favLevel);
    if (favGroupFilter === "__none")
      list = list.filter((s) => !favGroupOf[s.id]);
    else if (favGroupFilter)
      list = list.filter((s) => favGroupOf[s.id] === favGroupFilter);
    const q = favQuery.trim().toLowerCase();
    if (q)
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (() => {
            const py = getPinyinKeys(s.name);
            return py.full.includes(q) || py.initials.includes(q);
          })(),
      );
    return list;
  }, [favSpots, favCat, favLevel, favQuery, favGroupFilter, favGroupOf]);
  // 导出收藏清单为 txt（含等级/地址/开放时间/电话/高德导航链接），可直接发给别人
  const exportList = useCallback(() => {
    const lines = shownFavs.map((s, i) => {
      const lv = s.level ? `【${s.level}·${s.category}】` : `【${s.category}】`;
      const tq = quoteTicket(s);
      const tk =
        tq.price != null
          ? `｜门票 ¥${tq.price}${tq.source === "estimate" ? "（估）" : ""}`
          : "";
      const note = spotNotes[s.id] ? `｜备注 ${spotNotes[s.id]}` : "";
      const ot = s.openTime ? `｜开放 ${s.openTime}` : "";
      const tel = s.tel ? `｜☎ ${s.tel}` : "";
      const c = parseCoords(s);
      const nav = c
        ? `｜导航 https://uri.amap.com/marker?position=${c.lng.toFixed(6)},${c.lat.toFixed(6)}&name=${encodeURIComponent(s.name)}`
        : "";
      return `${i + 1}. ${lv}${s.name}（${s.address}）${tk}${ot}${tel}${note}${nav}`;
    });
    const text =
      `华夏探索 · 收藏清单（${shownFavs.length} 个景点）\n` +
      `导出时间：${new Date().toLocaleString("zh-CN")}\n\n${lines.join("\n")}\n`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `收藏清单-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [shownFavs]);
  if (favSpots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Heart className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">
          还没有收藏景点
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
          在「景点览胜」中点击爱心按钮收藏
        </p>
        <Button
          variant="outline"
          onClick={() => setActiveView("spots")}
          className="gap-2"
        >
          <MapPin className="w-4 h-4" />
          去挑景点
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
          已收藏{" "}
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {favSpots.length}
          </span>{" "}
          个景点
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => shownFavs.forEach((s) => addToTrip(s.id))}
        >
          <Route className="w-3.5 h-3.5" />
          {favCat === "全部" ? "全部加入行程" : "本类加入行程"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={exportList}
          title="下载 txt 清单：名称/等级/地址/开放时间/电话/导航链接"
        >
          <Download className="w-3.5 h-3.5" />
          导出清单
        </Button>
      </div>
      {/* 收藏夹分组 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setFavGroupFilter(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            favGroupFilter === null
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
          }`}
        >
          全部分组
        </button>
        <button
          onClick={() =>
            setFavGroupFilter(favGroupFilter === "__none" ? null : "__none")
          }
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            favGroupFilter === "__none"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
          }`}
        >
          未分组
        </button>
        {favGroups.map((g) => (
          <span
            key={g.id}
            className={`inline-flex items-center rounded-full border transition-colors ${
              favGroupFilter === g.id
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
            }`}
          >
            <button
              onClick={() =>
                setFavGroupFilter(favGroupFilter === g.id ? null : g.id)
              }
              className="px-2.5 py-1 text-xs font-medium"
            >
              {g.name}
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `删除分组「${g.name}」？其中的收藏会回到未分组。`,
                  )
                )
                  deleteFavGroup(g.id);
              }}
              title="删除分组（收藏保留）"
              className="pr-2 text-[10px] opacity-50 hover:text-rose-500"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            const name = window.prompt("新分组名称：");
            if (name && name.trim()) createFavGroup(name);
          }}
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
        >
          ＋ 新建分组
        </button>
      </div>
      {/* 等级快筛 */}
      <div className="flex items-center gap-1.5 mb-3">
        {(["5A", "4A"] as const).map((lv) => (
          <button
            key={lv}
            onClick={() => setFavLevel(favLevel === lv ? null : lv)}
            className={`px-2 py-1 rounded-lg text-xs font-black border transition-colors ${
              favLevel === lv
                ? "bg-amber-400 text-white border-amber-400"
                : "bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            }`}
          >
            {lv}
          </button>
        ))}
      </div>
      {/* 搜索（名称+拼音）：收藏多了以后定位用 */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <Input
          placeholder="在收藏中搜索名称 / 拼音（如 gmgy）..."
          className="pl-10 pr-10 h-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-sm"
          value={favQuery}
          onChange={(e) => setFavQuery(e.target.value)}
        />
        {favQuery && (
          <button
            onClick={() => setFavQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {favCats.length > 2 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {favCats.map((cat) => (
            <button
              key={cat}
              onClick={() => setFavCat(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                favCat === cat
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              {cat}
              <span className="ml-1 text-[10px] opacity-60">
                {cat === "全部"
                  ? favSpots.length
                  : favSpots.filter((x) => x.category === cat).length}
              </span>
            </button>
          ))}
        </div>
      )}
      <SpotGrid
        spots={shownFavs}
        onSelect={setSelectedSpot}
        groups={favGroups}
        groupOf={favGroupOf}
        onAssignGroup={setFavGroup}
      />
    </div>
  );
}

/* ═══════ 我的信息视图 ═══════ */
function ProfileView() {
  const {
    spots,
    favorites,
    trip,
    tripDaySplit,
    customPrices,
    dissuasionRecords,
  } = useAppStore();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => {
    const s = new Set(spots.map((sp) => sp.category));
    return s.size;
  }, [spots]);
  const tripDays = trip.length > 0 ? tripDaySplit.length + 1 : 0;

  // 全量数据导出（收藏/行程/改价/翻车记录/备注），跨设备迁移用
  const exportData = () => {
    const state = useAppStore.getState();
    const payload = {
      exportedAt: new Date().toISOString(),
      favorites: state.favorites,
      trip: state.trip,
      tripDaySplit: state.tripDaySplit,
      customPrices: state.customPrices,
      spotNotes: state.spotNotes,
      dissuasionRecords: state.dissuasionRecords,
      favGroups: state.favGroups,
      favGroupOf: state.favGroupOf,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spot-visual-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 恢复备份：逐字段校验后合并（数组并集、对象覆盖、翻车记录按 id 去重）
  const restoreData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        const arr = (v: unknown) => (Array.isArray(v) ? v : []);
        const rec = (v: unknown) =>
          v && typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : {};
        const cur = useAppStore.getState();
        // 翻车记录按 id 去重（备份在前，本地新记录在后）
        const seenReviews = new Set(
          arr(d.dissuasionRecords).map((r: any) => r?.id),
        );
        const mergedReviews = [
          ...arr(d.dissuasionRecords),
          ...cur.dissuasionRecords.filter((r) => !seenReviews.has(r.id)),
        ];
        useAppStore.setState({
          favorites: Array.from(
            new Set([...arr(d.favorites), ...cur.favorites]),
          ).filter((id) => spots.some((s) => s.id === id)),
          trip: Array.from(new Set([...arr(d.trip), ...cur.trip])).filter(
            (id) => spots.some((s) => s.id === id),
          ),
          tripDaySplit: arr(d.tripDaySplit).length
            ? (arr(d.tripDaySplit) as typeof cur.tripDaySplit)
            : cur.tripDaySplit,
          customPrices: {
            ...rec(d.customPrices),
            ...cur.customPrices,
          } as typeof cur.customPrices,
          favGroups: Array.isArray(d.favGroups)
            ? (d.favGroups as typeof cur.favGroups)
            : cur.favGroups,
          favGroupOf: rec(d.favGroupOf) as typeof cur.favGroupOf,
          spotNotes: {
            ...rec(d.spotNotes),
            ...cur.spotNotes,
          } as typeof cur.spotNotes,
          dissuasionRecords: mergedReviews as typeof cur.dissuasionRecords,
        });
        const n = arr(d.favorites).length + arr(d.trip).length;
        window.alert(
          `恢复完成：收藏/行程共并入 ${n} 条，翻车记录合并后 ${mergedReviews.length} 条。`,
        );
      } catch {
        window.alert("恢复失败：文件不是有效的备份数据（应为导出的 JSON）。");
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = () => {
    if (
      !window.confirm(
        "将清空本应用的全部本地数据（收藏、行程、改价、翻车记录），且不可恢复。确定？",
      )
    )
      return;
    try {
      localStorage.removeItem("spot-app");
      localStorage.removeItem("trip-packlist-checked");
    } catch {}
    window.location.reload();
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
          游客
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          景点览胜 · 数据中心
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "总景点",
            value: spots.length,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          { label: "已收藏", value: favorites.length, color: "text-red-500" },
          {
            label: "分类数",
            value: cats,
            color: "text-amber-600 dark:text-amber-400",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 p-4 text-center"
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "行程站点",
            value: trip.length,
            color: "text-teal-600",
            sub: tripDays > 1 ? `${tripDays} 天` : undefined,
          },
          {
            label: "翻车记录",
            value: dissuasionRecords.length,
            color: "text-rose-500",
          },
          {
            label: "手动改价",
            value: Object.keys(customPrices).length,
            color: "text-sky-600",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 p-4 text-center"
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {stat.label}
              {stat.sub ? ` · ${stat.sub}` : ""}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          数据管理
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          数据全部保存在浏览器本地（localStorage）。换设备前先导出备份。
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex-1 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
          >
            导出全部数据 (JSON)
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            className="flex-1 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
          >
            恢复备份
          </button>
          <button
            onClick={clearAllData}
            className="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-500/10 transition-colors"
          >
            清空本地数据
          </button>
        </div>
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) restoreData(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700/80 dark:border-gray-700 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
          使用提示
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
          <p>• 点击「导入 JSON」可加载自定义景点数据</p>
          <p>• JSON 支持多种字段格式，自动识别分类</p>
          <p>• 收藏、行程、改价、翻车记录刷新不丢失</p>
          <p>• 景点网络需要数据包含 location 坐标字段</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════ 主页面 ═══════ */
export default function Home() {
  const { activeView, theme } = useAppStore();
  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    return () => document.body.classList.remove("dark");
  }, [theme]);

  // 切视图时回到主内容顶部：上一视图的深度滚动残留会让新视图像缺了一截
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [activeView]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  // 返回顶部：主内容是 overflow-y-auto 容器（不是 window），监听其滚动
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const h = () => setShowTop(el.scrollTop > 600);
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, []);

  return (
    <div className="min-h-[calc(100vh-52px)] flex flex-col bg-gray-50 dark:bg-gray-900/50 dark:bg-gray-950/50">
      <div className="flex flex-1 min-h-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <MobileHeader onMenuOpen={() => setMobileMenu(true)} />
        <MobileMenu open={mobileMenu} onClose={() => setMobileMenu(false)} />
        <main className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Desktop header bar */}
            <div className="hidden md:flex items-center justify-between h-14 px-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 dark:bg-gray-900/50 shrink-0">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                {NAV_ITEMS.find((n) => n.key === activeView)?.label}
              </h2>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                景点览胜 · 支持自定义 JSON 导入
              </div>
            </div>
            {/* Content area */}
            <div ref={mainScrollRef} className="flex-1 overflow-y-auto">
              <div
                className={`${activeView === "network" ? "" : "max-w-7xl mx-auto"} p-4 sm:p-6 lg:p-8`}
              >
                {activeView === "spots" && <SpotsView />}
                {activeView === "network" && (
                  <div className="h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]">
                    <NetworkView />
                  </div>
                )}
                {activeView === "favorites" && <FavoritesView />}
                {activeView === "trip" && <TripView />}
                {/* 修复：补全缺失的视图路由 */}
                {activeView === "personality" && <PersonalityView />}
                {activeView === "budget" && <BudgetView />}
                {activeView === "deterrent" && <DeterrentView />}
                {activeView === "fitness" && <FitnessView />}
                {activeView === "stamina-sandbox" && <StaminaSandboxView />}
                {activeView === "ptsi" && <PTSIView />}
                {activeView === "dissuasion" && <DissuasionView />}
                {activeView === "profile" && <ProfileView />}
              </div>
            </div>
          </div>
        </main>
      </div>
      {/* Footer */}
      <footer className="mt-auto border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            景点览胜 · 支持自定义 JSON 数据导入
          </p>
        </div>
      </footer>
      <SpotDetailDialog />
      <CompareBar />
      {showTop && (
        <button
          onClick={() =>
            mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
          title="返回顶部"
          className="fixed bottom-20 right-5 z-40 w-11 h-11 rounded-full bg-white dark:bg-gray-900/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
