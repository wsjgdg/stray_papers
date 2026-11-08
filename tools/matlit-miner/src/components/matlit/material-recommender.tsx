'use client'

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Lightbulb,
  Loader2,
  Search,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Zap,
  ShieldCheck,
  FlaskConical,
  Layers,
  Sparkles,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import { toast } from 'sonner'
import type { TabValue } from '@/app/page'

// MaterialRecommenderDialog
//
// G13 — a requirement-driven material recommender. The user dials in their
// constraints (min efficiency, bandgap window, lead-free, category, and a
// stability-required toggle), clicks "Find materials", and the backend
// /api/recommend endpoint returns up to 5 ranked candidates with a 0–100
// match score, the list of criteria they satisfy, and any informational
// data gaps. Clicking a result navigates to the Papers tab pre-filtered
// to that material.
//
// Pure filtering + scoring — no LLM call. Results are cached server-side
// for 5 min per requirements-hash so dial-twiddling is cheap.

interface Requirements {
  minEfficiency: number | null
  minBandgap: number
  maxBandgap: number
  leadFree: boolean
  category: string // 'all' | 'perovskite' | 'chalcogenide' | 'oxide' | 'other'
  stabilityRequired: boolean
}

interface RecommendItem {
  materialId: string
  name: string
  score: number
  matchedCriteria: string[]
  missingCriteria: string[]
}

interface RecommendResponse {
  results: RecommendItem[]
  total: number
  generatedAt: string
}

const CATEGORY_OPTIONS = [
  { value: 'all', labelKey: 'recommend.category.all' },
  { value: 'perovskite', labelKey: 'recommend.category.perovskite' },
  { value: 'chalcogenide', labelKey: 'recommend.category.chalcogenide' },
  { value: 'oxide', labelKey: 'recommend.category.oxide' },
  { value: 'other', labelKey: 'recommend.category.other' },
]

const SCORE_TONE: Array<{
  min: number
  ring: string
  text: string
  labelKey: string
}> = [
  {
    min: 85,
    ring: 'stroke-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    labelKey: 'recommend.score.excellent',
  },
  {
    min: 65,
    ring: 'stroke-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    labelKey: 'recommend.score.good',
  },
  {
    min: 50,
    ring: 'stroke-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    labelKey: 'recommend.score.fair',
  },
  {
    min: 0,
    ring: 'stroke-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
    labelKey: 'recommend.score.weak',
  },
]

function scoreTone(score: number) {
  return SCORE_TONE.find((t) => score >= t.min) ?? SCORE_TONE[SCORE_TONE.length - 1]
}

/**
 * Compact score ring — same SVG donut style as the dashboard StatCard,
 * sized down to 40×40 for inline use in result rows.
 */
function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score)
  const pct = Math.max(0, Math.min(100, score))
  const circumference = 2 * Math.PI * 14
  const dashOffset = circumference - (pct / 100) * circumference
  return (
    <div className="relative w-10 h-10 shrink-0" aria-hidden>
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          strokeWidth="3"
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          strokeWidth="3"
          className={tone.ring}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums ${tone.text}`}
      >
        {score}
      </div>
    </div>
  )
}

function RecommendResultRow({
  item,
  rank,
  onNavigate,
  onClose,
}: {
  item: RecommendItem
  rank: number
  onNavigate: (t: TabValue, materialId?: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const tone = scoreTone(item.score)
  const matchedLabel = t('recommend.row.matched')
  const missingLabel = t('recommend.row.missing')
  const viewPapersLabel = t('recommend.row.viewPapers')
  const rankLabel = t('recommend.row.rank', { rank })

  return (
    <Card className="border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
      <CardContent className="p-4 flex items-start gap-3">
        <ScoreRing score={item.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {item.name}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                {rankLabel} ·{' '}
                <span className={tone.text}>{t(tone.labelKey)}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              onClick={() => {
                onClose()
                onNavigate('papers', item.materialId)
              }}
              aria-label={`${viewPapersLabel}: ${item.name}`}
            >
              {viewPapersLabel}
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {item.matchedCriteria.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" aria-hidden />
                {matchedLabel}
              </div>
              <div className="flex flex-wrap gap-1">
                {item.matchedCriteria.map((c) => (
                  <Badge
                    key={c}
                    variant="outline"
                    className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {item.missingCriteria.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" aria-hidden />
                {missingLabel}
              </div>
              <div className="flex flex-wrap gap-1">
                {item.missingCriteria.map((c) => (
                  <Badge
                    key={c}
                    variant="outline"
                    className="text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function MaterialRecommenderDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onNavigate: (t: TabValue, materialId?: string) => void
}) {
  const { t, locale } = useI18n()
  const [minEfficiency, setMinEfficiency] = useState<number | null>(15)
  const [bandgapRange, setBandgapRange] = useState<[number, number]>([1.0, 1.8])
  const [leadFree, setLeadFree] = useState(false)
  const [category, setCategory] = useState<string>('all')
  const [stabilityRequired, setStabilityRequired] = useState(false)

  // i18n — recommend.* keys live in src/components/i18n/provider.tsx
  const L = useMemo(
    () => ({
      title: t('recommend.title'),
      desc: t('recommend.desc'),
      minEffLabel: t('recommend.minEffLabel'),
      minEffHint: (v: number | null) =>
        v === null ? t('recommend.minEffHint') : t('recommend.minEffHintValue', { v }),
      minEffClear: t('recommend.minEffClear'),
      bandgapLabel: t('recommend.bandgapLabel'),
      bandgapHint: (lo: number, hi: number) =>
        t('recommend.bandgapHint', { lo: lo.toFixed(1), hi: hi.toFixed(1) }),
      leadFreeLabel: t('recommend.leadFreeLabel'),
      leadFreeDesc: t('recommend.leadFreeDesc'),
      categoryLabel: t('recommend.categoryLabel'),
      stabilityLabel: t('recommend.stabilityLabel'),
      stabilityDesc: t('recommend.stabilityDesc'),
      findBtn: t('recommend.findBtn'),
      finding: t('recommend.finding'),
      empty: t('recommend.empty'),
      resultsHeading: (n: number, total: number) =>
        t('recommend.resultsHeading', { n, total }),
      generatedAt: (iso: string) =>
        t('recommend.generatedAt', { date: new Date(iso).toLocaleString(locale) }),
      error: (msg: string) => t('recommend.error', { msg }),
      close: t('recommend.close'),
    }),
    [t, locale],
  )

  const findMutation = useMutation({
    mutationFn: async (): Promise<RecommendResponse> => {
      // Build the request payload — only include criteria that the user
      // actually enabled (null/missing on the server = "don't filter").
      const requirements: Record<string, unknown> = {}
      if (minEfficiency !== null) requirements.minEfficiency = minEfficiency
      // Only include bandgap bounds when they represent a real constraint
      // (i.e. not the full 0–5 eV default range). This avoids filtering
      // out materials with no bandgap record when the user didn't really
      // care about bandgap.
      if (bandgapRange[0] > 0 || bandgapRange[1] < 5) {
        requirements.minBandgap = bandgapRange[0]
        requirements.maxBandgap = bandgapRange[1]
      }
      if (leadFree) requirements.leadFree = true
      if (category !== 'all') requirements.category = category
      if (stabilityRequired) requirements.stabilityRequired = true

      return api<RecommendResponse>('/api/recommend', {
        method: 'POST',
        body: JSON.stringify({ requirements }),
      })
    },
    onError: (err: Error) => {
      toast.error(L.error(err.message))
    },
  })

  const results = findMutation.data?.results ?? []
  const total = findMutation.data?.total ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="w-5 h-5 text-amber-500" aria-hidden />
            {L.title}
          </DialogTitle>
          <DialogDescription>{L.desc}</DialogDescription>
        </DialogHeader>

        {/* Requirement controls */}
        <div className="space-y-4">
          {/* Min efficiency slider + clear button */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-orange-500" aria-hidden />
                {L.minEffLabel}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-slate-500">
                  {L.minEffHint(minEfficiency)}
                </span>
                {minEfficiency !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setMinEfficiency(null)}
                  >
                    {L.minEffClear}
                  </Button>
                )}
              </div>
            </div>
            {minEfficiency === null ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={() => setMinEfficiency(15)}
              >
                {t('recommend.minEffEnable')}
              </Button>
            ) : (
              <Slider
                value={[minEfficiency]}
                min={0}
                max={35}
                step={1}
                onValueChange={(v) => setMinEfficiency(v[0] ?? 0)}
                aria-label={L.minEffLabel}
              />
            )}
          </div>

          {/* Bandgap range slider */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-500" aria-hidden />
                {L.bandgapLabel}
              </Label>
              <span className="text-xs tabular-nums text-slate-500">
                {L.bandgapHint(bandgapRange[0], bandgapRange[1])}
              </span>
            </div>
            <Slider
              value={bandgapRange}
              min={0}
              max={5}
              step={0.1}
              onValueChange={(v) =>
                setBandgapRange([v[0] ?? 0, v[1] ?? 5] as [number, number])
              }
              aria-label={L.bandgapLabel}
            />
          </div>

          {/* Category select */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-violet-500" aria-hidden />
              {L.categoryLabel}
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead-free + stability toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" aria-hidden />
                  {L.leadFreeLabel}
                </Label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {L.leadFreeDesc}
                </p>
              </div>
              <Switch checked={leadFree} onCheckedChange={setLeadFree} aria-label={L.leadFreeLabel} />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-sky-500" aria-hidden />
                  {L.stabilityLabel}
                </Label>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {L.stabilityDesc}
                </p>
              </div>
              <Switch
                checked={stabilityRequired}
                onCheckedChange={setStabilityRequired}
                aria-label={L.stabilityLabel}
              />
            </div>
          </div>
        </div>

        {/* Find button */}
        <div className="flex justify-center">
          <Button
            onClick={() => findMutation.mutate()}
            disabled={findMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {findMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-1.5" />
            )}
            {findMutation.isPending ? L.finding : L.findBtn}
          </Button>
        </div>

        {/* Results */}
        {findMutation.isPending && (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm text-slate-500">{L.finding}</p>
          </div>
        )}

        {!findMutation.isPending && findMutation.data && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" aria-hidden />
                {L.resultsHeading(results.length, total)}
              </h4>
              <span className="text-[11px] text-slate-400">
                {L.generatedAt(findMutation.data.generatedAt)}
              </span>
            </div>

            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <p className="text-sm text-slate-500 max-w-md">{L.empty}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {results.map((item, i) => (
                  <RecommendResultRow
                    key={item.materialId}
                    item={item}
                    rank={i + 1}
                    onNavigate={onNavigate}
                    onClose={() => onOpenChange(false)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {L.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
