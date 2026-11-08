'use client'

import { useState, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, Loader2, Star, Trophy, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

interface CompareItem {
  id: string
  name: string
  category: string
  paperCount: number
  yearRange: string
  maxCitations: number
  synthesized: string
  bandgap: string
  method: string
  conditions: string
  maxEfficiency: number | null
  efficiencyCertified: boolean
  efficiencySource: string
}

type FieldKey = keyof CompareItem
type TFn = (key: string, vars?: Record<string, string | number>) => string

// Fields whose values should be compared as numbers for diff detection.
const NUMERIC_KEYS: FieldKey[] = ['paperCount', 'maxCitations', 'maxEfficiency', 'bandgap']
// Fields where "higher is better" and a single best material gets a star.
// bandgap is intentionally excluded — lower isn't universally better.
const BEST_KEYS: FieldKey[] = ['paperCount', 'maxCitations', 'maxEfficiency']

const KNOWN_CATS = ['perovskite', 'chalcogenide', 'oxide', 'other']

// Shared palette for the radar chart strokes/fills and both the hover and
// keyboard tooltips, so colors stay in sync across all three surfaces.
const RADAR_COLORS = ['#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6']

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s === '—') return null
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function catBadgeClass(cat: string): string {
  switch (cat) {
    case 'perovskite':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
    case 'chalcogenide':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
    case 'oxide':
      return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700'
  }
}

// Does this row's values differ across the compared materials?
function isDiffRow(key: FieldKey, items: CompareItem[]): boolean {
  if (NUMERIC_KEYS.includes(key)) {
    const nums = items
      .map((c) => parseNum(c[key]))
      .filter((v): v is number => v !== null)
    if (nums.length < 2) return false
    return !nums.every((v) => v === nums[0])
  }
  const strs = items
    .map((c) => String(c[key] ?? '').trim())
    .filter((s) => s !== '' && s !== '—')
  if (strs.length < 2) return false
  return !strs.every((v) => v === strs[0])
}

// For numeric "higher is better" rows, return the id of the single best
// material. Returns null on ties or non-best fields.
function bestIdForKey(key: FieldKey, items: CompareItem[]): string | null {
  if (!BEST_KEYS.includes(key)) return null
  const nums = items
    .map((c) => ({ id: c.id, n: parseNum(c[key]) }))
    .filter((x): x is { id: string; n: number } => x.n !== null)
  if (nums.length < 2) return null
  const max = Math.max(...nums.map((x) => x.n))
  const top = nums.filter((x) => x.n === max)
  return top.length === 1 ? top[0].id : null
}

interface Winner {
  label: string
  name: string
  value: string
  color: 'emerald' | 'amber' | 'sky' | 'violet'
}

/** Locale-aware string picker — signature matches the `pick` fn from useI18n,
 *  narrowed to `string`. Used by module-level helpers (computeWinners / renderCell)
 *  that can't call the hook themselves. */
type TrFn = (en: string, zh: string) => string

function computeWinners(items: CompareItem[], tr: TrFn): Winner[] {
  const out: Winner[] = []
  if (items.length < 2) return out

  // Highest efficiency
  const eff = items
    .map((c) => ({ c, n: c.maxEfficiency }))
    .filter((x) => x.n !== null && x.n !== undefined)
  if (eff.length >= 2) {
    const max = Math.max(...eff.map((x) => x.n as number))
    const top = eff.filter((x) => x.n === max)
    if (top.length === 1) {
      out.push({
        label: tr('Highest efficiency', '最高效率'),
        name: top[0].c.name,
        value: `${(top[0].n as number).toFixed(2)}%`,
        color: 'emerald',
      })
    }
  }

  // Most papers
  const papers = items.map((c) => ({ c, n: c.paperCount }))
  if (papers.length >= 2) {
    const max = Math.max(...papers.map((x) => x.n))
    const top = papers.filter((x) => x.n === max)
    if (top.length === 1) {
      out.push({
        label: tr('Most papers', '论文最多'),
        name: top[0].c.name,
        value: String(top[0].n),
        color: 'sky',
      })
    }
  }

  // Most cited
  const cited = items.map((c) => ({ c, n: c.maxCitations }))
  if (cited.length >= 2) {
    const max = Math.max(...cited.map((x) => x.n))
    const top = cited.filter((x) => x.n === max)
    if (top.length === 1) {
      out.push({
        label: tr('Most cited', '引用最高'),
        name: top[0].c.name,
        value: String(top[0].n),
        color: 'amber',
      })
    }
  }

  // Narrowest bandgap (smallest positive value)
  const bg = items
    .map((c) => ({ c, n: parseNum(c.bandgap) }))
    .filter((x) => x.n !== null && x.n > 0)
  if (bg.length >= 2) {
    const min = Math.min(...bg.map((x) => x.n as number))
    const top = bg.filter((x) => x.n === min)
    if (top.length === 1) {
      out.push({
        label: tr('Narrowest bandgap', '最窄带隙'),
        name: top[0].c.name,
        value: `${(top[0].n as number).toFixed(2)} eV`,
        color: 'violet',
      })
    }
  }

  return out
}

const WINNER_COLOR: Record<Winner['color'], string> = {
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  amber:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  violet:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
}

function renderCell(
  field: { key: FieldKey; longText?: boolean },
  c: CompareItem,
  isBest: boolean,
  tr: TrFn,
  t: TFn,
): ReactNode {
  const key = field.key
  const val = c[key]

  // Category → colored badge
  if (key === 'category') {
    const cat = String(val ?? 'other')
    const label = KNOWN_CATS.includes(cat) ? t(`materials.cat.${cat}`) : cat
    return (
      <Badge variant="outline" className={`text-[10px] font-medium ${catBadgeClass(cat)}`}>
        {label}
      </Badge>
    )
  }

  // Max efficiency — green + "★ best" when winner
  if (key === 'maxEfficiency') {
    if (val === null || val === undefined) {
      return <span className="text-slate-400">—</span>
    }
    return (
      <span
        className={`inline-flex items-center gap-1 ${
          isBest
            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-orange-600 dark:text-orange-400'
        }`}
      >
        {Number(val).toFixed(2)}%
        {c.efficiencyCertified ? ' ✓' : ''}
        {isBest && (
          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <Star className="w-3 h-3 fill-current" />
            {tr('best', '最优')}
          </span>
        )}
      </span>
    )
  }

  // Bandgap — emerald text, no "best" (application dependent)
  if (key === 'bandgap') {
    const n = parseNum(val)
    if (n === null) return <span className="text-slate-400">—</span>
    return <span className="text-emerald-600 dark:text-emerald-400">{String(val)}</span>
  }

  // Numeric "higher is better" (paperCount, maxCitations) — subtle ★ on winner
  if (typeof val === 'number') {
    return (
      <span
        className={`inline-flex items-center gap-1 ${
          isBest
            ? 'font-bold text-slate-900 dark:text-slate-50'
            : 'text-slate-700 dark:text-slate-300'
        }`}
      >
        {String(val)}
        {isBest && <Star className="w-3 h-3 text-amber-500 fill-current" />}
      </span>
    )
  }

  // Generic string
  const s = String(val ?? '').trim()
  if (!s || s === '—') return <span className="text-slate-400">—</span>
  return (
    <span
      className={`block ${
        field.longText ? 'whitespace-normal break-words' : 'whitespace-nowrap'
      }`}
    >
      {s}
    </span>
  )
}

export function CompareDialog({ materialIds }: { materialIds: string[] }) {
  const { t, locale, pick: tr } = useI18n()
  const [open, setOpen] = useState(false)
  // Index of the metric currently focused via keyboard (0=Papers, 1=Citations,
  // 2=Efficiency, 3=Bandgap). null when the radar container isn't focused.
  const [focusedMetricIndex, setFocusedMetricIndex] = useState<number | null>(null)
  const idsParam = materialIds.slice(0, 4).join(',')

  const { data, isLoading } = useQuery<{ comparison: CompareItem[] }>({
    queryKey: ['compare', idsParam],
    queryFn: () => api(`/api/compare?ids=${idsParam}`),
    enabled: open && materialIds.length >= 2,
  })

  const comparison = data?.comparison ?? []

  const fields: Array<{ key: FieldKey; label: string; longText?: boolean }> = [
    { key: 'category', label: tr('Category', '类别') },
    { key: 'paperCount', label: tr('Papers', '论文数') },
    { key: 'yearRange', label: tr('Year range', '年份范围') },
    { key: 'maxCitations', label: tr('Max citations', '最高引用') },
    { key: 'synthesized', label: tr('Synthesized', '可合成') },
    { key: 'bandgap', label: tr('Bandgap (eV)', '带隙 (eV)') },
    { key: 'method', label: tr('Method', '方法'), longText: true },
    { key: 'conditions', label: tr('Conditions', '条件'), longText: true },
    { key: 'maxEfficiency', label: tr('Max eff (%)', '最高效率 (%)') },
    { key: 'efficiencySource', label: tr('Eff source', '效率来源') },
  ]

  // Precompute diff flag + best material id per field row.
  const fieldMeta = useMemo(
    () =>
      fields.map((f) => {
        const diff = isDiffRow(f.key, comparison)
        const bestId = diff ? bestIdForKey(f.key, comparison) : null
        return { ...f, diff, bestId }
      }),
    // `fields` is derived purely from `locale` (via `tr`), so depending on
    // locale alone keeps this memo stable across unrelated re-renders.
    [comparison, locale, fields],
  )

  const winners = useMemo(() => computeWinners(comparison, tr as TrFn), [comparison, tr])

  // Radar chart data, normalized to 0-100 per metric (relative to the max
  // across compared materials) so no single metric dominates the chart.
  const radarData = useMemo(() => {
    if (comparison.length < 2) return []
    const metrics: Array<{ metric: string; key: FieldKey }> = [
      { metric: tr('Papers', '论文'), key: 'paperCount' },
      { metric: tr('Citations', '引用'), key: 'maxCitations' },
      { metric: tr('Efficiency', '效率'), key: 'maxEfficiency' },
      { metric: tr('Bandgap', '带隙'), key: 'bandgap' },
    ]
    return metrics.map((m) => {
      const vals = comparison.map((c) => parseNum(c[m.key]) ?? 0)
      const max = Math.max(...vals, 0)
      const point: Record<string, string | number> = { metric: m.metric }
      for (const c of comparison) {
        const v = parseNum(c[m.key]) ?? 0
        point[c.name] = max > 0 ? Math.round((v / max) * 100) : 0
      }
      return point
    })
  }, [comparison, locale, tr])

  // Lookup: localized metric label -> materialName -> original (display) value.
  // Mirrors the radar metrics so the tooltip can show real numbers instead of
  // the normalized 0-100 scores Recharts consumes.
  const rawDataLookup = useMemo(() => {
    const map: Record<string, Record<string, string | number>> = {}
    const metrics: Array<{ label: string; get: (c: CompareItem) => string | number }> = [
      { label: tr('Papers', '论文'), get: (c) => c.paperCount },
      { label: tr('Citations', '引用'), get: (c) => c.maxCitations },
      {
        label: tr('Efficiency', '效率'),
        get: (c) =>
          c.maxEfficiency === null || c.maxEfficiency === undefined
            ? '—'
            : `${c.maxEfficiency.toFixed(2)}%`,
      },
      { label: tr('Bandgap', '带隙'), get: (c) => (c.bandgap?.trim() ? c.bandgap : '—') },
    ]
    for (const metric of metrics) {
      map[metric.label] = {}
      for (const c of comparison) {
        map[metric.label][c.name] = metric.get(c)
      }
    }
    return map
  }, [comparison, locale, tr])

  // Shared tooltip renderer: takes the localized metric label and the
  // (possibly undefined) radarData point for that metric. Used by both the
  // Recharts hover Tooltip (via renderRadarTooltip below) and the keyboard
  // navigation tooltip so they show identical content.
  const renderTooltipContent = (
    metric: string,
    point: Record<string, string | number> | undefined,
  ) => {
    const raw = rawDataLookup[metric] ?? {}
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-background/95 backdrop-blur p-2 shadow-md text-xs max-w-[220px]">
        <div className="font-semibold mb-1 text-slate-900 dark:text-slate-100">{metric}</div>
        <div className="space-y-0.5">
          {comparison.map((c, idx) => {
            const name = c.name
            const rawVal = raw[name] ?? '—'
            const normVal = point ? point[name] : undefined
            const norm = typeof normVal === 'number' ? normVal.toFixed(0) : '—'
            return (
              <div key={`${name}-${idx}`} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: RADAR_COLORS[idx % RADAR_COLORS.length] }}
                />
                <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{name}</span>
                <span className="ml-auto font-semibold text-slate-900 dark:text-slate-100">
                  {rawVal}
                </span>
                <span className="text-slate-400 text-[10px]">({norm})</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Custom tooltip for the radar chart: shows the original (pre-normalization)
  // value for each material plus the normalized 0-100 score in parentheses.
  const renderRadarTooltip = (props: {
    active?: boolean
    payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>
    label?: string | number
  }) => {
    if (!props.active || !props.payload?.length) return null
    const metric = String(props.label ?? '')
    const point = radarData.find((d) => d.metric === metric)
    return renderTooltipContent(metric, point)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={materialIds.length < 2} className="gap-1.5">
          <GitCompare className="w-3.5 h-3.5" />
          {tr('Compare', '比较')} ({materialIds.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-emerald-500" />
            {tr('Material Comparison', '材料对比')}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto gap-1.5 h-7 text-xs"
              onClick={() => {
                const url = `/api/compare/report?ids=${encodeURIComponent(idsParam)}`
                window.open(url, '_blank', 'noopener,noreferrer')
              }}
              disabled={materialIds.length < 2}
              title={tr('Open a print-friendly report (use Save as PDF)', '打开可打印报告（用“另存为 PDF”）')}
            >
              <FileDown className="w-3.5 h-3.5" />
              {tr('Export PDF', '导出 PDF')}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : comparison.length >= 2 ? (
          <div className="space-y-4">
            {/* Winner summary pills */}
            {winners.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {winners.map((w) => (
                  <div
                    key={w.label}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${WINNER_COLOR[w.color]}`}
                  >
                    <Trophy className="w-3 h-3 shrink-0" />
                    <span className="opacity-70">{w.label}:</span>
                    <span className="font-semibold">{w.name}</span>
                    <span className="opacity-70">({w.value})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block w-3.5 h-3.5 rounded-sm bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700" />
              {tr(
                'Highlighted rows have different values across materials',
                '高亮行表示各材料间数值不同',
              )}
            </div>

            {/* Comparison table — sticky header + sticky first column */}
            <div className="overflow-auto max-h-[55vh] rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 bg-slate-100 dark:bg-slate-900 p-2 text-left text-slate-500 dark:text-slate-400 font-medium border-b border-r border-slate-200 dark:border-slate-700 min-w-[110px]">
                      {tr('Field', '字段')}
                    </th>
                    {comparison.map((c) => (
                      <th
                        key={c.id}
                        className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 p-2 text-left font-mono font-bold text-slate-900 dark:text-slate-100 min-w-[150px] border-b border-slate-200 dark:border-slate-700"
                      >
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fieldMeta.map((field, rowIdx) => {
                    const cellBg = field.diff
                      ? 'bg-amber-50 dark:bg-amber-950/40'
                      : rowIdx % 2 === 1
                        ? 'bg-slate-50 dark:bg-slate-900/50'
                        : 'bg-white dark:bg-slate-950'
                    // Sticky first-column cell needs an opaque bg so scrolled
                    // content doesn't bleed through; use a solid dark variant.
                    const stickyBg = field.diff
                      ? 'bg-amber-50 dark:bg-amber-950'
                      : 'bg-slate-100 dark:bg-slate-900'
                    const hoverBg = field.diff
                      ? 'group-hover:bg-amber-100 dark:group-hover:bg-amber-900/60'
                      : 'group-hover:bg-slate-100 dark:group-hover:bg-slate-800/60'
                    return (
                      <tr key={field.key} className="group">
                        <td
                          className={`sticky left-0 z-10 ${stickyBg} ${hoverBg} p-2 text-slate-500 dark:text-slate-400 font-medium border-r border-slate-200 dark:border-slate-800 align-top min-w-[110px] transition-colors`}
                        >
                          {field.label}
                        </td>
                        {comparison.map((c) => (
                          <td
                            key={c.id}
                            className={`${cellBg} ${hoverBg} p-2 align-top transition-colors`}
                          >
                            {renderCell(field, c, field.bestId === c.id, tr as TrFn, t)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Normalized radar chart */}
            {radarData.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {tr('Radar Chart Comparison', '雷达图对比')}
                </div>
                <div
                  className="relative h-[250px] sm:h-[300px] w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  tabIndex={0}
                  role="group"
                  aria-label={tr(
                    'Radar chart comparison. Use arrow keys to navigate metrics.',
                    '雷达图对比。使用方向键切换指标。',
                  )}
                  onFocus={() => setFocusedMetricIndex(0)}
                  onBlur={() => setFocusedMetricIndex(null)}
                  onKeyDown={(e) => {
                    if (radarData.length === 0) return
                    const n = radarData.length
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      setFocusedMetricIndex((i) => (i === null ? 0 : (i + 1) % n))
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      setFocusedMetricIndex((i) => (i === null ? 0 : (i - 1 + n) % n))
                    }
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      {comparison.map((c, i) => (
                        <Radar
                          key={c.id}
                          name={c.name}
                          dataKey={c.name}
                          stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                          fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      ))}
                      <Tooltip content={renderRadarTooltip as never} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                  {focusedMetricIndex !== null &&
                    focusedMetricIndex >= 0 &&
                    focusedMetricIndex < radarData.length && (
                      <div
                        className="absolute top-2 right-2 z-10 pointer-events-none"
                        aria-hidden="true"
                      >
                        {renderTooltipContent(
                          String(radarData[focusedMetricIndex].metric),
                          radarData[focusedMetricIndex],
                        )}
                      </div>
                    )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  {tr(
                    'Values normalized to 0-100 scale (relative to the maximum across compared materials)',
                    '数值已归一化到 0-100 范围（相对于对比材料中的最大值）',
                  )}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 text-sm">
            {tr(
              'Select at least 2 materials to compare.',
              '请选择至少 2 种材料进行对比。',
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
