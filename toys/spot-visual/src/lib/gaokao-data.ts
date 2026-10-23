// ════════════════════════════════════════════════════════════════════════
// 志愿探索 · 高考数据层
//
// ⚠️ 数据性质声明（务必阅读）：
// 本文件内置的投档线为「示例/估算数据」，数值依据公开报道的 2024 年各省
// 投档线区间近似推算，仅用于演示「分数⇄位次」「冲稳保」等工程逻辑，
// 不构成任何志愿填报依据。正式填报请以考生所在省级教育考试院官方数据为准。
//
// 数据来源（MIT 授权，可替换为全量真实数据）：
//   • GaokaoCompass  — https://github.com/choucisan/GaokaoCompass  (MIT, 完整数据托管于 HuggingFace: choucsan/Gaokao-Compass-11M)
//   • secnotes/gaokao — https://github.com/secnotes/gaokao  (MIT, 21 省静态 JSON)
//
// 全量替换：将真实数据集（与上述 Admission / ScoreRank 结构一致）传入
//   loadFullDataset(admissions, scoreRanks) 即可无缝切换，UI 无需改动。
// ════════════════════════════════════════════════════════════════════════

export interface School {
  code: string;
  name: string;
  prov: string; // 所在地（省/直辖市）
  is985: boolean;
  is211: boolean;
  isDFC: boolean; // 双一流
  base: number; // 河南·理科(物理类) 2024 近似投档线（示例）
}

export interface Admission {
  schoolCode: string;
  prov: string; // 招生省份（中文）
  year: number;
  cat: string; // 科类
  batch: string;
  minScore: number;
  minRank: number;
}

export interface ScoreRank {
  prov: string;
  cat: string;
  year: number;
  score: number;
  rank: number; // 累计人数（位次）
}

// ── 院校主数据（所在地 + 层次 + 示例基准分） ──
export const SCHOOLS: School[] = [
  { code: 'THU', name: '清华大学', prov: '北京', is985: true, is211: true, isDFC: true, base: 696 },
  { code: 'PKU', name: '北京大学', prov: '北京', is985: true, is211: true, isDFC: true, base: 693 },
  { code: 'SHU', name: '上海交通大学', prov: '上海', is985: true, is211: true, isDFC: true, base: 692 },
  { code: 'FUD', name: '复旦大学', prov: '上海', is985: true, is211: true, isDFC: true, base: 691 },
  { code: 'ZJU', name: '浙江大学', prov: '浙江', is985: true, is211: true, isDFC: true, base: 689 },
  { code: 'USTC', name: '中国科学技术大学', prov: '安徽', is985: true, is211: true, isDFC: true, base: 688 },
  { code: 'NJU', name: '南京大学', prov: '江苏', is985: true, is211: true, isDFC: true, base: 685 },
  { code: 'RUC', name: '中国人民大学', prov: '北京', is985: true, is211: true, isDFC: true, base: 683 },
  { code: 'BUAA', name: '北京航空航天大学', prov: '北京', is985: true, is211: true, isDFC: true, base: 678 },
  { code: 'BIT', name: '北京理工大学', prov: '北京', is985: true, is211: true, isDFC: true, base: 675 },
  { code: 'XJTU', name: '西安交通大学', prov: '陕西', is985: true, is211: true, isDFC: true, base: 673 },
  { code: 'HIT', name: '哈尔滨工业大学', prov: '黑龙江', is985: true, is211: true, isDFC: true, base: 671 },
  { code: 'TJU', name: '同济大学', prov: '上海', is985: true, is211: true, isDFC: true, base: 670 },
  { code: 'HUST', name: '华中科技大学', prov: '湖北', is985: true, is211: true, isDFC: true, base: 668 },
  { code: 'WHU', name: '武汉大学', prov: '湖北', is985: true, is211: true, isDFC: true, base: 666 },
  { code: 'SEU', name: '东南大学', prov: '江苏', is985: true, is211: true, isDFC: true, base: 665 },
  { code: 'UESTC', name: '电子科技大学', prov: '四川', is985: true, is211: true, isDFC: true, base: 660 },
  { code: 'SYSU', name: '中山大学', prov: '广东', is985: true, is211: true, isDFC: true, base: 658 },
  { code: 'XMU', name: '厦门大学', prov: '福建', is985: true, is211: true, isDFC: true, base: 655 },
  { code: 'TIANJIN', name: '天津大学', prov: '天津', is985: true, is211: true, isDFC: true, base: 653 },
  { code: 'ECNU', name: '华东师范大学', prov: '上海', is985: true, is211: true, isDFC: true, base: 650 },
  { code: 'SCUT', name: '华南理工大学', prov: '广东', is985: true, is211: true, isDFC: true, base: 645 },
  { code: 'CSU', name: '中南大学', prov: '湖南', is985: true, is211: true, isDFC: true, base: 643 },
  { code: 'DLUT', name: '大连理工大学', prov: '辽宁', is985: true, is211: true, isDFC: true, base: 640 },
  { code: 'JLU', name: '吉林大学', prov: '吉林', is985: true, is211: true, isDFC: true, base: 630 },
  { code: 'CQU', name: '重庆大学', prov: '重庆', is985: true, is211: true, isDFC: true, base: 628 },
  { code: 'HNU', name: '湖南大学', prov: '湖南', is985: true, is211: true, isDFC: true, base: 625 },
  { code: 'LZU', name: '兰州大学', prov: '甘肃', is985: true, is211: true, isDFC: true, base: 610 },
  { code: 'ZZU', name: '郑州大学', prov: '河南', is985: false, is211: true, isDFC: true, base: 601 },
  { code: 'SUDA', name: '苏州大学', prov: '江苏', is985: false, is211: true, isDFC: true, base: 595 },
  { code: 'HENU', name: '河南大学', prov: '河南', is985: false, is211: false, isDFC: true, base: 580 },
  { code: 'SUST', name: '苏州科技大学', prov: '江苏', is985: false, is211: false, isDFC: false, base: 590 },
  { code: 'HAUST', name: '河南科技大学', prov: '河南', is985: false, is211: false, isDFC: false, base: 572 },
  { code: 'NCWU', name: '华北水利水电大学', prov: '河南', is985: false, is211: false, isDFC: false, base: 560 },
  { code: 'HZU', name: '河南工业大学', prov: '河南', is985: false, is211: false, isDFC: false, base: 555 },
];

// ── 覆盖的招生省份 + 科类（演示范围） ──
export const PROVINCES: { name: string; cats: string[] }[] = [
  { name: '河南', cats: ['物理类', '历史类'] },
  { name: '广东', cats: ['物理类', '历史类'] },
  { name: '浙江', cats: ['综合改革'] },
];

// 各科类相对「河南·理科」的近似分差（示例推算）
const CAT_DELTA: Record<string, number> = {
  '河南·物理类': 0,
  '河南·历史类': -38,
  '广东·物理类': -8,
  '广东·历史类': -12,
  '浙江·综合改革': -22,
};

// 一分一段锚点（示例）：用于 分数⇄位次 近似换算
const RANK_ANCHORS: Record<string, [number, number][]> = {
  '河南·物理类': [[700, 50], [680, 500], [660, 2000], [640, 5000], [620, 12000], [600, 25000], [580, 45000], [550, 90000]],
  '河南·历史类': [[660, 50], [640, 400], [620, 1500], [600, 3500], [580, 7000], [550, 18000], [530, 30000]],
  '广东·物理类': [[680, 100], [660, 800], [640, 3000], [620, 8000], [600, 18000], [580, 32000], [550, 70000]],
  '广东·历史类': [[650, 100], [630, 600], [610, 2000], [590, 6000], [570, 13000], [550, 25000]],
  '浙江·综合改革': [[690, 100], [670, 800], [650, 3000], [630, 8000], [610, 18000], [590, 35000], [560, 70000]],
};

const YEAR = 2024;

// 线性插值求位次
export function rankFromAnchors(anchors: [number, number][], score: number): number {
  if (score >= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (score <= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [s1, r1] = anchors[i];
    const [s2, r2] = anchors[i + 1];
    if (score <= s1 && score >= s2) {
      const t = (s1 - score) / (s1 - s2);
      return Math.round(r1 + t * (r2 - r1));
    }
  }
  return last[1];
}

export function rankForScore(prov: string, cat: string, score: number): number {
  const anchors = RANK_ANCHORS[`${prov}·${cat}`];
  if (!anchors) return 0;
  return rankFromAnchors(anchors, score);
}

// ── 生成示例投档线（依据 base + 科类分差 + 位次锚点） ──
export function buildAdmissions(): Admission[] {
  const out: Admission[] = [];
  for (const p of PROVINCES) {
    for (const cat of p.cats) {
      const delta = CAT_DELTA[`${p.name}·${cat}`] ?? 0;
      for (const s of SCHOOLS) {
        const minScore = s.base + delta;
        const minRank = rankForScore(p.name, cat, minScore);
        out.push({
          schoolCode: s.code,
          prov: p.name,
          year: YEAR,
          cat,
          batch: '本科批',
          minScore,
          minRank,
        });
      }
    }
  }
  return out;
}

export const ADMISSIONS: Admission[] = buildAdmissions();

export function getSchool(code: string): School | undefined {
  return SCHOOLS.find((s) => s.code === code);
}

// ── 全量数据替换接口（接入 GaokaoCompass / secnotes 真实数据时使用） ──
let _override: Admission[] | null = null;
export function loadFullDataset(admissions: Admission[]): void {
  _override = admissions;
}
export function activeAdmissions(): Admission[] {
  return _override ?? ADMISSIONS;
}
