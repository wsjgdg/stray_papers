// 本文件由 scripts/gen-dish-impact.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// price 为该条目的整份总价（元，原数据集口径），carbon/water/land 为整份环境足迹（g / L / m²）。
export interface DishImpact {
  db: string;
  price: number | null;
  carbon: number | null;
  water: number | null;
  land: number | null;
  weight: number | null;
}

export const DISH_IMPACT: Record<string, DishImpact> = {
  '东坡肉': { db: '东坡肉', price: 21.99, carbon: 5923.7, water: 0.4, land: 2.19, weight: 1101.0 },
  '临高烤乳猪': { db: '烤乳猪', price: 36.31, carbon: 4577.0, water: 0.4, land: 4.14, weight: 2156.0 },
  '佛跳墙': { db: '简式佛跳墙', price: 20.93, carbon: 2238.7, water: 0.1, land: 0.91, weight: 936.0 },
  '兴安烤羊腿': { db: '烤羊腿', price: 45.16, carbon: 7164.0, water: 0.5, land: 4.23, weight: 1041.0 },
  '剁椒鱼头': { db: '剁椒鱼头', price: 6.01, carbon: 2523.0, water: 0.0, land: 0.32, weight: 797.0 },
  '千张包子': { db: '湖州千张包', price: 11.65, carbon: 1865.4, water: 0.1, land: 0.97, weight: 1736.0 },
  '客家酿豆腐': { db: '酿豆腐', price: 11.31, carbon: 1873.0, water: 0.1, land: 1.29, weight: 1211.0 },
  '德州扒鸡': { db: '德州扒鸡', price: 16.31, carbon: 1502.5, water: 0.1, land: 1.48, weight: 657.0 },
  '扬州炒饭': { db: '扬州蛋炒饭', price: 17.43, carbon: 2899.6, water: 0.6, land: 1.95, weight: 1168.0 },
  '把子肉': { db: '把子肉', price: 12.46, carbon: 1859.2, water: 0.1, land: 0.65, weight: 568.0 },
  '无锡排骨': { db: '无锡排骨', price: 20.16, carbon: 2551.0, water: 0.2, land: 1.02, weight: 886.0 },
  '昌吉丸子汤': { db: '丸子汤', price: 6.01, carbon: 1077.6, water: 0.0, land: 0.24, weight: 319.0 },
  '松鼠桂鱼': { db: '松鼠鳜鱼', price: 51.45, carbon: 2298.3, water: 0.1, land: 1.4, weight: 1152.0 },
  '梅菜扣肉': { db: '梅菜扣肉', price: 14.51, carbon: 3393.4, water: 0.2, land: 1.47, weight: 750.0 },
  '毛氏红烧肉': { db: '毛氏红烧肉', price: 13.08, carbon: 3307.7, water: 0.2, land: 1.35, weight: 675.0 },
  '永州血鸭': { db: '炒血鸭', price: 20.72, carbon: 5899.3, water: 0.3, land: 2.33, weight: 1394.0 },
  '汽锅鸡': { db: '汽锅鸡', price: 23.27, carbon: 2007.0, water: 0.2, land: 2.44, weight: 1035.0 },
  '油焖大虾': { db: '油焖大虾', price: 16.58, carbon: 1294.8, water: 0.0, land: 0.14, weight: 578.0 },
  '淮南牛肉汤': { db: '淮南牛肉汤', price: 62.26, carbon: 16030.4, water: 1.1, land: 8.63, weight: 1240.0 },
  '猪血丸子': { db: '猪血丸子', price: 12.64, carbon: 2505.9, water: 0.2, land: 1.42, weight: 631.0 },
  '白切鸡': { db: '白切鸡', price: 6.79, carbon: 1012.9, water: 0.1, land: 1.03, weight: 521.0 },
  '盐水鸭': { db: '盐水鸭', price: 14.59, carbon: 1874.1, water: 0.2, land: 2.13, weight: 905.0 },
  '福州鱼丸': { db: '福州鱼丸汤', price: 70.11, carbon: 7089.4, water: 0.2, land: 1.86, weight: 1710.0 },
  '粉蒸肉': { db: '粉蒸肉', price: 12.16, carbon: 2084.0, water: 0.1, land: 1.54, weight: 807.0 },
  '红烧肉': { db: '红烧肉', price: 17.63, carbon: 1827.3, water: 0.0, land: 0.14, weight: 573.0 },
  '葱烧海参': { db: '葱烧海参', price: 20.26, carbon: 1778.8, water: 0.0, land: 0.26, weight: 1175.0 },
  '软兜长鱼': { db: '软兜长鱼', price: 58.35, carbon: 3125.2, water: 0.0, land: 0.1, weight: 1008.0 },
  '辣炒蛤蜊': { db: '辣炒蛤蜊', price: 6.89, carbon: 756.8, water: 0.0, land: 0.16, weight: 600.0 },
  '锅包肉': { db: '锅包肉', price: 7.47, carbon: 1156.8, water: 0.1, land: 0.51, weight: 437.0 },
  '麻婆豆腐': { db: '烧麻婆豆腐', price: 13.67, carbon: 2073.3, water: 0.1, land: 1.6, weight: 787.0 },
};
