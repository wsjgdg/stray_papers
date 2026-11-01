"use client";

// useSearchParams 在预渲染时需要 Suspense 边界，这里改为按请求渲染
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LIBRARY_STATS } from "@/lib/spot-data";

/* ═══ 中国味道功能细节（本模块页尾展开） ═══ */
const FOOD_FEATURES = [
  [
    "行程计划闭环",
    "收藏入行程 → 按体力预算自动分天 → 整条行程 7 日天气体检 → 装备清单 → 预算/体力沙盘联动 → 文本/行程卡导出。",
  ],
  [
    "劝退 × 翻车日记",
    "劝退指南按紫外线与身体条件评估；翻车日记记录真实踩坑，反哺劝退筛选与景点详情口碑。",
  ],
  [
    "7 日出行窗口",
    "PTSI 指数接真实天气预报，逐日评分标出本周最适合出行的一天。",
  ],
  [
    "五级图源 + 离线包",
    "OSM 实拍 → 图库 API → 本地预置包 → 渐变占位，逐张标注来源，断网也有真图。",
  ],
  [
    "味道地图 + 口味图谱",
    "省级地图可下钻到市级，另有「辣 × 甜」二维图谱，点选直达。",
  ],
  [
    "432 道地方名食",
    "34 道省级代表菜 + 398 道市级名食，每道都有真实照片与口味档案。",
  ],
  [
    "四层数据来源",
    "菜肴级钠、USDA 营养库、主料参照、自评，逐维度标注依据等级。",
  ],
  [
    "口味测试 & 对比",
    "六个维度滑杆匹配最接近的菜；两道菜并排比雷达、价格、碳足迹。",
  ],
  ["环境足迹", "命中菜标注每份价格、碳足迹、水足迹、土地占用（CC BY 4.0）。"],
  ["热力 + 伪 3D", "按大区/按菜系/辣度热力三种着色；选中区域带阴影凸起。"],
  ["分享闭环", "导出 PNG 分享卡、URL 带上下文可直达某省某市。"],
  ["手机可读", "小屏自适应，键盘 ←→ 切省、↑↓ 切市。"],
];

const FOOD_LAYERS = [
  ["菜肴级钠", "中国菜肴数据集 3,302 道（CC BY 4.0）", "37 / 432"],
  ["营养库钠糖", "USDA FoodData Central（可按 fdcId 复核）", "7 / 432"],
  ["主料参照", "中国食物成分表 第 6 版（有食品编号）", "330 / 432"],
  ["自评", "本项目按公开锚点定标", "全部 432"],
];

/* ═══ 三大模块卡：定位 / 用途 / 优点 ═══ */
const MODULES = [
  {
    href: "/",
    emoji: "🏔️",
    name: "景点览胜",
    accent: "emerald",
    tagline: `全国 ${LIBRARY_STATS.total.toLocaleString()} 个景点的行前决策台`,
    uses: [
      "决定去不去：劝退指南按实时紫外线与身体条件给 go/nogo 结论",
      "决定怎么排：收藏入行程 → 体力预算自动分天 → 一键就近排序",
      "决定花多少：门票真实报价/估算 + 住宿交通估算，三档预算对照",
      "出发前避坑：翻车日记 + 相似踩坑匹配，体检报告逐项可核",
    ],
    highlights: [
      `统一库 ${LIBRARY_STATS.total.toLocaleString()} 条（手工精选 + 城市 POI + 2023 A 级名录）`,
      "坡度/厕所/出入口/UV/电话全部接真实数据源（OSM、AWS 高程瓦片、高德），口径见数据来源页",
      "十二个功能视图共享一套收藏/行程/身体条件，视图切换 keep-alive 不重载",
      "筛选状态可分享（?prov=&cat=&lv=&q= 深链直达同一视图）",
    ],
    cta: "进入景点览胜",
  },
  {
    href: "/food",
    emoji: "🍜",
    name: "中国味道",
    accent: "rose",
    tagline: "432 道地方名食铺在地图与口味平面上",
    uses: [
      "到一省一市先吃什么：地图下钻直达省级代表菜与市级名食",
      "按口味找菜：六维滑杆（辣/甜/酸/香/鲜）匹配最接近的菜",
      "健康对照：菜肴级钠含量、USDA 营养、主料成分表逐层可核",
      "两道菜并排比：雷达图 + 价格 + 碳足迹同屏对比",
    ],
    highlights: [
      "每道菜都有真实照片（Bing 抓取管线 + 人工终检，432 张本地打包）",
      "口味雷达按公开锚点定标（Scoville、相对甜度），横向可比",
      "环境足迹（碳/水/土地）来自 CC BY 4.0 学术数据集",
      "热力图 + 伪 3D 选中凸起，URL 带上下文可分享到某省某市",
    ],
    cta: "进入中国味道",
  },
  {
    href: "/gaokao",
    emoji: "🎓",
    name: "志愿探索",
    accent: "violet",
    tagline: "投档线铺在地图上，按「冲 / 稳 / 保」着色",
    uses: [
      "输入分数估位次：一分一段表插值，2025/2026 双年可切",
      "看谁能上：28 省市本科投档线地图着色，点校看三年趋势",
      "专业反查：院校 × 专业 × 选科最低分归并（2026 沿用 2025 口径并标注）",
      "院校画像：软科排名 + 985/211/双一流 + 第四轮学科评估交叉",
    ],
    highlights: [
      "2026 年 18 省市投档线（OCR 自各省考试院发布，MIT 许可）",
      "一分一段表 / 省控线接掌上高考公开静态数据（友好采集）",
      "569 所院校地图坐标 + 463 所学科评估，全部来源可查",
      "非官方数据全程标注口径，位次估算误差在同一分数段内",
    ],
    cta: "试试志愿探索",
  },
];

const ACCENT: Record<
  string,
  {
    border: string;
    btn: string;
    text: string;
  }
> = {
  emerald: {
    border: "hover:border-emerald-300 dark:hover:border-emerald-500/50",
    btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  rose: {
    border: "hover:border-rose-300 dark:hover:border-rose-500/50",
    btn: "bg-rose-600 hover:bg-rose-700 text-white",
    text: "text-rose-600 dark:text-rose-400",
  },
  violet: {
    border: "hover:border-violet-300 dark:hover:border-violet-500/50",
    btn: "bg-violet-600 hover:bg-violet-700 text-white",
    text: "text-violet-600 dark:text-violet-400",
  },
};

function AboutPageInner() {
  const qs = useSearchParams()?.toString() ?? "";
  const link = (p: string) => (qs ? `${p}?${qs}` : p);

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
      {/* ═══ 头部 ═══ */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          华夏探索
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-[680px]">
          三个互相独立的子应用，共用一套「有依据写依据、没依据写自评」的数据纪律。
          每个模块的用途与优点如下，数据逐条出处见
          <Link
            className="text-emerald-600 dark:text-emerald-400 underline mx-1"
            href={link("/sources")}
          >
            数据来源
          </Link>
          页。
        </p>
      </div>

      {/* ═══ 三模块卡 ═══ */}
      <div className="grid lg:grid-cols-3 gap-4 mb-10">
        {MODULES.map((m) => {
          const a = ACCENT[m.accent];
          return (
            <div
              key={m.href}
              className={`rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 p-5 flex flex-col transition-colors ${a.border}`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-2xl">{m.emoji}</span>
                <div>
                  <div className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                    {m.name}
                  </div>
                  <div className={`text-[11px] font-medium ${a.text}`}>
                    {m.tagline}
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3 mb-1.5">
                用途
              </div>
              <ul className="space-y-1.5 mb-4">
                {m.uses.map((u) => (
                  <li
                    key={u}
                    className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed flex gap-1.5"
                  >
                    <span className="text-gray-300 dark:text-gray-600 shrink-0">
                      ▸
                    </span>
                    <span>{u}</span>
                  </li>
                ))}
              </ul>

              <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                优点
              </div>
              <ul className="space-y-1.5 mb-5">
                {m.highlights.map((h) => (
                  <li
                    key={h}
                    className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed flex gap-1.5"
                  >
                    <span className={`${a.text} shrink-0`}>✦</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={link(m.href)}
                className={`mt-auto inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${a.btn}`}
              >
                {m.cta} →
              </Link>
            </div>
          );
        })}
      </div>

      {/* ═══ 景点览胜功能展开 ═══ */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 p-5 mb-8">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          景点览胜 · 功能清单
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            [
              "网格 + 网络双视图",
              "6000 条卡片流 / ECharts 地图下钻，收藏行程状态直接上地图",
            ],
            [
              "劝退指南",
              "实时 UV + 身体条件 → go/nogo 结论球，坡度/厕所/出口逐项接真实数据",
            ],
            ["体力沙盘 + 账本", "体力 vs 体验双轴散点，四条真实登山线高程剖面"],
            [
              "行程闭环",
              "自动分天 / 就近排序 / 逐日预算 / 7 日天气体检 / 导出",
            ],
            ["翻车日记", "踩坑记录可导入导出，反哺劝退筛选与详情口碑"],
            ["旅人测试", "45 种人格组合 + 基于收藏的真实推荐目的地"],
          ].map(([t, d]) => (
            <div
              key={t}
              className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3"
            >
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
                {t}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 中国味道功能细节 + 数据覆盖 ═══ */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
          🍜 中国味道 · 功能细节
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          「一省一菜 →
          一市一味」：口味数值、数据来源、价格与环境足迹都能展开核对。
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {FOOD_FEATURES.map(([t, d]) => (
            <div
              key={t}
              className="rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 p-4"
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {t}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 p-5 mb-8">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          中国味道 · 数据覆盖
        </h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 dark:text-gray-500">
              <th className="py-1.5 pr-3 font-medium">层级</th>
              <th className="py-1.5 pr-3 font-medium">来源</th>
              <th className="py-1.5 font-medium">覆盖</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 dark:text-gray-300">
            {FOOD_LAYERS.map(([a, b, c]) => (
              <tr
                key={a}
                className="border-t border-gray-100 dark:border-gray-800"
              >
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-200">
                  {a}
                </td>
                <td className="py-2 pr-3">{b}</td>
                <td className="py-2">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
          全部模块的逐条出处与复核方式见{" "}
          <Link
            className="text-emerald-600 dark:text-emerald-400 underline"
            href={link("/sources")}
          >
            数据来源
          </Link>
          。
        </div>
      </div>

      {/* ═══ 底部导航 ═══ */}
      <div className="flex flex-wrap gap-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={link(m.href)}
            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {m.emoji} {m.name}
          </Link>
        ))}
        <Link
          href={link("/sources")}
          className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
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
