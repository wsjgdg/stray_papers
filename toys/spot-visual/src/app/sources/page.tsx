"use client";

// useSearchParams 在预渲染时需要 Suspense 边界，这里改为按请求渲染
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LIBRARY_STATS } from "@/lib/spot-data";
import { POI_DESCRIPTIONS, SCENIC_DESCRIPTIONS } from "@/lib/poi-descriptions";
import { OUTSOURCE_DESCRIPTIONS } from "@/lib/scenic-desc-outsource.generated";
import { SCENIC_DETAILS } from "@/lib/scenic-details.generated";
import { SCENIC_SERVICES } from "@/lib/scenic-services.generated";
import { SPOT_TERRAIN } from "@/lib/spot-terrain.generated";

// 条数动态读取，避免硬编码过期（同 LIBRARY_STATS 的做法）。
// 这些模块已随 spot-data/视图进入本页 bundle，直接取键数不增加体积。
const SCENIC_DESC_COUNT = Object.keys(SCENIC_DESCRIPTIONS).length;
const POI_DESC_COUNT = Object.keys(POI_DESCRIPTIONS).length;
const OUTSOURCE_DESC_COUNT = Object.keys(OUTSOURCE_DESCRIPTIONS).length;
const DETAILS_COUNT = Object.keys(SCENIC_DETAILS).length;
const DETAILS_TEL = Object.values(SCENIC_DETAILS).filter((d) => d.tel).length;
const DETAILS_OPENTIME = Object.values(SCENIC_DETAILS).filter(
  (d) => d.openTime,
).length;
const SERVICES_COUNT = Object.keys(SCENIC_SERVICES).length;
const SERVICES_TOILET = Object.values(SCENIC_SERVICES).filter(
  (s) => s.nearestToiletM >= 0,
).length;
const TERRAIN_COUNT = Object.keys(SPOT_TERRAIN).length;

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
    layer: "景点览胜（内置示例）",
    source: `本项目整理的 ${LIBRARY_STATS.manual} 个代表性景区公开信息`,
    license: "—",
    fields: "名称、地址、分类、设施、推荐项目、经纬度、体力成本标签",
    note: "仅作演示基底；描述为基于公开资料的自行整理，非权威出处。",
  },
  {
    layer: "景点览胜（实时探索）",
    source: "OpenStreetMap（Nominatim 地理编码 + Overpass 兴趣点查询）",
    license: "ODbL（© OpenStreetMap 贡献者）",
    fields: "POI 名称、坐标、分类推断、设施标签、image 标签实拍图",
    note: "由服务端代理请求（30 分钟缓存），为城市探索的第三级兜底（前两级：构建时烘好的城市包 → 库内筛选）。社区数据质量参差，名称/分类可能缺失；Wikimedia 域名图片因国内不可达被排除。overpass-api.de 在部分部署环境连接被拒，此时该兜底不生效，仅影响长尾城市。",
  },
  {
    layer: "7 日出行窗口 / 行程体检 / UV 阴影曲线（天气）",
    source: "Open-Meteo 免费预报 API",
    license: "CC BY 4.0",
    fields:
      "逐日紫外线峰值、最高/最低气温、降水概率；逐小时紫外线、日照时长、云量（劝退视图 UV 阴影占比曲线）",
    note: "服务端代理（/api/weather，0.5° 网格缓存 30 分钟），客户端零外链。PTSI 为本项目自研口径（UV + 身体条件 + 拥挤度），非气象行业标准指数。",
  },
  {
    layer: "景点图片",
    source:
      "多级链路：本地 webp 相册（Bing 抓取，域名降权 + 人工终检）→ 高德官方相册图（5A/4A 名录条目，构建时烘焙，URL 运行时不可达自动降级）→ OSM image 标签（实时探索）→ 分类池 → 渐变占位",
    license: "Bing 抓取图 / 高德图片 / OSM 图片版权归原作者，仅作演示",
    fields: "—",
    note: "详情弹窗逐张标注来源（估/改价口径同理）。菜品 432 张出处见 public/dishes/SOURCES.md；内置景点离线包见 public/spots/_candidates/_report.json。",
  },
  {
    layer: "劝退指南 / PTSI / 体力账本 / 体力沙盘（算法口径）",
    source: "本项目自研",
    license: "—",
    fields:
      "PTSI 0–140 三分项、劝退结论球、体力成本 0–100（按分类默认 + 项目系数）、沙盘体验分 0–100",
    note: `自评性质，仅供出行决策参考，非安全建议。结论球中的坡度、厕所、出入口、UV 阴影项已接真实数据（见上/下方对应数据行），其余劝退文案为模板表述。体力账本直接挂四条真实登山线（见「登山账本」行）。沙盘体验分口径：有高德评分时按 (评分−3)/2×100 线性映射（5.0→100 / 4.5→75 / 4.0→50），无评分按景区等级落位（5A 75 / 4A 65 / 其他 55）——评分仅城市 POI 条目有，名录条目实际走等级落位。`,
  },
  {
    layer: "预算页住宿 / 站间交通（估算）",
    source: "本项目自评基准价（无外部数据源）",
    license: "—",
    fields:
      "住宿：分天天数 × ¥300/晚（舒适档基准，穷游/土豪档按 0.6/2.5 倍率）；交通：行程站间直线距离 × ¥0.55/km（30km 内不计）",
    note: "无真实酒店/票价数据源（酒店类 API 配额不可用），基准价与单价均为自评，仅供量级参考；真实出行请以预订平台报价为准。",
  },
  {
    layer: "开放时间 / 景区电话",
    source:
      "高德地图：城市 POI 深度字段（biz_ext.opentime2，构建时随 POI 包抓取）+ 5A/4A 名录条目周边搜索烘焙（SCENIC_DETAILS）",
    license: "高德开放平台，仅供演示",
    fields: `开放时段文本（城市 POI 约 95% 填充；名录条目 ${DETAILS_OPENTIME}/${DETAILS_COUNT}）；景区电话（名录条目 ${DETAILS_TEL}/${DETAILS_COUNT}）`,
    note: "详情页已标注「出行前请再核实」；门票价与预约标记高德不提供（cost 填充 0.3%），见下方人工标注。构建用的 key 只在本机环境，绝不进发布产物；名录条目的评分字段当前无填充、官方图片仅个别条目有值（运行时不可达即降级），基本不参与展示。",
  },
  {
    layer: "景区服务设施（厕所 / 出入口）",
    source:
      "OpenStreetMap 中国全量 PBF（pyosmium TagFilter 离线提取，构建时烘焙）",
    license: "ODbL（© OpenStreetMap 贡献者）",
    fields: `周边 500m 卫生间数量与最近距离（haversine）、周边 300m 出入口数量与最近距离；覆盖 ${SERVICES_COUNT} 条 A 级条目，${SERVICES_TOILET} 条检索到厕所`,
    note: "曾用腾讯位置服务 nearby 检索（仅 5A、99 条），因日配额不可持续已整体替换为 OSM 离线解析（一次解析全国、零在线依赖）。-1 表示对应范围内无结果；OSM 社区数据质量参差，未检索到 ≠ 实际没有。",
  },
  {
    layer: "景区等级（5A/4A/3A）与名录补充景点",
    source:
      "2023 年全国 A 级景区数据集（AtomGit Universal-Tool/de21c，14844 条，GCJ02 坐标）",
    license: "仅供学习研究使用，严禁商业用途",
    fields: "景区等级、省市区、地址、GCJ02 坐标",
    note: `${LIBRARY_STATS.levelMatched} 个 POI 按名称+距离匹配挂等级；${LIBRARY_STATS.extras} 个库内未覆盖的 3A+ 景区反向入库为骨架条目（等级+坐标，无图无描述，图走分类池降级）。统一库合计 ${LIBRARY_STATS.total} 条（手工 ${LIBRARY_STATS.manual} + 城市 POI ${LIBRARY_STATS.cityPoi} + A 级名录 ${LIBRARY_STATS.extras}，覆盖 ${LIBRARY_STATS.cityCount} 城）。`,
  },
  {
    layer: "景区简介",
    source:
      "本项目撰写管线：人工精写 + 外包 AI 初稿（任务书约束）+ 事实句模板兜底",
    license: "本项目自有内容",
    fields: "中文简介文案（60–110 字/条）；未覆盖条目回落事实句模板",
    note: `人工精写 ${SCENIC_DESC_COUNT} 条 5A/知名景区简介（名录精确名落键，宁缺毋滥），城市 POI 人工简介 ${POI_DESC_COUNT} 条；4A 长尾由外包批次持续合入（已合入 ${OUTSOURCE_DESC_COUNT} 条，进行中），未覆盖条目回落事实句模板——等级/省市/类别取自 2023 全国 A 级名录或高德 POI 字段，零编造。事实纪律：数字与强断言（世界遗产、全国重点文保、最大、唯一等）必须可核实，不能确认一律降级表述；门票/开放时间/预约/电话一律不写入文案（应用内是独立结构化字段，写进文案会与真实数据打架）。外包流程：外部 AI 按任务书出初稿 → 机器验收（长度 60–110 字、禁写词、id 回填、无编造断言，硬违规整批拒收）→ 人工抽检 15–20 条核对口径 → 按 id 合入（键=库条目 id，天然避免同名跨市串写）。来源标注：条目级出处不可查（写作型内容无 URL），口径为「人工撰写，事实性经编辑核对」；POI 类简介另有高德 POI 数据打底。`,
  },
  {
    layer: "是否需预约",
    source: "人工标注（40 条，无自动数据源）",
    license: "—",
    fields: "预约渠道与时限提示",
    note: "只标注确定有预约制/实名限流的景点（故宫、莫高窟、布达拉宫、兵马俑等）；普通线上购票不标注，避免稀释警示。",
  },
  {
    layer: "登山账本（真实山径高程）",
    source: "Open-Meteo Elevation API（构建时沿路线关键节点插值采样）",
    license: "CC BY 4.0",
    fields:
      "海拔剖面（km-elevation）、累计路程（直线 ×1.25 绕行系数）、关键节点",
    note: "路径为泰山/黄山/峨眉山/华山四条经典登山线的关键节点直线插值，非 GPS 轨迹；海拔为真实地形数据，节点坐标为近似值。「预计用时」为经验参考值（非公式估算：实测高程剖面 × 1.25 绕行系数撑不起徒步用时模型，真实步道折返系数远大于此），界面已标注「经验参考值」。",
  },
  {
    layer: "地形坡度（劝退指南坡度项 / 全 A 级覆盖）",
    source:
      "AWS Terrain Tiles（Terrarium 编码，AWS Open Data 公共数据集，下垫 SRTM 等全球 DEM）",
    license: "公开数据集（© OpenStreetMap 贡献者等，见数据集页）",
    fields: `最大坡度（度）、陡坡占比（>10° 网格占比）；~112m 网格分辨率，单景区覆盖约 3.6×4.8km；${TERRAIN_COUNT} 条 A 级条目全覆盖`,
    note: `z13 瓦片 256×256 DEM 经 8× 降采样后算 Horn 3×3 坡度——像素级（~14m）坡度在平原城市被 SRTM 噪声主导（上海中心城区测出 68° 最大坡度），112m 网格下山脊/平原均合理。曾用 Open-Meteo Elevation（1.4km 网格，首批 1208 条），因日配额不可持续换源并全量统一重算，两代数据不混用。四条登山线优先用更精细的路线剖面（见「登山账本」行）。陡峭分档（全域陡峭 ≥50% / 多段陡坡 ≥20% / 缓坡为主）为本项目口径。瓦片缓存于构建环境，不进发布产物。`,
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
    note: "第三方整理的非官方数据（源自公开报道与考试院公告）。投档线按院校×科类取专业组最低分归并；位次由一分一段表线性插值估算；同比基于同源 2024 年数据（投档线约半数、招生计划约四分之一院校可比）；招生计划为专业组合计（约六成院校有值）。山西源数据损坏、青海未公布，未收录；缺位次的院校行（约 0.8%，如西藏大部分）保留展示，位次显示为「—」。985/211/双一流标签以软科官方标签为准。正式填报请以省级教育考试院官方数据为准。",
  },
  {
    layer: "志愿探索（2026 年投档线）",
    source:
      "secnotes/gaokao（github.com/secnotes/gaokao，MIT，OCR 自各省考试院官方发布）",
    license: "MIT（非官方转录，仅供学习参考）",
    fields:
      "2026 年 18 省市本科/专科批院校·专业组最低分（多数省份原表无位次列）、985/211/双一流标签；经 scripts/fetch-gaokao-secnotes.mjs 打包，再按省拆为 public/data/gaokao/2026/",
    note: "覆盖安徽/北京/重庆/福建/广东/广西/贵州/海南/河北/黑龙江/湖北/湖南/江苏/辽宁/内蒙古/上海/山西/浙江；其余省份用 2025 年 GaokaoCompass 数据（年份开关可切）。原表多数省份不公布位次，现由一分一段表按投档最低分反推并在界面标「≈」，估算误差在同一分数段人数以内。无招生计划与同比。",
  },
  {
    layer: "志愿探索（2026 年一分一段表 / 省控线）",
    source:
      "掌上高考公开静态数据（static-data.gaokao.cn，section2021 分段表接口）",
    license: "公开数据，仅供学习参考",
    fields:
      "2026 年 18 省市全部 32 个科类的分数—累计位次分段表与本科批省控线；经 scripts/fetch-gaokao-rank.mjs 采集（请求间隔 350ms，友好采集）",
    note: "新疆、西藏不公布一分一段表（2025/2026 均无），这两省的位次保持「—」。浙江为分段填报、不分本科/专科批次，故无本科线（一段/二段线口径不同，未强行套用）。",
  },
  {
    layer: "志愿探索（专业级投档线）",
    source: "GaokaoCompass major-admission 表（同上，MIT）",
    license: "MIT",
    fields:
      "2025 年 28 省市本科批专业/专业组最低分与位次、选科要求；按省懒加载（public/data/gaokao-major/，共 12MB）",
    note: "同（院校×专业组×专业×选科）取最低分归并；缺位次用一分一段回填。专业组编号保留（新高考省份不同组分数线差异大）。该数据集只有 2025 年版本。2026 年专业级投档线没有可用公开源：本仓库实测掌上高考静态 CDN（static-data.gaokao.cn）在 /www/2.0/school/{id}/ 下只发布 info.json（院校信息）、pc_special.json（开设专业清单，无分数无位次）、pc_jobdetail.json（就业）、provinceline / specialscore 等 20 余条专业分数候选路径全部 404 NoSuchKey，其公开粒度止于「院校×批次」；HuggingFace 侧 data/2026/{prov}/major-admission.csv 亦为 404。因此「专业反查」在 2026 年沿用 2025 专业目录，并在结果区用琥珀色横幅标注口径。",
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
    layer: "志愿探索（院校地图坐标）",
    source:
      "掌上高考公开静态数据 school/list_v2.json（院校所在省市）+ 仓库内 DataV 地级边界中心点",
    license: "第三方整理的非官方静态数据；DataV GeoAtlas 边界",
    fields:
      "586 所院校中 569 所的坐标（地级市精度；北京/上海/天津/重庆取市辖区中心）；经 scripts/fetch-school-coords.mjs 生成 src/lib/school-coords.generated.ts",
    note: "掌上高考的院校信息只有 city_id / county_id，不含经纬度，本项目也未接入任何地图 API 或高德 key，因此不做门牌级地理编码 —— 坐标精度为地级市，直辖市为市辖区。同一点上的院校在地图上按小圆环展开，圆环位置本身不代表真实校园位置，只用于「这所院校大概在哪」的空间感知。17 所院校（如中国石油大学、绍兴文理学院）在掌上高考院校库里同名歧义或缺失，回落到省份中心点。",
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        数据来源与边界
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed max-w-[680px]">
        本页列出所有外部数据的出处、许可与「能支撑到什么程度」。
        凡是没有外部依据的数值，页面上一律标注为「自评」。
      </p>

      <div className="space-y-3">
        {ROWS.map((r) => (
          <div
            key={r.layer}
            className="rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-900 p-4"
          >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {r.layer}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                {r.license}
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
              来源：{r.source}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              字段：{r.fields}
            </div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              {r.note}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-800/60 p-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        <b className="text-gray-700 dark:text-gray-300">未纳入：</b>
        消费调研（外卖/点评菜品热度、销量）没有公开数据集；
        「糖」在中国菜肴数据集里只有总碳水列，没有糖列，故甜度仍走量表与自评；
        辣/酸/香/鲜在营养库中无对应量纲。
      </div>

      <div className="mt-6">
        <Link
          href={link("/about")}
          className="text-emerald-600 dark:text-emerald-400 text-sm underline"
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
