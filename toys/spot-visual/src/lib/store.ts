import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Spot, sampleSpots, type DissuasionRecord } from './spot-data';

export type ViewType = 'spots' | 'network' | 'favorites' | 'personality' | 'budget' | 'deterrent' | 'fitness' | 'profile'
  | 'stamina-sandbox' | 'ptsi' | 'dissuasion';  // 新增三个视图

interface AppStore {
  spots: Spot[];
  favorites: string[];
  activeView: ViewType;
  selectedSpot: Spot | null;
  searchQuery: string;
  activeCategory: string;
  viewMode: 'grid' | 'list';

  setSpots: (spots: Spot[]) => void;
  appendSpots: (spots: Spot[]) => void;
  updateSpotImages: (updates: { id: string; image: string }[]) => void;
  toggleFavorite: (id: string) => void;
  setActiveView: (view: ViewType) => void;
  setSelectedSpot: (spot: Spot | null) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (c: string) => void;
  setViewMode: (m: 'grid' | 'list') => void;
  resetSpots: () => void;
  clearAllSpots: () => void;

  // ═══ 体力沙盘状态（不持久化，仅会话内有效） ═══
  staminaBudget: number;                // 用户体力预算上限
  activeSpotOrder: string[];            // 沙盘中拖拽排序后的景点 ID 序列
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
      activeView: 'spots' as ViewType,
      selectedSpot: null,
      searchQuery: '',
      activeCategory: '全部',
      viewMode: 'grid' as 'grid' | 'list',

      setSpots: (spots) => set({ spots }),
      appendSpots: (newSpots) => set((s) => ({ spots: [...s.spots, ...newSpots] })),
      // 按 id 精准更新图片，避免重写整个 spots 数组触发全量重渲染
      updateSpotImages: (updates) => {
        if (updates.length === 0) return;
        set((s) => {
          const map = new Map(updates.map((u) => [u.id, u.image]));
          return { spots: s.spots.map((sp) => (map.has(sp.id) ? { ...sp, image: map.get(sp.id)! } : sp)) };
        });
      },
      toggleFavorite: (id) => set((s) => ({
        favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
      })),
      setActiveView: (view) => set({ activeView: view }),
      setSelectedSpot: (spot) => set({ selectedSpot: spot }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveCategory: (c) => set({ activeCategory: c }),
      setViewMode: (m) => set({ viewMode: m }),
      resetSpots: () => set({ spots: sampleSpots, activeCategory: '全部', searchQuery: '' }),
      clearAllSpots: () => set({ spots: [], activeCategory: '全部', searchQuery: '' }),

      // ═══ 体力沙盘状态 ═══
      staminaBudget: 100,
      activeSpotOrder: [],
      setStaminaBudget: (v) => set({ staminaBudget: v }),
      setActiveSpotOrder: (ids) => set({ activeSpotOrder: ids }),

      // ═══ 劝退日记 ═══
      dissuasionRecords: [],
      addDissuasionRecord: (r) => set((s) => ({
        dissuasionRecords: [...s.dissuasionRecords, r],
      })),
      removeDissuasionRecord: (id) => set((s) => ({
        dissuasionRecords: s.dissuasionRecords.filter(r => r.id !== id),
      })),
      voteDissuasionRecord: (id) => set((s) => ({
        dissuasionRecords: s.dissuasionRecords.map(r =>
          r.id === id ? { ...r, voteCount: r.voteCount + 1 } : r
        ),
      })),
    }),
    { name: 'spot-app', partialize: (s) => ({ favorites: s.favorites, spots: s.spots, dissuasionRecords: s.dissuasionRecords }) },
  ),
);
