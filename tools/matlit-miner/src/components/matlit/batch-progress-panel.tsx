'use client'

import { Loader2, CheckCircle2, XCircle, Activity, Radio } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/components/i18n/provider'
import { useProgressSocket } from '@/hooks/use-progress-socket'

const JOB_TYPE_LABELS: Record<string, string> = {
  classify: 'Classification',
  extract: 'Extraction',
  'search-batch': 'Batch search',
  reclassify: 'Re-classify',
  'bulk-delete': 'Bulk delete',
}

const JOB_TYPE_COLORS: Record<string, string> = {
  classify: 'text-violet-600',
  extract: 'text-rose-600',
  'search-batch': 'text-sky-600',
  reclassify: 'text-violet-600',
  'bulk-delete': 'text-red-600',
}

export function BatchProgressPanel() {
  const { t } = useI18n()
  const { connected, jobs } = useProgressSocket()

  const activeJobs = jobs.filter((j) => j.status === 'running')
  const recentJobs = jobs.filter((j) => j.status !== 'running').slice(0, 3)

  // Only hide when disconnected AND no jobs at all
  if (!connected && activeJobs.length === 0 && recentJobs.length === 0) return null

  return (
    <Card className="border-emerald-200/60 dark:border-emerald-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-500" /> {t('progress.title')}
          <Badge
            variant="outline"
            className={`ml-auto text-[9px] gap-1 ${connected ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-800 dark:text-slate-500'}`}
          >
            <Radio className={`w-2.5 h-2.5 ${connected ? 'animate-pulse' : ''}`} />
            {connected ? t('progress.connected') : t('progress.disconnected')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {activeJobs.length === 0 && recentJobs.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">{t('progress.noJobs')}</div>
        ) : (
          <>
            {activeJobs.map((job) => {
              const pct = job.total > 0 ? (job.done / job.total) * 100 : 0
              return (
                <div key={job.id} className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-medium ${JOB_TYPE_COLORS[job.type] || 'text-slate-600'}`}>
                      {JOB_TYPE_LABELS[job.type] || job.type}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">
                      {t('progress.of', { done: job.done, total: job.total })}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {job.errors > 0 && (
                    <div className="text-[10px] text-amber-600 mt-1">{t('progress.errors', { n: job.errors })}</div>
                  )}
                </div>
              )
            })}
            {recentJobs.map((job) => (
              <div key={job.id} className={`flex items-center gap-2 text-xs p-2 rounded-lg ${job.status === 'completed' ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : 'bg-red-50/30 dark:bg-red-950/10'}`}>
                {job.status === 'completed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className={JOB_TYPE_COLORS[job.type] || 'text-slate-600'}>
                  {JOB_TYPE_LABELS[job.type] || job.type}
                </span>
                <span className="text-slate-400 ml-auto tabular-nums">
                  {job.done}/{job.total}
                </span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}
