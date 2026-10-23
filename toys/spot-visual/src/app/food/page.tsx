'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Share2, Check, UtensilsCrossed, MapPin, Flame, ChevronLeft, Loader2, Sparkles, Layers } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { PROVINCE_FOODS, CUISINE_COLORS, TASTE_KEYS, TASTE_DIMENSIONS, getProvince } from '@/lib/food-data';
import { TASTE_EVIDENCE, EVIDENCE_LABEL, EVIDENCE_STYLE, SCOVILLE_BANDS, getDishNutrition, sodiumToScore } from '@/lib/taste-evidence';
import { getDishIngredients, SODIUM_BANDS } from '@/lib/ingredient-nutrition';
import { DISH_SODIUM, SODIUM_DATASET_SIZE } from '@/lib/dish-sodium.generated';
import { resolveCityFood } from '@/lib/food-city';
import { loadCityGeo, getCachedCityGeo, type CityGeo } from '@/lib/city-geo';
import { TasteRadar } from '@/components/food/taste-radar';
import { TasteScatter } from '@/components/food/taste-scatter';
import { DishVisual } from '@/components/food/dish-visual';
import ChinaMap, { type MapRegistration } from '@/components/map/china-map';
import { cn } from '@/lib/utils';

const REGION_COLORS: Record<string, string> = {
  华北: '#F59E0B', 东北: '#10B981', 华东: '#3B82F6', 华中: '#8B5CF6',
  华南: '#EC4899', 西南: '#EF4444', 西北: '#D97706',
};
const REGION_ORDER = ['华北', '东北', '华东', '华中', '华南', '西南', '西北'];

const FALLBACK_CITY_COLOR = '#CBD5E1';
const SELECTED_COLOR = '#0F766E';

export default function FoodPage() {
  const [provCode, setProvCode] = useState('SC');
  /** 下钻中的省份简称；null = 全国视图 */
  const [drill, setDrill] = useState<string | null>(null);
  /** 下钻后选中的城市展示简称 */
  const [citySel, setCitySel] = useState<string | null>(null);

  const [cityGeo, setCityGeo] = useState<CityGeo | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityErr, setCityErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  /** 左栏视图：地图 / 口味图谱 */
  const [view, setView] = useState<'map' | 'atlas'>('map');

  const selected = getProvince(provCode) ?? PROVINCE_FOODS[0];
  const cuisineColor = CUISINE_COLORS[selected.cuisine] ?? '#64748B';

  const nameToCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of PROVINCE_FOODS) m[p.name] = p.code;
    return m;
  }, []);

  // ── 下钻：按需加载市级边界 ──────────────────────────────
  useEffect(() => {
    if (!drill) {
      setCityGeo(null);
      setCityErr(null);
      setCityLoading(false);
      return;
    }
    let alive = true;
    setCityGeo(getCachedCityGeo(drill) ?? null);
    setCityErr(null);
    setCityLoading(true);
    loadCityGeo(drill)
      .then((g) => { if (alive) setCityGeo(g); })
      .catch((e: unknown) => {
        if (!alive) return;
        setCityGeo(null);
        setCityErr(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => { if (alive) setCityLoading(false); });
    return () => { alive = false; };
  }, [drill]);

  const enterProvince = useCallback((name: string) => {
    const code = nameToCode[name];
    if (!code) return;
    setProvCode(code);
    setDrill(name);
    setCitySel(null);
  }, [nameToCode]);

  // 深链：?prov=海南 / ?prov=HI 直接进入该省下钻视图（便于分享与复现）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('prov');
    if (!p) return;
    const hit = PROVINCE_FOODS.find(
      (x) => x.name === p || x.fullName === p || x.code === p.toUpperCase(),
    );
    if (hit) enterProvince(hit.name);
  }, [enterProvince]);

  const backToNation = useCallback(() => {
    setDrill(null);
    setCitySel(null);
  }, []);

  // ── 城市列表（含代表菜解析结果） ────────────────────────
  const cityRows = useMemo(() => {
    if (!cityGeo) return [];
    return cityGeo.cities.map((c) => ({ ...c, food: resolveCityFood(selected, c.fullName) }));
  }, [cityGeo, selected]);

  const localCount = useMemo(() => cityRows.filter((c) => c.food.isLocal).length, [cityRows]);

  const activeCity = useMemo(
    () => (citySel ? cityRows.find((c) => c.label === citySel) ?? null : null),
    [cityRows, citySel],
  );

  // ── 全国视图 option ────────────────────────────────────
  const nationalOption = useMemo<EChartsOption>(() => {
    const data = PROVINCE_FOODS.map((p) => ({
      name: p.name,
      value: 1,
      itemStyle: {
        areaColor: p.code === provCode ? SELECTED_COLOR : (REGION_COLORS[p.region] ?? '#94A3B8'),
        opacity: p.code === provCode ? 1 : 0.78,
        borderColor: '#ffffff',
        borderWidth: 0.6,
      },
    }));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const prov = PROVINCE_FOODS.find((x) => x.name === p.name);
          return prov
            ? `<b>${prov.fullName}</b><br/>代表菜：${prov.dish}<br/>菜系：${prov.cuisine}<br/><span style="color:#0F766E">点击下钻到市级 →</span>`
            : String(p.name ?? '');
        },
      },
      series: [
        {
          type: 'map',
          map: 'china-compliant',
          roam: true,
          layoutCenter: ['50%', '52%'],
          layoutSize: '116%',
          selectedMode: 'single',
          label: { show: false },
          emphasis: {
            label: { show: true, color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
            itemStyle: { areaColor: SELECTED_COLOR },
          },
          itemStyle: { borderColor: '#ffffff', borderWidth: 0.6 },
          data,
        },
      ],
    };
  }, [provCode]);

  // ── 省级（市级边界）option ─────────────────────────────
  const provinceOption = useMemo<EChartsOption>(() => {
    if (!cityGeo || !cityRows.length) return nationalOption;
    const data = cityRows.map((c) => {
      const color = c.food.isLocal
        ? (CUISINE_COLORS[c.food.cuisine] ?? cuisineColor)
        : FALLBACK_CITY_COLOR;
      return {
        name: c.label,
        value: 1,
        itemStyle: {
          areaColor: c.label === citySel ? SELECTED_COLOR : color,
          opacity: 1,
          borderColor: '#ffffff',
          borderWidth: c.label === citySel ? 1.4 : 0.7,
        },
      };
    });
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const row = cityRows.find((x) => x.label === p.name);
          if (!row) return String(p.name ?? '');
          return `<b>${row.fullName}</b><br/>代表菜：${row.food.dish}<br/>${row.food.isLocal ? '城市专属名食' : '沿用省域风味'}`;
        },
      },
      series: [
        {
          type: 'map',
          map: cityGeo.mapName,
          roam: true,
          // 用剔除远海岛礁后的包围盒定初始视野，避免主陆地被压扁/挤出画面
          boundingCoords: cityGeo.viewBounds,
          layoutCenter: ['50%', '50%'],
          layoutSize: '112%',
          selectedMode: 'single',
          label: { show: false },
          emphasis: {
            label: { show: true, color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
            itemStyle: { areaColor: SELECTED_COLOR },
          },
          itemStyle: { borderColor: '#ffffff', borderWidth: 0.7 },
          data,
        },
      ],
    };
  }, [cityGeo, cityRows, citySel, drill, cuisineColor, nationalOption]);

  const maps = useMemo<MapRegistration[]>(
    () => (cityGeo ? [{ name: cityGeo.mapName, geo: cityGeo.geo }] : []),
    [cityGeo],
  );

  const option = drill && cityGeo ? provinceOption : nationalOption;

  const onSelect = useCallback((p: any) => {
    if (p?.seriesType !== 'map' || !p.name) return;
    if (!drill) {
      enterProvince(p.name);
      return;
    }
    if (!cityGeo) return;
    if (cityRows.some((c) => c.label === p.name)) setCitySel(p.name);
  }, [drill, cityGeo, cityRows, enterProvince]);

  // ── 面板数据：城市优先，否则省域 ────────────────────────
  const panel = useMemo(() => {
    if (activeCity) {
      return {
        key: `city-${activeCity.fullName}`,
        title: activeCity.fullName,
        sub: `${selected.fullName} · ${activeCity.food.isLocal ? '城市专属名食' : '省域风味'}`,
        dish: activeCity.food.dish,
        cuisine: activeCity.food.cuisine,
        desc: activeCity.food.desc,
        isCity: true,
        isLocal: activeCity.food.isLocal,
      };
    }
    return {
      key: `prov-${selected.code}`,
      title: selected.fullName,
      sub: `${selected.region}地区 · 省域代表菜`,
      dish: selected.dish,
      cuisine: selected.cuisine,
      desc: selected.desc,
      isCity: false,
      isLocal: true,
    };
  }, [activeCity, selected]);

  const panelColor = CUISINE_COLORS[panel.cuisine] ?? cuisineColor;

  const cityErrText = useMemo(() => {
    if (!cityErr) return '';
    if (/\b404\b/.test(cityErr)) return '上游边界数据源未收录该行政区的地级边界';
    if (/Failed to fetch|NetworkError/i.test(cityErr)) return '边界数据请求失败，请检查网络后重试';
    return cityErr;
  }, [cityErr]);

  const sortedTaste = useMemo(
    () => TASTE_KEYS.map((k) => ({ k, v: selected.taste[k] })).sort((a, b) => b.v - a.v),
    [selected],
  );

  const shareText = useMemo(() => {
    const top = sortedTaste.slice(0, 2).map((t) => t.k).join('·');
    const where = panel.isCity ? panel.title : selected.fullName;
    return `【中国味道 · ${where}】\n代表菜：${panel.dish}（${panel.cuisine}）\n口味标签：${top}\n风味印象：${panel.desc}\n—— 用 WorkBuddy 打造的《华夏探索》探索中国味道 #WorkBuddy #1024程序员节`;
  }, [panel, selected.fullName, sortedTaste]);

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="w-5 h-5 text-rose-500" />
          <h1 className="text-xl font-bold text-gray-900">中国味道 · 一省一菜 → 一市一味</h1>
          {drill && (
            <button
              onClick={backToNation}
              className="ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full pl-1.5 pr-2.5 py-1 hover:bg-emerald-100 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> 返回全国
            </button>
          )}
          <div className="ml-auto inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs shrink-0">
            {([['map', '味道地图'], ['atlas', '口味图谱']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors',
                  view === k ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-500">
          {view === 'atlas'
            ? '把 34 道省级代表菜铺在「辣 × 甜」平面上：横轴辣度、纵轴甜度，点越大越鲜。点击任意点下钻到该省。'
            : drill
              ? <>已下钻到 <b className="text-gray-700">{selected.fullName}</b>，点击地图上的市/区查看该地代表菜；也可用下方城市清单定位。</>
              : '点击任意省份下钻到市级，下方查看代表菜与口味档案。'}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* ══ 左栏：地图 + 地图下方的说明/城市清单/分享卡 ══ */}
        <div className="min-w-0 space-y-5">
        {/* ══ 味道地图 / 口味图谱 ══ */}
        {view === 'atlas' ? (
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <TasteScatter active={drill} onPick={(n) => enterProvince(n)} height={620} />
            <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              横轴辣度、纵轴甜度，点越大越鲜；颜色为菜系。点击任意点下钻到该省。
            </p>
          </section>
        ) : (
        <section className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ChinaMap
            option={option}
            onSelect={onSelect}
            maps={maps}
            height={620}
            className="w-full [&_canvas]:!h-full"
          />

          {/* 加载/失败遮罩 */}
          {drill && (cityLoading || cityErr) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/78 backdrop-blur-[2px] text-center px-6">
              {cityLoading ? (
                <>
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  <p className="text-sm text-gray-600">正在加载 {selected.fullName} 市级边界…</p>
                </>
              ) : (
                <>
                  <Layers className="w-6 h-6 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">{selected.fullName} 暂无市级矢量边界</p>
                  <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed">{cityErrText}</p>
                  <p className="text-xs text-gray-400">仍可查看右侧的省域代表菜。</p>
                  <button onClick={backToNation} className="mt-1 text-xs font-medium text-emerald-700 underline">返回全国视图</button>
                </>
              )}
            </div>
          )}

          {/* 图例 */}
          {drill ? (
            <div className="absolute left-3 bottom-3 flex flex-wrap gap-2 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2.5 py-2 max-w-[85%]">
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cuisineColor }} />城市专属名食
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FALLBACK_CITY_COLOR }} />沿用省域风味
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SELECTED_COLOR }} />当前选中
              </span>
            </div>
          ) : (
            <div className="absolute left-3 bottom-3 flex flex-wrap gap-1.5 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2.5 py-2 max-w-[85%]">
              {REGION_ORDER.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REGION_COLORS[r] }} />
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="absolute right-3 top-3 text-[10px] text-gray-400 bg-white/80 rounded px-1.5 py-0.5">
            可滚轮缩放 / 拖拽{drill && cityGeo ? ` · 共 ${cityRows.length} 个地级行政区` : ''}
          </div>

          {/* 视野剔除提示（如三沙市岛礁跨越南海，会把本岛压扁） */}
          {drill && cityGeo && cityGeo.offscreen.length > 0 && (
            <div className="absolute right-3 bottom-3 max-w-[230px] text-[10px] text-gray-500 bg-white/88 backdrop-blur-sm border border-gray-200 rounded-lg px-2 py-1.5 leading-relaxed">
              {cityGeo.offscreen.map((o) => o.fullName).join('、')} 的范围远超本岛，已移出初始视野，可在右侧城市清单中查看。
            </div>
          )}
        </section>
        )}

        {/* ══ 地图下方：菜品说明 · 城市清单 · 分享卡 ══
            右栏放雷达和口味条就够高了，把文字类内容挪到地图下方，
            左栏不再空一大片，整页高度也更接近。 */}
        <motion.div
          key={`${panel.key}-info`}
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm"
        >
          <div className="flex items-start gap-3 mb-3">
            <span className="shrink-0 mt-0.5 text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: panelColor }}>
              {panel.cuisine}
            </span>
            <p className="text-sm text-gray-600 leading-relaxed">{panel.desc}</p>
          </div>

          {drill && cityRows.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700">城市清单</span>
                <span className="text-[10px] text-gray-400">{localCount}/{cityRows.length} 有专属名食</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-[104px] overflow-y-auto pr-1 content-start">
                {cityRows.map((c) => (
                  <button
                    key={c.fullName}
                    onClick={() => setCitySel(c.label)}
                    title={`${c.fullName} · ${c.food.dish}`}
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                      c.label === citySel
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : c.food.isLocal
                          ? 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:text-emerald-700'
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-gray-100 grid gap-3 sm:grid-cols-[1fr_210px] sm:items-end">
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" /> 分享卡 · #WorkBuddy #1024程序员节
              </div>
              <pre className="text-[11px] text-gray-500 whitespace-pre-wrap font-sans leading-relaxed max-h-[72px] overflow-y-auto">{shareText}</pre>
            </div>
            <button
              onClick={copyShare}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors border border-emerald-200"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? '已复制分享文案' : '复制分享文案'}
            </button>
          </div>
        </motion.div>
        </div>

        {/* ══ 详情面板 ══ */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-[68px]">
          {/*
            切换城市时右栏会「跳一下」的原因有两个：
            1) 之前用 AnimatePresence mode="wait"，旧内容先退出（且容器高度塌陷）再进新内容；
            2) 标题行、徽标行、简介、城市清单、分享卡的高度都随内容变。
            这里改成：不做进出场动画（只做透明度微变），并给高度会变的块预留固定高度，
            让整块面板在切换城市时尺寸恒定。
          */}
          <motion.div
            key={panel.key}
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14 }}
          >
            <div className="min-h-[52px] flex items-start justify-between gap-2 mb-1">
              <h2 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2">{panel.title}</h2>
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: panelColor }}>{panel.cuisine}</span>
            </div>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
              <MapPin className="w-3 h-3" />{panel.sub}
            </p>

            {/* 固定高度的徽标位：无论是否城市视角，占位一致 */}
            <div className="h-6 mb-3">
              {panel.isCity && (
                <div className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full',
                  panel.isLocal ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-50 text-gray-500 border border-gray-200',
                )}>
                  {panel.isLocal ? <Sparkles className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                  {panel.isLocal ? '城市专属名食' : '沿用省域风味'}
                </div>
              )}
            </div>

              <div className="mb-3">
                <DishVisual
                  dish={panel.dish}
                  cuisine={panel.cuisine}
                  cuisineColor={panelColor}
                  taste={selected.taste}
                />
              </div>

              <div className="flex justify-center mb-2">
                <TasteRadar taste={selected.taste} color={panelColor} size={240} />
              </div>

              {/* 口径披露：逐维度标出来源等级，有数据的给数据，没有的直接说没有 */}
              <div className="mb-3 text-center">
                <button
                  onClick={() => setShowBasis((v) => !v)}
                  className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {panel.isCity ? '口味取所属省域参考' : '口味雷达为本项目自评口径'}
                  <span className="underline decoration-dotted underline-offset-2">{showBasis ? '收起依据' : '依据？'}</span>
                </button>
              </div>
              {showBasis && (
                <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-2.5 text-left">
                  <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                    6 个维度里，<b className="text-gray-700">咸、甜有公开刻度</b>（钠 mg/100g 与蔗糖相对甜度），
                    <b className="text-gray-700">辣锚定 Scoville 量表</b>；
                    <b className="text-gray-700">酸、香、鲜没有公开量纲</b>。
                    具体数值仍是本项目按各自的 0/50/100 锚点定标，不是实测结果。
                  </p>

                  {(() => {
                    const nut = getDishNutrition(panel.dish);
                    if (!nut) {
                      return (
                        <p className="text-[10px] leading-relaxed text-gray-400 mb-2 border-l-2 border-gray-200 pl-2">
                          「{panel.dish}」在 USDA FoodData Central 没有能对上的条目，
                          咸 / 甜也退回自评；其余维度见下表。
                        </p>
                      );
                    }
                    return (
                      <div className="text-[10px] leading-relaxed text-gray-500 mb-2 border-l-2 border-emerald-300 pl-2">
                        <div className="font-semibold text-gray-700 mb-0.5">
                          营养库有对应条目 · 钠 {nut.sodiumMg} mg/100g · 糖 {nut.sugarsG} g/100g
                        </div>
                        <div className="text-gray-500">
                          {nut.description}（{nut.dataType}，fdcId {nut.fdcId}）。{nut.caveat}
                        </div>
                        <div className="text-gray-400 mt-0.5">
                          按 800mg/100g 归一到 100 折算，咸度刻度值约 {sodiumToScore(nut.sodiumMg)}（当前自评估值 {selected.taste.咸}）。
                        </div>
                      </div>
                    );
                  })()}

                  <ul className="space-y-1.5">
                    {TASTE_DIMENSIONS.map((d) => {
                      const ev = TASTE_EVIDENCE[d.key];
                      return (
                        <li key={d.key} className="text-[10px] leading-snug text-gray-500">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-700">{d.name}</span>
                            <span className={cn('px-1 py-px rounded border text-[9px] font-medium', EVIDENCE_STYLE[ev.level])}>
                              {EVIDENCE_LABEL[ev.level]}
                            </span>
                            <span className="text-gray-600">{ev.scale}</span>
                          </div>
                          <div className="text-gray-400 mt-0.5">{ev.note}</div>
                          <div className="text-gray-400 mt-0.5">0 = {d.low}；100 = {d.high}</div>
                        </li>
                      );
                    })}
                  </ul>

                  {(() => {
                    const sd = DISH_SODIUM[panel.dish];
                    if (!sd) return null;
                    return (
                      <div className="mt-2 border-t border-emerald-200 pt-2">
                        <div className="text-[10px] font-semibold text-emerald-700 mb-1">
                          菜肴级实测 · 中国菜肴数据集（3,302 道，CC BY 4.0）
                        </div>
                        <div className="text-[10px] text-gray-600 leading-relaxed">
                          每份钠 <b>{sd.na} mg</b>（库内条目「{sd.db}」，{sd.serving} 份）
                          <span className="text-gray-400"> · </span>
                          在 3,302 道菜中排前 <b>{Math.max(1, 100 - sd.pct)}%</b>
                          <span className="text-gray-400">（分位 {sd.pct}）</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, sd.pct)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed mt-1">
                          各家做法差异大，此处是全库同菜名的实测值，非本页自评口径。
                        </p>
                      </div>
                    );
                  })()}

                  {(() => {
                    const ing = getDishIngredients(panel.dish);
                    if (!ing) return null;
                    return (
                      <div className="mt-2 border-t border-gray-200 pt-2">
                        <div className="text-[10px] font-semibold text-gray-600 mb-1">
                          主料参照 ·《中国食物成分表》第 6 版（每 100g）
                        </div>
                        <div className="space-y-0.5">
                          {ing.items.map((it) => (
                            <div key={it.code} className="flex items-baseline gap-1.5 text-[10px] text-gray-500">
                              <span className="text-gray-700 font-medium">{it.name}</span>
                              <span className="text-gray-300">#{it.code}</span>
                              <span>{it.energyKcal} kcal</span>
                              <span className="text-gray-300">·</span>
                              <span>钠 {it.sodiumMg} mg</span>
                              {it.note && <span className="text-gray-400">（{it.note}）</span>}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed mt-1">{ing.caveat}</p>
                        <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5">
                          这是主料数据，不是整道菜的实测值。
                        </p>
                      </div>
                    );
                  })()}

                  <div className="mt-2 border-t border-gray-200 pt-2">
                    <div className="text-[10px] font-semibold text-gray-600 mb-0.5">咸度刻度的量纲锚定</div>
                    <div className="space-y-0.5">
                      {SODIUM_BANDS.map((b) => (
                        <div key={b.label} className="text-[10px] text-gray-500">
                          {b.label}：{b.range} → 刻度 {b.score}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 border-t border-gray-200 pt-2">
                    <div className="text-[10px] font-semibold text-gray-600 mb-0.5">辣度换算参照 · Scoville</div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
                      {SCOVILLE_BANDS.map((b) => (
                        <span key={b.label}>{b.label}：{b.range}（{b.example}）</span>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 leading-relaxed mt-2">
                    消费调研（外卖/点评菜品热度）没有公开可引用的数据集，未纳入。
                  </p>
                </div>
              )}

              {/* taste bars */}
              <div className="space-y-2 mb-4">
                {sortedTaste.map((t) => (
                  <div key={t.k} className="flex items-center gap-2">
                    <span className="w-4 text-xs font-medium text-gray-500">{t.k}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.v}%`, backgroundColor: panelColor }} />
                    </div>
                    <span className="w-6 text-right text-xs text-gray-400">{t.v}</span>
                  </div>
                ))}
              </div>

            </motion.div>
        </aside>
      </div>

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        省域代表菜汇编自公开资料（百度百科《中国菜》名录等）；市级代表菜为公开饮食文化常识整理，
        未收录的城市明确标注「沿用省域风味」，不做臆造。口味雷达数值为按菜系特征的估算标签，仅供文化科普与演示。
        地图为矢量静态边界（省级与大部分市级来自 DataV GeoAtlas；台湾 20 县市边界 DataV 未提供，取自 GeoJSON.cn），
        含台湾、南海诸岛，非在线地图服务，不请求境外瓦片。
      </p>
    </div>
  );
}
