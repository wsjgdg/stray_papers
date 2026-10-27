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

import { withSharecode } from "@/lib/share-link";

export const GAOKAO_DATA_URL = "/data/gaokao-2025.json";
export const GAOKAO_BATCHES_URL = "/data/gaokao-2025-batches.json";
export const GAOKAO_YEARS = [2026, 2025] as const;

export function dataUrlFor(year: number): string {
  return `/data/gaokao-${year}.json`;
}
export function batchesUrlFor(year: number): string {
  return `/data/gaokao-${year}-batches.json`;
}

/**
 * 单省批次包（5~30KB gzip）：专科/提前批/专项。
 * 单体批次文件 1.6MB（265KB gzip），切一次「专科批」要解析 1.9 万行，
 * 实测 2.6s 且网络只占 0.44s，所以按省拆开。
 */
export function provinceBatchesUrlFor(year: number, prov: string): string {
  const slug = PROV_SLUG[prov] ?? encodeURIComponent(prov);
  return `/data/gaokao/${year}/b/${slug}.json`;
}

/** 省份清单（1~3KB）：下拉框与统计口径的来源 */
export function indexUrlFor(year: number): string {
  return `/data/gaokao/${year}/index.json`;
}

/** 单省数据包（15~60KB gzip）：只含该省全部科类的投档线与一分一段 */
export function provinceUrlFor(year: number, prov: string): string {
  const slug = PROV_SLUG[prov] ?? encodeURIComponent(prov);
  return `/data/gaokao/${year}/${slug}.json`;
}

// ── 年份清单缓存 ──
const indexCache = new Map<number, GaokaoIndex>();

export function cachedIndex(year: number): GaokaoIndex | null {
  return indexCache.get(year) ?? null;
}

export function rememberIndex(year: number, idx: GaokaoIndex) {
  indexCache.set(year, idx);
}
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
  schoolCode: string; // 本省招生代码（跨省同码不同校，仅展示用）
  schoolName: string; // 全局键：院校名（跨省一致）
  group: BatchGroup; // 批次组（benke=本科普通批）
  prov: string; // 招生省份（中文）
  year: number;
  cat: string; // 科类
  batch: string;
  minScore: number;
  minRank: number;
  rankDerived?: boolean; // 位次由一分一段表按投档最低分反推（原表无位次列）
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

export type BatchGroup = "benke" | "tiqian" | "zhuanxiang" | "zhuanke";

export const BATCH_GROUPS: { key: BatchGroup; label: string }[] = [
  { key: "benke", label: "本科批" },
  { key: "tiqian", label: "提前批" },
  { key: "zhuanxiang", label: "专项计划" },
  { key: "zhuanke", label: "专科批" },
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
// 数据按省拆分投放（public/data/gaokao/{year}/{slug}.json）：
//   INDEX  省份/科类清单（1~3KB），决定下拉框与统计口径
//   REAL   当前年份的聚合视图，按访问过的省份逐步填充
// 索引表只增不减：用户翻过的省份留在内存里，回切零成本。
let REAL: RealDataset | null = null;
let INDEX: GaokaoIndex | null = null;
let schoolIndex = new Map<string, School>();
let admIndex = new Map<string, Admission[]>(); // "prov|cat" → 投档线列表
let curveIndex = new Map<string, [number, number][]>(); // "prov|cat" → 一分一段
const loadedProvinces = new Set<string>(); // `${year}|${prov}`
const pkgCache = new Map<string, ProvincePackage>();

/** 单省清单：只含控制线与行数，不含具体投档线 */
export interface GaokaoIndex {
  v: number;
  year: number;
  src: string;
  provs: Record<
    string,
    { cats: Record<string, { ctrl?: number; rows: number }> }
  >;
  totalRows: number;
  totalSchools: number;
}

/** 单省数据包（一个省的全部科类） */
export interface ProvincePackage {
  v: number;
  year: number;
  src: string;
  prov: string;
  cats: Record<string, RealCatData>;
}

function clearRuntime() {
  REAL = null;
  INDEX = null;
  schoolIndex = new Map();
  admIndex = new Map();
  curveIndex = new Map();
  loadedProvinces.clear();
  pkgCache.clear();
  batchIndex = new Map(); // 批次文件按年区分，换年必须清空
  loadedBatchProvinces.clear();
  batchPkgCache.clear();
}

/** 把一个省的投档线并入索引（不做清空，支持逐省累加） */
function indexProvince(
  prov: string,
  cats: Record<string, RealCatData>,
  year: number,
) {
  for (const [cat, cd] of Object.entries(cats)) {
    // 先登记一分一段：下面要用它补投档表的位次
    const curve = cd.curve ?? [];
    if (curve.length) curveIndex.set(`${prov}|${cat}`, curve);

    admIndex.set(
      `${prov}|${cat}`,
      (cd.adm ?? []).map(
        ([
          code,
          name,
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
          schoolName: name,
          group: "benke" as const,
          prov,
          year,
          cat,
          batch,
          minScore,
          // 部分省份（2026 年北京/湖南/湖北/江苏/河北等 14 省）的投档表
          // 根本没有位次列，整列为 0。有官方一分一段时按分数反推，
          // 否则同分去向、位次对比、分享卡全部为空。
          minRank:
            minRank || (curve.length ? rankFromCurve(curve, minScore) : 0),
          rankDerived: !minRank && curve.length > 0,
          planCount: planCount ?? undefined,
          scoreDelta: scoreDelta ?? undefined,
          planDelta: planDelta ?? undefined,
        }),
      ),
    );
    for (const [code, name, , , , loc, flags] of cd.adm ?? []) {
      // 招生代码跨省冲突（实测 1.4 万处），院校全局键 = 校名
      if (!schoolIndex.has(name))
        schoolIndex.set(name, {
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
  // 批次数据可能已先一步载入（用户直接点「专科批」），此时用刚到的
  // 一分一段把该省的位次补齐，保证结果与加载顺序无关。
  if (batchIndex.size) backfillBatchRanks(prov);
}

/** 载入某年份的省份清单（几 KB）。换年份会自动清空上一年的数据。 */
export function loadIndex(idx: GaokaoIndex): boolean {
  if (!idx || typeof idx !== "object" || !idx.provs) return false;
  if (INDEX?.year !== idx.year) clearRuntime();
  INDEX = idx;
  if (!REAL) REAL = { v: idx.v, year: idx.year, src: idx.src, provs: {} };
  return true;
}

/** 该省数据是否已就绪 */
export function isProvinceLoaded(prov: string): boolean {
  return !!REAL && loadedProvinces.has(`${REAL.year}|${prov}`);
}

/** 已下载过的省数据包（再次切换直接复用，零请求） */
export function cachedProvincePackage(
  year: number,
  prov: string,
): ProvincePackage | null {
  return pkgCache.get(`${year}|${prov}`) ?? null;
}

/**
 * 预热用：把某个年份的省包放进缓存，但**不动运行时**。
 *
 * 和 loadProvincePackage 的区别：后者要求 pkg.year === 当前运行时年份（会直接
 * 合并进索引）。预热未来才会切换到的年份时，运行时还是旧年份，必须只入缓存。
 */
export function rememberProvincePackage(
  year: number,
  prov: string,
  pkg: ProvincePackage,
): void {
  if (!pkg || typeof pkg !== "object" || !pkg.cats) return;
  pkgCache.set(`${year}|${prov}`, pkg);
}

/** 合并单省数据包到运行时索引 */
export function loadProvincePackage(pkg: ProvincePackage): boolean {
  if (!pkg || typeof pkg !== "object" || !pkg.cats) return false;
  if (!REAL || pkg.year !== REAL.year) return false;
  const key = `${pkg.year}|${pkg.prov}`;
  if (loadedProvinces.has(key)) return true;
  indexProvince(pkg.prov, pkg.cats, pkg.year);
  REAL.provs[pkg.prov] = pkg.cats;
  loadedProvinces.add(key);
  pkgCache.set(key, pkg);
  return true;
}

/** 整份数据集一次性载入（测试与兜底用）；结构非法返回 false */
export function loadFullDataset(data: RealDataset): boolean {
  if (!data || typeof data !== "object" || !data.provs) return false;
  clearRuntime();
  REAL = data;
  const provs: GaokaoIndex["provs"] = {};
  let totalRows = 0;
  const names = new Set<string>();
  for (const [prov, cats] of Object.entries(data.provs)) {
    indexProvince(prov, cats, data.year);
    loadedProvinces.add(`${data.year}|${prov}`);
    provs[prov] = { cats: {} };
    for (const [cat, cd] of Object.entries(cats)) {
      provs[prov].cats[cat] = { ctrl: cd.ctrl, rows: cd.adm?.length ?? 0 };
      totalRows += cd.adm?.length ?? 0;
      for (const row of cd.adm ?? []) names.add(row[1]);
    }
  }
  INDEX = {
    v: data.v,
    year: data.year,
    src: data.src,
    provs,
    totalRows,
    totalSchools: names.size,
  };
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
  return INDEX?.year ?? REAL?.year ?? null;
}

export function dataSource(): string {
  return INDEX?.src ?? REAL?.src ?? "";
}

// ── 读取接口（数据就绪前返回空值） ──

export function activeProvinces(): { name: string; cats: string[] }[] {
  // 优先用年份清单：分省投放时 REAL.provs 只含已下载的省，
  // 下拉框必须展示全部可选省份。
  if (INDEX) {
    return Object.entries(INDEX.provs).map(([name, v]) => ({
      name,
      cats: Object.keys(v.cats),
    }));
  }
  if (!REAL) return [];
  return Object.entries(REAL.provs).map(([name, cats]) => ({
    name,
    cats: Object.keys(cats),
  }));
}

/** 该年份覆盖的院校总数（来自清单，未下载省份也计入） */
export function totalSchools(): number {
  return INDEX?.totalSchools ?? schoolIndex.size;
}

/** 该年份的投档线总行数（来自清单） */
export function totalRows(): number {
  return INDEX?.totalRows ?? 0;
}

export function activeSchools(): School[] {
  return [...schoolIndex.values()];
}

export function getSchool(name: string): School | undefined {
  return schoolIndex.get(name);
}

// ── 非本科批批次组（提前批/专项/专科），懒加载文件合并 ──
// 文件结构：{ v, year, provs: { 省: { 组: { 科类: { adm: AdmRow[] } } } } }
export interface BatchesDataset {
  v: number;
  year: number;
  provs: Record<string, Record<string, Record<string, RealCatData>>>;
}

let batchIndex = new Map<string, Admission[]>(); // `prov|group|cat`
const loadedBatchProvinces = new Set<string>(); // `${year}|${prov}`
const batchPkgCache = new Map<string, ProvinceBatchesPackage>(); // 同上键

/**
 * 位次缺失时按一分一段反推。返回 0 表示该省该科类也没有一分一段，
 * 此时宁可留空也不编造。
 */
function derivedRank(prov: string, cat: string, minScore: number): number {
  const curve = curveIndex.get(`${prov}|${cat}`);
  return curve?.length ? rankFromCurve(curve, minScore) : 0;
}

/** 给已经载入的批次数据补位次（批次文件与省包加载顺序不固定） */
function backfillBatchRanks(prov: string) {
  const prefix = `${prov}|`;
  for (const [key, list] of batchIndex) {
    if (!key.startsWith(prefix)) continue;
    for (const a of list) {
      if (a.minRank) continue;
      const r = derivedRank(a.prov, a.cat, a.minScore);
      if (r) {
        a.minRank = r;
        a.rankDerived = true;
      }
    }
  }
}

/** 把一批「组 → 科类 → adm」并进批次索引（支持逐省累加） */
function indexBatches(
  prov: string,
  groups: Record<string, Record<string, RealCatData>>,
  year: number,
) {
  for (const [group, cats] of Object.entries(groups)) {
    for (const [cat, cd] of Object.entries(cats)) {
      const rows = (cd.adm ?? []) as AdmRow[];
      batchIndex.set(
        `${prov}|${group}|${cat}`,
        rows.map(([code, name, batch, minScore, minRank]) => {
          const derived = minRank ? 0 : derivedRank(prov, cat, minScore);
          return {
            schoolCode: code,
            schoolName: name,
            group: group as BatchGroup,
            prov,
            year,
            cat,
            batch,
            minScore,
            minRank: minRank || derived,
            rankDerived: !minRank && derived > 0,
          };
        }),
      );
      for (const [code, name, , , , loc, flags] of rows) {
        if (!schoolIndex.has(name))
          schoolIndex.set(name, {
            code,
            name,
            prov: loc,
            is985: (flags & 1) !== 0,
            is211: (flags & 2) !== 0,
            isDFC:
              (flags & 1) !== 0 || (flags & 2) !== 0 || DFC_EXTRA.has(name),
            isPrivate: (flags & 4) !== 0,
          });
      }
    }
  }
}

/** 合并整份批次文件（兜底/测试用；线上走 loadProvinceBatches 按省加载） */
export function loadBatchesDataset(data: BatchesDataset): boolean {
  if (!data || typeof data !== "object" || !data.provs) return false;
  batchIndex = new Map();
  loadedBatchProvinces.clear();
  for (const [prov, groups] of Object.entries(data.provs)) {
    indexBatches(prov, groups, data.year);
    loadedBatchProvinces.add(`${data.year}|${prov}`);
  }
  return true;
}

/** 单省批次包（懒加载文件结构） */
export interface ProvinceBatchesPackage {
  v: number;
  year: number;
  prov: string;
  groups: Record<string, Record<string, RealCatData>>;
}

/** 合并单省批次包，不触碰其他省的数据 */
export function loadProvinceBatches(pkg: ProvinceBatchesPackage): boolean {
  if (!pkg || typeof pkg !== "object" || !pkg.groups) return false;
  if (!REAL || pkg.year !== REAL.year) return false;
  const key = `${pkg.year}|${pkg.prov}`;
  if (loadedBatchProvinces.has(key)) return true;
  indexBatches(pkg.prov, pkg.groups, pkg.year);
  loadedBatchProvinces.add(key);
  batchPkgCache.set(key, pkg);
  return true;
}

/** 该省该年批次数据是否已载入 */
export function isProvinceBatchesLoaded(year: number, prov: string): boolean {
  return loadedBatchProvinces.has(`${year}|${prov}`);
}

/** 已下载过的批次包（切回该省零请求） */
export function cachedProvinceBatches(
  year: number,
  prov: string,
): ProvinceBatchesPackage | null {
  return batchPkgCache.get(`${year}|${prov}`) ?? null;
}

export function isBatchesLoaded(): boolean {
  return batchIndex.size > 0;
}

/** 切换数据年份时清空批次索引，强制按新年份重新懒加载 */
export function resetBatches(): void {
  batchIndex = new Map();
  loadedBatchProvinces.clear();
  batchPkgCache.clear();
}

export function admissionsFor(
  prov: string,
  cat: string,
  group: BatchGroup = "benke",
): Admission[] {
  if (group === "benke") return admIndex.get(`${prov}|${cat}`) ?? [];
  return batchIndex.get(`${prov}|${group}|${cat}`) ?? [];
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

/** 一分一段表原始数据（供 UI 绘制分布图） */
export function curveFor(prov: string, cat: string): [number, number][] {
  return curveIndex.get(`${prov}|${cat}`) ?? [];
}

/**
 * 从「已缓存但未载入运行时」的省包里取某科类曲线。
 *
 * 用途：跨年等位分换算需要另一年份的一分一段，但运行时一次只装一个年份
 * （loadProvincePackage 会校验 pkg.year === 运行时年份）。这里只读缓存副本。
 */
export function cachedCurveFor(
  year: number,
  prov: string,
  cat: string,
): [number, number][] | null {
  const pkg = pkgCache.get(`${year}|${prov}`);
  const curve = pkg?.cats?.[cat]?.curve;
  return curve && curve.length ? curve : null;
}

/**
 * 位次 → 分数（一分一段反查）。
 *
 * 曲线按分数降序、累计位次递增；给定位次取「第一个累计位次 ≥ rank 的分数档」，
 * 也就是该位次能落到的最高分。位次超出表尾时返回表尾分数。
 */
export function scoreFromRank(
  curve: [number, number][],
  rank: number,
): number | null {
  if (!curve.length || !rank) return null;
  if (rank <= curve[0][1]) return curve[0][0];
  for (let i = 0; i < curve.length; i++) {
    if (curve[i][1] >= rank) return curve[i][0];
  }
  return curve[curve.length - 1][0];
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
  青海: "qinghai",
  陕西: "shaanxi",
  山东: "shandong",
  上海: "shanghai",
  山西: "shanxi",
  西藏: "xizang",
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
    const r = await fetch(withSharecode(`/data/gaokao-history/${slug}.json`));
    if (!r.ok) return null;
    const d = (await r.json()) as HistoryDataset;
    if (!d?.cats) return null;
    historyCache.set(prov, d);
    return d;
  } catch {
    return null;
  }
}

// ── 专业级录取数据（按省懒加载，public/data/gaokao-major/{slug}.json） ──

/** [专业组, 专业名, 选科要求索引(数据文件 reqs 表), 最低分, 最低位次] */
export type MajorRow = [
  group: string,
  name: string,
  reqIdx: number,
  minScore: number,
  minRank: number,
];

export interface MajorDataset {
  v: number;
  year: number;
  reqs: string[];
  cats: Record<string, Record<string, MajorRow[]>>;
}

const majorCache = new Map<string, MajorDataset>();

/** 拉取某省专业级投档线（内存缓存；无数据/加载失败返回 null） */
export async function fetchMajors(prov: string): Promise<MajorDataset | null> {
  const cached = majorCache.get(prov);
  if (cached) return cached;
  const slug = PROV_SLUG[prov];
  if (!slug) return null;
  try {
    const r = await fetch(withSharecode(`/data/gaokao-major/${slug}.json`));
    if (!r.ok) return null;
    const d = (await r.json()) as MajorDataset;
    if (!d?.cats) return null;
    majorCache.set(prov, d);
    return d;
  } catch {
    return null;
  }
}
