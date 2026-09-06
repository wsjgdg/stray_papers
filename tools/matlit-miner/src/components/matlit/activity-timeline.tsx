'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Sparkles, Microscope, Zap, Activity as ActivityIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/components/i18n/provider'
import { api } from '@/lib/api-client'

interface ActivityItem {
  type: 'paper' | 'classification' | 'extraction' | 'efficiency'
  ts: string
  title: string
  detail: string
  material: string
}

interface ActivityData {
  activities: ActivityItem[]
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; dot: string }> = {
  paper: { icon: FileText, color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/30', dot: 'bg-sky-400' },
  classification: { icon: Sparkles, color: 'text-violet-500 bg-violet-50 dark:bg-violet-950/30', dot: 'bg-violet-400' },
  extraction: { icon: Microscope, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/30', dot: 'bg-rose-400' },
  efficiency: { icon: Zap, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30', dot: 'bg-orange-400' },
}

function timeAgo(ts: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return t('activity.justNow')
  if (minutes < 60) return t('activity.minutesAgo', { n: minutes })
  if (hours < 24) return t('activity.hoursAgo', { n: hours })
  return t('activity.daysAgo', { n: days })
}

export default function ActivityTimeline() {
  const { t } = useI18n()
  const { data, isLoading } = useQuery<ActivityData>({
    queryKey: ['activity'],
    queryFn: () => api('/api/activity'),
    refetchInterval: 30000,
  })

  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['paper', 'classification', 'extraction', 'efficiency']))

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const activities = (data?.activities ?? []).filter((a) => activeTypes.has(a.type))

  return (
    <Card className="border-indigo-200/60 dark:border-indigo-900/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-indigo-500" /> {t('activity.title')}
        </CardTitle>
        <CardDescription>{t('activity.desc')}</CardDescription>
        {/* Type filter chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(['paper', 'classification', 'extraction', 'efficiency'] as const).map((type) => {
            const meta = TYPE_META[type]
            const Icon = meta.icon
            const active = activeTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-all ${active ? meta.color + ' border-current' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'}`}
              >
                <Icon className="w-2.5 h-2.5" />
                {t(`activity.type.${type}`)}
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-slate-400 text-sm">{t('common.loading')}</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">{t('activity.empty')}</div>
        ) : (
          <div className="relative max-h-[400px] overflow-y-auto pr-2">
            {/* Timeline line */}
            <div className="absolute left-3.5 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-3">
              {activities.map((a, i) => {
                const meta = TYPE_META[a.type] || TYPE_META.paper
                const Icon = meta.icon
                return (
                  <div key={i} className="relative flex items-start gap-3 pl-0">
                    {/* Dot + icon */}
                    <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-2 ring-white dark:ring-slate-900 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[9px] ${meta.color} border-current`}>
                          {t(`activity.type.${a.type}`)}
                        </Badge>
                        <span className="font-mono text-[10px] text-slate-500">{a.material}</span>
                        <span className="text-[10px] text-slate-400 ml-auto whitespace-nowrap">{timeAgo(a.ts, t)}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-1">
                        {a.title}
                      </div>
                      {a.detail && (
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{a.detail}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
