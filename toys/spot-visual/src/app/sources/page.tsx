"use client";

// useSearchParams 在预渲染时需要 Suspense 边界，这里改为按请求渲染
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ROWS = [
  {
    layer: "菜肴级钠 / 价格 / 碳足迹",
    source: "中国菜肴数据集（3,302 道菜）",
    license: "CC BY 4.0",
    fields: "每份钠 mg、每份价格 元、碳足迹 g、水足迹 L、土地 m²",
    note: "取中文菜名精确/去前缀后匹配，共 37 道命中（含 7 条地名/别名变体人工确认）。菜系字段不可靠（锅包肉被标成鲁菜），未使用。",
  },
  {
    layer: "营养库钠糖",
    source: "USDA FoodData Central",
    license: "美国政府数据",
    fields: "钠 mg/100g、糖 g/100g",
    note: "仅 7 道对得上（如 Duck, Peking fdcId 2706141）。美式中餐条目多，中国地方菜少。",
  },
  {
    layer: "主料参照",
    source:
      "《中国食物成分表 标准版 第 6 版》（经 Sanotsu/china-food-composition-data 转录）",
    license: "原书版权归出版社；本项目仅引用少量条目并注明食品编号",
    fields: "主料每 100g 能量 kcal、钠 mg、GI",
    note: "主料数据，不是整道菜。330 道菜按菜名主料推断。",
  },
  {
    layer: "口味雷达（辣/甜/酸/香/鲜）",
    source: "本项目自评",
    license: "—",
    fields: "0–100 六维",
    note: "按公开锚点定标（Scoville、蔗糖相对甜度），仅适合菜系间横向比较。",
  },
  {
    layer: "菜品照片",
    source: "Bing 图片搜索抓取，按域名优先取菜谱站/门户站",
    license: "版权归原作者与原站点，仅作演示",
    fields: "—",
    note: "432 张本地打包。出处见 public/dishes/SOURCES.md。",
  },
  {
    layer: "地图边界",
    source: "DataV GeoAtlas；台湾 20 县市取自 GeoJSON.cn",
    license: "公开使用",
    fields: "省级 / 市级矢量边界",
    note: "含台湾、南海诸岛，非在线地图服务，不请求境外瓦片。",
  },
  {
    layer: "志愿探索（院校投档线 / 一分一段）",
    source:
      "GaokaoCompass（github.com/choucisan/GaokaoCompass，HuggingFace: choucsan/Gaokao-Compass-11M）",
    license: "MIT",
    fields:
      "2025 年 28 省市本科普通批院校投档线（最低分/位次、2024 同比）、一分一段表、院校×科类招生计划合计；经 scripts/fetch-gaokao-data.mjs 压缩打包",
    note: "第三方整理的非官方数据（源自公开报道与考试院公告）。投档线按院校×科类取专业组最低分归并；位次由一分一段表线性插值估算；同比基于同源 2024 年数据（投档线约半数、招生计划约四分之一院校可比）；招生计划为专业组合计（约六成院校有值）。山西源数据损坏、青海未公布、西藏缺位次，未收录。985/211/双一流标签以软科官方标签为准。正式填报请以省级教育考试院官方数据为准。",
  },
  {
    layer: "志愿探索（院校排名 / 层次标签）",
    source: "软科中国大学排名（主榜 2025，shanghairanking.cn 公开 API）",
    license: "软科数据，仅供学习参考，非商业用途",
    fields:
      "586 所院校排名（1–500 名含综合得分，之后为 500+ 区间）、官方 985/211/双一流标签、院校类型；经 scripts/fetch-gaokao-enrich.mjs 打包",
    note: "第三方商业排名，代表性有限，排名≠办学质量全部。合并进志愿探索详情面板与筛选。",
  },
  {
    layer: "志愿探索（学科实力）",
    source:
      "教育部学位与研究生教育发展中心 第四轮学科评估（2017 公布；经 GitHub Johnnydaszhu/2017ChinaUniversityDisciplineAssessment 转录）",
    license: "官方公开结果，转录数据仅供演示",
    fields:
      "各校 A+/A/A- 学科数量与 A+ 学科名称（463 所院校，与软科主榜交叉命中 289 所）",
    note: "第四轮为最近一轮完整公开结果（第五轮未公开），数据截至 2017 年，不代表最新学科实力。仅统计 A 档，B 及以下未收录。",
  },
];

function SourcesPageInner() {
  const qs = useSearchParams()?.toString() ?? "";
  const link = (p: string) => (qs ? `${p}?${qs}` : p);

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">数据来源与边界</h1>
      <p className="text-sm text-gray-500 mb-6 leading-relaxed max-w-[680px]">
        本页列出所有外部数据的出处、许可与「能支撑到什么程度」。
        凡是没有外部依据的数值，页面上一律标注为「自评」。
      </p>

      <div className="space-y-3">
        {ROWS.map((r) => (
          <div
            key={r.layer}
            className="rounded-2xl border border-gray-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-gray-900">
                {r.layer}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500">
                {r.license}
              </span>
            </div>
            <div className="text-xs text-gray-600 mb-1">来源：{r.source}</div>
            <div className="text-xs text-gray-500 mb-1">字段：{r.fields}</div>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              {r.note}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 leading-relaxed">
        <b className="text-gray-700">未纳入：</b>
        消费调研（外卖/点评菜品热度、销量）没有公开数据集；
        「糖」在中国菜肴数据集里只有总碳水列，没有糖列，故甜度仍走量表与自评；
        辣/酸/香/鲜在营养库中无对应量纲。
      </div>

      <div className="mt-6">
        <Link
          href={link("/about")}
          className="text-emerald-600 text-sm underline"
        >
          ← 返回作品介绍
        </Link>
      </div>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={null}>
      <SourcesPageInner />
    </Suspense>
  );
}
