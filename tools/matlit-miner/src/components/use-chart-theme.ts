'use client'

import { useTheme } from 'next-themes'
import { useState, useEffect } from 'react'

/**
 * Returns theme-aware Recharts colors.
 * Usage: const chartTheme = useChartTheme()
 * Then: <CartesianGrid stroke={chartTheme.grid} /> etc.
 */
export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  return {
    isDark,
    grid: isDark ? '#1e293b' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',  // brightened dark axis for better contrast
    axisDim: isDark ? '#64748b' : '#94a3b8',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#475569' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#0f172a',
    legendColor: isDark ? '#cbd5e1' : '#475569',
    labelColor: isDark ? '#94a3b8' : '#64748b',
    cursorFill: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  }
}
