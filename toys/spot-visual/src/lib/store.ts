import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Spot, sampleSpots, type DissuasionRecord } from "./spot-data";

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
  addToTrip: (id: string) => void;
  removeFromTrip: (id: string) => void;
  moveTripSpot: (id: string, dir: -1 | 1) => void;
  clearTrip: () => void;

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
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      spots: sampleSpots,
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
      resetSpots: () =>
        set((s) => ({
          spots: sampleSpots,
          activeCategory: "全部",
          searchQuery: "",
          favorites: s.favorites.filter((id) =>
            sampleSpots.some((sp) => sp.id === id),
          ),
          trip: s.trip.filter((id) => sampleSpots.some((sp) => sp.id === id)),
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
      addToTrip: (id) =>
        set((s) => (s.trip.includes(id) ? s : { trip: [...s.trip, id] })),
      removeFromTrip: (id) =>
        set((s) => ({ trip: s.trip.filter((t) => t !== id) })),
      moveTripSpot: (id, dir) =>
        set((s) => {
          const idx = s.trip.indexOf(id);
          const to = idx + dir;
          if (idx === -1 || to < 0 || to >= s.trip.length) return s;
          const trip = [...s.trip];
          [trip[idx], trip[to]] = [trip[to], trip[idx]];
          return { trip };
        }),
      clearTrip: () => set({ trip: [] }),

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
      partialize: (s) => ({
        favorites: s.favorites,
        spots: s.spots,
        dissuasionRecords: s.dissuasionRecords,
        customPrices: s.customPrices,
        trip: s.trip,
      }),
    },
  ),
);
