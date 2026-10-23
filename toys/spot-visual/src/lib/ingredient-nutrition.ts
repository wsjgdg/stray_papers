// ════════════════════════════════════════════════════════════════════════
// 主料参照数据 ·《中国食物成分表 标准版 第6版》「能量和食物一般营养成分」
//
// 数据取自公开仓库 Sanotsu/china-food-composition-data（原书表格 OCR + 人工校正）。
// 用途与边界：
//   - 这里给的是**主料（食材）**的每 100g 能量与钠，**不是整道菜**的实测值；
//   - 菜品数据依旧标「自评」，两者在 UI 上分开展示，不混为一谈；
//   - 只引用了个位数十几个条目并注明食品编号（foodCode），便于回原书核对。
// 单位：能量 kcal/100g，钠 mg/100g。
// ════════════════════════════════════════════════════════════════════════

export interface Ingredient {
  /** 原书食品编号，可据此回查 */
  code: string;
  name: string;
  energyKcal: number;
  sodiumMg: number;
  /** 形态说明，避免拿干制品和鲜品混用 */
  note?: string;
}

export const INGREDIENTS: Record<string, Ingredient> = {
  chickenBreast: { code: '091112', name: '鸡胸脯肉', energyKcal: 118, sodiumMg: 44.8 },
  chickenLeg: { code: '091113', name: '鸡腿', energyKcal: 146, sodiumMg: 73.6 },
  porkLeg: { code: '081103', name: '猪肉（后臀尖）', energyKcal: 336, sodiumMg: 57.5 },
  beefLeg: { code: '082103', name: '牛肉（后腿）', energyKcal: 106, sodiumMg: 45.4 },
  lambLeg: { code: '083116', name: '羊肉（后腿）', energyKcal: 111, sodiumMg: 93.8 },
  grassCarp: { code: '121102', name: '草鱼', energyKcal: 113, sodiumMg: 46.0 },
  carp: { code: '121111', name: '鲤鱼', energyKcal: 109, sodiumMg: 53.7 },
  shrimp: { code: '122106', name: '对虾', energyKcal: 93, sodiumMg: 165.2 },
  seaCucumber: { code: '129001', name: '海参', energyKcal: 78, sodiumMg: 502.9, note: '鲜品' },
  tofuSoft: { code: '031307', name: '豆腐（南豆腐）', energyKcal: 87, sodiumMg: 3.1 },
  egg: { code: '111101x', name: '鸡蛋（代表值）', energyKcal: 139, sodiumMg: 131.5 },
  wheatFlour: { code: '011201x', name: '小麦粉（代表值）', energyKcal: 359, sodiumMg: 14.1 },
  glutinousRice: { code: '012301', name: '糯米', energyKcal: 350, sodiumMg: 1.5 },
  cabbage: { code: '045101x', name: '大白菜（代表值）', energyKcal: 20, sodiumMg: 68.9 },
  woodEar: { code: '051014', name: '木耳（水发）', energyKcal: 27, sodiumMg: 8.5 },
  seaweed: { code: '052008', name: '紫菜（干）', energyKcal: 250, sodiumMg: 710.5 },
  roastDuck: { code: '092307', name: '烤鸭', energyKcal: 309, sodiumMg: 776.4, note: '加工品，已含调味' },
  soyBeef: { code: '082301', name: '酱牛肉', energyKcal: 246, sodiumMg: 869.2, note: '加工品，已含调味' },
  peanutOil: { code: '192007', name: '花生油', energyKcal: 899, sodiumMg: 3.5 },
};

export interface DishIngredients {
  items: string[];
  /** 为什么拿这个主料参照，以及与整道菜的差距 */
  caveat: string;
}

/** 34 道省级代表菜 → 主料。只映射有对应食品条目的主料，不硬凑。 */
export const DISH_INGREDIENTS: Record<string, DishIngredients> = {
  北京烤鸭: { items: ['roastDuck'], caveat: '用的是「烤鸭」加工品条目，已含挂糖与调味，比生鸭更接近成品。' },
  煎饼馃子: { items: ['wheatFlour', 'egg'], caveat: '主料为绿豆面与鸡蛋，成分表按小麦粉与鸡蛋代表值参照。' },
  驴肉火烧: { items: ['wheatFlour'], caveat: '驴肉在成分表中无独立条目，此处只给酥皮（小麦粉）参照。' },
  刀削面: { items: ['wheatFlour'], caveat: '面条生重参照，煮后吸水，实际每 100g 能量会大幅下降。' },
  手扒肉: { items: ['lambLeg'], caveat: '羊肉后腿生重参照，清水煮制不加盐，成菜钠接近主料。' },
  朝鲜冷面: { items: ['wheatFlour'], caveat: '冷面多用荞麦与淀粉，成分表无对应条目，按小麦粉参照。' },
  锅包肉: { items: ['porkLeg'], caveat: '里脊/后臀尖生重参照；挂糊油炸并浇糖醋汁，成菜能量与糖远高于主料。' },
  红烧肉: { items: ['porkLeg'], caveat: '五花肉生重参照；冰糖收汁与酱油使成菜能量、钠显著上升。' },
  盐水鸭: { items: ['roastDuck'], caveat: '鸭类加工品参照；盐水鸭是腌渍后煮，钠比烤鸭更高。' },
  西湖醋鱼: { items: ['grassCarp'], caveat: '草鱼生重参照；糖醋汁会明显增加糖。' },
  臭鳜鱼: { items: ['carp'], caveat: '鳜鱼无独立条目，按鲤鱼等淡水鱼参照；腌制发酵后钠远高于主料。' },
  佛跳墙: { items: ['seaCucumber', 'shrimp'], caveat: '取海参与虾两类主料参照；整坛还有鲍鱼、蹄筋与高汤，实际远不止这些。' },
  粉蒸肉: { items: ['porkLeg'], caveat: '五花肉生重参照；米粉与豆瓣酱会带来额外钠。' },
  葱烧海参: { items: ['seaCucumber'], caveat: '鲜海参本身钠较高，葱烧的酱油与高汤会再叠加。' },
  烩面: { items: ['wheatFlour', 'lambLeg'], caveat: '面与羊汤两类主料参照；羊汤含盐，成菜钠更高。' },
  清蒸武昌鱼: { items: ['grassCarp'], caveat: '武昌鱼属鳊鱼，成分表无条目，按草鱼参照；清蒸淋豉油会加钠。' },
  剁椒鱼头: { items: ['carp'], caveat: '鳙鱼头无条目，按鲤鱼参照；剁椒本身是腌制品，成菜钠极高。' },
  白切鸡: { items: ['chickenLeg'], caveat: '鸡腿肉生重参照；浸熟不加盐，成菜钠接近主料，靠蘸料补咸。' },
  螺蛳粉: { items: ['glutinousRice'], caveat: '米粉按米类参照；酸笋与螺蛳汤是钠的主要来源，主料数据无法体现。' },
  文昌鸡: { items: ['chickenLeg'], caveat: '鸡肉生重参照；白切做法成菜钠接近主料。' },
  重庆火锅: { items: ['cabbage'], caveat: '火锅无单一主料，这里取涮煮蔬菜参照；牛油锅底与蘸料的钠远高于此。' },
  麻婆豆腐: { items: ['tofuSoft'], caveat: '南豆腐本身钠极低（3.1mg），整道菜的钠几乎全部来自豆瓣酱与酱油。' },
  酸汤鱼: { items: ['grassCarp'], caveat: '鱼类主料参照；酸汤发酵带来的钠与酸度不在主料数据里。' },
  过桥米线: { items: ['glutinousRice'], caveat: '米线按米类参照；鸡汤与火腿片贡献主要钠。' },
  羊肉泡馍: { items: ['lambLeg', 'wheatFlour'], caveat: '羊肉与馍两类主料参照；羊汤含盐，整碗钠更高。' },
  兰州牛肉面: { items: ['beefLeg', 'wheatFlour'], caveat: '牛肉与面两类主料参照；清汤加盐与辣油是钠的主要来源。' },
  手抓羊肉: { items: ['lambLeg'], caveat: '羊肉生重参照；蘸椒盐会额外加钠。' },
  烩羊杂: { items: ['lambLeg'], caveat: '羊杂无独立条目，按羊肉参照；内脏的胆固醇与嘌呤另有差异。' },
  大盘鸡: { items: ['chickenLeg'], caveat: '鸡肉生重参照；豆瓣酱与土豆吸汁后整菜钠更高。' },
  叉烧: { items: ['porkLeg'], caveat: '猪肉生重参照；叉烧酱含糖含盐，成菜糖与钠显著上升。' },
  葡国鸡: { items: ['chickenLeg'], caveat: '鸡肉生重参照；椰浆与咖喱使脂肪和能量上升。' },
  卤肉饭: { items: ['porkLeg', 'glutinousRice'], caveat: '猪肉与米饭两类主料参照；卤汁是钠的主要来源。' },
};

/** 钠的分布区间，用来给「咸度」刻度做量纲锚定（B 方案） */
export const SODIUM_BANDS = [
  { label: '本味（蔬果、生鲜肉、豆腐）', range: '1 – 100 mg/100g', score: '0 – 12' },
  { label: '常规调味（家常炒菜、汤面）', range: '100 – 400 mg/100g', score: '12 – 50' },
  { label: '重盐（酱卤、腌腊、火锅）', range: '600 – 1500 mg/100g', score: '75 – 100' },
];

export function getDishIngredients(dish: string) {
  const hit = DISH_INGREDIENTS[dish];
  if (!hit) return null;
  const items = hit.items.map((k) => INGREDIENTS[k]).filter(Boolean);
  return items.length ? { items, caveat: hit.caveat } : null;
}
