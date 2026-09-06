'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Pencil, Check, X, Loader2, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'

interface PaperNotesProps {
  paperId: string
  initialNotes: string
}

const AUTOSAVE_DEBOUNCE_MS = 1500

/**
 * Personal notes / annotations for a single paper.
 *
 * - Display mode: shows notes (or placeholder) + Edit button.
 * - Edit mode: Textarea + Save / Cancel.
 * - Auto-save: 1.5s after typing stops (only when content has changed from
 *   the last persisted value), with a subtle "Saved" badge.
 */
export function PaperNotes({ paperId, initialNotes }: PaperNotesProps) {
  const { t } = useI18n()
  const [notes, setNotes] = useState(initialNotes)
  const [isEditing, setIsEditing] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // The most recent value persisted to the server. Used to detect changes
  // that need auto-saving.
  const persistedRef = useRef(initialNotes)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextAutosaveRef = useRef(false)

  // Reset state when switching to a different paper.
  useEffect(() => {
    setNotes(initialNotes)
    persistedRef.current = initialNotes
    setIsEditing(false)
    setSavedAt(null)
    skipNextAutosaveRef.current = true
  }, [paperId, initialNotes])

  const saveMutation = useMutation({
    mutationFn: async (next: string) => {
      return api<{ ok: boolean; notes: string }>(
        `/api/papers/${paperId}/notes`,
        { method: 'PUT', body: JSON.stringify({ notes: next }) },
      )
    },
    onSuccess: (_data, variables) => {
      persistedRef.current = variables
      setSavedAt(Date.now())
    },
    onError: (err: unknown) => {
      toast.error(t('papers.notes.save'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  // Debounced auto-save: when `notes` changes (and differs from persisted value),
  // schedule a save 1.5s later.
  useEffect(() => {
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    if (!isEditing) return
    if (notes === persistedRef.current) return
    if (saveMutation.isPending) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      saveMutation.mutate(notes)
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [notes, isEditing, saveMutation])

  const handleStartEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleCancel = useCallback(() => {
    // Revert to the last persisted value.
    setNotes(persistedRef.current)
    setIsEditing(false)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
  }, [])

  const handleSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    saveMutation.mutate(notes, {
      onSuccess: () => {
        toast.success(t('papers.notes.saved'))
        setIsEditing(false)
      },
    })
  }, [notes, saveMutation, t])

  // Clear "Saved" badge after a few seconds.
  useEffect(() => {
    if (savedAt == null) return
    const timer = setTimeout(() => setSavedAt(null), 3000)
    return () => clearTimeout(timer)
  }, [savedAt])

  const showSavedBadge = savedAt != null && !saveMutation.isPending

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <StickyNote className="w-3 h-3 text-slate-500" />
        <span className="text-xs font-medium text-slate-500">
          {t('papers.notes.title')}
        </span>
        {saveMutation.isPending && (
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-4 text-slate-500"
          >
            <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
            {t('common.loading')}
          </Badge>
        )}
        {showSavedBadge && (
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-4 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/40"
          >
            <Check className="w-2.5 h-2.5 mr-1" />
            {t('papers.notes.autoSaved')}
          </Badge>
        )}
        {!isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="ml-auto h-6 px-2 text-[11px] text-slate-500"
          >
            <Pencil className="w-3 h-3 mr-1" />
            {t('papers.notes.edit')}
          </Button>
        )}
      </div>

      {!isEditing ? (
        notes ? (
          <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-amber-50/60 dark:bg-amber-950/15 p-3 rounded-md border border-amber-100 dark:border-amber-900/40 whitespace-pre-wrap max-h-60 overflow-y-auto">
            {notes}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            className="w-full text-left text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 p-3 rounded-md border border-dashed border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
          >
            {t('papers.notes.empty')}
          </button>
        )
      ) : (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('papers.notes.placeholder')}
            rows={6}
            className="text-xs resize-y min-h-[120px]"
            autoFocus
            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="h-7"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1" />
              )}
              {t('papers.notes.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={saveMutation.isPending}
              className="h-7"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              {t('papers.notes.cancel')}
            </Button>
            <span className="text-[10px] text-slate-400 ml-auto">
              {t('papers.notes.autoSaved')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
