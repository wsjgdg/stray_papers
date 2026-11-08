/**
 * 印象分与真话罐 · 换算层
 * 与沉默值、好感度构成人格三面：沉默值=私下的我，好感度=关系中的我，印象分=表演的我。
 * 印象分：沉默 delta ≥2 的选项视为「表演」，累计表演分后按全剧本满值归一化成 0-100 ——
 * 统计口径与 src/lib/affinity.ts 的坦诚度完全同构，全部从剧本自动推导，剧本文件零标注。
 * 真话罐：沉默 delta ≤0 的选项文案自动收进存档 truthJar（跨周目保留，语义同结局图鉴）。
 */
import { STORYLINES, STORY_SCRIPTS, type StorylineId } from "@/data/storylines";
import type { GameSaveData } from "@/lib/gameSave";

export interface ImpressionTier {
  id: string;
  /** 达到该档位所需的印象分（0-100） */
  threshold: number;
  label: string;
  blurb: string;
}

/** 档位称号：查无此蛙（0+）→ 眼熟（25+）→ 靠谱（50+）→ 明星蛙（75+）→ 模板（95+） */
export const IMPRESSION_TIERS: ImpressionTier[] = [
  { id: "unknown", threshold: 0, label: "查无此蛙", blurb: "点名册上翻不到这张脸" },
  { id: "familiar", threshold: 25, label: "眼熟", blurb: "……你是不是那个谁来着" },
  { id: "reliable", threshold: 50, label: "靠谱", blurb: "交代的事都办了，就是没蛙记得交过什么" },
  { id: "star", threshold: 75, label: "明星蛙", blurb: "合影站中间，横幅上有名字" },
  { id: "template", threshold: 95, label: "模板", blurb: "下一届的材料里，你是范例那一页" },
];

export function impressionTierOf(value: number): ImpressionTier {
  let matched = IMPRESSION_TIERS[0];
  for (const tier of IMPRESSION_TIERS) {
    if (value >= tier.threshold) matched = tier;
  }
  return matched;
}

let performancePoolCache: number | null = null;

/** 全剧本表演分满值：所有「表演」选项（沉默 delta ≥2）的分值之和，自动统计 */
export function getPerformancePool(): number {
  if (performancePoolCache !== null) return performancePoolCache;
  let pool = 0;
  for (const script of Object.values(STORY_SCRIPTS)) {
    if (!script) continue;
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const choice of scene.choices ?? []) {
          if (choice.silenceDelta >= 2) pool += choice.silenceDelta;
        }
      }
    }
  }
  performancePoolCache = pool;
  return pool;
}

/** 印象分：表演分 → 0-100（归一化口径同坦诚度） */
export function impressionPercent(points: number): number {
  const pool = getPerformancePool();
  if (pool <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((points / pool) * 100)));
}

/**
 * 校园公示栏评语（结局卡按印象分五档追加，文案本身就是批判）。
 * 区间严格对照规格：<25 / 25-50 / 50-75 / 75-95 / 95+。
 */
export function bulletinReviewOf(percent: number): string {
  if (percent >= 95) return "该生表现完美，作为模板供后续参考";
  if (percent >= 75) return "同学学习的榜样，多次活动照片入选";
  if (percent >= 50) return "积极性高，情绪稳定，值得信任";
  if (percent >= 25) return "表现平稳，未给集体添麻烦";
  return "该蛙存在感较低，建议多参加集体活动";
}

let truthTextsCache: string[] | null = null;

/** 全剧本真话全集：沉默 delta ≤0 的选项文案（按剧情线顺序去重），自动统计 */
export function getTruthTexts(): string[] {
  if (truthTextsCache) return truthTextsCache;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const meta of STORYLINES) {
    const script = STORY_SCRIPTS[meta.id];
    if (!script) continue;
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const choice of scene.choices ?? []) {
          if (choice.silenceDelta > 0) continue;
          if (seen.has(choice.text)) continue;
          seen.add(choice.text);
          out.push(choice.text);
        }
      }
    }
  }
  truthTextsCache = out;
  return out;
}

export interface TruthJarGroup {
  /** 所属剧情线；null = 现行剧本里找不到出处的散落真话 */
  lineId: StorylineId | null;
  lineTitle: string;
  /** 该线全部真话句数 */
  total: number;
  /** 已收进罐子的真话（按剧本顺序） */
  texts: string[];
}

export interface TruthJarReport {
  groups: TruthJarGroup[];
  /** 罐里的真话句数 */
  collected: number;
  /** 全剧本真话总数 */
  total: number;
  /** 全部真话都进罐了 */
  complete: boolean;
  /** 被抽走的句数（批次 CF）：计数还在，内容没了——像它没被写过 */
  taken: number;
}

/**
 * 把存档里的真话罐按剧情线分组，供结局图鉴展示。
 * vanished（批次 CF）：被抽走的那几句——不渲染，但计数不回滚（事实发生过，记录没了）。
 */
export function truthJarReport(save: GameSaveData, vanished?: string[]): TruthJarReport {
  const vanishedSet = new Set(vanished ?? []);
  const jar = new Set(save.truthJar);
  const groups: TruthJarGroup[] = [];
  const claimed = new Set<string>();
  for (const meta of STORYLINES) {
    const script = STORY_SCRIPTS[meta.id];
    if (!script) continue;
    const truths: string[] = [];
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const choice of scene.choices ?? []) {
          if (choice.silenceDelta > 0) continue;
          if (!truths.includes(choice.text)) truths.push(choice.text);
        }
      }
    }
    if (truths.length === 0) continue;
    const texts = truths.filter((text) => {
      if (!jar.has(text) || claimed.has(text)) return false;
      /* 消迹（批次 CF）：被抽走的那一句不渲染——计数还在，内容没了 */
      if (vanishedSet.has(text)) return false;
      claimed.add(text);
      return true;
    });
    groups.push({ lineId: meta.id, lineTitle: meta.title, total: truths.length, texts });
  }
  const leftovers = [...jar].filter((text) => !claimed.has(text) && !vanishedSet.has(text));
  if (leftovers.length > 0) {
    groups.push({ lineId: null, lineTitle: "散落的真话", total: leftovers.length, texts: leftovers });
  }
  const allTruths = getTruthTexts();
  const complete = allTruths.length > 0 && allTruths.every((text) => jar.has(text));
  return { groups, collected: jar.size, total: allTruths.length, complete, taken: vanishedSet.size };
}
