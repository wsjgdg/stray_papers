'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Loader2, CheckCircle2, ArrowRight, Lightbulb, Sparkles, FileText, Microscope, Zap as ZapIcon, ShieldCheck, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import type { TabValue } from '@/app/page'

interface PipelineProps {
  onNavigate: (tab: TabValue) => void
  stats: {
    materials: number
    papers: number
    classifications: number
    synthesized: number
    extracted: number
    efficiency: number
    verified: number
    pendingVerification: number
  } | undefined
}

export function OneClickPipeline({ onNavigate, stats }: PipelineProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [pipelineStep, setPipelineStep] = useState(0) // 0=idle, 1=search, 2=classify, 3=extract
  const [pipelineDone, setPipelineDone] = useState(false)

  const runPipeline = useMutation({
    mutationFn: async () => {
      setPipelineDone(false)
      // Step 1: Batch search
      setPipelineStep(1)
      await api('/api/papers/search-batch', { method: 'POST', body: JSON.stringify({ limit: 10, onlyEmpty: true, maxMaterials: 60 }) })

      // Step 2: Classify all
      setPipelineStep(2)
      await api('/api/classify/batch', { method: 'POST', body: JSON.stringify({ limit: 500 }) })

      // Step 3: Extract all
      setPipelineStep(3)
      await api('/api/extract/batch', { method: 'POST', body: JSON.stringify({ limit: 500 }) })
    },
    onSuccess: () => {
      setPipelineDone(true)
      setPipelineStep(0)
      toast.success(t('dashboard.hero.oneClickDone'))
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['nav-stats'] })
      qc.invalidateQueries({ queryKey: ['coverage'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
    onError: (e) => {
      setPipelineStep(0)
      toast.error(`Pipeline failed: ${(e as Error).message}`)
    },
  })

  const stepLabels = [t('dashboard.hero.oneClickSearch'), t('dashboard.hero.oneClickClassify'), t('dashboard.hero.oneClickExtract')]
  const isRunning = pipelineStep > 0

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{t('dashboard.hero.oneClick')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{t('dashboard.hero.oneClickDesc')}</p>
            </div>
          </div>
          <Button
            onClick={() => runPipeline.mutate()}
            disabled={isRunning}
            className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                <span className="text-xs">{t('dashboard.hero.oneClickStep', { n: pipelineStep, step: stepLabels[pipelineStep - 1] })}</span>
              </>
            ) : pipelineDone ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                {t('dashboard.hero.oneClickDone')}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-1" />
                {t('dashboard.hero.oneClick')}
              </>
            )}
          </Button>
        </div>
        {isRunning && (
          <div className="mt-3 space-y-1.5">
            <Progress value={(pipelineStep / 3) * 100} className="h-1.5 [&>div]:bg-emerald-500" />
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              {stepLabels.map((label, i) => (
                <span key={i} className={`flex items-center gap-0.5 ${pipelineStep > i + 1 ? 'text-emerald-600' : pipelineStep === i + 1 ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                  {pipelineStep > i + 1 ? <CheckCircle2 className="w-2.5 h-2.5" /> : pipelineStep === i + 1 ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />}
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function NextStepsCard({ onNavigate, stats }: PipelineProps) {
  const { t } = useI18n()
  if (!stats) return null

  const c = stats
  const unclassifiedCount = c.papers - c.classifications
  const pendingExtract = c.synthesized - c.extracted
  const materialsWithoutPapers = c.materials // simplified

  const steps: Array<{ condition: boolean; text: string; action: () => void; icon: React.ElementType; color: string }> = [
    { condition: c.materials === 0, text: t('dashboard.nextStep.seed'), action: () => onNavigate('materials'), icon: FlaskConical, color: 'text-emerald-600' },
    { condition: c.papers === 0, text: t('dashboard.nextStep.search', { n: c.materials }), action: () => onNavigate('papers'), icon: FileText, color: 'text-sky-600' },
    { condition: c.papers > 0 && unclassifiedCount > 0, text: t('dashboard.nextStep.classify', { n: unclassifiedCount }), action: () => onNavigate('classification'), icon: Sparkles, color: 'text-violet-600' },
    { condition: c.synthesized > 0 && pendingExtract > 0, text: t('dashboard.nextStep.extract', { n: pendingExtract }), action: () => onNavigate('extraction'), icon: Microscope, color: 'text-rose-600' },
    { condition: c.efficiency === 0 && c.extracted > 0, text: t('dashboard.nextStep.efficiency'), action: () => onNavigate('efficiency'), icon: ZapIcon, color: 'text-orange-600' },
    { condition: c.extracted > 0 && c.pendingVerification > 0, text: t('dashboard.nextStep.verify', { n: c.pendingVerification }), action: () => onNavigate('verification'), icon: ShieldCheck, color: 'text-indigo-600' },
    { condition: c.verified > 0 && c.extracted > 0 && c.efficiency > 0, text: t('dashboard.nextStep.export'), action: () => onNavigate('results'), icon: Download, color: 'text-teal-600' },
  ]

  const nextStep = steps.find(s => s.condition)
  const allDone = !nextStep && c.materials > 0 && c.papers > 0 && c.classifications > 0

  return (
    <Card className="border-amber-200/60 dark:border-amber-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" /> {t('dashboard.nextStep.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {allDone ? (
          <div className="text-center py-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
            <p className="text-sm font-medium text-emerald-600">{t('dashboard.nextStep.allDone')}</p>
          </div>
        ) : nextStep ? (
          <button
            onClick={nextStep.action}
            className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors text-left"
          >
            <nextStep.icon className={`w-4 h-4 ${nextStep.color} shrink-0`} />
            <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">{nextStep.text}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>
        ) : (
          <div className="text-center py-3 text-xs text-slate-400">
            {t('dashboard.nextStep.allDone')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Need FlaskConical import
import { FlaskConical } from 'lucide-react'
