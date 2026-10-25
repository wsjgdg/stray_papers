import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Spot,
  sampleSpots,
  LIBRARY_SPOTS,
  type DissuasionRecord,
} from "./spot-data";

export type ViewType =
  | "spots"
  | "network"
  | "favorites"
  | "trip"
  | "personality"
  | "budget"
  | "deterrent"
  | "fitness"
  | "profile"
  | "stamina-sandbox"
  | "ptsi"
  | "dissuasion"; // 新增三个视图

// 劝退记录投票去重（仅会话内有效，不持久化）
const votedDissuasion = new Set<string>();

interface AppStore {
  spots: Spot[];
  favorites: string[];
  activeView: ViewType;
  selectedSpot: Spot | null;
  searchQuery: string;
  activeCategory: string;
  viewMode: "grid" | "list";

  setSpots: (spots: Spot[]) => void;
  appendSpots: (spots: Spot[]) => void;
  updateSpotImages: (updates: { id: string; image: string }[]) => void;
  /** 按 id 批量更新图片来源标注（配合 updateSpotImages 使用） */
  updateSpotImageSources: (updates: { id: string; source?: string }[]) => void;
  toggleFavorite: (id: string) => void;
  setActiveView: (view: ViewType) => void;
  setSelectedSpot: (spot: Spot | null) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (c: string) => void;
  setViewMode: (m: "grid" | "list") => void;
  resetSpots: () => void;
  clearAllSpots: () => void;

  // ═══ 用户改价（预算沙盘，持久化；key = `${spotId}::${project}`） ═══
  customPrices: Record<string, number>;
  setCustomPrice: (key: string, price: number) => void;
  clearCustomPrices: () => void;

  // ═══ 行程单（有序景点 id 序列，持久化） ═══
  trip: string[];
  tripDaySplit: number[]; // 分天分段点（每段的结束索引，升序不含末段）
  addToTrip: (id: string) => void;
  removeFromTrip: (id: string) => void;
  moveTripSpot: (id: string, dir: -1 | 1) => void;
  clearTrip: () => void;
  splitTripDay: (index: number) => void;
  mergeTripDay: (splitIndex: number) => void;
  setTripDaySplit: (splits: number[]) => void;

  // ═══ 体力沙盘状态（不持久化，仅会话内有效） ═══
  staminaBudget: number; // 用户体力预算上限
  activeSpotOrder: string[]; // 沙盘中拖拽排序后的景点 ID 序列
  setStaminaBudget: (v: number) => void;
  setActiveSpotOrder: (ids: string[]) => void;

  // ═══ 劝退日记数据（持久化到 localStorage） ═══
  dissuasionRecords: DissuasionRecord[];
  addDissuasionRecord: (r: DissuasionRecord) => void;
  removeDissuasionRecord: (id: string) => void;
  voteDissuasionRecord: (id: string) => void;
  /** 本会话内是否已对该记录投过票（投票去重的只读查询） */
  hasVotedDissuasion: (id: string) => boolean;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      spots: LIBRARY_SPOTS,
      favorites: [],
      activeView: "spots" as ViewType,
      selectedSpot: null,
      searchQuery: "",
      activeCategory: "全部",
      viewMode: "grid" as "grid" | "list",

      setSpots: (spots) =>
        set((s) => ({
          spots,
          // 整体替换景点后，收藏里指向已不存在景点的 id 会变成幽灵数据
          // （角标数量与收藏页内容对不上），替换时同步清理。
          favorites: s.favorites.filter((id) =>
            spots.some((sp) => sp.id === id),
          ),
          customPrices: Object.fromEntries(
            Object.entries(s.customPrices).filter(([k]) =>
              spots.some((sp) => k.startsWith(`${sp.id}::`)),
            ),
          ),
          trip: s.trip.filter((id) => spots.some((sp) => sp.id === id)),
          // 换城属于大改，分天分组直接重置
          tripDaySplit: [],
        })),
      appendSpots: (newSpots) =>
        set((s) => ({ spots: [...s.spots, ...newSpots] })),
      // 按 id 精准更新图片，避免重写整个 spots 数组触发全量重渲染
      updateSpotImages: (updates) => {
        if (updates.length === 0) return;
        set((s) => {
          const map = new Map(updates.map((u) => [u.id, u.image]));
          return {
            spots: s.spots.map((sp) =>
              map.has(sp.id) ? { ...sp, image: map.get(sp.id)! } : sp,
            ),
          };
        });
      },
      updateSpotImageSources: (updates) => {
        if (updates.length === 0) return;
        set((s) => {
          const map = new Map(updates.map((u) => [u.id, u.source]));
          return {
            spots: s.spots.map((sp) =>
              map.has(sp.id) ? { ...sp, imageSource: map.get(sp.id) } : sp,
            ),
          };
        });
      },
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),
      setActiveView: (view) => set({ activeView: view }),
      setSelectedSpot: (spot) => set({ selectedSpot: spot }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveCategory: (c) => set({ activeCategory: c }),
      setViewMode: (m) => set({ viewMode: m }),
      // 恢复完整库（手工精选 + 城市包），保留仍指向库内条目的收藏/行程
      resetSpots: () =>
        set((s) => ({
          spots: LIBRARY_SPOTS,
          activeCategory: "全部",
          searchQuery: "",
          favorites: s.favorites.filter((id) =>
            LIBRARY_SPOTS.some((sp) => sp.id === id),
          ),
          trip: s.trip.filter((id) => LIBRARY_SPOTS.some((sp) => sp.id === id)),
        })),
      clearAllSpots: () =>
        set({
          spots: [],
          activeCategory: "全部",
          searchQuery: "",
          favorites: [],
          customPrices: {},
          trip: [],
        }),

      // ═══ 用户改价 ═══
      customPrices: {},
      setCustomPrice: (key, price) =>
        set((s) => ({ customPrices: { ...s.customPrices, [key]: price } })),
      clearCustomPrices: () => set({ customPrices: {} }),

      // ═══ 行程单 ═══
      trip: [],
      tripDaySplit: [],
      addToTrip: (id) =>
        set((s) => (s.trip.includes(id) ? s : { trip: [...s.trip, id] })),
      removeFromTrip: (id) =>
        set((s) => {
          const idx = s.trip.indexOf(id);
          if (idx === -1) return s;
          // 移除后索引前移，分段点同步收缩
          const tripDaySplit = s.tripDaySplit
            .map((p) => (p > idx ? p - 1 : p))
            .filter((p) => p !== idx && p > 0 && p < s.trip.length - 1);
          return { trip: s.trip.filter((t) => t !== id), tripDaySplit };
        }),
      moveTripSpot: (id, dir) =>
        set((s) => {
          const idx = s.trip.indexOf(id);
          const to = idx + dir;
          if (idx === -1 || to < 0 || to >= s.trip.length) return s;
          const trip = [...s.trip];
          [trip[idx], trip[to]] = [trip[to], trip[idx]];
          // 相邻换位跨越分段点时，分段点跟着换
          const tripDaySplit = s.tripDaySplit.map((p) =>
            p === idx ? to : p === to ? idx : p,
          );
          return { trip, tripDaySplit };
        }),
      clearTrip: () => set({ trip: [], tripDaySplit: [] }),
      splitTripDay: (index) =>
        set((s) => {
          // 在 index 之后分段；末尾分段无意义
          if (index < 0 || index >= s.trip.length - 1) return s;
          if (s.tripDaySplit.includes(index)) return s;
          return {
            tripDaySplit: [...s.tripDaySplit, index].sort((a, b) => a - b),
          };
        }),
      mergeTripDay: (splitIndex) =>
        set((s) => ({
          tripDaySplit: s.tripDaySplit.filter((p) => p !== splitIndex),
        })),
      setTripDaySplit: (splits) => set({ tripDaySplit: splits }),

      // ═══ 体力沙盘状态 ═══
      staminaBudget: 100,
      activeSpotOrder: [],
      setStaminaBudget: (v) => set({ staminaBudget: v }),
      setActiveSpotOrder: (ids) => set({ activeSpotOrder: ids }),

      // ═══ 劝退日记 ═══
      dissuasionRecords: [],
      addDissuasionRecord: (r) =>
        set((s) => ({
          dissuasionRecords: [...s.dissuasionRecords, r],
        })),
      removeDissuasionRecord: (id) =>
        set((s) => ({
          dissuasionRecords: s.dissuasionRecords.filter((r) => r.id !== id),
        })),
      hasVotedDissuasion: (id) => votedDissuasion.has(id),
      voteDissuasionRecord: (id) => {
        // 会话内去重：同一条记录重复点击不再累加，防止无限刷票
        if (votedDissuasion.has(id)) return;
        votedDissuasion.add(id);
        set((s) => ({
          dissuasionRecords: s.dissuasionRecords.map((r) =>
            r.id === id ? { ...r, voteCount: r.voteCount + 1 } : r,
          ),
        }));
      },
    }),
    {
      name: "spot-app",
      version: 2,
      // v1 → v2：spots 从「内置30条/替换结果」升级为统一库（手工精选 + 城市包）。
      // 用户自定义导入的条目（非旧内置 id）原样保留；指向已弃 id 的收藏/行程清理。
      migrate: (state, version) => {
        if (version < 2 && state && typeof state === "object") {
          const st = state as {
            spots?: Spot[];
            favorites?: string[];
            trip?: string[];
          };
          // 旧内置 id 用精确集合判断（用户 JSON 可能自带纯数字 id，不能按格式误杀）
          const legacyIds = new Set(sampleSpots.map((sp) => sp.id));
          const isLegacyBuiltin = (s: Spot) =>
            legacyIds.has(s.id) ||
            s.id.startsWith("poi-") ||
            s.id.startsWith("osm-");
          const custom = (st.spots ?? []).filter((s) => !isLegacyBuiltin(s));
          const valid = new Set([
            ...LIBRARY_SPOTS.map((s) => s.id),
            ...custom.map((s) => s.id),
          ]);
          st.spots = [...LIBRARY_SPOTS, ...custom];
          st.favorites = (st.favorites ?? []).filter((id) => valid.has(id));
          st.trip = (st.trip ?? []).filter((id) => valid.has(id));
        }
        return state as never;
      },
      partialize: (s) => ({
        favorites: s.favorites,
        spots: s.spots,
        dissuasionRecords: s.dissuasionRecords,
        customPrices: s.customPrices,
        trip: s.trip,
        // 记住上次浏览的视图，刷新后原地恢复（对齐 food 页行为）
        activeView: s.activeView,
      }),
    },
  ),
);
