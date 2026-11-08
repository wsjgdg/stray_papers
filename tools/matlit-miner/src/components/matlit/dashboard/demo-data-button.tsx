'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Database, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { STALE_TIMES, QUERY_KEYS } from '@/lib/query-keys'
import { useI18n } from '@/components/i18n/provider'
import type { DemoSeedResponse, HealthData } from './types'

/**
 * DemoDataButton — two-button cluster shown inside the dashboard hero:
 *   1. "Load demo data" — POST /api/demo/seed, idempotent one-click fill of a
 *      realistic complete dataset (60 materials + 50 papers + 50
 *      classifications + 10 efficiencies + 5 verifications). Button is
 *      disabled and re-labelled "Demo data loaded ✓" once overall health
 *      crosses 50% (so the user sees clear feedback that the dataset is
 *      already substantial).
 *   2. "Reset all data" — POST /api/demo/reset, ghost+rose, opens an
 *      AlertDialog confirm before wiping the entire DB. Disabled when DB
 *      is already empty (overall health === 0).
 *
 * Both mutations end with `qc.invalidateQueries()` (no queryKey) so every
 * React Query cache — stats, health, materials, papers, coverage,
 * knowledge-graph, efficiency-trend, history, … — refetches on success.
 *
 * Re-uses the same ['health'] cache key as DataHealthCard so the "demo
 * loaded?" detection shares a single network round-trip with the meter.
 */
export function DemoDataButton() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const { data: health } = useQuery<HealthData>({
    queryKey: QUERY_KEYS.health,
    queryFn: () => api<HealthData>('/api/health'),
    staleTime: STALE_TIMES.health,
  })
  const overall = health?.overallHealth ?? 0
  const alreadyLoaded = overall > 50
  const isEmpty = overall === 0

  const seedMutation = useMutation({
    mutationFn: () =>
      api<DemoSeedResponse>('/api/demo/seed', { method: 'POST' }),
    onSuccess: async (data) => {
      // Wipe every React Query cache so the dashboard, charts, coverage,
      // timeline, knowledge-graph, leaderboard etc. all re-fetch with the
      // freshly-seeded DB.
      await qc.invalidateQueries()
      toast.success(
        t('dashboard.demoData.toast.loaded', {
          materials: data.materials,
          papers: data.papers,
          classifications: data.classifications,
          efficiencies: data.efficiencies,
          verifications: data.verifications,
        }),
        { duration: 6000 },
      )
    },
    onError: (err: Error) => {
      toast.error(
        t('dashboard.demoData.toast.loadFailed', { msg: err.message }),
      )
    },
  })

  const resetMutation = useMutation({
    mutationFn: () =>
      api<{ deleted: boolean; counts: Record<string, number> }>('/api/demo/reset', { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries()
      setResetting(false)
      setResetOpen(false)
      toast.success(t('dashboard.demoData.toast.cleared'))
    },
    onError: (err: Error) => {
      setResetting(false)
      toast.error(
        t('dashboard.demoData.toast.resetFailed', { msg: err.message }),
      )
    },
  })

  const btnLabel = t('dashboard.demoData.btnLabel')
  const loadedLabel = t('dashboard.demoData.loadedLabel')
  const loadingLabel = t('dashboard.demoData.loadingLabel')
  const resetLabel = t('dashboard.demoData.resetLabel')
  const resetConfirmTitle = t('dashboard.demoData.resetConfirmTitle')
  const resetConfirmDesc = t('dashboard.demoData.resetConfirmDesc')
  const cancelLabel = t('common.cancel')
  const continueLabel = t('dashboard.demoData.continueLabel')

  return (
    <>
      <Button
        onClick={() => seedMutation.mutate()}
        disabled={seedMutation.isPending || alreadyLoaded}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        size="sm"
        aria-label={btnLabel}
        title={alreadyLoaded ? loadedLabel : t('dashboard.demoData.titleHint')}
      >
        {seedMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : alreadyLoaded ? (
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
        ) : (
          <Database className="w-4 h-4 mr-1.5" />
        )}
        {seedMutation.isPending ? loadingLabel : alreadyLoaded ? loadedLabel : btnLabel}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setResetOpen(true)}
        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
        disabled={resetMutation.isPending || isEmpty}
        aria-label={resetLabel}
        title={isEmpty ? t('dashboard.demoData.emptyHint') : t('dashboard.demoData.resetHint')}
      >
        <Trash2 className="w-3.5 h-3.5 mr-1" /> {resetLabel}
      </Button>

      <AlertDialog open={resetOpen} onOpenChange={(o) => { if (!resetting) setResetOpen(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              {resetConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{resetConfirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={(e) => {
                e.preventDefault()
                setResetting(true)
                resetMutation.mutate()
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {resetting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {continueLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
