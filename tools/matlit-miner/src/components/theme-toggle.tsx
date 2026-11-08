'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/components/i18n/provider'

// Simple "is mounted" store to avoid the setState-in-effect lint pattern
function subscribe() {
  return () => {}
}
function getSnapshot() {
  return true
}
function getServerSnapshot() {
  return false
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Avoid hydration mismatch: render a stable placeholder until mounted
  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5 h-8 w-9 px-0" aria-label={t('nav.toggleThemeAria')}>
        <Sun className="w-3.5 h-3.5" />
      </Button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 w-9 px-0" aria-label={t('nav.toggleThemeAria')}>
          {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2 cursor-pointer">
          <Sun className="w-4 h-4" /> {t('nav.themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2 cursor-pointer">
          <Moon className="w-4 h-4" /> {t('nav.themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2 cursor-pointer">
          <Monitor className="w-4 h-4" /> {t('nav.themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
