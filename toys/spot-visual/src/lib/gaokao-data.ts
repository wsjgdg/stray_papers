// ════════════════════════════════════════════════════════════════════════
// 志愿探索 · 高考数据层
//
// 数据：GaokaoCompass 数据集（MIT 授权）经 scripts/fetch-gaokao-data.mjs
// 压缩生成的静态 JSON（public/data/gaokao-2025.json），覆盖 2025 年
// 28 个省市的本科普通批院校投档线与一分一段表。
//
// 页面挂载时 fetch 该文件并调用 loadFullDataset()，之后所有读取走
// active*() 系列接口。数据未加载完成时接口返回空值，页面显示加载态。
//
// ⚠️ 数据性质：第三方整理的非官方数据（源自公开报道与考试院公告），
// 仅供演示与参考，正式填报请以省级教育考试院官方数据为准。
// ════════════════════════════════════════════════════════════════════════

export const GAOKAO_DATA_URL = "/data/gaokao-2025.json";
export const GAOKAO_ENRICH_URL = "/data/gaokao-enrich.json";

export interface School {
  code: string;
  name: string;
  prov: string; // 所在地（省/直辖市）
  is985: boolean;
  is211: boolean;
  isDFC: boolean; // 双一流（优先用软科官方标签，未上榜时回退数据集 flags + 内置名单）
  isPrivate: boolean;
  category?: string; // 院校类型（综合/理工/师范…，软科）
  rank?: string; // 软科中国大学排名（如 "14"；"500+" 为并列区间）
  rankNum?: number; // 排名数值（500+ 记 500，用于筛选）
  rankScore?: number; // 软科综合得分（500+ 无得分）
  aPlus?: number; // 第四轮学科评估 A+ 学科数
  aClass?: number; // A+ / A / A- 学科总数
  topDisc?: string[]; // A+ 学科名称（最多 4 个）
}

export interface Admission {
  schoolCode: string;
  prov: string; // 招生省份（中文）
  year: number;
  cat: string; // 科类
  batch: string;
  minScore: number;
  minRank: number;
  planCount?: number; // 该校在该省该科类的本科招生计划人数（专业组合计）
  scoreDelta?: number; // 投档线同比（2025 - 2024，正=涨分）
  planDelta?: number; // 招生计划同比（正=扩招）
}

// ── 生成的 JSON 结构（scripts/fetch-gaokao-data.mjs 输出） ──
export type AdmRow = [
  code: string,
  name: string,
  batch: string,
  minScore: number,
  minRank: number,
  loc: string,
  flags: number,
  planCount: number | null,
  scoreDelta: number | null,
  planDelta: number | null,
];

export interface RealCatData {
  ctrl?: number; // 本科批省控线
  curve?: [number, number][]; // 一分一段表：[score, 累计位次]，按分降序
  adm: AdmRow[];
}

export interface RealDataset {
  v: number;
  year: number;
  src: string;
  provs: Record<string, Record<string, RealCatData>>;
}

// ── 双一流（非 985/211 部分）内置名单，仅在软科增强数据未覆盖时兜底 ──
const DFC_EXTRA = new Set([
  "中国科学院大学",
  "首都师范大学",
  "外交学院",
  "中国人民公安大学",
  "中国音乐学院",
  "中央美术学院",
  "中央戏剧学院",
  "天津工业大学",
  "天津中医药大学",
  "山西大学",
  "上海海洋大学",
  "上海中医药大学",
  "上海体育大学",
  "上海体育学院",
  "上海音乐学院",
  "上海科技大学",
  "南京邮电大学",
  "南京林业大学",
  "南京信息工程大学",
  "南京中医药大学",
  "南京医科大学",
  "中国美术学院",
  "宁波大学",
  "河南大学",
  "湘潭大学",
  "华南农业大学",
  "广州医科大学",
  "广州中医药大学",
  "成都理工大学",
  "西南石油大学",
  "成都中医药大学",
  "南方科技大学",
]);

// ── 运行时数据与索引 ──
let REAL: RealDataset | null = null;
let schoolIndex = new Map<string, School>();
let admIndex = new Map<string, Admission[]>(); // "prov|cat" → 投档线列表
let curveIndex = new Map<string, [number, number][]>(); // "prov|cat" → 一分一段

function buildIndexes(data: RealDataset) {
  schoolIndex = new Map();
  admIndex = new Map();
  curveIndex = new Map();
  for (const [prov, cats] of Object.entries(data.provs)) {
    for (const [cat, cd] of Object.entries(cats)) {
      admIndex.set(
        `${prov}|${cat}`,
        cd.adm.map(
          ([
            code,
            ,
            batch,
            minScore,
            minRank,
            ,
            ,
            planCount,
            scoreDelta,
            planDelta,
          ]) => ({
            schoolCode: code,
            prov,
            year: data.year,
            cat,
            batch,
            minScore,
            minRank,
            planCount: planCount ?? undefined,
            scoreDelta: scoreDelta ?? undefined,
            planDelta: planDelta ?? undefined,
          }),
        ),
      );
      if (cd.curve?.length) curveIndex.set(`${prov}|${cat}`, cd.curve);
      for (const [code, name, , , , loc, flags] of cd.adm) {
        if (schoolIndex.has(code)) continue;
        schoolIndex.set(code, {
          code,
          name,
          prov: loc,
          is985: (flags & 1) !== 0,
          is211: (flags & 2) !== 0,
          isDFC: (flags & 1) !== 0 || (flags & 2) !== 0 || DFC_EXTRA.has(name),
          isPrivate: (flags & 4) !== 0,
        });
      }
    }
  }
}

/** 页面挂载后载入生成的 JSON；结构非法返回 false */
export function loadFullDataset(data: RealDataset): boolean {
  if (!data || typeof data !== "object" || !data.provs) return false;
  REAL = data;
  buildIndexes(data);
  return true;
}

// ── 增强数据（排名 / 官方层次标签 / 学科评估） ──

interface EnrichEntry {
  name: string;
  rank?: string | null;
  rankNum?: number | null;
  score?: number | null;
  tags?: string[];
  category?: string;
  aPlus?: number;
  a?: number;
  aMinus?: number;
  topDisc?: string[];
}

export interface EnrichDataset {
  v: number;
  rankSrc: string;
  evalSrc: string;
  unis: Record<string, EnrichEntry>;
}

/** 跨源校名匹配：去掉全角/半角括号内容与空白 */
function normName(n: string): string {
  return String(n)
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, "");
}

let enrichIndex = new Map<string, EnrichEntry>();
let RANK_SRC = "";
let EVAL_SRC = "";

/** 合并增强数据进院校索引；覆盖 985/211/双一流 为软科官方标签 */
export function loadEnrichDataset(data: EnrichDataset): boolean {
  if (!data || typeof data !== "object" || !data.unis) return false;
  enrichIndex = new Map();
  for (const [k, v] of Object.entries(data.unis)) enrichIndex.set(k, v);
  RANK_SRC = data.rankSrc ?? "";
  EVAL_SRC = data.evalSrc ?? "";
  for (const s of schoolIndex.values()) {
    const e = enrichIndex.get(normName(s.name));
    if (!e) continue;
    if (e.tags?.length) {
      s.is985 = e.tags.includes("985");
      s.is211 = e.tags.includes("211");
      s.isDFC = e.tags.includes("双一流") || s.is985 || s.is211;
    }
    if (e.rank) {
      s.rank = e.rank;
      s.rankNum = e.rankNum ?? undefined;
    }
    if (typeof e.score === "number") s.rankScore = e.score;
    if (e.category) s.category = e.category;
    const aTotal = (e.aPlus ?? 0) + (e.a ?? 0) + (e.aMinus ?? 0);
    if (aTotal > 0) {
      s.aPlus = e.aPlus ?? 0;
      s.aClass = aTotal;
      s.topDisc = e.topDisc ?? [];
    }
  }
  return true;
}

export function isEnriched(): boolean {
  return enrichIndex.size > 0;
}

export function enrichSources(): { rankSrc: string; evalSrc: string } {
  return { rankSrc: RANK_SRC, evalSrc: EVAL_SRC };
}

export function isRealData(): boolean {
  return REAL !== null;
}

export function dataYear(): number | null {
  return REAL?.year ?? null;
}

export function dataSource(): string {
  return REAL?.src ?? "";
}

// ── 读取接口（数据就绪前返回空值） ──

export function activeProvinces(): { name: string; cats: string[] }[] {
  if (!REAL) return [];
  return Object.entries(REAL.provs).map(([name, cats]) => ({
    name,
    cats: Object.keys(cats),
  }));
}

export function activeSchools(): School[] {
  return [...schoolIndex.values()];
}

export function getSchool(code: string): School | undefined {
  return schoolIndex.get(code);
}

export function admissionsFor(prov: string, cat: string): Admission[] {
  return admIndex.get(`${prov}|${cat}`) ?? [];
}

/** 本科批省控线（无数据返回 undefined） */
export function controlLine(prov: string, cat: string): number | undefined {
  return REAL?.provs[prov]?.[cat]?.ctrl;
}

// ── 分数 ⇄ 位次（真实一分一段表插值） ──

/** 一分一段：分降序 [score, cumRank]，线性插值 */
export function rankFromCurve(
  curve: [number, number][],
  score: number,
): number {
  if (!curve.length) return 0;
  if (score >= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (score <= last[0]) return last[1];
  let lo = 0,
    hi = curve.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid][0] >= score) lo = mid;
    else hi = mid;
  }
  const [s1, r1] = curve[lo];
  const [s2, r2] = curve[hi];
  return Math.round(r1 + ((s1 - score) / (s1 - s2)) * (r2 - r1));
}

export function rankForScore(prov: string, cat: string, score: number): number {
  const curve = curveIndex.get(`${prov}|${cat}`);
  if (!curve) return 0;
  return rankFromCurve(curve, score);
}

// ── 历史投档线（按省懒加载，public/data/gaokao-history/{slug}.json） ──

export interface HistoryDataset {
  v: number;
  year: number;
  years: number[];
  cats: Record<string, Record<string, (number | null)[]>>;
}

// 招生省中文名 → 数据文件 slug（与 scripts/fetch-gaokao-data.mjs 的 SLUGS 对应）
const PROV_SLUG: Record<string, string> = {
  安徽: "anhui",
  北京: "beijing",
  重庆: "chongqing",
  福建: "fujian",
  甘肃: "gansu",
  广东: "guangdong",
  广西: "guangxi",
  贵州: "guizhou",
  海南: "hainan",
  河北: "hebei",
  黑龙江: "heilongjiang",
  河南: "henan",
  湖北: "hubei",
  湖南: "hunan",
  江苏: "jiangsu",
  江西: "jiangxi",
  吉林: "jilin",
  辽宁: "liaoning",
  内蒙古: "neimenggu",
  宁夏: "ningxia",
  陕西: "shaanxi",
  山东: "shandong",
  上海: "shanghai",
  四川: "sichuan",
  天津: "tianjin",
  新疆: "xinjiang",
  云南: "yunnan",
  浙江: "zhejiang",
};

const historyCache = new Map<string, HistoryDataset>();

/** 拉取某省近四年投档线历史（内存缓存；无数据/加载失败返回 null） */
export async function fetchHistory(
  prov: string,
): Promise<HistoryDataset | null> {
  const cached = historyCache.get(prov);
  if (cached) return cached;
  const slug = PROV_SLUG[prov];
  if (!slug) return null;
  try {
    const r = await fetch(`/data/gaokao-history/${slug}.json`);
    if (!r.ok) return null;
    const d = (await r.json()) as HistoryDataset;
    if (!d?.cats) return null;
    historyCache.set(prov, d);
    return d;
  } catch {
    return null;
  }
}
