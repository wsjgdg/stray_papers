'use client'

import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wand2, Zap, Loader2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'
import type {
  HealthData,
  PipelineState,
  SearchBatchResponse,
  BatchJobResponse,
} from './types'
import { INITIAL_PIPELINE_STATE } from './types'
import { PipelineProgressModal } from './pipeline-modal'

/**
 * useFillAllPipeline — custom hook that orchestrates the 3-step fill
 * pipeline client-side.
 *
 * Each step is a sequential `await api(...)` call. Between steps we check a
 * `cancelRef` flag so the user can abort after the current step finishes.
 * We capture `startHealth` from /api/health before step 1 and `endHealth`
 * after step 3 so the completion toast can show the delta.
 *
 * Steps:
 *   1. POST /api/papers/search-batch  (max 20 materials, onlyEmpty=true)
 *   2. POST /api/classify/batch       (limit 50, with jobId for WS progress)
 *   3. POST /api/extract/batch        (limit 30, with jobId for WS progress)
 *
 * Search failures are NOT fatal — likely a network hiccup or all sources
 * rate-limited. We mark the step as failed and continue to classification
 * (there may already be unclassified papers).
 */
export function useFillAllPipeline() {
  const qc = useQueryClient()
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE)
  const cancelRef = useRef(false)
  const runningRef = useRef(false)

  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    cancelRef.current = false

    // Capture starting health for the final delta message
    let startHealth = 0
    try {
      const h = await api<HealthData>('/api/health')
      startHealth = h.overallHealth
    } catch {
      // ignore — keep startHealth at 0
    }

    setState({
      ...INITIAL_PIPELINE_STATE,
      step: 'search',
      startHealth,
      steps: {
        search: { status: 'running', total: 0, done: 0 },
        classify: { status: 'pending', total: 0, done: 0 },
        extract: { status: 'pending', total: 0, done: 0 },
      },
    })

    // ----- Step 1: Batch search papers for empty materials -----
    let searchInserted = 0
    let searchMaterials = 0
    let searchFailed = false
    let searchErrMsg: string | undefined
    try {
      const r = await api<SearchBatchResponse>('/api/papers/search-batch', {
        method: 'POST',
        body: JSON.stringify({ limit: 5, onlyEmpty: true, maxMaterials: 20 }),
      })
      searchInserted = r.totalInserted
      searchMaterials = r.materialsProcessed
    } catch (e) {
      // Search failures are NOT fatal — likely a network hiccup or all
      // sources rate-limited. Mark the step as failed and continue to
      // classification (there may already be unclassified papers).
      searchFailed = true
      searchErrMsg = (e as Error).message
    }

    if (cancelRef.current) {
      setState((s) => ({
        ...s,
        step: 'cancelled',
        steps: {
          ...s.steps,
          search: searchFailed
            ? { status: 'failed', total: 0, done: 0, message: searchErrMsg }
            : { status: 'completed', total: searchMaterials, done: searchMaterials, inserted: searchInserted },
        },
      }))
      runningRef.current = false
      return
    }

    setState((s) => ({
      ...s,
      steps: {
        ...s.steps,
        search: searchFailed
          ? { status: 'failed', total: 0, done: 0, message: searchErrMsg }
          : { status: 'completed', total: searchMaterials, done: searchMaterials, inserted: searchInserted },
      },
    }))

    // ----- Step 2: Batch classify unclassified papers -----
    const classifyJobId = `pipeline-classify-${Date.now()}`
    setState((s) => ({
      ...s,
      step: 'classify',
      classifyJobId,
      steps: {
        ...s.steps,
        classify: { status: 'running', total: 0, done: 0 },
      },
    }))

    let classifyResult: BatchJobResponse
    try {
      classifyResult = await api<BatchJobResponse>('/api/classify/batch', {
        method: 'POST',
        body: JSON.stringify({ limit: 50, jobId: classifyJobId }),
      })
    } catch (e) {
      const err = e as Error
      setState((s) => ({
        ...s,
        step: 'failed',
        errorMessage: err.message,
        steps: {
          ...s.steps,
          classify: { status: 'failed', total: 0, done: 0, message: err.message },
        },
      }))
      runningRef.current = false
      return
    }

    if (cancelRef.current) {
      setState((s) => ({
        ...s,
        step: 'cancelled',
        steps: {
          ...s.steps,
          classify: {
            status: 'completed',
            total: classifyResult.total,
            done: classifyResult.processed,
            processed: classifyResult.processed,
            errors: classifyResult.errors,
          },
        },
      }))
      runningRef.current = false
      return
    }

    setState((s) => ({
      ...s,
      steps: {
        ...s.steps,
        classify: {
          status: 'completed',
          total: classifyResult.total,
          done: classifyResult.processed,
          processed: classifyResult.processed,
          errors: classifyResult.errors,
        },
      },
    }))

    // ----- Step 3: Batch extract synthesized papers -----
    const extractJobId = `pipeline-extract-${Date.now()}`
    setState((s) => ({
      ...s,
      step: 'extract',
      extractJobId,
      steps: {
        ...s.steps,
        extract: { status: 'running', total: 0, done: 0 },
      },
    }))

    let extractResult: BatchJobResponse
    try {
      extractResult = await api<BatchJobResponse>('/api/extract/batch', {
        method: 'POST',
        body: JSON.stringify({ limit: 30, onlySynthesized: true, jobId: extractJobId }),
      })
    } catch (e) {
      const err = e as Error
      setState((s) => ({
        ...s,
        step: 'failed',
        errorMessage: err.message,
        steps: {
          ...s.steps,
          extract: { status: 'failed', total: 0, done: 0, message: err.message },
        },
      }))
      runningRef.current = false
      return
    }

    setState((s) => ({
      ...s,
      steps: {
        ...s.steps,
        extract: {
          status: 'completed',
          total: extractResult.total,
          done: extractResult.processed,
          processed: extractResult.processed,
          errors: extractResult.errors,
        },
      },
    }))

    // ----- Capture end health and announce -----
    let endHealth = startHealth
    try {
      const h = await api<HealthData>('/api/health')
      endHealth = h.overallHealth
    } catch {
      // ignore
    }

    setState((s) => ({ ...s, step: 'done', endHealth }))

    // Wipe every React Query cache so the dashboard, charts, coverage,
    // timeline, knowledge-graph, leaderboard etc. all re-fetch with the
    // newly-enriched DB.
    await qc.invalidateQueries()

    toast.success(
      endHealth >= startHealth
        ? `Pipeline complete! Data health improved from ${startHealth} to ${endHealth}`
        : `Pipeline complete. Data health: ${startHealth} → ${endHealth}`,
      { duration: 8000 },
    )

    runningRef.current = false
  }, [qc])

  const cancel = useCallback(() => {
    cancelRef.current = true
  }, [])

  const reset = useCallback(() => {
    if (runningRef.current) return
    setState(INITIAL_PIPELINE_STATE)
  }, [])

  const isRunning =
    state.step === 'search' ||
    state.step === 'classify' ||
    state.step === 'extract'

  return { state, run, cancel, reset, isRunning }
}

/**
 * FillAllDataHeroButton — large emerald CTA placed above the OneClickPipeline
 * card. Clicking it runs the full client-orchestrated pipeline
 * (search → classify → extract) and opens a modal with live per-step
 * progress.
 *
 * While running, the modal blocks ESC / outside-click so the user can't
 * accidentally dismiss the pipeline mid-flight. The Cancel button stops
 * after the current step completes.
 *
 * Only edits dashboard-tab.tsx — re-uses existing /api/papers/search-batch,
 * /api/classify/batch, /api/extract/batch endpoints. No new API route
 * created; orchestration is 100% client-side. i18n via t() from useI18n().
 */
export function FillAllDataHeroButton() {
  const { t } = useI18n()
  const pipeline = useFillAllPipeline()
  const [open, setOpen] = useState(false)

  const handleStart = () => {
    setOpen(true)
    void pipeline.run()
  }

  const handleOpenChange = (o: boolean) => {
    // Block close attempts while the pipeline is running (click-outside, ESC).
    if (!o && pipeline.isRunning) return
    setOpen(o)
    if (!o) {
      // Defer reset so the close animation can finish before state clears.
      setTimeout(() => pipeline.reset(), 200)
    }
  }

  const handleCancel = () => {
    pipeline.cancel()
  }

  // --- i18n ---
  const titleText = t('dashboard.fillAll.title')
  const descText = t('dashboard.fillAll.desc')
  const estTimeText = t('dashboard.fillAll.estTime')
  const runningText = t('dashboard.fillAll.running')
  const startBtnText = t('dashboard.fillAll.startBtn')
  const cappedNoteText = t('dashboard.fillAll.capsNote')

  return (
    <>
      <Card className="relative overflow-hidden border-emerald-300/70 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 shadow-sm">
        <CardContent className="p-4 sm:p-5 relative z-10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                <Wand2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center justify-center w-5 h-5 text-sm">⚡</span>
                  {titleText}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">
                  {descText}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {estTimeText}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span>{cappedNoteText}</span>
                </p>
              </div>
            </div>
            <Button
              onClick={handleStart}
              disabled={pipeline.isRunning}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shrink-0 w-full sm:w-auto h-12 sm:px-6 text-base"
              aria-label={titleText}
            >
              {pipeline.isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span className="truncate">{runningText}</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  {startBtnText}
                </>
              )}
            </Button>
          </div>
        </CardContent>
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
      </Card>

      <PipelineProgressModal
        open={open}
        onOpenChange={handleOpenChange}
        state={pipeline.state}
        onCancel={handleCancel}
      />
    </>
  )
}
