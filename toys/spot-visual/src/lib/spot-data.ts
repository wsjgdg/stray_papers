import { SPOT_PHOTOS } from "./spot-photos.generated";
import { POOL_LOCAL } from "./category-pool.generated";
// ═══ 景点数据类型 ═══
export interface Spot {
  id: string;
  name: string;
  image: string;
  /** 相册多图（手工精选景点内联；城市包 POI 走 photosKey 懒加载） */
  photos?: string[];
  /** 城市包 POI 的相册索引键「城市::POI名」，见 lib/poi-photos.ts */
  photosKey?: string;
  /** 高德评分（0-5，仅城市包 POI 有） */
  rating?: number;
  /** 开放时间（高德 biz_ext.opentime2，95% 填充） */
  openTime?: string;
  /** 景区电话（高德 POI，55% 填充） */
  tel?: string;
  /** 官网（高德 POI，13% 填充） */
  website?: string;
  /** 景区等级（5A/4A/3A，来源 2023 全国 A 级景区名录） */
  level?: string;
  /** 预约提示（仅标注有预约制/实名限流的景点） */
  reservation?: string;
  /** 图片来源标注：osm | unsplash | pexels | pool | amap（详情弹窗展示，数据诚实性） */
  imageSource?: string;
  address: string;
  facilities: string[];
  projects: string[];
  category: string;
  description: string;
  location?: unknown;
  staminaCost?: number; // 体力消耗值 0-100（可选，JSON 导入时可携带）
}

/* ═══ 体力货币：按分类自动推断的体力消耗默认值（0-100） ═══ */
export const CATEGORY_STAMINA_DEFAULT: Record<string, number> = {
  自然风光: 55,
  自然风景: 55,
  历史人文: 30,
  历史文化: 30,
  主题乐园: 60,
  城市地标: 25,
  海滨度假: 40,
  山岳景区: 85,
  古镇村落: 20,
  宗教寺庙: 35,
  美食小吃: 15,
  轻运动: 70,
};

/* ═══ 体力货币：景点精确体力消耗值映射（覆盖示例景点） ═══ */
export const STAMINA_COST_MAP: Record<string, number> = {
  张家界国家森林公园: 65, // 山岳+徒步
  故宫博物院: 25, // 平地参观
  上海迪士尼乐园: 55, // 全天站立+排队
  广州塔: 15, // 电梯观光
  三亚亚龙湾: 25, // 沙滩休闲
  黄山风景区: 90, // 高海拔登山
  丽江古城: 20, // 平地漫步
  少林寺: 40, // 半山寺庙
  九寨沟风景区: 55, // 高原栈道
  "长城·八达岭": 80, // 陡坡攀爬
  长隆海洋王国: 50, // 主题乐园
  鼓浪屿: 30, // 小岛漫步
};

/* ═══ 体力货币：项目体力系数（关键词匹配） ═══ */
export const PROJECT_STAMINA_FACTOR: Record<string, number> = {
  徒步: 1.3,
  登山: 1.5,
  攀岩: 1.5,
  栈道: 1.2,
  骑行: 1.4,
  漂流: 1.3,
  潜水: 1.1,
  冲浪: 1.4,
  滑雪: 1.5,
  骑马: 1.2,
  划船: 1.1,
  蹦极: 1.0,
  观景: 0.7,
  参观: 0.5,
  游览: 0.6,
  漫步: 0.5,
  表演: 0.3,
  演出: 0.3,
  夜游: 0.6,
  打卡: 0.4,
  博物馆: 0.4,
  展览: 0.3,
  体验: 0.8,
  缆车: -0.3,
  索道: -0.4,
  电梯: -0.3,
  观光车: -0.2,
  过山车: 1.1,
  跳楼机: 1.2,
  摩天轮: 0.3,
};

/**
 * 获取景点的体力消耗值（混合策略）
 * 1. 优先使用 Spot 上的 staminaCost 字段（JSON 导入时携带）
 * 2. 降级到 STAMINA_COST_MAP 精确匹配
 * 3. 再降级到 CATEGORY_STAMINA_DEFAULT 分类推断
 * 4. 默认 40
 */
export function getStaminaCost(spot: Spot): number {
  // 检查 spot 上是否有直接字段（JSON 导入时可能携带）
  const direct = (spot as any).staminaCost;
  if (typeof direct === "number" && direct >= 0 && direct <= 100) return direct;
  // 精确名称匹配
  if (STAMINA_COST_MAP[spot.name] !== undefined)
    return STAMINA_COST_MAP[spot.name];
  // 分类推断
  if (CATEGORY_STAMINA_DEFAULT[spot.category] !== undefined)
    return CATEGORY_STAMINA_DEFAULT[spot.category];
  return 40;
}

/**
 * 根据项目名称计算体力系数调整
 * 返回 0.3~1.5 的乘数（缆车类可降低体力消耗，徒步类增加）
 */
export function getProjectStaminaFactor(projectName: string): number {
  for (const [kw, factor] of Object.entries(PROJECT_STAMINA_FACTOR)) {
    if (projectName.includes(kw)) return factor;
  }
  return 1.0; // 默认不变
}

/* ═══ PTSI 指数 ═══ */
export interface PTSIResult {
  score: number; // 0-100，越高越适宜出行
  uvScore: number; // 紫外线分项 (0-50)
  bodyScore: number; // 身体条件分项 (0-60)
  crowdScore: number; // 拥挤分项 (0-30)
  verdict: "go" | "caution" | "nogo";
  reasons: string[];
}

/* ═══ 反向游记 ═══ */
export interface DissuasionRecord {
  id: string;
  spotId: string;
  spotName: string;
  timestamp: number;
  tags: string[]; // 翻车标签数组
  timePeriod: string; // '清晨' | '正午' | '黄昏'
  bodyConditions: string[]; // ['knee', 'heart', 'heat']
  comment: string;
  voteCount: number;
}

/* ═══ 翻车标签预设 ═══ */
export const DISSUASION_TAGS = [
  { id: "queue", label: "排队3h+", emoji: "🧍" },
  { id: "closed", label: "设施关闭", emoji: "🚧" },
  { id: "fake", label: "实际与图片不符", emoji: "🎭" },
  { id: "expensive", label: "门票太贵", emoji: "💸" },
  { id: "toilet", label: "卫生间脏乱", emoji: "🚽" },
  { id: "parking", label: "停车困难", emoji: "🅿️" },
  { id: "sun", label: "暴晒无遮挡", emoji: "☀️" },
  { id: "stairs", label: "台阶太多", emoji: "🪜" },
  { id: "crowded", label: "人多拥挤", emoji: "👥" },
  { id: "signal", label: "信号差", emoji: "📵" },
  { id: "food", label: "餐饮难吃", emoji: "🤢" },
  { id: "danger", label: "安全隐患", emoji: "⚠️" },
];

// ═══ 分类颜色映射 ═══
export const CATEGORY_COLORS: Record<string, string> = {
  自然风光: "bg-emerald-50 text-emerald-700 border-emerald-200",
  自然风景: "bg-emerald-50 text-emerald-700 border-emerald-200",
  历史人文: "bg-amber-50 text-amber-700 border-amber-200",
  历史文化: "bg-amber-50 text-amber-700 border-amber-200",
  主题乐园: "bg-pink-50 text-pink-700 border-pink-200",
  城市地标: "bg-slate-100 text-slate-700 border-slate-200",
  海滨度假: "bg-sky-50 text-sky-700 border-sky-200",
  山岳景区: "bg-lime-50 text-lime-700 border-lime-200",
  古镇村落: "bg-orange-50 text-orange-700 border-orange-200",
  宗教寺庙: "bg-violet-50 text-violet-700 border-violet-200",
  美食小吃: "bg-rose-50 text-rose-700 border-rose-200",
  轻运动: "bg-teal-50 text-teal-700 border-teal-200",
};

// ═══ 分类主题色（用于占位图） ═══
export const CATEGORY_THEME: Record<
  string,
  { from: string; to: string; icon: string }
> = {
  自然风光: { from: "#D1FAE5", to: "#A7F3D0", icon: "🌲" },
  自然风景: { from: "#D1FAE5", to: "#A7F3D0", icon: "🌲" },
  历史人文: { from: "#FEF3C7", to: "#FDE68A", icon: "🏛️" },
  历史文化: { from: "#FEF3C7", to: "#FDE68A", icon: "🏛️" },
  主题乐园: { from: "#FCE7F3", to: "#FBCFE8", icon: "🎡" },
  城市地标: { from: "#F1F5F9", to: "#E2E8F0", icon: "🏙️" },
  海滨度假: { from: "#E0F2FE", to: "#BAE6FD", icon: "🏖️" },
  山岳景区: { from: "#ECFCCB", to: "#D9F99D", icon: "⛰️" },
  古镇村落: { from: "#FFEDD5", to: "#FED7AA", icon: "🏘️" },
  宗教寺庙: { from: "#EDE9FE", to: "#DDD6FE", icon: "⛩️" },
  美食小吃: { from: "#FFE4E6", to: "#FECDD3", icon: "🍜" },
  轻运动: { from: "#CCFBF1", to: "#99F6E4", icon: "🚴" },
};

// ═══ 分类 → 本地图片池（API 降级用，全部为通过 API 验证的真实 URL） ═══
const CATEGORY_PHOTOS: Record<string, string[]> = {
  自然风光: [
    "https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1683041132892-0fe990b3afc3?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1658056366953-e2e93b1c1099?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1664604655363-f6050b3ca4d8?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1596905738125-a6b51b1bdbb6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1700148676800-a12f8a016deb?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1732808460864-b8e5eb489a52?w=800&h=500&fit=crop&q=80",
  ],
  自然风景: [
    "https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1683041132892-0fe990b3afc3?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1658056366953-e2e93b1c1099?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1664604655363-f6050b3ca4d8?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1596905738125-a6b51b1bdbb6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1700148676800-a12f8a016deb?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1732808460864-b8e5eb489a52?w=800&h=500&fit=crop&q=80",
  ],
  历史人文: [
    "https://images.unsplash.com/photo-1628620843425-75da163c80f2?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1512102917795-4edc80a0aa63?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1514461835410-ddd29ff89d14?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1522787345986-d5c7885a889e?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1458022799175-1eb17cf09d90?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1697455621145-c688d7558143?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1649523217385-f27a01e148dc?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1777245144514-7ed23da44abb?w=800&h=500&fit=crop&q=80",
  ],
  历史文化: [
    "https://images.unsplash.com/photo-1628620843425-75da163c80f2?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1512102917795-4edc80a0aa63?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1514461835410-ddd29ff89d14?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1522787345986-d5c7885a889e?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1458022799175-1eb17cf09d90?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1697455621145-c688d7558143?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1649523217385-f27a01e148dc?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1777245144514-7ed23da44abb?w=800&h=500&fit=crop&q=80",
  ],
  主题乐园: [
    "https://images.unsplash.com/photo-1502136969935-8d8eef54d77b?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1627035983655-0ceec61bb733?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1615493749624-7a97d4b18fe6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1761242606389-0a45db29fdee?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1669570083880-0d9cb0ad1dea?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1613546167482-b3280d75f796?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1567617849031-8655483b300b?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1707112244220-6cc774e9ac15?w=800&h=500&fit=crop&q=80",
  ],
  城市地标: [
    "https://images.unsplash.com/photo-1554793000-245d3a3c2a51?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1487506878145-e78516feade7?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1683041134049-28843fae8c1f?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1771945031979-55fa29dd9716?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1636834620871-d22004dd9e07?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1773852031792-fbb826750ded?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1505617483630-e5a543eaaa86?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1761727946659-27115be461ed?w=800&h=500&fit=crop&q=80",
  ],
  海滨度假: [
    "https://images.unsplash.com/photo-1650970366119-34cb82f8b4c1?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1611946022552-d2ca5ffba186?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1617371067811-6f7535979874?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1631535152690-ba1a85229136?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1701785924585-d2b4bc6a66cf?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1660486358484-975da44dc68e?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1660486360130-02ec33fa1ccb?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1660486358746-8bc9f2a94496?w=800&h=500&fit=crop&q=80",
  ],
  山岳景区: [
    "https://images.unsplash.com/photo-1558469070-b0bb906830a2?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1583606317098-8926d58c73c6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1664648853617-127a94346600?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1613587905169-736ffb75de9e?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1661901697097-ed11697502f4?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1630562392473-83a289d6155f?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1616794448732-17b953353db0?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1603893964388-18a64012afea?w=800&h=500&fit=crop&q=80",
  ],
  古镇村落: [
    "https://images.unsplash.com/photo-1605096048662-5ab61695a122?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1611144222869-ca3d1bafa89c?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1653931565039-c500acbb31d2?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1667831083048-4ddd6a8cd4db?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1766337996174-d6766b8ce932?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1761552505189-3933cea126f7?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1783441113959-945f3774a320?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1762996770562-ffce7254c4cc?w=800&h=500&fit=crop&q=80",
  ],
  宗教寺庙: [
    "https://images.unsplash.com/photo-1530634082454-f57b7d567b25?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1543160058-bb08f2f22c21?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1580355275559-10c832e123f1?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1713346643669-ab7793501846?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1575642158817-5bc47aea404f?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1562777578-3e432ed38f03?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1740203493443-b17b8d904405?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1583200698551-6b032ba0f19f?w=800&h=500&fit=crop&q=80",
  ],
  美食小吃: [
    "https://images.unsplash.com/photo-1552912470-ee2e96439539?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1506781961370-37a89d6b3095?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1628324716243-0c9c29971a58?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1718942900361-d01a1ee8d077?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1471110338536-858caa3dbe45?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1545324053-41b04f1a8e8a?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1506159094651-959dec66fac6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1711127498984-84bea628db02?w=800&h=500&fit=crop&q=80",
  ],
  轻运动: [
    "https://images.unsplash.com/photo-1603102859961-64b17d43580d?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1456613820599-bfe244172af5?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1615632778185-48e15a6f68bf?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1764067522124-b51d909061a6?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1760115338751-cc810cb0a591?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1774050021466-369013ca33ef?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1607429289025-ee36ac310746?w=800&h=500&fit=crop&q=80",
    "https://images.unsplash.com/photo-1610432151528-67e398f52d0a?w=800&h=500&fit=crop&q=80",
  ],
};

// 通用风景图（未知分类时使用）
let FALLBACK_PHOTOS = [
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1438786657495-640937046d18?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1598439473183-42c9301db5dc?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1615134732800-ca7ef7a3388c?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=500&fit=crop&q=80",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=500&fit=crop&q=80",
];

// ═══ 分类池离线化：加载时把远程 URL 就地替换为本地 webp（npm run pool:fetch 生成）。
// 找不到本地副本的 URL（如新增未下载）保持远程原样，由 SpotImage 降级链兜底。 ═══
const toLocalPool = (url: string): string => POOL_LOCAL[url] ?? url;
for (const cat of Object.keys(CATEGORY_PHOTOS)) {
  CATEGORY_PHOTOS[cat] = CATEGORY_PHOTOS[cat].map(toLocalPool);
}
FALLBACK_PHOTOS = FALLBACK_PHOTOS.map(toLocalPool);

// ═══ 按分类追踪已用索引，确保同分类内不重复分配 ═══
const _usedIndices: Map<string, Set<number>> = new Map();

// ═══ 图片缓存自学习：API 拉到的 URL 写入 localStorage，降级时优先复用 ═══
const PHOTO_CACHE_KEY = "spot-photo-cache";
const PHOTO_CACHE_MAX_PER_CAT = 200; // 每分类缓存上限，防止 localStorage 撑爆

type PhotoCache = Record<string, string[]>;

/** 读取整份缓存（SSR / 解析失败时返回空对象） */
function readPhotoCache(): PhotoCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PHOTO_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PhotoCache) : {};
  } catch {
    return {};
  }
}

/** 将 API 成功拉到的 URL 写入对应分类缓存（去重，自动截断到上限） */
export function cachePhotoForCategory(category: string, url: string): void {
  if (!url || typeof window === "undefined") return;
  try {
    const cache = readPhotoCache();
    const arr = cache[category] || [];
    if (!arr.includes(url)) {
      arr.push(url);
      // 超出上限丢弃最旧的（FIFO），保留近期拉到的
      if (arr.length > PHOTO_CACHE_MAX_PER_CAT)
        arr.splice(0, arr.length - PHOTO_CACHE_MAX_PER_CAT);
      cache[category] = arr;
      localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    /* localStorage 满或禁用时静默 */
  }
}

/**
 * 同步降级：取一张图。仅在 API 失败时使用。
 * 优先返回 localStorage 缓存中「本次会话未用过」的 URL（自学习层）；
 * 缓存耗尽或不存在时回退到编译期 CATEGORY_PHOTOS 池。
 * 同分类内不重复分配；全部用过则清空重轮。
 */
export function getCategoryImageUrl(category: string, _index?: number): string {
  // 调用方指定索引：直接用编译期池（示例景点初始化走这条路径，保证稳定）
  if (_index !== undefined) {
    const pool = CATEGORY_PHOTOS[category] || FALLBACK_PHOTOS;
    return pool.length > 0 ? pool[_index % pool.length] : "";
  }

  // 拼接候选池：自学习缓存（运行时积累）在前，编译期池在后
  const cached = readPhotoCache()[category] || [];
  const builtin = CATEGORY_PHOTOS[category] || FALLBACK_PHOTOS;
  const pool = [...cached, ...builtin];
  if (pool.length === 0) return "";

  // 按分类获取已用索引集合
  let used = _usedIndices.get(category);
  if (!used) {
    used = new Set();
    _usedIndices.set(category, used);
  }

  // 找一个未使用的索引
  let idx = -1;
  for (let i = 0; i < pool.length; i++) {
    if (!used.has(i)) {
      idx = i;
      break;
    }
  }

  // 池内全部用过，清空重轮
  if (idx === -1) {
    used.clear();
    idx = 0;
  }

  used.add(idx);
  return pool[idx];
}

export const DEFAULT_CATEGORIES = [
  "自然风光",
  "历史人文",
  "主题乐园",
  "城市地标",
  "海滨度假",
  "山岳景区",
  "古镇村落",
  "宗教寺庙",
];

export const getCategoryColor = (cat: string) =>
  CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-600 border-gray-200";

// ═══ 分类图标名映射 ═══
export const CATEGORY_ICON_NAMES: Record<string, string> = {
  自然风光: "TreePine",
  自然风景: "TreePine",
  历史人文: "Landmark",
  历史文化: "Landmark",
  主题乐园: "Sparkles",
  城市地标: "Building2",
  海滨度假: "Waves",
  山岳景区: "Mountain",
  古镇村落: "HomeIcon",
  宗教寺庙: "Church",
  美食小吃: "UtensilsCrossed",
  轻运动: "Bike",
};

// ═══ 解析坐标 ═══
export function parseCoords(spot: Spot): { lat: number; lng: number } | null {
  const loc = spot.location;
  if (!loc) return null;
  if (typeof loc === "object" && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude ?? o.y);
    const lng = Number(o.lng ?? o.lon ?? o.longitude ?? o.x);
    if (
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    )
      return { lat, lng };
  }
  if (Array.isArray(loc) && loc.length >= 2) {
    const lat = Number(loc[0]),
      lng = Number(loc[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  if (typeof loc === "string") {
    const nums = loc
      .match(/-?\d+\.?\d*/g)
      ?.map(Number)
      .filter((n) => !isNaN(n));
    if (nums && nums.length >= 2) return { lat: nums[0], lng: nums[1] };
  }
  return null;
}

// ═══ 球面距离（haversine，单位 km）——用于就近串联与距离排序 ═══
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ═══ 提取区域 ═══
/**
 * 从地址里取城市名（带「市」）。用于城市维度筛选与计数。
 *
 * 兼容三种写法：
 *   「北京市东城区…」→ 北京市
 *   「浙江省杭州市西湖区…」→ 杭州市（跳过省名）
 *   「杭州市…」→ 杭州市
 * 取不到时回退到前 4 个字符，宁可粗糙也不要返回空串。
 */
export function getCity(address: string): string {
  const m = address.match(/([^\s省市]{1,4}市)/);
  return m ? m[1] : address.slice(0, 4);
}

export function getDistrict(address: string): string {
  const m = address.match(/(.{2,6}市)(.{2,4}[区县市])/);
  return m ? m[0] : address.slice(0, 8) || "未知区域";
}

// ═══ 导入 JSON 解析 ═══
export function parseImportedSpots(raw: unknown): Spot[] {
  let arr: unknown[] = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw) && raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.data ?? obj.spots ?? obj.list ?? obj.items;
    if (Array.isArray(candidate)) arr = candidate;
  }
  return arr
    .filter((item) => {
      const o = item as Record<string, unknown>;
      return o.name && typeof o.name === "string";
    })
    .map((item, idx) => {
      const o = item as Record<string, unknown>;
      // photos
      const rawPhotos = o.photo ?? o.photos ?? o.images ?? o.pictures;
      let photos: string[] = [];
      if (Array.isArray(rawPhotos))
        photos = rawPhotos.map(String).filter((p) => p.startsWith("http"));
      else if (typeof rawPhotos === "string" && rawPhotos.startsWith("http"))
        photos = [rawPhotos];
      const image =
        photos[0] ||
        String(o.image || o.cover || o.pic || o.imageUrl || o.thumb || "");
      const extraPhotos = photos.length > 1 ? photos.slice(1) : undefined;
      // facilities / projects
      const parseArr = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === "string")
          return v
            .split(/[,，、;；|]/)
            .map((s) => s.trim())
            .filter(Boolean);
        return [];
      };
      return {
        id: String(o.id || `imp-${Date.now()}-${idx}`),
        name: String(o.name || ""),
        image: image || "", // 空字符串 = 需要从 API 拉取或降级
        photos: extraPhotos,
        address: String(o.address || o.location_addr || o.addr || ""),
        facilities: parseArr(o.facilities ?? o.facility),
        projects: parseArr(o.projects ?? o.project ?? o.activities),
        category: String(o.category || o.type || o.classify || o.tag || "其他"),
        description: String(
          o.description || o.intro || o.desc || o.about || o.content || "",
        ),
        location:
          o.location ?? o.coord ?? o.coordinates ?? o.lat_lng ?? o.lng_lat,
      };
    });
}

// ═══ 示例景点数据（含坐标） ═══
export const sampleSpots: Spot[] = [
  {
    id: "1",
    name: "张家界国家森林公园",
    reservation: RESERVATION_NOTES["张家界国家森林公园"],
    image:
      SPOT_PHOTOS["张家界国家森林公园"] ?? getCategoryImageUrl("自然风光", 0),
    address: "湖南省张家界市武陵源区",
    facilities: ["游客中心", "索道", "环保车", "餐厅", "医务室", "停车场"],
    projects: [
      "天门山玻璃栈道",
      "百龙天梯",
      "金鞭溪徒步",
      "袁家界观景台",
      "天子山云海",
    ],
    category: "自然风光",
    staminaCost: 65,
    description:
      '张家界国家森林公园是中国第一个国家森林公园，以独特的石英砂岩峰林地貌闻名于世。公园内有三千多座形态各异的奇峰，被誉为"缩小的仙境，放大的盆景"。电影《阿凡达》中悬浮山的原型就取景于此。这里四季分明，春赏百花、夏避酷暑、秋观红叶、冬览雪景。',
    location: { lat: 29.3249, lng: 110.4343 },
  },
  {
    id: "2",
    name: "故宫博物院",
    image: SPOT_PHOTOS["故宫博物院"] ?? getCategoryImageUrl("历史人文", 0),
    address: "北京市东城区景山前街4号",
    facilities: [
      "语音导览",
      "文创商店",
      "餐厅",
      "无障碍通道",
      "存包处",
      "母婴室",
    ],
    projects: ["太和殿参观", "珍宝馆", "钟表馆", "御花园漫步", "数字故宫体验"],
    category: "历史人文",
    staminaCost: 25,
    description:
      "故宫博物院又称紫禁城，建于明永乐十八年（1420年），是中国明清两代的皇家宫殿，也是世界上现存规模最大、保存最完整的木质结构古建筑群。占地面积72万平方米，馆藏文物超过186万件。",
    location: { lat: 39.9163, lng: 116.3972 },
  },
  {
    id: "3",
    name: "上海迪士尼乐园",
    image: SPOT_PHOTOS["上海迪士尼乐园"] ?? getCategoryImageUrl("主题乐园", 0),
    address: "上海市浦东新区川沙镇黄赵路310号",
    facilities: [
      "主题酒店",
      "停车场",
      "婴儿车租赁",
      "轮椅租赁",
      "寄存柜",
      "急救站",
    ],
    projects: [
      "创极速光轮",
      "翱翔·飞越地平线",
      "加勒比海盗",
      "七个小矮人矿山车",
      "奇幻童话城堡",
    ],
    category: "主题乐园",
    staminaCost: 55,
    description:
      "上海迪士尼乐园是中国内地首座迪士尼主题乐园，拥有七大主题园区，包括全球最大的迪士尼城堡——奇幻童话城堡。融合了中国传统文化元素与迪士尼经典故事。",
    location: { lat: 31.144, lng: 121.657 },
  },
  {
    id: "4",
    name: "广州塔",
    image: SPOT_PHOTOS["广州塔"] ?? getCategoryImageUrl("城市地标", 0),
    address: "广东省广州市海珠区阅江西路222号",
    facilities: [
      "观光层",
      "旋转餐厅",
      "户外观景平台",
      "纪念品商店",
      "电梯",
      "地下停车场",
    ],
    projects: ["488米户外观景台", "极速云霄跳楼机", "摩天轮", "珠江夜游"],
    category: "城市地标",
    staminaCost: 15,
    description:
      '广州塔又称"小蛮腰"，总高度600米，是中国第一高塔。塔身采用独特的扭转造型，拥有世界最高的户外观景平台、横向摩天轮和垂直速降体验项目。',
    location: { lat: 23.1066, lng: 113.3245 },
  },
  {
    id: "5",
    name: "三亚亚龙湾",
    image: SPOT_PHOTOS["三亚亚龙湾"] ?? getCategoryImageUrl("海滨度假", 0),
    address: "海南省三亚市吉阳区亚龙湾",
    facilities: [
      "更衣室",
      "淋浴间",
      "防晒用品店",
      "潜水中心",
      "餐饮区",
      "救生站",
    ],
    projects: ["沙滩漫步", "潜水体验", "帆船出海", "摩托艇", "海边瑜伽"],
    category: "海滨度假",
    staminaCost: 25,
    description:
      '亚龙湾被誉为"天下第一湾"，拥有7.5公里长的银白色海滩，沙质细腻、海水清澈见底。年均气温25.5°C，终年可游泳，是中国南方最理想的海滨度假胜地。',
    location: { lat: 18.192, lng: 109.6387 },
  },
  {
    id: "6",
    name: "黄山风景区",
    image: SPOT_PHOTOS["黄山风景区"] ?? getCategoryImageUrl("山岳景区", 0),
    address: "安徽省黄山市黄山区汤口镇",
    facilities: ["索道", "山上酒店", "环保车", "医疗点", "餐厅", "行李托运"],
    projects: [
      "迎客松打卡",
      "光明顶日出",
      "西海大峡谷",
      "飞来石",
      "云谷寺徒步",
    ],
    category: "山岳景区",
    staminaCost: 90,
    description:
      '黄山以奇松、怪石、云海、温泉、冬雪"五绝"著称于世，被列为世界文化与自然双重遗产。主峰莲花峰海拔1864.8米。徐霞客曾赞叹："登黄山，天下无山，观止矣！"',
    location: { lat: 30.1374, lng: 118.1694 },
  },
  {
    id: "7",
    name: "丽江古城",
    image: SPOT_PHOTOS["丽江古城"] ?? getCategoryImageUrl("古镇村落", 0),
    address: "云南省丽江市古城区",
    facilities: ["特色客栈", "美食街", "酒吧街", "手工艺品店", "导游服务"],
    projects: [
      "四方街夜游",
      "木府参观",
      "纳西古乐欣赏",
      "黑龙潭公园",
      "束河古镇",
    ],
    category: "古镇村落",
    staminaCost: 20,
    description:
      "丽江古城始建于宋末元初，距今已有800多年历史。融合了纳西族、汉族、白族等多个民族的建筑风格与文化传统，是中国以整座古城申报世界文化遗产获得成功的两座古城之一。",
    location: { lat: 26.8721, lng: 100.2259 },
  },
  {
    id: "8",
    name: "少林寺",
    image: SPOT_PHOTOS["少林寺"] ?? getCategoryImageUrl("宗教寺庙", 0),
    address: "河南省郑州市登封市嵩山五乳峰下",
    facilities: [
      "停车场",
      "游客中心",
      "纪念品商店",
      "素斋餐厅",
      "讲解服务",
      "医务室",
    ],
    projects: [
      "少林功夫表演",
      "塔林参观",
      "达摩洞朝拜",
      "武术体验课",
      "嵩山游览",
    ],
    category: "宗教寺庙",
    staminaCost: 40,
    description:
      "少林寺始建于北魏太和十九年（495年），是汉传佛教的禅宗祖庭，也是少林武术的发源地。少林功夫以刚柔并济、内外兼修的特点享誉世界，千佛殿内的五百罗汉壁画是不可多得的艺术珍品。",
    location: { lat: 34.5082, lng: 112.9365 },
  },
  {
    id: "9",
    name: "九寨沟风景区",
    reservation: RESERVATION_NOTES["九寨沟风景区"],
    image: SPOT_PHOTOS["九寨沟风景区"] ?? getCategoryImageUrl("自然风光", 1),
    address: "四川省阿坝藏族羌族自治州九寨沟县",
    facilities: ["观光车", "栈道", "餐厅", "环保厕所", "氧气站", "纪念品店"],
    projects: ["五花海", "珍珠滩瀑布", "诺日朗瀑布", "长海", "镜海倒影"],
    category: "自然风光",
    staminaCost: 55,
    description:
      '九寨沟以翠海、叠瀑、彩林、雪峰、藏情"五绝"闻名。景区内共有114个海子，湖水清澈见底，色彩斑斓变幻。秋季漫山遍野的彩林倒映在碧蓝的湖水中，如同人间仙境。',
    location: { lat: 33.26, lng: 103.92 },
  },
  {
    id: "10",
    name: "长城·八达岭",
    reservation: RESERVATION_NOTES["长城·八达岭"],
    image: SPOT_PHOTOS["长城·八达岭"] ?? getCategoryImageUrl("历史人文", 1),
    address: "北京市延庆区G6京藏高速58号出口",
    facilities: [
      "缆车",
      "滑车",
      "停车场",
      "游客中心",
      "无障碍通道",
      "餐饮服务",
    ],
    projects: ["北八楼登顶", "南长城徒步", "长城夜景", "好汉坡打卡", "熊乐园"],
    category: "历史人文",
    staminaCost: 25,
    description:
      '八达岭长城是万里长城中最具代表性的段落，始建于明弘治十八年（1505年），海拔高度达1015米。"不到长城非好汉"使其成为到北京的必游之地。',
    location: { lat: 40.3588, lng: 116.0198 },
  },
  {
    id: "11",
    name: "长隆海洋王国",
    image: SPOT_PHOTOS["长隆海洋王国"] ?? getCategoryImageUrl("主题乐园", 1),
    address: "广东省珠海市横琴新区富祥湾长隆海洋王国",
    facilities: [
      "主题酒店",
      "亲子设施",
      "轮椅租赁",
      "婴儿车租赁",
      "餐厅",
      "急救站",
    ],
    projects: ["鲸鲨馆", "白鲸剧场", "海豚剧场", "鹦鹉过山车", "超级激流"],
    category: "主题乐园",
    staminaCost: 50,
    description:
      "长隆海洋王国是全球最大的海洋主题乐园之一，拥有多项吉尼斯世界纪录：全球最大的海洋鱼类展馆、最大的亚克力玻璃观景窗等。夜间烟花无人机汇演令人叹为观止。",
    location: { lat: 22.0996, lng: 113.5338 },
  },
  {
    id: "12",
    name: "鼓浪屿",
    image: SPOT_PHOTOS["鼓浪屿"] ?? getCategoryImageUrl("海滨度假", 1),
    address: "福建省厦门市思明区鼓浪屿",
    facilities: [
      "轮渡码头",
      "特色民宿",
      "美食街",
      "导游服务",
      "公共厕所",
      "急救站",
    ],
    projects: ["日光岩登顶", "菽庄花园", "皓月园", "风琴博物馆", "环岛漫步"],
    category: "海滨度假",
    staminaCost: 30,
    description:
      '鼓浪屿面积仅1.88平方公里，完好地保留了上千幢中外风格各异的建筑物，被誉为"万国建筑博览"。还被誉为"钢琴之岛"和"音乐之岛"，被列为世界文化遗产。',
    location: { lat: 24.4488, lng: 118.0646 },
  },
  {
    id: "13",
    name: "秦始皇兵马俑博物馆",
    reservation: RESERVATION_NOTES["秦始皇兵马俑博物馆"],
    image:
      SPOT_PHOTOS["秦始皇兵马俑博物馆"] ?? getCategoryImageUrl("历史人文", 1),
    address: "陕西省西安市临潼区秦陵路",
    facilities: ["讲解器租赁", "电瓶车", "停车场", "文创店", "餐饮区"],
    projects: [
      "一号坑参观",
      "铜车马展厅",
      "秦始皇帝陵",
      "《复活的军团》演出",
      "考古体验",
    ],
    category: "历史人文",
    staminaCost: 45,
    description:
      '秦始皇兵马俑被誉为"世界第八大奇迹"，数千件按真人比例烧制的陶俑军阵埋藏地下两千余年，形态无一雷同。一号坑的恢弘军阵最为震撼，铜车马工艺至今令人叹服。',
    location: { lat: 34.3841, lng: 109.2785 },
  },
  {
    id: "14",
    name: "杭州西湖风景名胜区",
    image:
      SPOT_PHOTOS["杭州西湖风景名胜区"] ?? getCategoryImageUrl("自然风光", 2),
    address: "浙江省杭州市西湖区龙井路",
    facilities: ["游船码头", "环湖观光车", "寄存处", "公共wifi", "医疗点"],
    projects: [
      "苏堤春晓漫步",
      "三潭印月游船",
      "雷峰塔登塔",
      "断桥残雪打卡",
      "音乐喷泉夜景",
    ],
    category: "自然风光",
    staminaCost: 55,
    description:
      '西湖三面环山、一面临城，"西湖十景"散落在湖光山色之间，是中国唯一一处列入世界文化遗产的湖泊类景点。四季景致各异，免费开放，适合慢游。',
    location: { lat: 30.2431, lng: 120.1445 },
  },
  {
    id: "15",
    name: "桂林漓江风景区",
    image: SPOT_PHOTOS["桂林漓江风景区"] ?? getCategoryImageUrl("自然风光", 3),
    address: "广西壮族自治区桂林市灵川县磨盘山码头",
    facilities: ["游船码头", "竹筏点", "电瓶车", "餐饮区", "摄影服务"],
    projects: [
      "磨盘山码头游船",
      "九马画山",
      "黄布倒影",
      "兴坪古镇",
      "遇龙河竹筏",
    ],
    category: "自然风光",
    staminaCost: 50,
    description:
      '漓江是喀斯特山水风光的精华段，乘船顺流而下，两岸青峰倒影如画，黄布倒影一段正是第五套人民币20元背面的取景地。"江作青罗带，山如碧玉簪"说的就是这里。',
    location: { lat: 25.269, lng: 110.289 },
  },
  {
    id: "16",
    name: "华山风景区",
    reservation: RESERVATION_NOTES["黄山风景区"],
    image: SPOT_PHOTOS["华山风景区"] ?? getCategoryImageUrl("山岳景区", 1),
    address: "陕西省渭南市华阴市玉泉路",
    facilities: ["索道", "游客中心", "山顶住宿", "医疗点", "装备租赁"],
    projects: ["北峰索道", "长空栈道", "苍龙岭", "东峰日出", "西峰索道"],
    category: "山岳景区",
    staminaCost: 90,
    description:
      '华山五峰如莲花盛开，自古以"奇险天下第一山"著称。长空栈道贴崖而行仅容一人通过，是勇敢者的名片；东峰观日出、苍龙岭走脊线，体力消耗全在这座山上。',
    location: { lat: 34.475, lng: 110.085 },
  },
  {
    id: "17",
    name: "泰山风景区",
    image: SPOT_PHOTOS["泰山风景区"] ?? getCategoryImageUrl("山岳景区", 1),
    address: "山东省泰安市泰山区红门路",
    facilities: ["索道", "徒步盘道", "山顶旅馆", "医疗点", "挑夫服务点"],
    projects: [
      "红门徒步登山",
      "中天门索道",
      "十八盘",
      "玉皇顶日出",
      "岱庙参观",
    ],
    category: "山岳景区",
    staminaCost: 88,
    description:
      '"五岳之首"泰山是历代帝王封禅之地，登顶玉皇顶观云海日出是经典体验。红门至南天门全程约七千级台阶，夜爬看日出的人流常年络绎不绝。',
    location: { lat: 36.254, lng: 117.101 },
  },
  {
    id: "18",
    name: "峨眉山风景区",
    image: SPOT_PHOTOS["峨眉山风景区"] ?? getCategoryImageUrl("山岳景区", 1),
    address: "四川省乐山市峨眉山市黄湾镇",
    facilities: ["索道", "猴区防护点", "寺庙住宿", "医疗点", "观光车站"],
    projects: ["金顶十方普贤", "雷洞坪猴区", "万年寺", "生态猴区", "温泉酒店"],
    category: "山岳景区",
    staminaCost: 85,
    description:
      '峨眉山是中国四大佛教名山之一，金顶十方普贤金像在云海之上熠熠生辉。从山脚到山顶落差近三千米，植被与气候垂直分布，生态猴区的藏酋猴是这里最有名的"原住民"。',
    location: { lat: 29.521, lng: 103.332 },
  },
  {
    id: "19",
    name: "乌镇风景区",
    image: SPOT_PHOTOS["乌镇风景区"] ?? getCategoryImageUrl("古镇村落", 1),
    address: "浙江省嘉兴市桐乡市乌镇石佛南路",
    facilities: ["游船", "电瓶车", "民宿接待", "寄存处", "餐饮区"],
    projects: ["西栅夜景", "染坊", "茅盾故居", "摇橹船", "乌村体验"],
    category: "古镇村落",
    staminaCost: 45,
    description:
      "乌镇是江南水乡的活标本，西栅的灯光夜景把小桥流水映成一幅流动的画。这里的染坊、酒坊和老邮局保留了百年前的生活肌理，世界互联网大会永久会址也设于此。",
    location: { lat: 30.748, lng: 120.486 },
  },
  {
    id: "20",
    name: "平遥古城",
    image: SPOT_PHOTOS["平遥古城"] ?? getCategoryImageUrl("古镇村落", 1),
    address: "山西省晋中市平遥县古城内",
    facilities: ["电瓶车", "导游讲解", "寄存处", "停车场", "餐饮区"],
    projects: [
      "古城墙骑行",
      "日昇昌票号",
      "县衙升堂表演",
      "《又见平遥》演出",
      "明清街夜游",
    ],
    category: "古镇村落",
    staminaCost: 40,
    description:
      '平遥古城是中国保存最完整的古代县城，1997年列入世界文化遗产。城内的日昇昌票号是中国第一家票号，堪称"现代银行的乡下祖父"，青砖灰瓦间尽是晋商往事。',
    location: { lat: 37.189, lng: 112.176 },
  },
  {
    id: "21",
    name: "凤凰古城",
    image: SPOT_PHOTOS["凤凰古城"] ?? getCategoryImageUrl("古镇村落", 1),
    address: "湖南省湘西土家族苗族自治州凤凰县",
    facilities: ["游船", "接驳车", "民宿接待", "停车场", "应急医疗点"],
    projects: ["沱江泛舟", "虹桥夜色", "沈从文故居", "苗寨体验", "沱江跳岩"],
    category: "古镇村落",
    staminaCost: 42,
    description:
      '凤凰古城依沱江而建，吊脚楼群临水而立，是沈从文笔下的"边城"。夜幕降临时江面灯影摇曳，泛舟其上是这里最经典的打开方式。',
    location: { lat: 27.948, lng: 109.599 },
  },
  {
    id: "22",
    name: "布达拉宫",
    image: SPOT_PHOTOS["布达拉宫"] ?? getCategoryImageUrl("历史人文", 1),
    address: "西藏自治区拉萨市城关区北京中路",
    facilities: ["预约制", "讲解器", "存包处", "医疗点", "转经道"],
    projects: ["宫殿主体参观", "珍宝馆", "药王山观景台", "宗角禄康公园转经"],
    category: "历史人文",
    staminaCost: 50,
    description:
      "布达拉宫矗立于拉萨红山之巅，海拔三千七百米，是藏式建筑的巅峰之作，1961年入选首批全国重点文物保护单位。参观需提前预约并严格限时，殿内禁止拍照。",
    location: { lat: 29.655, lng: 91.117 },
  },
  {
    id: "23",
    name: "敦煌莫高窟",
    image: SPOT_PHOTOS["敦煌莫高窟"] ?? getCategoryImageUrl("历史人文", 1),
    address: "甘肃省酒泉市敦煌市鸣沙山东麓",
    facilities: ["预约制", "摆渡车", "数字展示中心", "存包处", "应急医疗点"],
    projects: [
      "数字球幕影院",
      "实体洞窟参观",
      "藏经洞陈列馆",
      "鸣沙山月牙泉联游",
    ],
    category: "历史人文",
    staminaCost: 35,
    description:
      "莫高窟开凿于鸣沙山崖壁上，现存735个洞窟、四万五千平方米壁画，是世界现存规模最大的佛教艺术地。为保护壁画实行预约限流，数字中心的球幕电影是参观前菜。",
    location: { lat: 40.036, lng: 94.809 },
  },
  {
    id: "24",
    name: "东方明珠广播电视塔",
    image:
      SPOT_PHOTOS["东方明珠广播电视塔"] ?? getCategoryImageUrl("城市地标", 1),
    address: "上海市浦东新区世纪大道",
    facilities: ["电梯", "旋转餐厅", "寄存处", "停车场", "文创店"],
    projects: [
      "263米主观光层",
      "透明悬空廊",
      "城市历史陈列馆",
      "黄浦江游船联票",
    ],
    category: "城市地标",
    staminaCost: 30,
    description:
      "东方明珠塔高约468米，与外滩隔江相望，是上海天际线的坐标原点。259米处的全透明悬空观光廊脚下即是车水马龙的陆家嘴，胆量与风景在这里成正比。",
    location: { lat: 31.2397, lng: 121.4998 },
  },
  {
    id: "25",
    name: "重庆洪崖洞",
    image: SPOT_PHOTOS["重庆洪崖洞"] ?? getCategoryImageUrl("城市地标", 1),
    address: "重庆市渝中区嘉陵江滨江路",
    facilities: ["电梯", "观景平台", "停车场", "餐饮区", "应急通道"],
    projects: ["洪崖洞夜景", "千厮门大桥观景", "解放碑步行街", "两江夜游游船"],
    category: "城市地标",
    staminaCost: 28,
    description:
      '洪崖洞是依山就势而建的吊脚楼建筑群，夜晚灯火通明时神似动画里的"汤屋"，是重庆最出片的夜景地标。楼内十一层通高，从顶层出门还是马路，堪称8D魔幻。',
    location: { lat: 29.562, lng: 106.578 },
  },
  {
    id: "26",
    name: "青岛海滨风景区",
    image: SPOT_PHOTOS["青岛海滨风景区"] ?? getCategoryImageUrl("海滨度假", 1),
    address: "山东省青岛市市南区京山路",
    facilities: ["步行栈道", "观光船", "淋浴间", "停车场", "啤酒屋"],
    projects: [
      "栈桥回澜阁",
      "八大关漫步",
      "小麦岛日落",
      "啤酒博物馆",
      "第一海水浴场",
    ],
    category: "海滨度假",
    staminaCost: 38,
    description:
      "青岛的红瓦绿树、碧海蓝天浓缩在市南的海岸线上。栈桥是百年城市原点，八大关汇聚二十多国建筑风格，夏天再配一袋原浆啤酒，就是这座城市该有的样子。",
    location: { lat: 36.059, lng: 120.319 },
  },
  {
    id: "27",
    name: "北海银滩",
    image: SPOT_PHOTOS["北海银滩"] ?? getCategoryImageUrl("海滨度假", 1),
    address: "广西壮族自治区北海市银海区银滩大道",
    facilities: ["淋浴间", "遮阳伞租赁", "救生站", "餐饮区", "停车场"],
    projects: ["银滩漫步", "赶海拾贝", "侨港风情街", "涠洲岛两日游"],
    category: "海滨度假",
    staminaCost: 42,
    description:
      '银滩以"滩长平、沙细白、水温净、浪柔软、无鲨鱼"著称，石英砂在阳光下泛出银光，故名银滩。这里是国内少数适合赶海的都市海滩，傍晚的日落尤其温柔。',
    location: { lat: 21.406, lng: 109.135 },
  },
  {
    id: "28",
    name: "北京环球度假区",
    image: SPOT_PHOTOS["北京环球度假区"] ?? getCategoryImageUrl("主题乐园", 1),
    address: "北京市通州区北京环球大道",
    facilities: ["快速通道", "婴儿车租赁", "寄存处", "医疗点", "停车场"],
    projects: [
      "哈利·波特禁忌之旅",
      "霸天虎过山车",
      "侏罗纪世界大冒险",
      "功夫熊猫盖世之地",
      "花车巡游",
    ],
    category: "主题乐园",
    staminaCost: 70,
    description:
      "北京环球度假区是亚洲第三座环球影城，七大主题景区从霍格沃茨到功夫熊猫一应俱全。旺季热门项目排队常超一小时，预算宽松的话建议购买优速通。",
    location: { lat: 39.864, lng: 116.664 },
  },
  {
    id: "29",
    name: "灵隐寺",
    image: SPOT_PHOTOS["灵隐寺"] ?? getCategoryImageUrl("宗教寺庙", 1),
    address: "浙江省杭州市西湖区法云弄",
    facilities: ["香花券", "电瓶车", "素斋馆", "寄存处", "停车场"],
    projects: ["飞来峰造像", "大雄宝殿", "永福禅寺", "韬光观海", "素斋体验"],
    category: "宗教寺庙",
    staminaCost: 40,
    description:
      "灵隐寺始建于东晋，是中国佛教禅宗十大名刹之一，背靠北高峰、面朝飞来峰。飞来峰石窟造像三百余尊，五代至元代历时数百年凿成，与寺院的香火相映千年。",
    location: { lat: 30.241, lng: 120.097 },
  },
  {
    id: "30",
    name: "青海湖二郎剑景区",
    image:
      SPOT_PHOTOS["青海湖二郎剑景区"] ?? getCategoryImageUrl("自然风光", 1),
    address: "青海省海南藏族自治州共和县环湖西路",
    facilities: ["观光车", "游船", "骑行驿站", "医疗点", "停车场"],
    projects: ["二郎剑半岛", "环湖骑行", "油菜花海", "湖边骑马", "黑马河日出"],
    category: "自然风光",
    staminaCost: 58,
    description:
      "青海湖是中国最大的内陆咸水湖，湖面海拔三千一百余米。二郎剑景区伸入湖心，七月环湖油菜花开成金色绸带，是环青海湖骑行最受欢迎的一段。",
    location: { lat: 36.58, lng: 100.48 },
  },
];

// ═══ 预算沙盘估价：精确匹配 → 关键词推断 → 默认值；界面上标注为「估算」，用户可改价 ═══
const PROJECT_PRICES: Record<string, number> = {
  天门山玻璃栈道: 32,
  百龙天梯: 72,
  金鞭溪徒步: 0,
  袁家界观景台: 15,
  天子山云海: 0,
  太和殿参观: 60,
  珍宝馆: 10,
  钟表馆: 10,
  御花园漫步: 0,
  数字故宫体验: 40,
  创极速光轮: 80,
  "翱翔·飞越地平线": 90,
  加勒比海盗: 60,
  七个小矮人矿山车: 70,
  奇幻童话城堡: 50,
  "488米户外观景台": 150,
  极速云霄跳楼机: 60,
  摩天轮: 80,
  珠江夜游: 120,
  沙滩漫步: 0,
  潜水体验: 280,
  帆船出海: 200,
  摩托艇: 180,
  海边瑜伽: 0,
  迎客松打卡: 0,
  光明顶日出: 0,
  西海大峡谷: 25,
  飞来石: 0,
  云谷寺徒步: 0,
  四方街夜游: 0,
  木府参观: 45,
  纳西古乐欣赏: 160,
  黑龙潭公园: 0,
  束河古镇: 0,
  少林功夫表演: 80,
  塔林参观: 0,
  达摩洞朝拜: 0,
  武术体验课: 120,
  嵩山游览: 0,
  五花海: 0,
  珍珠滩瀑布: 0,
  诺日朗瀑布: 0,
  长海: 0,
  镜海倒影: 0,
  北八楼登顶: 0,
  南长城徒步: 0,
  长城夜景: 40,
  好汉坡打卡: 0,
  熊乐园: 50,
  鲸鲨馆: 180,
  白鲸剧场: 120,
  海豚剧场: 100,
  鹦鹉过山车: 90,
  超级激流: 70,
  日光岩登顶: 0,
  菽庄花园: 30,
  皓月园: 0,
  风琴博物馆: 15,
  环岛漫步: 0,
};

/* ═══ 关键词 → 价格推断 ═══ */
const KEYWORD_PRICES: Record<string, number> = {
  玻璃: 40,
  索道: 80,
  缆车: 80,
  电瓶车: 30,
  游船: 120,
  快艇: 180,
  潜水: 280,
  漂流: 150,
  骑马: 100,
  滑翔: 300,
  蹦极: 200,
  跳伞: 400,
  温泉: 100,
  表演: 100,
  演出: 120,
  博物馆: 30,
  展览: 20,
  体验: 60,
  夜游: 80,
  观光车: 25,
  小火车: 30,
  秋千: 10,
  攀岩: 80,
  射箭: 50,
  划船: 60,
  自行车: 40,
  帐篷: 80,
  露营: 100,
};

export function guessPrice(project: string): number {
  if (PROJECT_PRICES[project] !== undefined) return PROJECT_PRICES[project];
  for (const [kw, price] of Object.entries(KEYWORD_PRICES)) {
    if (project.includes(kw)) return price;
  }
  return 30; // 默认
}

// ═══ 拼音索引（搜索用）：全拼 + 首字母，均去声调、小写；按名称缓存 ═══
import { pinyin } from "pinyin-pro";

const pinyinCache = new Map<string, { full: string; initials: string }>();

export function getPinyinKeys(name: string): {
  full: string;
  initials: string;
} {
  let v = pinyinCache.get(name);
  if (!v) {
    v = {
      full: pinyin(name, {
        pattern: "pinyin",
        toneType: "none",
        type: "array",
      }).join(""),
      initials: pinyin(name, {
        pattern: "first",
        toneType: "none",
        type: "array",
      }).join(""),
    };
    pinyinCache.set(name, v);
  }
  return v;
}

// ═══ 出行装备清单：按景点分类推导（行程单「出行装备」卡用） ═══
export const CATEGORY_PACKLIST: Record<string, string[]> = {
  自然风光: ["登山杖", "防晒霜", "防滑鞋", "充足饮用水"],
  自然风景: ["登山杖", "防晒霜", "防滑鞋", "充足饮用水"],
  山岳景区: ["登山杖", "防晒霜", "防滑鞋", "便携雨衣"],
  海滨度假: ["防晒霜", "泳衣", "拖鞋", "遮阳帽"],
  历史人文: ["舒适的鞋", "遮阳伞", "少量现金"],
  历史文化: ["舒适的鞋", "遮阳伞", "少量现金"],
  宗教寺庙: ["舒适的鞋", "遮阳伞", "少量现金（香火）"],
  古镇村落: ["舒适的鞋", "驱蚊液", "少量现金"],
  主题乐园: ["充电宝", "便携雨衣", "小零食"],
  城市地标: ["相机", "交通卡"],
  美食小吃: ["湿纸巾", "健胃消食片"],
  轻运动: ["运动鞋", "毛巾", "电解质水"],
};

export const PACKLIST_UNIVERSAL = [
  "身份证/证件",
  "手机充电宝",
  "饮用水",
  "常用药品",
];

// ═══ 统一库：手工精选（全字段）在前 + 城市包 POI（同名跳过，保手工版） ═══
// 城市探索的 chips 是这个库的过滤器；POI 图片由浏览器直连高德 CDN，不占服务器出网。
import { CITY_POI_PACKS, type CityPoi } from "./city-pois.generated";
import { POI_DESCRIPTIONS, RESERVATION_NOTES } from "./poi-descriptions";
import { POI_PHOTOS } from "./poi-photos.generated";
import {
  SCENIC_LEVELS,
  EXTRA_SCENICS,
  MANUAL_SCENIC_LEVELS,
} from "./scenic-enrich.generated";

export function cityPoiToSpot(city: string, p: CityPoi, index: number): Spot {
  const short = city.replace(/市$/, "");
  return {
    id: `poi-${short}-${index}`,
    name: p.name,
    image: POI_PHOTOS[`${city}::${p.name}`] ?? p.image,
    // 相册多图不再内联在主包里（见 lib/poi-photos.ts），只留取数用的键
    photosKey: `${city}::${p.name}`,
    rating: p.rating,
    openTime: p.openTime,
    tel: p.tel,
    website: p.website,
    level: SCENIC_LEVELS[`${city}::${p.name}`],
    reservation: RESERVATION_NOTES[p.name],
    imageSource: p.image ? "amap" : undefined,
    address: p.address || `${city}（高德 POI）`,
    facilities: [],
    projects: [],
    category: p.category,
    description:
      POI_DESCRIPTIONS[`${city}::${p.name}`] ??
      "来自高德地图 POI（构建时打包）。信息以景区公示为准。",
    location: { lat: p.lat, lng: p.lng },
  };
}

// A 级名录反哺景点的粗分类（与 fetch-city-pois 的推断口径一致）
function inferScenicCategory(name: string): string {
  const n = name;
  if (/博物馆|纪念馆|文物|古迹|遗址|陵|故居|会馆|宫殿/.test(n))
    return "历史人文";
  if (/寺|庙|观$|庵|塔|教堂|清真/.test(n)) return "宗教寺庙";
  if (/古镇|古城|古村|老街|古街/.test(n)) return "古镇村落";
  if (/乐园|游乐|主题公园|影城/.test(n)) return "主题乐园";
  if (/山|峰|岭|湖|江|河|瀑布|峡谷|溶洞|森林|草原|泉|滩|湾|岛/.test(n))
    return "自然风光";
  return "城市地标";
}

export const LIBRARY_SPOTS: Spot[] = (() => {
  const manualNames = new Set(sampleSpots.map((s) => s.name));
  const pois = Object.entries(CITY_POI_PACKS)
    .flatMap(([city, list]) => list.map((p, i) => cityPoiToSpot(city, p, i)))
    .filter((s) => !manualNames.has(s.name));
  // A 级名录反向补充：库内没有的 3A+ 景区（骨架条目：等级+坐标，图走分类池降级）
  const known = new Set([...manualNames, ...pois.map((s) => s.name)]);
  const extras = EXTRA_SCENICS.filter((e) => !known.has(e.name)).map(
    (e, i) =>
      ({
        id: `scenic-${e.city}-${i}`,
        // 全国化：跨省同名景区保留（id 含城市不冲突），地址自带省份可被省份筛选命中
        name: e.name,
        image: "",
        address: e.address || `${e.city}（A级景区名录）`,
        facilities: [],
        projects: [],
        category: inferScenicCategory(e.name),
        level: e.level,
        reservation: RESERVATION_NOTES[e.name],
        description: `国家${e.level}级景区（2023 年全国 A 级景区名录）。详细信息以景区公示为准。`,
        location: { lat: e.lat, lng: e.lng },
      }) as Spot,
  );
  // 手工景点补等级 + 预约标注自动回填（只写显式的，避免每个条目手抄一遍）
  const manualWithLevel = sampleSpots.map((s) => ({
    ...s,
    level: MANUAL_SCENIC_LEVELS[s.name] ?? s.level,
    reservation: s.reservation ?? RESERVATION_NOTES[s.name],
  }));
  return [...manualWithLevel, ...pois, ...extras];
})();
