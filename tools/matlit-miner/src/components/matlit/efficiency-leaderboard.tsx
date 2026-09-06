'use client'

import { useEffect, useMemo, useState, memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  Trophy,
  Globe2,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Crown,
  Play,
  Pause,
  Clock,
  RotateCcw,
  MousePointerClick,
  ExternalLink,
  CheckCircle2,
  CircleDashed,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LabelList,
} from 'recharts'
import { api, doiUrl } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useChartTheme } from '@/components/use-chart-theme'
import { useI18n } from '@/components/i18n/provider'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { TabValue } from '@/app/page'

// E3 — optional navigation callback. The Dashboard passes onNavigate to
// most cards, but EfficiencyLeaderboard is currently mounted without it;
// we accept it as an optional prop and fall back to a URL change that
// reloads the page into the target tab when not provided. This keeps the
// component fully self-contained without requiring changes to the parent.
interface EfficiencyLeaderboardProps {
  onNavigate?: (tab: TabValue, materialId?: string) => void
}

interface EfficiencyRecord {
  id: string
  materialId: string
  efficiencyValue: number
  certified: boolean
  source: string
  sourceType: string
  testConditions: string
  doi: string
  year: number | null
  notes: string
  createdAt: string
  material?: { name: string; id: string } | null
}

interface EfficiencyRecordsResponse {
  records: EfficiencyRecord[]
}

// E3 — enriched chart datum. Carries enough context to render the detail
// dialog without re-fetching the leaderboard response. The dialog's
// "records mini-table" is fetched on demand from /api/efficiency.
type ChartDatum = {
  name: string
  technology: string
  userEff: number
  worldRecord: number
  gap: number
  beatsRecord: boolean
  materialId?: string
  userCertified: boolean
  userYear: number | null
  userSource: string
  worldYear: number
  worldSource: string
}

interface UserEffRecord {
  materialId: string
  name: string
  efficiency: number
  certified: boolean
  year: number | null
  source: string
}
interface WorldRecord {
  category: string
  technology: string
  efficiency: number
  year: number
  source: string
}
interface EffGap {
  materialName: string
  userEff: number
  worldRecord: number
  gap: number
  technology: string
  beatsRecord: boolean
}
interface LeaderboardData {
  userRecords: UserEffRecord[]
  worldRecords: WorldRecord[]
  gaps: EffGap[]
}

// Inline tips (mirrors IMPROVEMENT_TIPS on the server; kept here to avoid a
// second round-trip). Keyed by category substring → tip text.
//
// NOTE: the server's leaderboard endpoint collapses records to best-per-
// material without preserving `source`, so the client-side
// `UserEffRecord` interface includes `source` but the leaderboard
// response leaves it empty. The detail dialog looks the source up on
// demand via /api/efficiency?materialId=… (see fetchRecordsForMaterial).
const TIPS: Record<string, { en: string; zh: string }> = {
  perovskite: {
    en: 'Reduce non-radiative recombination via interface passivation (e.g. PEABr). Improve crystallinity through anti-solvent quenching and mixed-cation/mixed-halide compositional engineering. Minimize hysteresis with proper transport layers (e.g. SnO2 / spiro-OMeTAD).',
    zh: '通过界面钝化（如 PEABr）降低非辐射复合；通过反溶剂淬火与混合阳离子/混合卤化物组分工程改善结晶度；优化传输层（SnO2 / spiro-OMeTAD）以减小迟滞。',
  },
  tandem: {
    en: 'Optimize the recombination layer (tunnel junction or ITO) between subcells. Match current densities of top and bottom cells. Improve top-cell transparency to boost bottom-cell photocurrent.',
    zh: '优化子电池之间的复合层（隧穿结或 ITO）；匹配顶电池与底电池的电流密度；提升顶电池透明度以增加底电池光电流。',
  },
  mapi: {
    en: 'Stabilize the α-phase at room temperature via Cs/FA doping. Passivate grain boundaries with Lewis bases. Encapsulate against moisture and oxygen.',
    zh: '通过 Cs/FA 掺杂在室温下稳定 α 相；用路易斯碱钝化晶界；加强封装以抑制水分/氧气降解。',
  },
  cigs: {
    en: 'Apply alkali post-deposition treatment (K, Na PDT). Engineer a double Ga-gradient (back-notch) for V_oc. Reduce interface recombination at the buffer/CdS layer.',
    zh: '采用碱金属后处理（K、Na PDT）；设计双 Ga 梯度（背场凹槽）提升 V_oc；降低 buffer/CdS 界面复合。',
  },
  cdte: {
    en: 'Replace Cu back-contact with a stable hole-selective layer (e.g. ZnTe:Cu or Se-alloyed). Reduce deep-level defects via Cl activation / CdCl2 anneal. Engineer the back interface for higher V_oc.',
    zh: '用稳定空穴选择层（如 ZnTe:Cu 或 Se 合金）替代 Cu 背接触；通过 Cl 激活 / CdCl2 退火减少深能级缺陷；优化背界面以提升 V_oc。',
  },
  opv: {
    en: 'Adopt state-of-the-art Y-series non-fullerene acceptors (Y6, L8-BO). Optimize donor:acceptor morphology via solvent additives. Reduce energetic disorder and triplet formation.',
    zh: '采用最新 Y 系列非富勒烯受体（Y6、L8-BO）；通过溶剂添加剂优化 donor:acceptor 形貌；降低能量无序与三线态形成。',
  },
  dssc: {
    en: 'Replace the iodide/triiodide electrolyte with a cobalt(bpy)3 redox couple for higher V_oc. Broaden spectral absorption with cosensitizers (porphyrin + organic). Reduce TiO2/electrolyte recombination via TiCl4 treatment.',
    zh: '以钴联吡啶氧化还原对替代碘/三碘化物电解质以提升 V_oc；用共敏化剂（卟啉+有机染料）拓宽光谱吸收；通过 TiCl4 处理降低 TiO2/电解质复合。',
  },
}

function tipFor(technology: string): { en: string; zh: string } {
  const t = technology.toLowerCase()
  if (t.includes('tandem')) return TIPS.tandem
  if (t.includes('mapb') || t.includes('mapi')) return TIPS.mapi
  if (t.includes('perovsk')) return TIPS.perovskite
  if (t.includes('cigs')) return TIPS.cigs
  if (t.includes('cdte')) return TIPS.cdte
  if (t.includes('organic')) return TIPS.opv
  if (t.includes('dssc') || t.includes('dye')) return TIPS.dssc
  return {
    en: 'Focus on reducing recombination losses, optimizing morphology and interfaces, and improving charge-collection efficiency. Review the most recent high-impact papers in this technology for state-of-the-art strategies.',
    zh: '聚焦于降低复合损耗、优化形貌与界面、提升电荷收集效率。参考该技术领域最新的高影响论文以获取前沿策略。',
  }
}

// Friendly category icon/color for a gap row.
function techColor(technology: string): string {
  const t = technology.toLowerCase()
  if (t.includes('tandem')) return '#8b5cf6'
  if (t.includes('perovsk')) return '#10b981'
  if (t.includes('cigs')) return '#f59e0b'
  if (t.includes('cdte')) return '#ef4444'
  if (t.includes('organic')) return '#ec4899'
  if (t.includes('dssc')) return '#06b6d4'
  return '#64748b'
}

// E4 — Historical NREL best-cell world records by year (approximate, for the
// timeline animation). For a given selectedYear, pick the entry with the
// largest year ≤ selectedYear and use its efficiency as the "world record
// as of that year". Sources: NREL Best Research-Cell Efficiency Chart.
const WORLD_RECORD_HISTORY: Record<string, Array<{ year: number; eff: number }>> = {
  perovskite: [
    { year: 2014, eff: 14.0 },
    { year: 2016, eff: 22.1 },
    { year: 2019, eff: 24.2 },
    { year: 2021, eff: 25.5 },
    { year: 2024, eff: 26.1 },
  ],
  'perovskite-tandem': [
    { year: 2014, eff: 13.4 },
    { year: 2016, eff: 23.6 },
    { year: 2018, eff: 25.2 },
    { year: 2020, eff: 29.1 },
    { year: 2023, eff: 33.7 },
    { year: 2024, eff: 33.9 },
  ],
  'perovskite-mapi': [
    { year: 2014, eff: 14.1 },
    { year: 2016, eff: 21.6 },
    { year: 2019, eff: 23.7 },
    { year: 2024, eff: 25.7 },
  ],
  cigs: [
    { year: 2014, eff: 20.8 },
    { year: 2016, eff: 22.3 },
    { year: 2019, eff: 23.3 },
    { year: 2024, eff: 23.6 },
  ],
  cdte: [
    { year: 2014, eff: 19.6 },
    { year: 2016, eff: 21.0 },
    { year: 2024, eff: 22.3 },
  ],
  opv: [
    { year: 2014, eff: 11.5 },
    { year: 2016, eff: 12.1 },
    { year: 2019, eff: 17.3 },
    { year: 2024, eff: 19.2 },
  ],
  dssc: [
    { year: 2014, eff: 14.3 },
    { year: 2024, eff: 14.3 },
  ],
}

// E4 — Notable milestone years rendered as amber dots below the slider.
// Hovering shows a tooltip; clicking jumps the slider to that year.
const MILESTONES: Array<{ year: number; en: string; zh: string }> = [
  { year: 2014, en: 'Perovskite 14.0%', zh: '钙钛矿 14.0%' },
  { year: 2016, en: 'Perovskite 22.1%', zh: '钙钛矿 22.1%' },
  { year: 2019, en: 'Perovskite 24.2%', zh: '钙钛矿 24.2%' },
  { year: 2021, en: 'Perovskite 25.5%', zh: '钙钛矿 25.5%' },
  { year: 2024, en: 'Perovskite 26.1%', zh: '钙钛矿 26.1%' },
]

// E4 — Map a technology label (from the leaderboard API) to a
// world-record-history category. Mirrors the server-side matchTechnology
// priority (tandem → mapi → perovskite → cigs → cdte → opv → dssc).
function categoryFromTech(tech: string): string {
  const t = tech.toLowerCase()
  if (t.includes('tandem')) return 'perovskite-tandem'
  if (t.includes('mapb')) return 'perovskite-mapi'
  if (t.includes('perovsk')) return 'perovskite'
  if (t.includes('cigs')) return 'cigs'
  if (t.includes('cdte')) return 'cdte'
  if (t.includes('organic')) return 'opv'
  if (t.includes('dssc') || t.includes('dye')) return 'dssc'
  return ''
}

// E4 — World-record efficiency as of `year` (largest history entry with
// year ≤ selectedYear). Returns 0 if no record exists yet for that year.
function wrAsOf(category: string, year: number): number {
  const history = WORLD_RECORD_HISTORY[category]
  if (!history?.length) return 0
  const eligible = history.filter((h) => h.year <= year)
  if (!eligible.length) return 0
  return Math.max(...eligible.map((h) => h.eff))
}

function CustomTooltip({
  active,
  payload,
  ctheme,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { technology?: string } }>
  ctheme: ReturnType<typeof useChartTheme>
}) {
  const { t } = useI18n()
  if (!active || !payload?.length) return null
  // Group by userEff / worldRecord
  const userVal = payload.find((p) => p.name === 'userEff')?.value
  const worldVal = payload.find((p) => p.name === 'worldRecord')?.value
  const tech = payload[0]?.payload?.technology
  return (
    <div
      className="rounded-lg border p-2.5 shadow-md text-xs max-w-[240px]"
      style={{
        background: ctheme.tooltipBg,
        borderColor: ctheme.tooltipBorder,
        color: ctheme.tooltipText,
      }}
    >
      {tech && <div className="font-semibold mb-1">{tech}</div>}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
          <span>{t('leaderboard.yourRecord')}:</span>
          <span className="ml-auto font-semibold tabular-nums">
            {userVal !== undefined && userVal > 0
              ? `${userVal.toFixed(2)}%`
              : t('leaderboard.noRecordYet')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block border"
            style={{ borderColor: '#475569', background: 'repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 2px, transparent 2px, transparent 4px)' }}
          />
          <span>{t('leaderboard.worldRecord')}:</span>
          <span className="ml-auto font-semibold tabular-nums">
            {worldVal !== undefined && worldVal > 0
              ? `${worldVal.toFixed(2)}%`
              : t('leaderboard.notYet')}
          </span>
        </div>
        {userVal !== undefined && worldVal !== undefined && userVal > 0 && worldVal > 0 && (
          <div className="pt-1 mt-1 border-t border-slate-200 dark:border-slate-700 text-[11px]">
            {userVal > worldVal ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                <Crown className="w-3 h-3" /> {t('leaderboard.beatsWorld')}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {t('leaderboard.gap')}: <span className="font-semibold tabular-nums">−{(worldVal - userVal).toFixed(2)}%</span>{' '}
                {t('leaderboard.belowRecord')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const EfficiencyLeaderboard = memo(function EfficiencyLeaderboard({ onNavigate }: EfficiencyLeaderboardProps = {}) {
  const { t, pick, locale } = useI18n()
  // Inline translation helper for complex template strings not yet in the i18n provider.
  const tr = (en: string, zh: string) => (locale === 'zh' ? zh : en)
  const ctheme = useChartTheme()
  // P1-6 — mobile detection. Drives slider thumb size, milestone hit
  // area, dialog layout (full-screen vs centered), and YAxis width on
  // the bar chart. SSR-safe (false on first paint).
  const isMobile = useMediaQuery('(max-width: 640px)')

  const [showAll, setShowAll] = useState(false)
  // E3 — selected bar for the Materials Project-style detail dialog.
  const [selectedBar, setSelectedBar] = useState<ChartDatum | null>(null)

  // E4 — NREL-style timeline: scrub the year to see efficiency records "as of"
  // that year. Default to the latest year (current state).
  const minYear = 2010
  const maxYear = 2024
  const [selectedYear, setSelectedYear] = useState<number>(maxYear)
  const [isPlaying, setIsPlaying] = useState(false)

  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: QUERY_KEYS.efficiencyLeaderboard,
    queryFn: () => api<LeaderboardData>('/api/efficiency/leaderboard'),
    // DB aggregation (best-per-material) — 1-min staleTime per M8
    // convention. The full record history below uses a longer 5-min cache.
    staleTime: STALE_TIMES.efficiency,
  })

  // E3 — fetch the full per-material efficiency records list when a bar is
  // clicked, so the dialog can show a mini-table of every record (not just
  // the best). Cached for 5 min per material.
  const { data: recordsForMaterial, isLoading: recordsLoading } = useQuery<EfficiencyRecordsResponse>({
    queryKey: QUERY_KEYS.efficiencyRecords(selectedBar?.materialId ?? ''),
    queryFn: () =>
      api<EfficiencyRecordsResponse>(
        `/api/efficiency?materialId=${encodeURIComponent(selectedBar?.materialId ?? '')}`,
      ),
    enabled: !!selectedBar?.materialId,
    staleTime: STALE_TIMES.efficiency,
  })

  // E4 — fetch ALL efficiency records (not collapsed to best-per-material) so
  // we can compute "best efficiency as of year Y" per material. This endpoint
  // already exists (GET /api/efficiency) — we just call it; no API changes.
  const { data: allRecordsResp } = useQuery<EfficiencyRecordsResponse>({
    queryKey: QUERY_KEYS.efficiencyAllRecords,
    queryFn: () => api<EfficiencyRecordsResponse>('/api/efficiency'),
    enabled: !!data?.gaps?.length,
    staleTime: STALE_TIMES.efficiencyTrend,
  })

  // E4 — auto-advance the year by 1 every 1.5s when playing (time-lapse).
  // Pause automatically when reaching maxYear.
  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => {
      setSelectedYear((y) => {
        if (y >= maxYear) {
          setIsPlaying(false)
          return maxYear
        }
        return y + 1
      })
    }, 1500)
    return () => window.clearInterval(id)
  }, [isPlaying, maxYear])

  // E4 — Build chart data filtered to the selected year. For each gap
  // (matched material), find the best user efficiency where
  // record.year ≤ selectedYear (records with null year are always eligible),
  // and the world record as of that year from WORLD_RECORD_HISTORY.
  // Materials with no eligible records keep their row but render a 0-width
  // bar so the chart layout stays stable while scrubbing.
  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data?.gaps?.length) return []
    // Prefer the full records history; fall back to the leaderboard's
    // best-per-material snapshot while the second query loads.
    const source: EfficiencyRecord[] =
      allRecordsResp?.records ??
      (data.userRecords ?? []).map((r) => ({
        id: r.materialId,
        materialId: r.materialId,
        efficiencyValue: r.efficiency,
        certified: r.certified,
        source: r.source,
        sourceType: '',
        testConditions: '',
        doi: '',
        year: r.year,
        notes: '',
        createdAt: '',
        material: { name: r.name, id: r.materialId },
      }))
    const recordsByMaterial = new Map<
      string,
      Array<{ eff: number; year: number | null }>
    >()
    for (const r of source) {
      const name = r.material?.name
      if (!name) continue
      if (!recordsByMaterial.has(name)) recordsByMaterial.set(name, [])
      recordsByMaterial.get(name)!.push({ eff: r.efficiencyValue, year: r.year })
    }
    const sorted = [...data.gaps].sort((a, b) => b.userEff - a.userEff)
    return sorted.map((g) => {
      const category = categoryFromTech(g.technology)
      const wr = category ? wrAsOf(category, selectedYear) : 0
      const recs = recordsByMaterial.get(g.materialName) ?? []
      const eligible = recs.filter((r) => r.year === null || r.year <= selectedYear)
      const userEff = eligible.length > 0 ? Math.max(...eligible.map((r) => r.eff)) : 0
      const gap = wr - userEff
      const userRecord = data.userRecords.find((u) => u.name === g.materialName)
      const worldRecord = data.worldRecords.find((w) => w.technology === g.technology)
      return {
        name: g.materialName,
        technology: g.technology,
        userEff: Number(userEff.toFixed(2)),
        worldRecord: Number(wr.toFixed(2)),
        gap: Number(gap.toFixed(2)),
        beatsRecord: userEff > 0 && userEff > wr,
        materialId: userRecord?.materialId,
        userCertified: userRecord?.certified ?? false,
        userYear: userRecord?.year ?? null,
        userSource: userRecord?.source ?? '',
        worldYear: worldRecord?.year ?? 0,
        worldSource: worldRecord?.source ?? '',
      }
    })
  }, [data, allRecordsResp, selectedYear])

  // E4 — Year tick labels under the slider (positioned to align with thumb).
  const yearTicks = useMemo(
    () => [minYear, 2014, 2018, 2022, maxYear],
    [minYear, maxYear],
  )

  // World-record list (show all 7 by default; "showAll" toggles the user's full list too)
  const visibleChart = showAll ? chartData : chartData.slice(0, 6)

  // Stats summary (E4: time-filtered — reflects the selected year)
  // M9 — wrap the .filter()/.reduce() derivations in useMemo so they don't
  // re-walk chartData on every unrelated re-render (chartData is itself
  // memoised, so the array reference is stable across unrelated renders).
  // Declared above the early returns so the hook runs in consistent order.
  const stats = useMemo(() => {
    const totalBeats = chartData.filter((g) => g.beatsRecord).length
    const validGaps = chartData.filter((g) => g.userEff > 0 && g.worldRecord > 0)
    const smallestGap =
      validGaps.length > 0
        ? validGaps.reduce((min, g) => (g.gap < min.gap ? g : min), validGaps[0])
        : chartData[0]
    const topUser = chartData.reduce(
      (max, g) => (g.userEff > max.userEff ? g : max),
      chartData[0],
    )
    return { totalBeats, validGaps, smallestGap, topUser }
  }, [chartData])
  const { totalBeats, smallestGap, topUser } = stats

  if (isLoading) {
    return (
      <Card className="border-emerald-200/60 dark:border-emerald-900/60">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  if (!data || chartData.length === 0) {
    // No matching user materials — still show the world-record reference list.
    return (
      <Card className="border-emerald-200/60 dark:border-emerald-900/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-emerald-500" />
            {t('leaderboard.title')}
          </CardTitle>
          <CardDescription>
            {t('leaderboard.worldRecordRef')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data?.worldRecords.map((w) => (
              <div
                key={w.category}
                className="rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate" title={w.technology}>
                  {w.technology}
                </div>
                <div className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {w.efficiency.toFixed(1)}%
                </div>
                <div className="text-[11px] sm:text-[10px] text-slate-400">{w.source} · {w.year}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/60">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-500" />
              {t('leaderboard.title')}
            </CardTitle>
            <CardDescription>
              {t('leaderboard.subtitleVs')}
            </CardDescription>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 rounded-sm bg-emerald-500" />
              {t('leaderboard.yourRecord')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm border"
                style={{
                  borderColor: '#475569',
                  background:
                    'repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 2px, transparent 2px, transparent 4px)',
                }}
              />
              {t('leaderboard.worldRecord')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="rounded-lg p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
            <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {topUser.userEff > 0 ? `${topUser.userEff.toFixed(2)}%` : '—'}
            </div>
            <div className="text-[11px] sm:text-[10px] text-emerald-600 dark:text-emerald-400">
              {t('leaderboard.yourBest')}
            </div>
          </div>
          <div className="rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
            <div className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {smallestGap.worldRecord > 0 ? `${smallestGap.worldRecord.toFixed(2)}%` : '—'}
            </div>
            <div className="text-[11px] sm:text-[10px] text-slate-500">
              {t('leaderboard.closestRecord')}
            </div>
          </div>
          <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center">
            <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {smallestGap.userEff > 0 && smallestGap.worldRecord > 0
                ? `${smallestGap.beatsRecord ? '+' : '−'}${Math.abs(smallestGap.gap).toFixed(2)}%`
                : '—'}
            </div>
            <div className="text-[11px] sm:text-[10px] text-amber-600 dark:text-amber-400">
              {t('leaderboard.smallestGap')}
            </div>
          </div>
          <div className="rounded-lg p-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-center">
            <div className="text-lg font-bold tabular-nums text-violet-600 dark:text-violet-400">
              {totalBeats}
            </div>
            <div className="text-[11px] sm:text-[10px] text-violet-600 dark:text-violet-400">
              {t('leaderboard.recordsBeaten')}
            </div>
          </div>
        </div>

        {/* E4 — NREL-style efficiency timeline slider */}
        <div className="mb-4 rounded-lg border border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
          <div className="flex items-center justify-between mb-2.5 gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                {t('leaderboard.timeline')}
              </span>
              <Badge
                variant="outline"
                className="text-[11px] sm:text-[10px] tabular-nums shrink-0 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              >
                {t('leaderboard.asOf')} {selectedYear}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant={isPlaying ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  // If at the end, rewind to the start before playing.
                  if (!isPlaying && selectedYear >= maxYear) setSelectedYear(minYear)
                  setIsPlaying((p) => !p)
                }}
                className={`${isMobile ? 'h-11 px-3' : 'h-7 px-2.5'} text-xs gap-1.5`}
                aria-label={isPlaying ? t('leaderboard.pause') : t('leaderboard.play')}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? t('leaderboard.pause') : t('leaderboard.play')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsPlaying(false)
                  setSelectedYear(maxYear)
                }}
                className={`${isMobile ? 'h-11 px-3' : 'h-7 px-2'} text-xs gap-1`}
                aria-label={t('leaderboard.reset')}
              >
                <RotateCcw className="w-3 h-3" />
                {t('leaderboard.reset')}
              </Button>
            </div>
          </div>

          {/* Year slider
              P1-6 — on mobile we enlarge the thumb (24px) and the
              track (8px) via arbitrary-variant classes targeting the
              internal `data-slot` selectors, and wrap the slider in a
              min-h-[44px] flex container so the touch target meets the
              44px minimum. Desktop keeps the default 16px thumb. */}
          <div className="px-1 pt-0.5">
            <div className={`${isMobile ? 'min-h-[44px] py-2' : 'py-1'} flex items-center`}>
              <Slider
                value={[selectedYear]}
                min={minYear}
                max={maxYear}
                step={1}
                onValueChange={(v) => {
                  const y = v[0]
                  if (typeof y === 'number') {
                    setSelectedYear(y)
                    setIsPlaying(false) // pause on manual scrub
                  }
                }}
                className={`cursor-pointer ${isMobile ? '[&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-track]]:h-2' : ''}`}
                aria-label={t('leaderboard.year')}
              />
            </div>
            {/* Milestone dots + year tick labels */}
            <div className="relative h-9 mt-2">
              {MILESTONES.map((m) => {
                const pct = ((m.year - minYear) / (maxYear - minYear)) * 100
                return (
                  <UITooltip key={m.year}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedYear(m.year)
                          setIsPlaying(false)
                        }}
                        // P1-6 — 44x44 hit area on mobile (the visible dot
                        // stays 10px, but the invisible button wraps it).
                        className={`absolute top-0 -translate-x-1/2 group focus:outline-none flex items-center justify-center ${isMobile ? 'h-11 w-11' : 'h-6 w-6'}`}
                        style={{ left: `${pct}%` }}
                        aria-label={`${m.year}: ${pick(m.en, m.zh)}`}
                      >
                        <span className="block w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-100 dark:ring-amber-950 group-hover:bg-amber-600 group-hover:scale-125 transition-transform" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[11px]">
                      <span className="font-semibold tabular-nums">{m.year}</span>
                      : {pick(m.en, m.zh)}
                    </TooltipContent>
                  </UITooltip>
                )
              })}
              {yearTicks.map((y, i) => {
                const pct = ((y - minYear) / (maxYear - minYear)) * 100
                const translate =
                  i === 0
                    ? 'translate-x-0'
                    : i === yearTicks.length - 1
                      ? '-translate-x-full'
                      : '-translate-x-1/2'
                return (
                  <span
                    key={y}
                    className={`absolute bottom-0 text-[11px] sm:text-[10px] text-slate-400 tabular-nums ${translate}`}
                    style={{ left: `${pct}%` }}
                  >
                    {y}
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="mb-4">
          <div className="flex items-center justify-end mb-1">
            <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 text-slate-400">
              <MousePointerClick className="w-2.5 h-2.5" />
              {t('leaderboard.clickHint')}
            </Badge>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(isMobile ? 200 : 220, visibleChart.length * (isMobile ? 52 : 60) + 40)}>
            <BarChart
              data={visibleChart}
              layout="vertical"
              margin={{ top: 4, right: isMobile ? 50 : 60, left: 8, bottom: 4 }}
              barCategoryGap="20%"
            >
              <defs>
                {/* Hatched pattern for the world-record bar */}
                <pattern
                  id="worldHatch"
                  patternUnits="userSpaceOnUse"
                  width="6"
                  height="6"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill="rgba(148,163,184,0.12)" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#475569" strokeWidth="1.5" />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={ctheme.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: isMobile ? 10 : 11, fill: ctheme.axis }}
                stroke={ctheme.axis}
                unit="%"
                domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={isMobile ? 92 : 130}
                tick={{ fontSize: isMobile ? 9 : 10, fill: ctheme.axis }}
                stroke={ctheme.axis}
                // P1-6 — on mobile, truncate long material names so the
                // YAxis column doesn't eat the bar chart area. Recharts
                // accepts a function that returns the formatted string.
                tickFormatter={(value: string) =>
                  isMobile && typeof value === 'string' && value.length > 12
                    ? `${value.slice(0, 11)}…`
                    : value
                }
              />
              <Tooltip
                cursor={{ fill: ctheme.cursorFill }}
                content={<CustomTooltip ctheme={ctheme} />}
              />
              {/* World-record bar (hatched, behind) — clickable */}
              <Bar
                dataKey="worldRecord"
                name="worldRecord"
                fill="url(#worldHatch)"
                stroke="#475569"
                strokeWidth={1}
                radius={[0, 4, 4, 0]}
                barSize={14}
                isAnimationActive
                animationDuration={300}
                animationEasing="ease-out"
                className="cursor-pointer"
                onClick={(d) => {
                  const p = (d as { payload?: ChartDatum }).payload
                  if (p) setSelectedBar(p)
                }}
              />
              {/* User efficiency bar (filled emerald, front) — clickable */}
              <Bar
                dataKey="userEff"
                name="userEff"
                radius={[0, 4, 4, 0]}
                barSize={14}
                isAnimationActive
                animationDuration={300}
                animationEasing="ease-out"
                className="cursor-pointer"
                onClick={(d) => {
                  const p = (d as { payload?: ChartDatum }).payload
                  if (p) setSelectedBar(p)
                }}
              >
                {visibleChart.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.beatsRecord ? '#f59e0b' : '#10b981'}
                    stroke={entry.beatsRecord ? '#b45309' : '#047857'}
                    strokeWidth={0.5}
                  />
                ))}
                <LabelList
                  dataKey="userEff"
                  position="right"
                  formatter={(v) => ((v as number) > 0 ? `${(v as number).toFixed(2)}%` : '')}
                  style={{ fontSize: 10, fill: ctheme.axis, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Show all toggle */}
        {chartData.length > 6 && (
          <div className="text-center mb-3">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className={`text-xs text-emerald-600 dark:text-emerald-400 hover:underline ${isMobile ? 'min-h-[44px] px-3 inline-flex items-center' : ''}`}
            >
              {showAll
                ? t('leaderboard.showTop6')
                : t('leaderboard.showAll', { n: chartData.length })}
            </button>
          </div>
        )}

        {/* Per-material gap rows + improvement hints */}
        <Accordion type="multiple" className="rounded-lg border border-slate-200 dark:border-slate-800 px-3">
          {visibleChart.map((g) => {
            const tip = tipFor(g.technology)
            return (
              <AccordionItem key={g.name} value={g.name} className="border-b-slate-100 dark:border-b-slate-800">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: techColor(g.technology) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-xs truncate text-slate-700 dark:text-slate-300">
                      {g.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] shrink-0 ml-1">
                      {g.technology.length > 24 ? `${g.technology.slice(0, 22)}…` : g.technology}
                    </Badge>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {g.userEff.toFixed(2)}%
                      </span>
                      <span className="text-[11px] sm:text-[10px] text-slate-400">/</span>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {g.worldRecord.toFixed(2)}%
                      </span>
                      {g.beatsRecord ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] sm:text-[9px] gap-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shrink-0"
                        >
                          <Crown className="w-2.5 h-2.5" /> {t('leaderboard.newRecord')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] sm:text-[9px] gap-0.5 bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700 shrink-0"
                        >
                          <TrendingDown className="w-2.5 h-2.5" />
                          −{Math.abs(g.gap).toFixed(2)}%
                        </Badge>
                      )}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-xs pl-5 pb-3">
                    <div className="flex items-start gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                          {t('leaderboard.howToImprove')}
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                          {pick(tip.en, tip.zh)}
                        </p>
                      </div>
                    </div>
                    {!g.beatsRecord && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                        {tr(
                          `Need to close a ${Math.abs(g.gap).toFixed(2)}% gap to match the world record.`,
                          `需缩小 ${Math.abs(g.gap).toFixed(2)}% 才能追平世界记录。`,
                        )}
                      </div>
                    )}
                    {g.beatsRecord && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <Crown className="w-3 h-3" />
                        {tr(
                          `Your material exceeds the published world record by ${Math.abs(g.gap).toFixed(2)}%. Consider submitting for independent certification.`,
                          `你的材料超出已发布世界记录 ${Math.abs(g.gap).toFixed(2)}%。建议送交独立认证。`,
                        )}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* World-record reference table (collapsible footer) */}
        <details className="mt-4 group">
          <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            {t('leaderboard.showAllRecords')}
            <span className="text-[11px] sm:text-[10px] text-slate-400 ml-1 group-open:hidden">▾</span>
            <span className="text-[11px] sm:text-[10px] text-slate-400 ml-1 hidden group-open:inline">▴</span>
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
            {data.worldRecords.map((w) => (
              <div
                key={w.category}
                className="rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div
                  className="text-[11px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate"
                  title={w.technology}
                >
                  {w.technology}
                </div>
                <div className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {w.efficiency.toFixed(1)}%
                </div>
                <div className="text-[11px] sm:text-[10px] text-slate-400">
                  {w.source} · {w.year}
                </div>
              </div>
            ))}
          </div>
        </details>

        {/* E3 — Materials Project-style detail dialog for the selected bar.
            Opens when the user clicks any bar in the chart above. Shows
            the user's record vs the world record, gap analysis, "how to
            improve" tips (mirrored from the accordion), and a mini-table
            of every efficiency record for the material. */}
        <Dialog open={!!selectedBar} onOpenChange={(o) => { if (!o) setSelectedBar(null) }}>
          <DialogContent className={`${isMobile ? 'max-w-full h-[100dvh] max-h-[100dvh] p-4 rounded-none' : 'sm:max-w-[520px] max-h-[85vh]'} overflow-y-auto`}>
            {selectedBar && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: techColor(selectedBar.technology) }}
                      aria-hidden="true"
                    />
                    <span className="font-mono">{selectedBar.name}</span>
                    {selectedBar.beatsRecord && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 gap-0.5">
                        <Crown className="w-3 h-3" />
                        {t('leaderboard.beatsRecord')}
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedBar.technology}
                  </DialogDescription>
                </DialogHeader>

                {/* User vs world record side-by-side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
                    <div className="flex items-center gap-1 text-[11px] sm:text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold">
                      <Trophy className="w-2.5 h-2.5" />
                      {t('leaderboard.yourRecord')}
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {selectedBar.userEff.toFixed(2)}%
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                      {selectedBar.userCertified ? (
                        <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {t('leaderboard.certified')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] sm:text-[9px] gap-0.5 bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700">
                          <CircleDashed className="w-2.5 h-2.5" />
                          {t('leaderboard.uncertified')}
                        </Badge>
                      )}
                      <span className="tabular-nums">
                        {selectedBar.userYear ?? t('leaderboard.yearUnknown')}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <div className="flex items-center gap-1 text-[11px] sm:text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                      <Globe2 className="w-2.5 h-2.5" />
                      {t('leaderboard.worldRecord')}
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-200 mt-0.5">
                      {selectedBar.worldRecord.toFixed(2)}%
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-[10px] text-slate-500 mt-0.5">
                      <span className="tabular-nums">{selectedBar.worldYear}</span>
                      <span>·</span>
                      <span className="truncate">{selectedBar.worldSource || 'NREL'}</span>
                    </div>
                  </div>
                </div>

                {/* Gap analysis */}
                <div className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${selectedBar.beatsRecord ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300' : 'bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {selectedBar.beatsRecord ? (
                    <>
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {tr(
                          `Beats the published world record by ${Math.abs(selectedBar.gap).toFixed(2)}% — consider submitting for independent certification.`,
                          `超出已发布世界记录 ${Math.abs(selectedBar.gap).toFixed(2)}% — 建议送交独立认证。`,
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                      <span>
                        {tr(
                          `${Math.abs(selectedBar.gap).toFixed(2)}% below the world record.`,
                          `低于世界记录 ${Math.abs(selectedBar.gap).toFixed(2)}%。`,
                        )}
                      </span>
                    </>
                  )}
                </div>

                {/* How to improve */}
                <div className="rounded-lg p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/70">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                    <Lightbulb className="w-3 h-3" />
                    {tr('How to improve', '如何改进')}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {pick(tipFor(selectedBar.technology).en, tipFor(selectedBar.technology).zh)}
                  </p>
                </div>

                {/* Mini-table of all efficiency records for this material */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    <FileText className="w-3 h-3" />
                    {t('leaderboard.allRecords')}
                    <Badge variant="outline" className="text-[10px] sm:text-[9px] ml-1">
                      {recordsForMaterial?.records?.length ?? 0}
                    </Badge>
                  </div>
                  {recordsLoading ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 py-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('leaderboard.loadingRecords')}
                    </div>
                  ) : (recordsForMaterial?.records?.length ?? 0) === 0 ? (
                    <div className="text-[11px] text-slate-400 italic py-2">
                      {t('leaderboard.noRecordsForMaterial')}
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                          <tr>
                            <th className="text-left font-medium px-2 py-1">{t('leaderboard.col.efficiency')}</th>
                            <th className="text-left font-medium px-2 py-1">{t('leaderboard.col.year')}</th>
                            <th className="text-left font-medium px-2 py-1">{t('leaderboard.col.source')}</th>
                            <th className="text-left font-medium px-2 py-1">{t('leaderboard.col.certified')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(recordsForMaterial?.records ?? []).map((r) => (
                            <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-2 py-1 font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {r.efficiencyValue.toFixed(2)}%
                              </td>
                              <td className="px-2 py-1 tabular-nums text-slate-600 dark:text-slate-300">
                                {r.year ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                                {r.source || r.sourceType || '—'}
                              </td>
                              <td className="px-2 py-1">
                                {r.certified ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <CircleDashed className="w-3 h-3 text-slate-300" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* DOI source link, if any record has one */}
                  {(recordsForMaterial?.records ?? []).find((r) => r.doi) && (
                    <a
                      href={doiUrl((recordsForMaterial?.records ?? []).find((r) => r.doi)?.doi ?? '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 mt-1.5 text-[11px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {t('leaderboard.viewSourcePaper')}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    size="sm"
                    className={isMobile ? 'h-11' : ''}
                    onClick={() => setSelectedBar(null)}
                  >
                    {t('leaderboard.close')}
                  </Button>
                  <Button
                    size="sm"
                    className={`bg-emerald-600 hover:bg-emerald-700 ${isMobile ? 'h-11' : ''}`}
                    onClick={() => {
                      if (onNavigate && selectedBar.materialId) {
                        onNavigate('efficiency', selectedBar.materialId)
                      } else {
                        // Fallback: reload into the Efficiency tab so
                        // page.tsx's mount-time URL reader picks it up.
                        const url = selectedBar.materialId
                          ? `/?tab=efficiency&materialId=${encodeURIComponent(selectedBar.materialId)}`
                          : '/?tab=efficiency'
                        window.location.href = url
                      }
                      setSelectedBar(null)
                    }}
                  >
                    {t('leaderboard.viewInEfficiencyTab')}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
})

export { EfficiencyLeaderboard }
