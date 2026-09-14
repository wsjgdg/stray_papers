import type { Leaderboard, LeaderboardEntry } from '../types.js';
import { fetchText } from '../http.js';

const PAGE = 'https://artificialanalysis.ai/';

/** 关注的榜单：AA 页面中的 Dataset 名 → 工作台榜单定义 */
const BOARD_DEFS: {
  id: string;
  name: string;
  nameCn: string;
  sourceName: string;
  metricKey: string;
  higherBetter: boolean;
  unit: string;
}[] = [
  {
    id: 'intelligence',
    name: 'Artificial Analysis Intelligence Index',
    nameCn: '综合智能指数',
    sourceName: 'Artificial Analysis Intelligence Index',
    metricKey: 'intelligenceIndex',
    higherBetter: true,
    unit: '分',
  },
  {
    id: 'agentic',
    name: 'Artificial Analysis Agentic Index',
    nameCn: '智能体能力指数',
    sourceName: 'Artificial Analysis Agentic Index',
    metricKey: 'score',
    higherBetter: true,
    unit: '分',
  },
  {
    id: 'omniscience',
    name: 'AA-Omniscience Index',
    nameCn: '知识可靠性（抗幻觉）',
    sourceName: 'AA-Omniscience Index',
    metricKey: 'omniscienceIndex',
    higherBetter: true,
    unit: '分',
  },
  {
    id: 'speed',
    name: 'Output Speed',
    nameCn: '输出速度',
    sourceName: 'Output Speed',
    metricKey: 'outputSpeed',
    higherBetter: true,
    unit: 'tok/s',
  },
  {
    id: 'briefcase',
    name: 'AA-Briefcase Elo',
    nameCn: '知识工作智能体 Elo',
    sourceName: 'AA-Briefcase Elo',
    metricKey: 'aaBriefcaseElo',
    higherBetter: true,
    unit: 'Elo',
  },
  {
    id: 'gdpval',
    name: 'GDPval-AA v2 Elo',
    nameCn: '真实工作任务 Elo',
    sourceName: 'GDPval-AA v2 Leaderboard',
    metricKey: 'gdpvalAaElo',
    higherBetter: true,
    unit: 'Elo',
  },
  {
    id: 'analyst',
    name: 'AA-AnalystAgent pass^5',
    nameCn: '量化分析任务 5 次通过率',
    sourceName: 'AA-AnalystAgent pass^5',
    metricKey: 'analystAgent',
    higherBetter: true,
    unit: '%',
  },
  {
    id: 'timePerTask',
    name: 'Time per Intelligence Index Task',
    nameCn: '单任务耗时',
    sourceName: 'Time per Intelligence Index Task',
    metricKey: 'timePerTask',
    higherBetter: false,
    unit: '分钟',
  },
  {
    id: 'costPerTask',
    name: 'Cost per Intelligence Index Task',
    nameCn: '单任务成本',
    sourceName: 'Cost per Intelligence Index Task',
    metricKey: 'input',
    higherBetter: false,
    unit: 'USD',
  },
  {
    id: 'openness',
    name: 'Openness Index Components',
    nameCn: '开放度指数构成',
    sourceName: 'Artificial Analysis Openness Index: Components',
    metricKey: 'transparencyMethodology',
    higherBetter: true,
    unit: '分',
  },
  {
    id: 'textToImage',
    name: 'Text to Image Arena',
    nameCn: '文生图竞技场',
    sourceName: 'Text to Image Leaderboard',
    metricKey: 'elo',
    higherBetter: true,
    unit: 'Elo',
  },
  {
    id: 'tts',
    name: 'Text to Speech Arena',
    nameCn: '语音合成竞技场',
    sourceName: 'Text to Speech Arena Leaderboard',
    metricKey: 'elo',
    higherBetter: true,
    unit: 'Elo',
  },
];

interface PropertyValue {
  '@type'?: string;
  name?: string;
  value?: number;
}

type RawEntry = Record<string, unknown>;

interface Dataset {
  '@type'?: string;
  name?: string;
  description?: string;
  data?: Record<string, RawEntry> | RawEntry[];
}

function toArray(data: Dataset['data']): RawEntry[] {
  if (!data) return [];
  return Array.isArray(data) ? data : Object.values(data);
}

/** PropertyValue[] / 数值 → { value, extra } */
function readMetric(
  raw: unknown,
  metricKey: string,
): { value: number; extra: Record<string, number> } {
  if (Array.isArray(raw)) {
    const props = raw as PropertyValue[];
    const extra: Record<string, number> = {};
    let main: number | null = null;
    for (const p of props) {
      if (!p || typeof p.value !== 'number' || !p.name) continue;
      extra[p.name] = p.value;
      if (p.name === 'mid' || p.name === metricKey) main = p.value;
    }
    if (main === null) main = props.find((p) => typeof p.value === 'number')?.value ?? 0;
    return { value: main, extra };
  }
  if (typeof raw === 'number') return { value: raw, extra: {} };
  return { value: 0, extra: {} };
}

function parseDatasets(html: string): Dataset[] {
  const out: Dataset[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) if (item && item['@type'] === 'Dataset') out.push(item as Dataset);
    } catch {
      /* 忽略无法解析的块 */
    }
  }
  return out;
}

export function slugFromDetailsUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/models\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

export async function fetchArtificialAnalysis(): Promise<{
  leaderboards: Leaderboard[];
  pricing: Map<string, { input: number | null; output: number | null; cacheHit: number | null }>;
}> {
  const { text } = await fetchText(PAGE, { timeoutMs: 30000 });
  const datasets = parseDatasets(text);

  // 同名数据集可能重复出现，保留条目最多的一份
  const byName = new Map<string, Dataset>();
  for (const ds of datasets) {
    if (!ds.name) continue;
    const prev = byName.get(ds.name);
    if (!prev || toArray(ds.data).length > toArray(prev.data).length) byName.set(ds.name, ds);
  }

  const leaderboards: Leaderboard[] = [];
  for (const def of BOARD_DEFS) {
    const ds = byName.get(def.sourceName);
    if (!ds) continue;
    const entries: LeaderboardEntry[] = toArray(ds.data)
      .map((raw) => {
        const { value, extra } = readMetric(raw[def.metricKey], def.metricKey);
        const extras: Record<string, number> = { ...extra };
        // 补充其余数值字段，便于 tooltip / 详情展示
        for (const [k, v] of Object.entries(raw)) {
          if (k === 'label' || k === 'detailsUrl' || k === def.metricKey) continue;
          if (typeof v === 'number') extras[k] = v;
        }
        return {
          label: String(raw.label ?? ''),
          value,
          extra: extras,
          detailsUrl:
            typeof raw.detailsUrl === 'string' ? new URL(raw.detailsUrl, PAGE).href : null,
          aaSlug: slugFromDetailsUrl(raw.detailsUrl),
          modelId: null,
        };
      })
      .filter((e) => e.label && Number.isFinite(e.value))
      .sort((a, b) => (def.higherBetter ? b.value - a.value : a.value - b.value));

    if (!entries.length) continue;
    leaderboards.push({
      id: def.id,
      name: def.nameCn,
      description: (ds.description ?? '').slice(0, 400),
      metricKey: def.metricKey,
      higherBetter: def.higherBetter,
      sourceId: 'artificial-analysis',
      sourceUrl: PAGE,
      sourceName: 'Artificial Analysis',
      entries,
    });
  }

  // 定价表（AA 独立测得，用于交叉校验 OpenRouter 报价）
  const pricing = new Map<
    string,
    { input: number | null; output: number | null; cacheHit: number | null }
  >();
  const pricingDs = byName.get('Pricing: Cache Hit, Input, and Output');
  if (pricingDs) {
    for (const raw of toArray(pricingDs.data)) {
      const slug = slugFromDetailsUrl(raw.detailsUrl);
      if (!slug) continue;
      const props = (raw.pricing ?? []) as PropertyValue[];
      const pick = (n: string) => props.find((p) => p.name === n)?.value ?? null;
      pricing.set(slug, {
        input: pick('inputPrice'),
        output: pick('outputPrice'),
        cacheHit: pick('cacheHitPrice'),
      });
    }
  }

  return { leaderboards, pricing };
}

export const AA_PAGE = PAGE;
