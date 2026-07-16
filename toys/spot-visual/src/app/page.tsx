'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Upload, MapPin, Star, X, LayoutGrid, List,
  Heart, User, Share2, Menu, ChevronLeft, ChevronRight, Image as ImageIcon,
  TreePine, Landmark, Sparkles, Building2, Waves, Mountain, HomeIcon, Church, UtensilsCrossed, Bike,
  AlertTriangle, Activity, Sparkles as SparklesIcon, Calculator, // 修复：补充缺失的图标导入，移除未使用的 Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore, type ViewType } from '@/lib/store';
import { type Spot, getCategoryColor, CATEGORY_ICON_NAMES, CATEGORY_THEME, parseImportedSpots, sampleSpots, getCategoryImageUrl, cachePhotoForCategory } from '@/lib/spot-data'; // 保留：cachePhotoForCategory 缓存机制
import dynamic from 'next/dynamic';

const NetworkView = dynamic(() => import('@/components/network-view'), { ssr: false });
const DeterrentView = dynamic(() => import('@/components/deterrent-view'), { ssr: false });
const FitnessView = dynamic(() => import('@/components/fitness-view'), { ssr: false });
const PersonalityView = dynamic(() => import('@/components/personality-view'), { ssr: false });
const BudgetView = dynamic(() => import('@/components/budget-view'), { ssr: false });

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = { TreePine, Landmark, Sparkles, Building2, Waves, Mountain, HomeIcon, Church, UtensilsCrossed, Bike };
const getCategoryIcon = (cat: string) => {
  const name = CATEGORY_ICON_NAMES[cat];
  if (!name || !ICON_MAP[name]) return null;
  const Comp = ICON_MAP[name];
  return <Comp className="w-3.5 h-3.5" />;
};

console.log('新代码生效了')

/* ═══════ 图片组件（分类主题占位） ═══════ */
function SpotImage({ src, alt, className = '', category = '' }: { src: string; alt: string; className?: string; category?: string }) {
  const [err, setErr] = useState(false);
  const noImage = !src || err;
  if (noImage) {
    const theme = CATEGORY_THEME[category] || { from: '#F3F4F6', to: '#E5E7EB', icon: '📍' };
    return (
      <div className={`flex flex-col items-center justify-center gap-2 ${className}`}
        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
        <span className="text-3xl leading-none select-none">{theme.icon}</span>
        {category && <span className="text-[11px] font-medium text-gray-500 px-2 py-0.5 rounded-full bg-white/60 backdrop-blur-sm">{category}</span>}
      </div>
    );
  }
  return <img src={src} alt={alt} className={`object-cover ${className}`} onError={() => setErr(true)} loading="lazy" />;
}

/* ═══════ 侧边栏 ═══════ */
const NAV_ITEMS: { key: ViewType; label: string; icon: React.ReactNode }[] = [
  { key: 'spots', label: '景点览胜', icon: <MapPin className="w-4.5 h-4.5" /> },
  { key: 'network', label: '景点网络', icon: <Share2 className="w-4.5 h-4.5" /> },
  { key: 'favorites', label: '收藏景点', icon: <Heart className="w-4.5 h-4.5" /> },
  { key: 'personality', label: '旅人测试', icon: <SparklesIcon className="w-4.5 h-4.5" /> },
  { key: 'budget', label: '预算沙盘', icon: <Calculator className="w-4.5 h-4.5" /> },
  { key: 'deterrent', label: '劝退指南', icon: <AlertTriangle className="w-4.5 h-4.5" /> },
  { key: 'fitness', label: '体力账本', icon: <Activity className="w-4.5 h-4.5" /> },
  { key: 'profile', label: '我的信息', icon: <User className="w-4.5 h-4.5" /> },
];

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { activeView, setActiveView, spots, favorites } = useAppStore();
  return (
    <aside className={`hidden md:flex flex-col border-r border-gray-200/80 bg-white transition-all duration-300 ${collapsed ? 'w-16' : 'w-52'}`}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
          <MapPin className="w-4.5 h-4.5 text-white" />
        </div>
        {!collapsed && <span className="font-bold text-gray-900 text-sm truncate">景点览胜</span>}
      </div>
      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.key;
          const badge = item.key === 'favorites' && favorites.length > 0 ? favorites.length : item.key === 'spots' ? spots.length : 0;
          return (
            <button key={item.key} onClick={() => setActiveView(item.key)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
              <span className={active ? 'text-emerald-600' : 'text-gray-400'}>{item.icon}</span>
              {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
              {!collapsed && badge > 0 && <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-emerald-200/60 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>{badge}</span>}
            </button>
          );
        })}
      </nav>
      {/* Toggle */}
      <button onClick={onToggle} className="hidden md:flex items-center justify-center h-10 border-t border-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}

/* ═══════ 移动端顶栏 ═══════ */
function MobileHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { activeView, spots, favorites, setActiveView } = useAppStore();
  const currentNav = NAV_ITEMS.find((n) => n.key === activeView);
  return (
    <header className="md:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
      <div className="flex items-center justify-between h-14 px-4">
        <button onClick={onMenuOpen} className="p-1 text-gray-500"><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{currentNav?.icon}</span>
          <span className="font-semibold text-gray-900 text-sm">{currentNav?.label}</span>
        </div>
        <div className="w-7" />
      </div>
      {/* Mobile nav tabs（只显示前4个，其余在汉堡菜单中） */}
      <div className="flex border-t border-gray-100 overflow-x-auto scrollbar-hide">
        {NAV_ITEMS.slice(0, 4).map((item) => {
          const active = activeView === item.key;
          return (
            <button key={item.key} onClick={() => setActiveView(item.key)}
              className={`flex-1 min-w-0 py-2 text-[11px] font-medium text-center transition-colors shrink-0 ${active ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-gray-400'}`}>
              <span className="block truncate px-0.5">{item.label}</span>
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
      <motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} className="absolute left-0 top-0 bottom-0 w-60 bg-white shadow-xl p-4 pt-6">
        <div className="flex items-center gap-2.5 mb-6 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <MapPin className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">景点览胜</span>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.key;
            return (
              <button key={item.key} onClick={() => { setActiveView(item.key); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                <span className={active ? 'text-emerald-600' : 'text-gray-400'}>{item.icon}</span>
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
function SpotGrid({ spots, onSelect }: { spots: Spot[]; onSelect: (s: Spot) => void }) {
  const { favorites, toggleFavorite } = useAppStore();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      <AnimatePresence mode="popLayout">
        {spots.map((spot) => {
          const isFav = favorites.includes(spot.id);
          return (
            <motion.div key={spot.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}>
              <div className="relative bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-300 group">
                <button onClick={() => onSelect(spot)} className="w-full text-left">
                  <div className="relative h-44 overflow-hidden">
                    <SpotImage src={spot.image} alt={spot.name} category={spot.category} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <Badge variant="outline" className={`absolute top-3 left-3 ${getCategoryColor(spot.category)}`}>
                      {getCategoryIcon(spot.category)}<span className="ml-1">{spot.category}</span>
                    </Badge>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-emerald-700 transition-colors truncate">{spot.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-2"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{spot.address}</span></div>
                    <div className="flex flex-wrap gap-1">
                      {spot.projects.slice(0, 3).map((p) => <span key={p} className="px-2 py-0.5 bg-gray-50 rounded text-[11px] text-gray-500 border border-gray-100">{p}</span>)}
                      {spot.projects.length > 3 && <span className="px-2 py-0.5 text-[11px] text-gray-400">+{spot.projects.length - 3}</span>}
                    </div>
                  </div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(spot.id); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm">
                  <Heart className={`w-4 h-4 transition-colors ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
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
function SpotList({ spots, onSelect }: { spots: Spot[]; onSelect: (s: Spot) => void }) {
  const { favorites, toggleFavorite } = useAppStore();
  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {spots.map((spot) => {
          const isFav = favorites.includes(spot.id);
          return (
            <motion.div key={spot.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
              <div className="relative bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-300 group flex">
                <button onClick={() => onSelect(spot)} className="flex flex-1 min-w-0 text-left">
                  <div className="w-40 sm:w-48 shrink-0 overflow-hidden"><SpotImage src={spot.image} alt={spot.name} category={spot.category} className="w-full h-full min-h-[120px] group-hover:scale-105 transition-transform duration-500" /></div>
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">{spot.name}</h3>
                      <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${getCategoryColor(spot.category)}`}>{spot.category}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-2"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{spot.address}</span></div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">{spot.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {spot.projects.slice(0, 4).map((p) => <span key={p} className="px-2 py-0.5 bg-gray-50 rounded text-[11px] text-gray-500 border border-gray-100">{p}</span>)}
                      {spot.projects.length > 4 && <span className="text-[11px] text-gray-400">+{spot.projects.length - 4}</span>}
                    </div>
                  </div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(spot.id); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm">
                  <Heart className={`w-4 h-4 transition-colors ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ═══════ 详情弹窗（无重叠关闭按钮 + 多图） ═══════ */
function SpotDetailDialog() {
  const { selectedSpot, setSelectedSpot, favorites, toggleFavorite } = useAppStore();
  const [photoIdx, setPhotoIdx] = useState(0);
  const spot = selectedSpot;
  const allPhotos = spot ? [spot.image, ...(spot.photos || [])] : [];

  // Reset photo index when spot changes
  const [prevId, setPrevId] = useState<string | null>(null);
  if (spot && spot.id !== prevId) { setPhotoIdx(0); setPrevId(spot.id); }

  if (!spot) return null;
  const isFav = favorites.includes(spot.id);

  return (
    <Dialog open={!!spot} onOpenChange={(open) => !open && setSelectedSpot(null)}>
      <DialogContent showCloseButton={false} className="max-w-2xl w-[95vw] max-h-[90vh] p-0 overflow-hidden gap-0">
        {/* Photo gallery */}
        <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-gray-100">
          <SpotImage src={allPhotos[photoIdx] || spot.image} alt={spot.name} category={spot.category} className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Close button (only one) */}
          <button onClick={() => setSelectedSpot(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10">
            <X className="w-4 h-4 text-white" />
          </button>
          {/* Favorite button */}
          <button onClick={() => toggleFavorite(spot.id)} className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-10">
            <Heart className={`w-4 h-4 transition-colors ${isFav ? 'fill-red-400 text-red-400' : 'text-white'}`} />
          </button>
          {/* Photo nav */}
          {allPhotos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
              <button onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))} className="w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center"><ChevronLeft className="w-3 h-3 text-white" /></button>
              <span className="text-white text-[11px] bg-black/30 rounded-full px-2 py-0.5">{photoIdx + 1} / {allPhotos.length}</span>
              <button onClick={() => setPhotoIdx((i) => Math.min(allPhotos.length - 1, i + 1))} className="w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center"><ChevronRight className="w-3 h-3 text-white" /></button>
            </div>
          )}
          {/* Bottom info */}
          <div className="absolute bottom-10 left-5 right-5 z-10">
            <Badge variant="outline" className={`mb-2 ${getCategoryColor(spot.category)}`}>{getCategoryIcon(spot.category)}<span className="ml-1">{spot.category}</span></Badge>
            <DialogHeader><DialogTitle className="text-2xl font-bold text-white drop-shadow-md">{spot.name}</DialogTitle></DialogHeader>
          </div>
        </div>
        {/* Detail content */}
        <ScrollArea className="max-h-[50vh]">
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /><span className="text-sm text-gray-600">{spot.address}</span></div>
            {/* Photo thumbnails */}
            {allPhotos.length > 1 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />图片 ({allPhotos.length})</h4>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allPhotos.map((p, i) => (
                    <button key={i} onClick={() => setPhotoIdx(i)} className={`shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition-colors ${i === photoIdx ? 'border-emerald-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                      <SpotImage src={p} alt={`${spot.name} ${i + 1}`} category={spot.category} className="w-full h-full" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div><h4 className="text-sm font-semibold text-gray-900 mb-2">景点介绍</h4><p className="text-sm text-gray-600 leading-relaxed">{spot.description}</p></div>
            <Separator />
            {spot.facilities.length > 0 && (<div><h4 className="text-sm font-semibold text-gray-900 mb-2.5">配套设施</h4><div className="flex flex-wrap gap-2">{spot.facilities.map((f) => <span key={f} className="inline-flex items-center px-2.5 py-1 bg-gray-100 rounded-md text-xs text-gray-600">{f}</span>)}</div></div>)}
            {spot.projects.length > 0 && (<div><h4 className="text-sm font-semibold text-gray-900 mb-2.5">推荐项目</h4><div className="space-y-2">{spot.projects.map((p) => (<div key={p} className="flex items-center gap-2 text-sm text-gray-600"><Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />{p}</div>))}</div></div>)}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════ 景点览胜视图 ═══════ */
function SpotsView() {
  const { spots, searchQuery, setSearchQuery, activeCategory, setActiveCategory, viewMode, setViewMode, setSelectedSpot, favorites, toggleFavorite, setSpots } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const allCategories = useMemo(() => {
    const cats = new Set(spots.map((s) => s.category));
    return ['全部', ...Array.from(cats)];
  }, [spots]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { '全部': spots.length };
    spots.forEach((s) => { c[s.category] = (c[s.category] || 0) + 1; });
    return c;
  }, [spots]);

  const filteredSpots = useMemo(() => {
    return spots.filter((s) => {
      const mc = activeCategory === '全部' || s.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const mq = !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.facilities.some((f) => f.toLowerCase().includes(q)) || s.projects.some((p) => p.toLowerCase().includes(q));
      return mc && mq;
    });
  }, [spots, activeCategory, searchQuery]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) { alert('请选择 JSON 文件'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const parsed = parseImportedSpots(raw);
        if (parsed.length === 0) { alert('未在文件中找到有效的景点数据'); return; }

        // ═══ 名称去重：跳过与已有景点名称完全相同的条目 ═══
        const existingNames = new Set(useAppStore.getState().spots.map(s => s.name.trim()));
        const duplicates: string[] = [];
        const unique = parsed.filter(s => {
          if (existingNames.has(s.name.trim())) {
            duplicates.push(s.name);
            return false;
          }
          existingNames.add(s.name.trim());
          return true;
        });

        if (unique.length === 0) {
          alert(`全部 ${duplicates.length} 个景点已存在，未导入任何新景点：\n${duplicates.join('、')}`);
          return;
        }

        // 先追加到 store（无图景点先显示渐变占位）
        useAppStore.getState().appendSpots(unique);
        setImporting(true);

        // 找出需要拉取图片的景点（image 为空）
        const needImages = unique.map((s, i) => ({ spot: s, idx: i })).filter(x => !x.spot.image);

        if (needImages.length > 0) {
          // 按分类分组，批量请求 API
          const byCategory = new Map<string, typeof needImages>();
          needImages.forEach(item => {
            const cat = item.spot.category || '其他';
            const arr = byCategory.get(cat) || [];
            arr.push(item);
            byCategory.set(cat, arr);
          });

          // 对每个分类批量请求图片
          const updates: { id: string; image: string }[] = [];
          let noApiKeys = false;
          await Promise.allSettled(
            Array.from(byCategory.entries()).map(async ([cat, items]) => {
              try {
                const res = await fetch(`/api/search-photo?q=${encodeURIComponent(cat)}&n=${items.length}`);
                if (!res.ok) throw new Error(`API ${res.status}`);
                const data = await res.json();

                // 检测 API Key 未配置
                if (data.error === 'NO_API_KEYS') {
                  noApiKeys = true;
                  items.forEach(item => {
                    const fallback = getCategoryImageUrl(item.spot.category);
                    if (fallback) updates.push({ id: item.spot.id, image: fallback });
                  });
                  return;
                }

                const results = data.results || [];
                items.forEach((item, i) => {
                  if (results[i] && results[i].url) {
                    const url = results[i].url;
                    updates.push({ id: item.spot.id, image: url });
                    // 保留：自学习缓存机制，把 API 拉到的真实 URL 写入本地缓存，下次降级可优先复用
                    cachePhotoForCategory(cat, url);
                  } else {
                    const fallback = getCategoryImageUrl(cat);
                    if (fallback) updates.push({ id: item.spot.id, image: fallback });
                  }
                });
              } catch {
                items.forEach(item => {
                  const fallback = getCategoryImageUrl(item.spot.category);
                  if (fallback) updates.push({ id: item.spot.id, image: fallback });
                });
              }
            })
          );

          if (noApiKeys) {
            console.warn('[景点览胜] 图片 API 未配置密钥，已降级使用本地图片池');
          }

          // 保留：精准更新 store 中对应景点的图片，避免全量替换和强制刷新页面
          if (updates.length > 0) {
            useAppStore.getState().updateSpotImages(updates);
          }
        }

        setImporting(false);

        // ═══ 导入完成提示 ═══
        let msg = `成功导入 ${unique.length} 个景点，当前共 ${useAppStore.getState().spots.length} 个`;
        if (duplicates.length > 0) {
          msg += `\n\n以下 ${duplicates.length} 个景点因名称重复已跳过：\n${duplicates.join('、')}`;
        }
        alert(msg);
      } catch { alert('JSON 解析失败，请检查文件格式'); setImporting(false); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  return (
    <div className="space-y-5">
      {/* Search + Import */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="搜索景点名称、地址、设施、项目..." className="pl-10 pr-10 h-11 bg-white border-gray-200 text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
      </div>
      {/* Category filters */}
      <div className="flex items-center justify-between gap-4">
        <ScrollArea className="flex-1 max-w-full"><div className="flex items-center gap-2 pb-1">
          {allCategories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border ${activeCategory === cat ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
              {cat !== '全部' && getCategoryIcon(cat)}{cat}
              <span className={`ml-0.5 text-[10px] ${activeCategory === cat ? 'text-white/70' : 'text-gray-400'}`}>{categoryCounts[cat] || 0}</span>
            </button>
          ))}
        </div></ScrollArea>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            {importing ? <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {importing ? '拉取图片中...' : '导入'}
          </Button>
          {spots.length > 0 && <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-gray-500" onClick={useAppStore.getState().resetSpots}>恢复示例</Button>}
          {spots.length > 0 && <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-red-400 hover:text-red-600" onClick={useAppStore.getState().clearAllSpots}>清空全部</Button>}
          <div className="hidden sm:flex items-center border border-gray-200 rounded-lg p-0.5 bg-white">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400'}`}><List className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
      {/* Count */}
      <p className="text-sm text-gray-500">共 <span className="font-semibold text-gray-900">{filteredSpots.length}</span> 个景点{activeCategory !== '全部' && <span> · {activeCategory}</span>}{searchQuery && <span> · &ldquo;{searchQuery}&rdquo;</span>}</p>
      {/* Content */}
      {filteredSpots.length === 0
        ? <div className="flex flex-col items-center justify-center py-24 text-center">
            <MapPin className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">没有找到匹配的景点</p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2"><Upload className="w-4 h-4" />导入 JSON</Button>
          </div>
        : viewMode === 'grid'
          ? <SpotGrid spots={filteredSpots} onSelect={setSelectedSpot} />
          : <SpotList spots={filteredSpots} onSelect={setSelectedSpot} />
      }
    </div>
  );
}

/* ═══════ 收藏景点视图 ═══════ */
function FavoritesView() {
  const { spots, favorites, setSelectedSpot, toggleFavorite } = useAppStore();
  const favSpots = useMemo(() => spots.filter((s) => favorites.includes(s.id)), [spots, favorites]);
  if (favSpots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Heart className="w-12 h-12 text-gray-300 mb-4" />
        <p className="text-gray-500 font-medium mb-1">还没有收藏景点</p>
        <p className="text-sm text-gray-400">在「景点览胜」中点击爱心按钮收藏</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-gray-500 mb-5">已收藏 <span className="font-semibold text-gray-900">{favSpots.length}</span> 个景点</p>
      <SpotGrid spots={favSpots} onSelect={setSelectedSpot} />
    </div>
  );
}

/* ═══════ 我的信息视图 ═══════ */
function ProfileView() {
  const { spots, favorites } = useAppStore();
  const cats = useMemo(() => { const s = new Set(spots.map((sp) => sp.category)); return s.size; }, [spots]);
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-gray-200/80 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4"><User className="w-8 h-8 text-white" /></div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">游客</h2>
        <p className="text-sm text-gray-400">景点览胜 · 使用统计</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '总景点', value: spots.length, color: 'text-emerald-600' },
          { label: '已收藏', value: favorites.length, color: 'text-red-500' },
          { label: '分类数', value: cats, color: 'text-amber-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200/80 p-4 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200/80 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">使用提示</h3>
        <div className="text-xs text-gray-500 space-y-2">
          <p>• 点击「导入 JSON」可加载自定义景点数据</p>
          <p>• JSON 支持多种字段格式，自动识别分类</p>
          <p>• 收藏数据保存在本地，刷新不丢失</p>
          <p>• 景点网络需要数据包含 location 坐标字段</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════ 主页面 ═══════ */
export default function Home() {
  const { activeView } = useAppStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <div className="flex flex-1 min-h-0">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <MobileHeader onMenuOpen={() => setMobileMenu(true)} />
        <MobileMenu open={mobileMenu} onClose={() => setMobileMenu(false)} />
        <main className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Desktop header bar */}
            <div className="hidden md:flex items-center justify-between h-14 px-6 border-b border-gray-100 bg-white/50 shrink-0">
              <h2 className="font-semibold text-gray-900 text-sm">{NAV_ITEMS.find((n) => n.key === activeView)?.label}</h2>
              <div className="text-xs text-gray-400">景点览胜 · 支持自定义 JSON 导入</div>
            </div>
            {/* Content area */}
            <div className="flex-1 overflow-y-auto">
              <div className={`${activeView === 'network' ? '' : 'max-w-7xl mx-auto'} p-4 sm:p-6 lg:p-8`}>
                {activeView === 'spots' && <SpotsView />}
                {activeView === 'network' && <div className="h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]"><NetworkView /></div>}
                {activeView === 'favorites' && <FavoritesView />}
                {/* 修复：补全缺失的视图路由 */}
                {activeView === 'personality' && <PersonalityView />}
                {activeView === 'budget' && <BudgetView />}
                {activeView === 'deterrent' && <DeterrentView />}
                {activeView === 'fitness' && <FitnessView />}
                {activeView === 'profile' && <ProfileView />}
              </div>
            </div>
          </div>
        </main>
      </div>
      {/* Footer */}
      <footer className="mt-auto border-t border-gray-100 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-center">
          <p className="text-xs text-gray-400">景点览胜 · 支持自定义 JSON 数据导入</p>
        </div>
      </footer>
      <SpotDetailDialog />
    </div>
  );
}
