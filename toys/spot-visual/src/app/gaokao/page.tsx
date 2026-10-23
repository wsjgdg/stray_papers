'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Target, AlertTriangle, TrendingUp, ShieldCheck, Flame, MapPin } from 'lucide-react';
import { PROVINCES } from '@/lib/gaokao-data';
import { recommend, provinceCats, type RecommendItem } from '@/lib/gaokao';
import { cn } from '@/lib/utils';

function TierTags({ item }: { item: RecommendItem }) {
  return (
    <div className="flex gap-1 shrink-0">
      {item.is985 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">985</span>}
      {item.is211 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">211</span>}
      {item.isDFC && !item.is211 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">双一流</span>}
    </div>
  );
}

function SchoolRow({ item }: { item: RecommendItem }) {
  const { admission: a } = item;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2.5"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 text-sm truncate">{item.schoolName}</span>
          <TierTags item={item} />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
          <MapPin className="w-3 h-3" />{item.schoolProv}
          <span>· 线 {a.minScore}</span>
          <span>· 位次 {a.minRank.toLocaleString()}</span>
        </div>
      </div>
      <span className={cn(
        'text-xs font-semibold px-2 py-1 rounded-lg shrink-0',
        item.gap <= 0 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600',
      )}>
        {item.gap <= 0 ? `差 ${-item.gap} 分` : `超 ${item.gap} 分`}
      </span>
    </motion.div>
  );
}

export default function GaoKaoPage() {
  const [prov, setProv] = useState('河南');
  const [cat, setCat] = useState('物理类');
  const [score, setScore] = useState(600);
  const cats = provinceCats(prov);
  const result = useMemo(() => recommend(score, prov, cat), [score, prov, cat]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">志愿探索 · 冲稳保</h1>
        </div>
        <p className="text-sm text-gray-500">输入分数，估算位次并分层推荐院校（演示数据，正式填报以官方为准）。</p>
      </div>

      {/* 输入卡片 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm mb-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">招生省份</span>
            <select
              value={prov}
              onChange={(e) => { setProv(e.target.value); setCat(provinceCats(e.target.value)[0]); }}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              {PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">科类</span>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">高考分数（2024 示例）</span>
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
        <div className="mt-4 flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <Target className="w-5 h-5 text-indigo-500 shrink-0" />
          <div>
            <div className="text-xs text-indigo-500">你的预估位次（{prov}·{cat}）</div>
            <div className="text-2xl font-bold text-indigo-700">{result.userRank ? `#${result.userRank.toLocaleString()}` : '—'}</div>
          </div>
        </div>
      </div>

      {/* 三档推荐 */}
      <div className="space-y-5">
        {([
          { key: 'reach', title: '冲一冲', icon: Flame, color: 'text-orange-500', items: result.reach },
          { key: 'match', title: '稳一稳', icon: TrendingUp, color: 'text-emerald-500', items: result.match },
          { key: 'safe', title: '保一保', icon: ShieldCheck, color: 'text-blue-500', items: result.safe },
        ] as const).map((bucket) => (
          <section key={bucket.key}>
            <h2 className={cn('flex items-center gap-1.5 text-sm font-bold mb-2', bucket.color)}>
              <bucket.icon className="w-4 h-4" />{bucket.title}
              <span className="text-gray-400 font-normal">（{bucket.items.length}）</span>
            </h2>
            {bucket.items.length === 0 ? (
              <p className="text-xs text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl p-4 text-center">该档暂无匹配院校，可调整分数或省份</p>
            ) : (
              <div className="space-y-2">
                {bucket.items.map((it) => <SchoolRow key={it.admission.schoolCode} item={it} />)}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* 声明 */}
      <div className="mt-6 flex gap-2 items-start text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          本页数据为<strong className="text-gray-500">示例/估算</strong>，依据公开报道的 2024 年投档线区间近似推算，仅用于演示位次换算与冲稳保逻辑。正式填报请以省级教育考试院官方数据为准。完整真实数据（MIT 授权：GaokaoCompass / secnotes）可通过 <code className="px-1 bg-gray-100 rounded">loadFullDataset()</code> 无缝接入。
        </span>
      </div>
    </div>
  );
}
