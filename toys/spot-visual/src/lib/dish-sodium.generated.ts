// 本文件由 scripts/gen-dish-sodium.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// 只保留派生结果：命中的库内菜名、每份钠、份数、该钠值在 3,302 道菜中的分位。
// match 字段说明匹配强度：exact=同名或仅差前缀，manual=人工确认的地名/异名变体，fuzzy=高相似度自动匹配。
export interface DishSodium {
  db: string;
  na: number;
  serving: string;
  pct: number;
  match: 'exact' | 'manual' | 'fuzzy';
}

export const DISH_SODIUM: Record<string, DishSodium> = {
  '东坡肉': { db: '东坡肉', na: 390.2, serving: '5', pct: 37, match: 'exact' },
  '临高烤乳猪': { db: '烤乳猪', na: 381.9, serving: '5', pct: 35, match: 'manual' },
  '佛跳墙': { db: '简式佛跳墙', na: 397.7, serving: '3', pct: 38, match: 'exact' },
  '兴安烤羊腿': { db: '烤羊腿', na: 555.5, serving: '4', pct: 58, match: 'manual' },
  '剁椒鱼头': { db: '剁椒鱼头', na: 1611.1, serving: '3', pct: 96, match: 'exact' },
  '千张包子': { db: '湖州千张包', na: 964.6, serving: '3', pct: 85, match: 'manual' },
  '客家酿豆腐': { db: '酿豆腐', na: 747.5, serving: '3', pct: 75, match: 'manual' },
  '德州扒鸡': { db: '德州扒鸡', na: 640.2, serving: '3', pct: 67, match: 'exact' },
  '扬州炒饭': { db: '扬州蛋炒饭', na: 513.1, serving: '4', pct: 53, match: 'fuzzy' },
  '把子肉': { db: '把子肉', na: 418.0, serving: '3', pct: 41, match: 'exact' },
  '无锡排骨': { db: '无锡排骨', na: 217.6, serving: '3', pct: 15, match: 'exact' },
  '昌吉丸子汤': { db: '丸子汤', na: 276.4, serving: '2', pct: 21, match: 'manual' },
  '松鼠桂鱼': { db: '松鼠鳜鱼', na: 540.3, serving: '3', pct: 56, match: 'manual' },
  '梅菜扣肉': { db: '梅菜扣肉', na: 1530.2, serving: '3', pct: 95, match: 'exact' },
  '毛氏红烧肉': { db: '毛氏红烧肉', na: 459.5, serving: '3', pct: 46, match: 'exact' },
  '永州血鸭': { db: '炒血鸭', na: 259.7, serving: '4', pct: 19, match: 'manual' },
  '汽锅鸡': { db: '汽锅鸡', na: 602.8, serving: '3', pct: 63, match: 'exact' },
  '油焖大虾': { db: '油焖大虾', na: 800.4, serving: '3', pct: 78, match: 'exact' },
  '淮南牛肉汤': { db: '淮南牛肉汤', na: 343.8, serving: '5', pct: 30, match: 'exact' },
  '猪血丸子': { db: '猪血丸子', na: 363.4, serving: '3', pct: 33, match: 'exact' },
  '白切鸡': { db: '白切鸡', na: 278.8, serving: '3', pct: 21, match: 'exact' },
  '盐水鸭': { db: '盐水鸭', na: 3832.7, serving: '4', pct: 99, match: 'exact' },
  '福州鱼丸': { db: '福州鱼丸汤', na: 550.4, serving: '3', pct: 58, match: 'fuzzy' },
  '粉蒸肉': { db: '粉蒸肉', na: 545.3, serving: '3', pct: 57, match: 'exact' },
  '红烧肉': { db: '红烧肉', na: 864.1, serving: '3', pct: 81, match: 'exact' },
  '葱烧海参': { db: '葱烧海参', na: 1173.3, serving: '3', pct: 91, match: 'exact' },
  '软兜长鱼': { db: '软兜长鱼', na: 399.8, serving: '3', pct: 38, match: 'exact' },
  '辣炒蛤蜊': { db: '辣炒蛤蜊', na: 666.4, serving: '2', pct: 69, match: 'exact' },
  '锅包肉': { db: '锅包肉', na: 370.5, serving: '3', pct: 34, match: 'exact' },
  '麻婆豆腐': { db: '烧麻婆豆腐', na: 467.9, serving: '3', pct: 47, match: 'exact' },
};

export const SODIUM_DATASET_SIZE = 3302;
