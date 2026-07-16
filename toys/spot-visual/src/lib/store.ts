import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Spot, sampleSpots } from './spot-data';

export type ViewType = 'spots' | 'network' | 'favorites' | 'profile';

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
  toggleFavorite: (id: string) => void;
  setActiveView: (view: ViewType) => void;
  setSelectedSpot: (spot: Spot | null) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategory: (c: string) => void;
  setViewMode: (m: 'grid' | 'list') => void;
  resetSpots: () => void;
  clearAllSpots: () => void;
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

      setSpots: (spots) => set({ spots, activeCategory: '全部', searchQuery: '' }),
      appendSpots: (newSpots) => set((s) => ({
        spots: [...s.spots, ...newSpots],
        activeCategory: '全部',
        searchQuery: '',
      })),
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
    }),
    { name: 'spot-app', partialize: (s) => ({ favorites: s.favorites, spots: s.spots }) },
  ),
);