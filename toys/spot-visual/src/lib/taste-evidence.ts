// ════════════════════════════════════════════════════════════════════════
// 口味雷达的「依据」分层
//
// 结论先说：6 个维度里只有 2 个能接外部数据，其余没有可对表的公开量纲。
// 所以这里不给「全都有凭据」的假象，而是逐维度标出来源等级：
//
//   database —— 有营养库条目（USDA FoodData Central），能给出可核验的数值与 fdcId
//   scale    —— 有公开量表/法定参照（Scoville、蔗糖相对甜度、膳食指南钠上限），
//               量表定义端点，但「这道菜落在哪一档」仍是本项目判断
//   self     —— 没有公开量纲，纯本项目自评口径（酸/香/鲜）
//
// 自动匹配为什么只保留了两条：
//   拿 34 道菜去 FDC 检索，机器匹配出来的结果大面积错位（驴肉火烧 → Egg white sandwich、
//   盐水鸭 → Sauce, duck、手扒肉 → Navajo 羊肉饺子）。宁可留空，也不把别的东西的数据
//   贴到这道菜上。下面两条是逐条人工核对过描述确实对得上的。
// ════════════════════════════════════════════════════════════════════════
import type { TasteKey } from './food-data';

export type EvidenceLevel = 'database' | 'scale' | 'self';

export interface DimensionEvidence {
  key: TasteKey;
  name: string;
  level: EvidenceLevel;
  /** 依据名称（量表 / 数据库 / 无） */
  scale: string;
  /** 这个依据能支撑到什么程度 */
  note: string;
}

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  database: '营养库',
  scale: '量表',
  self: '自评',
};

export const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  database: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scale: 'bg-sky-50 text-sky-700 border-sky-200',
  self: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const TASTE_EVIDENCE: Record<TasteKey, DimensionEvidence> = {
  咸: {
    key: '咸',
    name: '咸度',
    level: 'database',
    scale: '钠含量 mg/100g（USDA FoodData Central）',
    note: '营养库有条目时直接给实测钠值；没条目的菜退回按用盐量定档，标为自评。',
  },
  甜: {
    key: '甜',
    name: '甜度',
    level: 'scale',
    scale: '蔗糖相对甜度（sucrose = 100）',
    note: '糖类相对甜度是公开基准；菜品甜度按加糖种类与用量定档，属换算而非实测。',
  },
  酸: {
    key: '酸',
    name: '酸度',
    level: 'self',
    scale: '无公开量表',
    note: '滴定酸度 / pH 没有菜品级公开数据，只能按是否以酸为骨架描述。',
  },
  辣: {
    key: '辣',
    name: '辣度',
    level: 'scale',
    scale: 'Scoville 量表（SHU）',
    note: '辣椒素浓度刻度公开可查；菜品辣度按所用辣椒品种的 SHU 区间定档，属换算。',
  },
  香: {
    key: '香',
    name: '香度',
    level: 'self',
    scale: '无公开量表',
    note: '香气强度缺少统一量纲（挥发性物质种类太多），按烹饪手法描述。',
  },
  鲜: {
    key: '鲜',
    name: '鲜度',
    level: 'self',
    scale: '无公开量表',
    note: '谷氨酸当量没有菜品级公开数据，按主要呈鲜食材描述。',
  },
};

/** Scoville 参照档位：用于解释辣度数值的落点，不参与打分计算。 */
export const SCOVILLE_BANDS = [
  { label: '不辣', range: '0 – 100 SHU', example: '甜椒' },
  { label: '微辣', range: '100 – 2.5k SHU', example: '二荆条、灯笼椒' },
  { label: '中辣', range: '2.5k – 15k SHU', example: '线椒、杭椒' },
  { label: '重辣', range: '15k – 50k SHU', example: '朝天椒、小米辣' },
  { label: '极辣', range: '50k SHU 以上', example: '海南黄灯笼、涮涮辣' },
];

export interface DishNutrition {
  /** USDA FoodData Central 的 fdcId，可在 fooddata.nal.usda.gov 按此编号复核 */
  fdcId: number;
  /** FDC 里的条目名 */
  description: string;
  /** 数据类型（FNDDS = 美国膳食调查库，SR Legacy = 经典成分库） */
  dataType: string;
  /** 钠 mg / 100g */
  sodiumMg: number;
  /** 糖 g / 100g */
  sugarsG: number;
  /** 该条目与本菜的对应关系说明（避免让人以为是「本菜实测」） */
  caveat: string;
}

export const DISH_NUTRITION: Record<string, DishNutrition> = {
  北京烤鸭: {
    fdcId: 2706141,
    description: 'Duck, Peking',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 287,
    sugarsG: 4.41,
    caveat: '对应 FDC 的「Duck, Peking」条目（美国膳食调查库），与本菜同名同做法，可作量级参照。',
  },
  锅包肉: {
    fdcId: 2706401,
    description: 'Sweet and sour pork',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 304,
    sugarsG: 10.3,
    caveat: '对应 FDC 的「Sweet and sour pork」（糖醋猪肉类做法），锅包肉同属挂糊糖醋汁，作量级参照。',
  },
  庐州烤鸭: {
    fdcId: 2706141,
    description: 'Duck, Peking',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 287,
    sugarsG: 4.41,
    caveat: 'FDC 只有北京烤鸭条目，庐州烤鸭是合肥的挂炉烤鸭，腌料与吃法不同，此处仅作烤鸭类的量级参照。',
  },
  扬州炒饭: {
    fdcId: 2708951,
    description: 'Rice, fried, meatless',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 361,
    sugarsG: 0.62,
    caveat: '对应 FDC 的「Rice, fried, meatless」（素炒饭），扬州炒饭含虾仁火腿，实际蛋白与钠略高。',
  },
  老边饺子: {
    fdcId: 2708344,
    description: 'Dumpling, no meat',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 428,
    sugarsG: 1.23,
    caveat: '对应 FDC 的「Dumpling」条目（素馅），荤馅饺子钠与脂肪更高，此处按同一量级参照。',
  },
  黑家饺子: {
    fdcId: 2708344,
    description: 'Dumpling, no meat',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 428,
    sugarsG: 1.23,
    caveat: '同「饺子」条目换算，牛肉馅实际钠含量更高，仅作量级参照。',
  },
  鲅鱼饺子: {
    fdcId: 2708344,
    description: 'Dumpling, no meat',
    dataType: 'Survey (FNDDS)',
    sodiumMg: 428,
    sugarsG: 1.23,
    caveat: '同「饺子」条目换算，鱼肉馅脂肪更低、鲜味更足，仅作量级参照。',
  },
};

/** 把钠含量映射成 0–100 的咸度刻度：0mg=0，800mg/100g=100。仅用于解释，不覆盖自评值。 */
export function sodiumToScore(sodiumMg: number): number {
  return Math.max(0, Math.min(100, Math.round((sodiumMg / 800) * 100)));
}

export function getDishNutrition(dish: string): DishNutrition | undefined {
  return DISH_NUTRITION[dish];
}
