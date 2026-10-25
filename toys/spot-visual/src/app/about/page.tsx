'use client';

// useSearchParams 在预渲染时需要 Suspense 边界，这里改为按请求渲染
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const FEATURES = [
  ['味道地图 + 口味图谱', '省级地图可下钻到市级，另有「辣 × 甜」二维图谱，点选直达。'],
  ['432 道地方名食', '34 道省级代表菜 + 398 道市级名食，每道都有真实照片与口味档案。'],
  ['四层数据来源', '菜肴级钠、USDA 营养库、主料参照、自评，逐维度标注依据等级。'],
  ['口味测试 & 对比', '六个维度滑杆匹配最接近的菜；两道菜并排比雷达、价格、碳足迹。'],
  ['环境足迹', '命中菜标注每份价格、碳足迹、水足迹、土地占用（CC BY 4.0）。'],
  ['热力 + 伪 3D', '按大区/按菜系/辣度热力三种着色；选中区域带阴影凸起。'],
  ['分享闭环', '导出 PNG 分享卡、URL 带上下文可直达某省某市。'],
  ['手机可读', '小屏自适应，键盘 ←→ 切省、↑↓ 切市。'],
];

const LAYERS = [
  ['菜肴级钠', '中国菜肴数据集 3,302 道（CC BY 4.0）', '37 / 432'],
  ['营养库钠糖', 'USDA FoodData Central（可按 fdcId 复核）', '7 / 432'],
  ['主料参照', '中国食物成分表 第 6 版（有食品编号）', '330 / 432'],
  ['自评', '本项目按公开锚点定标', '全部 432'],
];

function AboutPageInner() {
  const qs = useSearchParams()?.toString() ?? '';
  const link = (p: string) => (qs ? `${p}?${qs}` : p);

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">华夏探索 · 中国味道</h1>
        <p className="text-sm text-gray-500 leading-relaxed max-w-[640px]">
          「一省一菜 → 一市一味」：把 432 道中国地方名食铺在地图与口味平面上，
          每道菜的口味数值、数据来源、价格与环境足迹都能展开核对。
          有依据的写依据，没依据的写明是自评。
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">{t}</div>
            <div className="text-xs text-gray-500 leading-relaxed">{d}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-8">
        <h2 className="text-base font-bold text-gray-900 mb-3">数据覆盖</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="py-1.5 pr-3 font-medium">层级</th>
              <th className="py-1.5 pr-3 font-medium">来源</th>
              <th className="py-1.5 font-medium">覆盖</th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            {LAYERS.map(([a, b, c]) => (
              <tr key={a} className="border-t border-gray-100">
                <td className="py-2 pr-3 font-medium text-gray-800">{a}</td>
                <td className="py-2 pr-3">{b}</td>
                <td className="py-2">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-[11px] text-gray-400">
          逐条出处与复核方式见 <Link className="text-emerald-600 underline" href={link('/sources')}>数据来源</Link>。
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={link('/food')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
          进入中国味道
        </Link>
        <Link href={link('/sources')} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
          查看数据来源
        </Link>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <Suspense fallback={null}>
      <AboutPageInner />
    </Suspense>
  );
}
