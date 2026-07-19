'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, TrendingUp, Crown, Wallet, Sparkles, MapPin, ChevronDown, Zap, Feather } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getStaminaCost, getProjectStaminaFactor } from '@/lib/spot-data';

/* ═══ 项目模拟价格（元/次） ═══ */
const PROJECT_PRICES: Record<string, number> = {
  '天门山玻璃栈道': 32, '百龙天梯': 72, '金鞭溪徒步': 0, '袁家界观景台': 15, '天子山云海': 0,
  '太和殿参观': 60, '珍宝馆': 10, '钟表馆': 10, '御花园漫步': 0, '数字故宫体验': 40,
  '创极速光轮': 80, '翱翔·飞越地平线': 90, '加勒比海盗': 60, '七个小矮人矿山车': 70, '奇幻童话城堡': 50,
  '488米户外观景台': 150, '极速云霄跳楼机': 60, '摩天轮': 80, '珠江夜游': 120,
  '沙滩漫步': 0, '潜水体验': 280, '帆船出海': 200, '摩托艇': 180, '海边瑜伽': 0,
  '迎客松打卡': 0, '光明顶日出': 0, '西海大峡谷': 25, '飞来石': 0, '云谷寺徒步': 0,
  '四方街夜游': 0, '木府参观': 45, '纳西古乐欣赏': 160, '黑龙潭公园': 0, '束河古镇': 0,
  '少林功夫表演': 80, '塔林参观': 0, '达摩洞朝拜': 0, '武术体验课': 120, '嵩山游览': 0,
  '五花海': 0, '珍珠滩瀑布': 0, '诺日朗瀑布': 0, '长海': 0, '镜海倒影': 0,
  '北八楼登顶': 0, '南长城徒步': 0, '长城夜景': 40, '好汉坡打卡': 0, '熊乐园': 50,
  '鲸鲨馆': 180, '白鲸剧场': 120, '海豚剧场': 100, '鹦鹉过山车': 90, '超级激流': 70,
  '日光岩登顶': 0, '菽庄花园': 30, '皓月园': 0, '风琴博物馆': 15, '环岛漫步': 0,
};

/* ═══ 关键词 → 价格推断 ═══ */
const KEYWORD_PRICES: Record<string, number> = {
  '玻璃': 40, '索道': 80, '缆车': 80, '电瓶车': 30, '游船': 120, '快艇': 180,
  '潜水': 280, '漂流': 150, '骑马': 100, '滑翔': 300, '蹦极': 200, '跳伞': 400,
  '温泉': 100, '表演': 100, '演出': 120, '博物馆': 30, '展览': 20, '体验': 60,
  '夜游': 80, '观光车': 25, '小火车': 30, '秋千': 10, '攀岩': 80, '射箭': 50,
  '划船': 60, '自行车': 40, '帐篷': 80, '露营': 100,
};

function guessPrice(project: string): number {
  if (PROJECT_PRICES[project] !== undefined) return PROJECT_PRICES[project];
  for (const [kw, price] of Object.entries(KEYWORD_PRICES)) {
    if (project.includes(kw)) return price;
  }
  return 30; // 默认
}

/* ═══ 三档预算倍率 ═══ */
const BUDGET_TIERS = [
  { id: 'budget', label: '穷游', icon: '🎒', color: '#10B981', bg: 'bg-emerald-50', multiplier: 0.6 },
  { id: 'comfort', label: '舒适', icon: '🏠', color: '#3B82F6', bg: 'bg-blue-50', multiplier: 1.0 },
  { id: 'luxury', label: '土豪', icon: '👑', color: '#F59E0B', bg: 'bg-amber-50', multiplier: 2.5 },
];

/* ═══════════════════════════════════════════════════
   单个景点预算卡片
   ═══════════════════════════════════════════════════ */
function SpotBudgetCard({ name, category, projects, onTotalChange, index }: {
  name: string; category: string; projects: string[]; onTotalChange: (delta: number) => void; index: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const staminaCost = getStaminaCost({ id: '', name, image: '', address: '', facilities: [], projects, category, description: '' });

  const items = projects.map((p, i) => ({
    name: p,
    price: guessPrice(p),
    index: i,
  }));

  const subtotal = items.filter(it => selected.has(it.index)).reduce((sum, it) => sum + it.price, 0);

  const toggleItem = (idx: number) => {
    const item = items.find(it => it.index === idx)!;
    const wasSelected = selected.has(idx);
    setSelected(prev => {
      const next = new Set(prev);
      if (wasSelected) next.delete(idx);
      else next.add(idx);
      return next;
    });
    onTotalChange(wasSelected ? -item.price : item.price);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* 头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 truncate">{name}</h4>
          <p className="text-xs text-gray-400">{category} · {projects.length} 个项目</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* ═══ 体力维度 ═══ */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">{staminaCost}</span>
          </div>
          <div className="text-right shrink-0">
          <motion.div
            key={subtotal}
            initial={{ scale: 1.2, color: '#EF4444' }}
            animate={{ scale: 1, color: subtotal > 0 ? '#EF4444' : '#9CA3AF' }}
            className="text-lg font-black"
          >
            {subtotal > 0 ? `¥${subtotal}` : '-'}
          </motion.div>
        </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </motion.div>
      </button>

      {/* 展开的项目列表 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {items.map(item => {
                const isSelected = selected.has(item.index);
                const isFree = item.price === 0;
                return (
                  <motion.button
                    key={item.index}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleItem(item.index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {/* 选择框 */}
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>

                    {/* 项目名 */}
                    <span className={`flex-1 text-sm ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                      {item.name}
                    </span>

                    {/* 价格 */}
                    <span className={`text-sm font-bold shrink-0 ${isFree ? 'text-green-500' : isSelected ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {isFree ? '免费' : `¥${item.price}`}
                    </span>
                  </motion.button>
                );
              })}

              {/* 快捷操作 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    const oldTotal = items.filter(it => selected.has(it.index)).reduce((s, it) => s + it.price, 0);
                    const newSet = new Set<number>();
                    let newTotal = 0;
                    items.forEach(it => { if (it.price > 0) { newSet.add(it.index); newTotal += it.price; } });
                    setSelected(newSet);
                    onTotalChange(newTotal - oldTotal);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  全选付费
                </button>
                <button
                  onClick={() => {
                    const oldTotal = items.filter(it => selected.has(it.index)).reduce((s, it) => s + it.price, 0);
                    setSelected(new Set());
                    onTotalChange(-oldTotal);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  全部取消
                </button>
                {/* ═══ D1.3 省力快捷操作：自动剔除 factor>1.0 的高体力项目 ═══ */}
                <button
                  onClick={() => {
                    const oldTotal = items.filter(it => selected.has(it.index)).reduce((s, it) => s + it.price, 0);
                    const newSet = new Set<number>();
                    let newTotal = 0;
                    items.forEach(it => {
                      const factor = getProjectStaminaFactor(it.name);
                      // factor ≤ 1.0 的项目默认可选（含漫步、参观、观景等省力项）
                      // factor ≤ 0.7 的缆车/索道类即使付费也保留（明显省力）
                      if (factor <= 0.7) {
                        newSet.add(it.index);
                        newTotal += it.price;
                      } else if (factor <= 1.0 && it.price === 0) {
                        // 免费且非高体力的省力项
                        newSet.add(it.index);
                      }
                    });
                    setSelected(newSet);
                    onTotalChange(newTotal - oldTotal);
                  }}
                  className="flex-1 py-2 text-xs font-bold text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors flex items-center justify-center gap-1"
                  title="保留低体力/省力项目，自动剔除徒步等高体力项"
                >
                  <Feather className="w-3 h-3" />
                  省力优先
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   预算对比条
   ═══════════════════════════════════════════════════ */
function BudgetBar({ total, tiers }: { total: number; tiers: typeof BUDGET_TIERS }) {
  const maxVal = Math.max(...tiers.map(t => Math.round(total * t.multiplier)), 1);

  return (
    <div className="space-y-3">
      {tiers.map(tier => {
        const amount = Math.round(total * tier.multiplier);
        const pct = (amount / maxVal) * 100;
        return (
          <div key={tier.id} className="flex items-center gap-3">
            <span className="text-lg shrink-0">{tier.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">{tier.label}</span>
                <motion.span
                  key={amount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-sm font-black"
                  style={{ color: tier.color }}
                >
                  ¥{amount.toLocaleString()}
                </motion.span>
              </div>
              <div className={`h-4 ${tier.bg} rounded-full overflow-hidden`}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   预算沙盘主页面
   ═══════════════════════════════════════════════════ */
export default function BudgetView() {
  const { spots } = useAppStore();
  const [total, setTotal] = useState(0);

  // 只显示有 projects 的景点
  const spotItems = useMemo(
    () => spots.filter(s => s.projects.length > 0),
    [spots]
  );

  // 总预算数据
  const maxPossible = useMemo(
    () => spotItems.reduce((sum, s) => sum + s.projects.reduce((ps, p) => ps + guessPrice(p), 0), 0),
    [spotItems]
  );

  const handleTotalChange = useCallback((delta: number) => {
    setTotal(prev => Math.max(0, prev + delta));
  }, []);

  // 价格分层统计
  const priceLayers = useMemo(() => {
    const free: string[] = [], cheap: string[] = [], mid: string[] = [], pricey: string[] = [];
    spotItems.forEach(s => {
      s.projects.forEach(p => {
        const price = guessPrice(p);
        if (price === 0) free.push(p);
        else if (price <= 50) cheap.push(p);
        else if (price <= 150) mid.push(p);
        else pricey.push(p);
      });
    });
    return [
      { label: '免费项目', count: free.length, color: '#10B981', emoji: '🆓' },
      { label: '平价 (≤50)', count: cheap.length, color: '#3B82F6', emoji: '💰' },
      { label: '中档 (50-150)', count: mid.length, color: '#F59E0B', emoji: '💎' },
      { label: '高端 (>150)', count: pricey.length, color: '#EF4444', emoji: '👑' },
    ];
  }, [spotItems]);

  if (spotItems.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6"
        >
          <Calculator className="w-10 h-10 text-amber-400" />
        </motion.div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">暂无可预算的景点</h3>
        <p className="text-sm text-gray-500">景点数据中需要有"推荐项目"才能模拟预算</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-8">
        {/* ═══ 标题 ═══ */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">预算沙盘</h2>
            <p className="text-xs text-gray-500">勾选项目，实时模拟旅行花费</p>
          </div>
        </div>

        {/* ═══ 金额汇总卡 ═══ */}
        <motion.div
          className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-2xl p-5 mb-5 text-white shadow-lg"
          layout
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white/80 text-xs font-medium mb-1">当前预算总计</div>
              <motion.div
                key={total}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-4xl font-black"
              >
                ¥{total.toLocaleString()}
              </motion.div>
              <div className="text-white/60 text-xs mt-1">已选 {spotItems.length} 个景点的部分项目</div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs mb-1">满选总价</div>
              <div className="text-xl font-bold">¥{maxPossible.toLocaleString()}</div>
              <div className="text-white/60 text-xs mt-1">
                省了 {Math.round((1 - total / (maxPossible || 1)) * 100)}%
              </div>
            </div>
          </div>
        </motion.div>

        {/* ═══ 三档预算对比 ═══ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">预算对比</span>
            <span className="text-[10px] text-gray-400 ml-auto">基于当前选择</span>
          </div>
          <BudgetBar total={total} tiers={BUDGET_TIERS} />
        </div>

        {/* ═══ 价格分层 ═══ */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {priceLayers.map(layer => (
            <div key={layer.label} className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
              <div className="text-lg">{layer.emoji}</div>
              <div className="text-base font-black" style={{ color: layer.color }}>{layer.count}</div>
              <div className="text-[9px] text-gray-400 leading-tight">{layer.label}</div>
            </div>
          ))}
        </div>

        {/* ═══ 景点项目列表 ═══ */}
        <div className="flex items-center gap-1.5 mb-3">
          <Wallet className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">景点项目</span>
          <span className="text-[10px] text-gray-400 ml-auto">点击展开勾选</span>
        </div>
        <div className="space-y-3">
          {spotItems.map((spot, i) => (
            <SpotBudgetCard
              key={spot.id}
              name={spot.name}
              category={spot.category}
              projects={spot.projects}
              onTotalChange={handleTotalChange}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}