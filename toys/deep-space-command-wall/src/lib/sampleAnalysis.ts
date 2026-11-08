// 样品舱分析化验：以样品编号字符串做种子的确定性伪随机（mulberry32），
// 同一样品重复打开报告结果恒定；按 mission 语境生成月壤 / 火星壤成分报告。
import type { MissionId } from "@/lib/missions";

export type SampleGrade = "S" | "A" | "B" | "C";

export interface SampleMineral {
  name: string;
  pct: number;
}

export interface SampleReport {
  sampleCode: string;
  siteName: string;
  missionId: MissionId;
  /** 矿物组成百分比（合计 100） */
  minerals: SampleMineral[];
  /** 微量项说明（月壤: 氦-3 / 火星壤: 高氯酸盐） */
  traceNote: string;
  waterSignal: boolean;
  waterPpm: number;
  /** 平均粒径 (μm) */
  grainSizeUm: number;
  /** 莫氏硬度 */
  hardnessMohs: number;
  grade: SampleGrade;
  summary: string;
  /** 冰下海洋直取水样（W 编号特殊样品）: 报告走海水化学分支 */
  oceanWater?: boolean;
  /** 宜居度指数 0-100（仅海洋水样报告携带） */
  habitability?: number;
  /** 泰坦甲烷湖岸碳氢样品（HC 编号）: 报告走低温有机化学分支 */
  hydrocarbon?: boolean;
}

/** 化验流程四段：破碎 → 光谱扫描 → 成分解析 → 出报告 */
export interface AnalysisStageDef {
  id: string;
  label: string;
  /** 该段结束时的进度阈值 */
  until: number;
}

export const ANALYSIS_STAGES: AnalysisStageDef[] = [
  { id: "crush", label: "样品破碎", until: 0.25 },
  { id: "spectrum", label: "光谱扫描", until: 0.55 },
  { id: "resolve", label: "成分解析", until: 0.85 },
  { id: "report", label: "生成报告", until: 1.01 },
];

/** 化验全程时长（秒） */
export const ANALYSIS_TOTAL_S = 5.5;

export function analysisStageAt(progress: number): { index: number; label: string } {
  for (let i = 0; i < ANALYSIS_STAGES.length; i += 1) {
    if (progress < ANALYSIS_STAGES[i].until) return { index: i, label: ANALYSIS_STAGES[i].label };
  }
  const last = ANALYSIS_STAGES.length - 1;
  return { index: last, label: ANALYSIS_STAGES[last].label };
}

/* ---------------- 确定性伪随机 ---------------- */

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 报告生成 ---------------- */

const LUNA_MINERALS = ["橄榄石", "辉石", "斜长石", "钛铁矿", "磁铁矿", "撞击玻璃珠"];
const MARS_MINERALS = ["橄榄石", "辉石", "长石", "磁铁矿", "赤铁矿", "硫酸盐矿物"];
const EUROPA_MINERALS = ["水冰", "硫酸镁", "氯化钠", "二氧化碳冰", "层状硅酸盐", "有机大分子"];
const VENUS_MINERALS = ["黄铁矿", "方铅矿", "硬石膏", "辉石", "斜长石", "硫酸盐矿物"];
const TITAN_MINERALS = ["水冰", "甲烷冰", "托林", "氨水合物", "二氧化碳冰", "有机聚合物"];
/** 冰下海洋水样（W 编号）: 海水化学溶质谱, 与普通冰壤岩屑报告完全不同 */
const OCEAN_SOLUTES = ["氯化钠", "硫酸镁", "氯化钾", "碳酸钙", "溶解二氧化硅", "有机大分子"];
/** 泰坦甲烷湖岸碳氢样品（HC 编号）: 低温碳氢化学谱 */
const HYDROCARBON_SOLUTES = ["甲烷冰", "乙烷冰", "托林", "乙炔", "氰化氢聚合物", "丙烷冰"];

const GRADE_SUMMARY: Record<SampleGrade, string> = {
  S: "科学价值极高，建议列为优先回传候选样品，舱内加密封存。",
  A: "科学价值较高，成分组合具有典型研究意义，建议保持封装完整。",
  B: "科学价值中等，可作为区域地质背景的对照样品。",
  C: "科学价值一般，以常规岩屑与风化产物为主，留作备份样品。",
};

function buildMinerals(rng: () => number, names: string[]): SampleMineral[] {
  const weights = names.map(() => 0.35 + rng() * rng() * 2.2);
  const total = weights.reduce((s, w) => s + w, 0);
  const minerals = names.map((name, i) => ({
    name,
    pct: Math.round((weights[i] / total) * 1000) / 10,
  }));
  // 修正舍入误差，保证合计恰好 100.0
  const sum = minerals.reduce((s, m) => s + m.pct, 0);
  const drift = Math.round((100 - sum) * 10) / 10;
  const top = minerals.reduce((best, m) => (m.pct > best.pct ? m : best), minerals[0]);
  top.pct = Math.round((top.pct + drift) * 10) / 10;
  return minerals.sort((a, b) => b.pct - a.pct);
}

export function buildSampleReport(input: {
  sampleCode: string;
  siteName: string;
  missionId: MissionId;
  /** 采样点的遥感预测评级（坐标散列）——真实化验 score 向其倾斜: S +0.3 / A +0.12 / B 0 */
  predGrade?: "S" | "A" | "B";
  /** 新鲜冰晶窗口加成（欧罗巴冰裂隙喷发玩法）：强制覆盖化验评级, 优先于 score 计算 */
  forceGrade?: SampleGrade;
}): SampleReport {
  const kind =
    input.missionId === "luna9"
      ? "luna"
      : input.missionId === "ares1"
        ? "mars"
        : input.missionId === "venus1"
          ? "venus"
          : input.missionId === "titan1"
            ? "titan"
            : "europa";
  const rng = mulberry32(hashSeed(`${input.missionId}:${input.sampleCode}:${input.siteName}`));

  // 冰下海洋直取水样（W 编号）: 专属海水化学报告——液态水体、含盐谱、恒定 S 级
  if (input.sampleCode.includes("-W")) {
    const solutes = buildMinerals(rng, OCEAN_SOLUTES);
    const salinityGl = Math.round((18 + rng() * 22) * 10) / 10;
    const ph = Math.round((6.8 + rng() * 1.6) * 10) / 10;
    return {
      sampleCode: input.sampleCode,
      siteName: input.siteName,
      missionId: input.missionId,
      minerals: solutes,
      traceNote: `检出过氧化氢 ${(0.6 + rng() * 1.8).toFixed(1)} ppm 与氨 ${(2 + rng() * 9).toFixed(1)} ppm（冰壳辐照产物经裂隙带入）; pH 约 ${ph}, 盐度约 ${salinityGl} g/L, 与地球深海水化学高度相似`,
      waterSignal: true,
      waterPpm: Math.round(880000 + rng() * 90000), // 液态水体: 含水 ~88-97 万 ppm
      grainSizeUm: 0,
      hardnessMohs: 0,
      grade: "S",
      summary: `木卫二冰下海洋直接水样——人类航天史上首次取得外星海洋液态水体。盐度与 pH 落在宜居区间, 溶质谱指示水岩反应活跃, 建议列为最高优先级回传样品。`,
      oceanWater: true,
      habitability: Math.round(72 + rng() * 24),
    };
  }

  // 泰坦甲烷湖岸碳氢样品（HC 编号）: 低温有机化学分支, 评级享湖岸富集加成
  const hydrocarbon = kind === "titan" && input.sampleCode.includes("-HC");

  const minerals = buildMinerals(
    rng,
    hydrocarbon
      ? HYDROCARBON_SOLUTES
      : kind === "luna"
        ? LUNA_MINERALS
        : kind === "mars"
          ? MARS_MINERALS
          : kind === "venus"
            ? VENUS_MINERALS
            : kind === "titan"
              ? TITAN_MINERALS
              : EUROPA_MINERALS,
  );

  // 冰世界含水信号概率远高于岩质天体; 金星高温脱水, 含水信号近乎绝迹; 泰坦表面以碳氢为主, 水冰基底次之
  const waterSignal =
    rng() <
    (kind === "luna"
      ? 0.22
      : kind === "mars"
        ? 0.34
        : kind === "venus"
          ? 0.05
          : kind === "titan"
            ? hydrocarbon
              ? 0.08
              : 0.4
            : 0.62);
  const waterPpm = waterSignal
    ? kind === "venus"
      ? Math.round(rng() * 8)
      : Math.round(
          (kind === "europa" ? 4000 : kind === "titan" ? 2200 : 40) +
            rng() * (kind === "europa" ? 18000 : kind === "titan" ? 9000 : 240),
        )
    : Math.round(rng() * 15);
  const grainSizeUm = Math.round(35 + rng() * 165);
  // 冰壤样品硬度显著低于岩屑; 泰坦碳氢沉积物更松软
  const hardnessMohs =
    kind === "europa"
      ? Math.round((1.6 + rng() * 2.8) * 10) / 10
      : kind === "titan"
        ? Math.round((1.2 + rng() * (hydrocarbon ? 1.6 : 2.4)) * 10) / 10
        : Math.round((3.2 + rng() * 3.3) * 10) / 10;

  const rareMineral =
    kind === "luna"
      ? "钛铁矿"
      : kind === "mars"
        ? "赤铁矿"
        : kind === "venus"
          ? "黄铁矿"
          : kind === "titan"
            ? "托林"
            : "层状硅酸盐";
  const rarePct = minerals.find((m) => m.name === rareMineral)?.pct ?? 0;
  // 遥感预测倾斜：预测 S 的点位真实化验也更容易出高评级（S +0.3 / A +0.12 / B 不加成）
  const predBias = input.predGrade === "S" ? 0.3 : input.predGrade === "A" ? 0.12 : 0;
  // 湖岸碳氢富集加成：甲烷湖沉积物有机质高度富集, S 级概率显著上浮
  const hcBias = hydrocarbon ? 0.25 : 0;
  const score = rng() * 0.85 + predBias + hcBias + (waterSignal ? 0.3 : 0) + (rarePct >= 12 ? 0.18 : 0) + (hardnessMohs >= 5.5 ? 0.08 : 0);
  const grade: SampleGrade = input.forceGrade ?? (score >= 1.08 ? "S" : score >= 0.82 ? "A" : score >= 0.52 ? "B" : "C");

  const traceNote =
    kind === "luna"
      ? `氦-3 微量 ${(0.8 + rng() * 3.4).toFixed(1)} ppm，为太阳风注入产物，具长期能源研究价值`
      : kind === "mars"
        ? `检出高氯酸盐微量 (${Math.round(120 + rng() * 480)} ppm)，为火星壤典型化学特征`
        : kind === "venus"
          ? `检出二氧化硫微量 (${Math.round(40 + rng() * 160)} ppm) 与酸雾蚀变壳层，为金星表面高温高压硫化环境的典型化学特征`
          : kind === "titan"
            ? hydrocarbon
              ? `检出氰化氢聚合物 (${(12 + rng() * 60).toFixed(1)} ppm) 与乙炔凝结物，碳氢比例指示湖泊蒸发沉积旋回，为前生命有机化学的关键证据`
              : `检出托林微量 (${(20 + rng() * 140).toFixed(1)} ppm) 与吸附甲烷，为泰坦表面低温光化学有机沉降的典型特征`
            : `检出过氧化氢微量 (${(0.4 + rng() * 2.2).toFixed(1)} ppm)，为冰壳受辐照裂解产物，与有机质共存具前生命化学意义`;

  return {
    sampleCode: input.sampleCode,
    siteName: input.siteName,
    missionId: input.missionId,
    minerals,
    traceNote,
    waterSignal,
    waterPpm,
    grainSizeUm,
    hardnessMohs,
    grade,
    summary:
      hydrocarbon && grade === "S"
        ? "甲烷湖岸碳氢沉积极品样品——乙烷冰与托林层理清晰, 完整记录湖泊蒸发沉积旋回, 建议列为最高优先级回传样品。"
        : GRADE_SUMMARY[grade],
    ...(hydrocarbon ? { hydrocarbon: true } : {}),
  };
}
