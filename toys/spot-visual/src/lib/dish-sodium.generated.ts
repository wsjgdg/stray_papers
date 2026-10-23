// 本文件由 scripts/match-dish-sodium.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// 只保留派生结果：命中的库内菜名、每份钠含量、每份份数、以及该钠值在 3,302 道菜中的分位。
// 原始表不入库。
export interface DishSodium {
  /** 数据集里的菜名（可能与本项目用字略有差异） */
  db: string;
  /** 每份钠含量 mg */
  na: number;
  /** 该条目的份数 */
  serving: string;
  /** 在全集 3,302 道菜中的钠分位（0-100，越高越咸） */
  pct: number;
}

export const DISH_SODIUM: Record<string, DishSodium> = {
  '东坡肉': { db: '东坡肉', na: 390.2, serving: '5', pct: 37 },
  '东坡肘子': { db: '八宝糯米东坡肘子', na: 356.0, serving: '3', pct: 32 },
  '临高烤乳猪': { db: '烤乳猪', na: 381.9, serving: '5', pct: 35 },
  '佛跳墙': { db: '简式佛跳墙', na: 397.7, serving: '3', pct: 38 },
  '全羊汤锅': { db: '全羊汤', na: 593.7, serving: '4', pct: 63 },
  '兴安烤羊腿': { db: '烤羊腿', na: 555.5, serving: '4', pct: 58 },
  '剁椒鱼头': { db: '剁椒鱼头', na: 1611.1, serving: '3', pct: 96 },
  '卜肉': { db: '萝卜肉粥', na: 177.0, serving: '4', pct: 12 },
  '叉烧': { db: '叉烧包', na: 2835.8, serving: '5', pct: 99 },
  '客家酿豆腐': { db: '酿豆腐', na: 747.5, serving: '3', pct: 75 },
  '德州扒鸡': { db: '德州扒鸡', na: 640.2, serving: '3', pct: 67 },
  '把子肉': { db: '把子肉', na: 418.0, serving: '3', pct: 41 },
  '无锡排骨': { db: '无锡排骨', na: 217.6, serving: '3', pct: 15 },
  '昌吉丸子汤': { db: '丸子汤', na: 276.4, serving: '2', pct: 21 },
  '梅菜扣肉': { db: '梅菜扣肉', na: 1530.2, serving: '3', pct: 95 },
  '毛氏红烧肉': { db: '毛氏红烧肉', na: 459.5, serving: '3', pct: 46 },
  '毛豆腐': { db: '金毛豆腐', na: 435.1, serving: '3', pct: 43 },
  '汽锅鸡': { db: '汽锅鸡', na: 602.8, serving: '3', pct: 63 },
  '油焖大虾': { db: '油焖大虾', na: 800.4, serving: '3', pct: 78 },
  '淮南牛肉汤': { db: '淮南牛肉汤', na: 343.8, serving: '5', pct: 30 },
  '湛江白切鸡': { db: '白切鸡', na: 278.8, serving: '3', pct: 21 },
  '爆肚': { db: '芫爆肚仁', na: 315.2, serving: '3', pct: 26 },
  '猪血丸子': { db: '猪血丸子', na: 363.4, serving: '3', pct: 33 },
  '白切鸡': { db: '白切鸡', na: 278.8, serving: '3', pct: 21 },
  '白城烤羊腿': { db: '烤羊腿', na: 555.5, serving: '4', pct: 58 },
  '盐水鸭': { db: '盐水鸭', na: 3832.7, serving: '4', pct: 99 },
  '福州鱼丸': { db: '福州鱼丸汤', na: 550.4, serving: '3', pct: 58 },
  '米豆腐': { db: '虾米豆腐羹', na: 527.8, serving: '3', pct: 55 },
  '粉蒸肉': { db: '粉蒸肉', na: 545.3, serving: '3', pct: 57 },
  '红烧肉': { db: '红烧肉', na: 864.1, serving: '3', pct: 81 },
  '红焖羊肉': { db: '栗子红焖羊肉', na: 493.1, serving: '3', pct: 50 },
  '臭豆腐': { db: '长沙臭豆腐', na: 120.6, serving: '3', pct: 8 },
  '葱烧海参': { db: '葱烧海参', na: 1173.3, serving: '3', pct: 91 },
  '软兜长鱼': { db: '软兜长鱼', na: 399.8, serving: '3', pct: 38 },
  '辣炒蛤蜊': { db: '辣炒蛤蜊', na: 666.4, serving: '2', pct: 69 },
  '金华火腿': { db: '金华火腿酥', na: 775.9, serving: '3', pct: 77 },
  '锅包肉': { db: '锅包肉', na: 370.5, serving: '3', pct: 34 },
  '麻婆豆腐': { db: '烧麻婆豆腐', na: 467.9, serving: '3', pct: 47 },
  '黄冈东坡肉': { db: '东坡肉', na: 390.2, serving: '5', pct: 37 },
};

export const SODIUM_DATASET_SIZE = 3302;
