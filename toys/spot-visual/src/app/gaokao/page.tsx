'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Target, AlertTriangle, MapPin, School } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { PROVINCES, SCHOOLS, activeAdmissions, getSchool, rankForScore } from '@/lib/gaokao-data';
import { provinceCats } from '@/lib/gaokao';
import { PROVINCE_CENTERS } from '@/lib/china-geo';
import ChinaMap from '@/components/map/china-map';

type Tier = 'reach' | 'match' | 'safe' | 'none';

const TIER_COLOR: Record<Tier, string> = {
  reach: '#F59E0B', // 冲
  match: '#10B981', // 稳
  safe: '#3B82F6', // 保
  none: '#CBD5E1', // 范围外
};
const TIER_LABEL: Record<Tier, string> = { reach: '冲一冲', match: '稳一稳', safe: '保一保', none: '超出范围' };

function tierOf(gap: number): Tier {
  if (gap >= -18 && gap <= 0) return 'reach';
  if (gap > 0 && gap <= 22) return 'match';
  if (gap > 22 && gap <= 55) return 'safe';
  return 'none';
}

function jitter(code: string): [number, number] {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 100000;
  const dx = ((h % 100) / 100 - 0.5) * 1.1;
  const dy = ((((h / 100) | 0) % 100) / 100 - 0.5) * 1.1;
  return [dx, dy];
}

export default function GaoKaoPage() {
  const [prov, setProv] = useState('河南');
  const [cat, setCat] = useState('物理类');
  const [score, setScore] = useState(600);
  const [selectedCode, setSelectedCode] = useState<string | null>('ZZU');
  const cats = provinceCats(prov);

  const userRank = useMemo(() => rankForScore(prov, cat, score), [prov, cat, score]);

  const admByCode = useMemo(() => {
    const m = new Map<string, { minScore: number; minRank: number }>();
    for (const a of activeAdmissions()) {
      if (a.prov === prov && a.cat === cat) m.set(a.schoolCode, { minScore: a.minScore, minRank: a.minRank });
    }
    return m;
  }, [prov, cat]);

  const points = useMemo(() => {
    return SCHOOLS.map((s) => {
      const adm = admByCode.get(s.code);
      if (!adm) return null;
      const center = PROVINCE_CENTERS[s.prov];
      if (!center) return null;
      const [dx, dy] = jitter(s.code);
      const gap = score - adm.minScore;
      const tier = tierOf(gap);
      const active = s.code === selectedCode;
      return {
        name: s.name,
        value: [center[0] + dx, center[1] + dy] as [number, number],
        schoolCode: s.code,
        gap,
        tier,
        symbolSize: active ? 18 : 10,
        itemStyle: {
          color: TIER_COLOR[tier],
          borderColor: active ? '#0F172A' : '#ffffff',
          borderWidth: active ? 2 : 1,
          opacity: tier === 'none' ? 0.55 : 1,
        },
      };
    }).filter(Boolean);
  }, [admByCode, score, selectedCode]);

  const counts = useMemo(() => {
    const c = { reach: 0, match: 0, safe: 0, none: 0 };
    for (const p of points as any[]) c[p.tier as Tier]++;
    return c;
  }, [points]);

  const option = useMemo<EChartsOption>(() => {
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const d = p.data;
          if (!d || !d.tier) return String(p.name ?? '');
          const gapText = d.gap <= 0 ? `差 ${-d.gap} 分` : `超 ${d.gap} 分`;
          return `<b>${d.name}</b><br/>${TIER_LABEL[d.tier as Tier]} · ${gapText}`;
        },
      },
      geo: {
        map: 'china-compliant',
        roam: true,
        layoutCenter: ['50%', '52%'],
        layoutSize: '116%',
        label: { show: false },
        itemStyle: { areaColor: '#F8FAFC', borderColor: '#CBD5E1', borderWidth: 0.6 },
        emphasis: { itemStyle: { areaColor: '#EEF2F6' }, label: { show: false } },
      },
      series: [
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          symbolSize: 10,
          data: points as any[],
          emphasis: { scale: 1.5, label: { show: false } },
          label: { show: false },
          zlevel: 2,
        },
      ],
    };
  }, [points]);

  const onSelect = (p: any) => {
    if (p?.seriesType === 'scatter' && p?.data?.schoolCode) {
      setSelectedCode(p.data.schoolCode === selectedCode ? null : p.data.schoolCode);
    }
  };

  const selSchool = selectedCode ? getSchool(selectedCode) : undefined;
  const selAdm = selectedCode ? admByCode.get(selectedCode) : undefined;
  const selGap = selAdm ? score - selAdm.minScore : 0;
  const selTier: Tier = selAdm ? tierOf(selGap) : 'none';

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">志愿探索 · 院校地图</h1>
        </div>
        <p className="text-sm text-gray-500">输入分数估算位次；地图上的院校点位按冲稳保着色，点击点位在右侧查看详情（演示数据）。</p>
      </div>

      {/* 输入卡片 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm mb-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">招生省份</span>
            <select
              value={prov}
              onChange={(e) => { setProv(e.target.value); setCat(provinceCats(e.target.value)[0]); setSelectedCode(null); }}
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
            >
              {PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">科类</span>
            <select
              value={cat}
              onChange={(e) => { setCat(e.target.value); setSelectedCode(null); }}
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
        <div className="mt-4 flex flex-wrap items-center gap-4 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500 shrink-0" />
            <div>
              <div className="text-xs text-indigo-500">你的预估位次（{prov}·{cat}）</div>
              <div className="text-2xl font-bold text-indigo-700">{userRank ? `#${userRank.toLocaleString()}` : '—'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR.reach }} />冲 {counts.reach}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR.match }} />稳 {counts.match}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR.safe }} />保 {counts.safe}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* 院校地图 */}
        <section className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ChinaMap option={option} onSelect={onSelect} height={560} className="w-full" />
          <div className="absolute left-3 bottom-3 flex flex-wrap gap-2 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2.5 py-2">
            {(['reach', 'match', 'safe', 'none'] as Tier[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLOR[t] }} />
                {TIER_LABEL[t]}
              </span>
            ))}
          </div>
          <div className="absolute right-3 top-3 text-[10px] text-gray-400 bg-white/80 rounded px-1.5 py-0.5">
            可滚轮缩放 / 拖拽
          </div>
        </section>

        {/* 详情面板 */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-[68px]">
          {selSchool && selAdm ? (
            <motion.div key={selSchool.code} initial={false} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-lg font-bold text-gray-900">{selSchool.name}</h2>
                {selSchool.is985 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">985</span>}
                {selSchool.is211 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">211</span>}
                {selSchool.isDFC && !selSchool.is211 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">双一流</span>}
              </div>
              <p className="text-xs text-gray-400 mb-4 flex items-center gap-1"><MapPin className="w-3 h-3" />{selSchool.prov} · {prov}招生</p>

              <div className="rounded-xl px-4 py-3 mb-4 text-white" style={{ backgroundColor: TIER_COLOR[selTier] }}>
                <div className="text-xs opacity-90">{TIER_LABEL[selTier]}</div>
                <div className="text-2xl font-bold">{selGap <= 0 ? `差 ${-selGap} 分` : `超 ${selGap} 分`}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs text-gray-400">投档线</div>
                  <div className="text-lg font-bold text-gray-900">{selAdm.minScore}</div>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs text-gray-400">最低位次</div>
                  <div className="text-lg font-bold text-gray-900">{selAdm.minRank.toLocaleString()}</div>
                </div>
              </div>

              <div className="text-xs text-gray-500 leading-relaxed">
                你的分数 {score} 分（位次 {userRank ? `#${userRank.toLocaleString()}` : '—'}），报考该校
                {selGap <= 0 ? '为冲一冲，存在一定风险' : selGap <= 22 ? '较稳妥，属于稳一稳区间' : selGap <= 55 ? '把握较大，可作为保底' : '超出常规范畴，请谨慎参考'}。
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-10">
              <School className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 mb-1">点击地图上的院校点位</p>
              <p className="text-xs text-gray-400 leading-relaxed">点位按「冲 / 稳 / 保」着色，右侧显示投档线与位次详情。</p>
              <div className="mt-5 space-y-2 text-left">
                {(['reach', 'match', 'safe'] as Tier[]).map((t) => (
                  <div key={t} className="flex items-center justify-between text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLOR[t] }} />{TIER_LABEL[t]}</span>
                    <span className="text-gray-700 font-semibold">{counts[t]} 所</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-6 flex gap-2 items-start text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          本页数据为<strong className="text-gray-500">示例/估算</strong>，依据公开报道的 2024 年投档线区间近似推算，仅用于演示位次换算与冲稳保逻辑。正式填报请以省级教育考试院官方数据为准。
          <code className="px-1 bg-gray-100 rounded">loadFullDataset()</code> 可无缝接入 MIT 授权全量数据（GaokaoCompass / secnotes）。
          地图为 DataV 省级矢量边界（含台湾、南海诸岛），非在线地图服务。
        </span>
      </div>
    </div>
  );
}
