'use client'

import { Card, CardContent } from '@/components/ui/card'

/**
 * StatPill — small flat tile used inside the dashboard hero strip.
 *
 * Shows just an icon + big number + label, color-coded by category. This is
 * the compact summary used in the hero's right-side 2x2 grid; the full
 * StatCard (below) is used for the four "stat cards" section.
 */
export function StatPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  }
  return (
    <div className={`rounded-xl p-3 flex flex-col h-full ${colorMap[color]}`}>
      <Icon className="w-4 h-4 mb-1.5 opacity-80" />
      <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  )
}

/**
 * StatCard — the four "stat cards" used below the hero.
 *
 * Each card shows an icon, a big numeric value, a sub-label, and optionally a
 * circular progress ring (when `progress` is supplied) drawn with two SVG
 * circles (background + colored arc). When no progress is given, the icon
 * sits in a soft rounded square instead.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  progress,
}: {
  icon: React.ElementType
  label: string
  value: number
  sub: string
  color: string
  progress?: number
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400',
    sky: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400',
  }
  const ringColor: Record<string, string> = {
    emerald: 'stroke-emerald-500',
    sky: 'stroke-sky-500',
    violet: 'stroke-violet-500',
    amber: 'stroke-amber-500',
  }
  const pct = Math.min(100, Math.max(0, progress ?? 0))
  const circumference = 2 * Math.PI * 14
  const dashOffset = circumference - (pct / 100) * circumference
  return (
    <Card className="overflow-hidden h-full">
      <CardContent className="p-4 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
            <div className="text-2xl font-bold tabular-nums mt-1 leading-tight">{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
          <div className="relative w-9 h-9 shrink-0">
            {progress !== undefined ? (
              <svg className="w-9 h-9 -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="14" fill="none" strokeWidth="3" className="stroke-slate-200 dark:stroke-slate-700" />
                <circle
                  cx="16" cy="16" r="14" fill="none" strokeWidth="3"
                  className={ringColor[color]}
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
            )}
            {progress !== undefined && (
              <div className={`absolute inset-0 flex items-center justify-center ${colorMap[color].split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${colorMap[color].split(' ').filter(c => c.startsWith('bg-') && !c.includes('dark:')).join(' ')}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-400">{pct.toFixed(0)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
