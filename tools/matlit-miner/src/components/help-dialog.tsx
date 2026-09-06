'use client'

import { useState } from 'react'
import { HelpCircle, Keyboard, Workflow, ShieldCheck, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useI18n } from '@/components/i18n/provider'

export function HelpDialog({
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  open?: boolean
  onOpenChange?: (o: boolean) => void
} = {}) {
  const { t } = useI18n()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChangeProp ?? setInternalOpen

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 w-9 px-0"
          aria-label={t('help.title')}
          title={t('help.title')}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-500" /> {t('help.title')}
          </DialogTitle>
          <DialogDescription>{t('help.desc')}</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4">
          {/* Shortcuts */}
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-2">
              <Keyboard className="w-3.5 h-3.5" /> {t('help.shortcuts')}
            </div>
            <div className="space-y-1.5">
              <ShortcutRow keys={['⌘', 'K']} desc={t('help.shortcut.cmdPalette')} />
              <ShortcutRow keys={['⌘', '1-9']} desc={t('help.shortcut.tabs')} />
              <ShortcutRow keys={['⌘', 'E']} desc={t('help.shortcut.exportCsv')} />
              <ShortcutRow keys={['⌘', '/']} desc={t('help.shortcut.help')} />
              <ShortcutRow keys={['L']} desc={t('help.shortcut.toggleLang')} />
              <ShortcutRow keys={['T']} desc={t('help.shortcut.toggleTheme')} />
              {/* O5: new keyboard shortcuts */}
              <ShortcutRow
                keys={['?']}
                desc={t('help.shortcut.help')}
              />
              <ShortcutRow
                keys={['/']}
                desc={t('help.shortcut.focusSearch')}
              />
              <ShortcutRow
                keys={['f']}
                desc={t('help.shortcut.focusCmdInput')}
              />
              <ShortcutRow
                keys={['Esc']}
                desc={t('help.shortcut.closeDialog')}
              />
              <ShortcutRow
                keys={['g', 'm']}
                desc={t('help.shortcut.gotoMaterials')}
              />
            </div>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              {t('help.shortcuts.note')}
            </p>
          </div>

          {/* Workflow */}
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-2">
              <Workflow className="w-3.5 h-3.5" /> {t('help.workflow')}
            </div>
            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside bg-slate-50 dark:bg-slate-800/50 p-3 rounded-md leading-relaxed">
              <li>Materials → {t('materials.seedDefaults')}</li>
              <li>Papers → {t('papers.batch.run')}</li>
              <li>Classification → {t('classify.run')}</li>
              <li>Extraction → {t('extract.run')}</li>
              <li>Efficiency → {t('eff.add')}</li>
              <li>Verification → {t('help.spotCheck')}</li>
              <li>Results → {t('results.exportCsv')}</li>
            </ol>
          </div>

          {/* Principles */}
          <div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('help.principles')}
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-md border border-emerald-200 dark:border-emerald-900 font-mono">
              {t('help.principles.text')}
            </div>
          </div>

          {/* P1-4: Replay onboarding tour */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              onClick={() => {
                setOpen(false)
                // Defer so the dialog closes before the tour overlay mounts.
                window.setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('matlit:replay-tour'))
                }, 80)
              }}
            >
              <Compass className="w-3.5 h-3.5" />
              {t('help.replayTour')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600 dark:text-slate-300">{desc}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className="min-w-[24px] text-center text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 shadow-sm">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}
