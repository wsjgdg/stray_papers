'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Trash2, Send, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useI18n } from '@/components/i18n/provider'
import { useProject } from '@/components/project-provider'
import {
  useComments,
  addComment,
  deleteComment,
  type CommentTargetType,
} from '@/lib/comments-store'
import { formatTimeAgo } from '@/lib/recent-materials'

/**
 * CommentsSection (C2) — a self-contained list + composer for material/paper
 * annotations.
 *
 * Behaviour:
 *  - When `targetId` is null/empty, shows an "empty context" hint (caller
 *    can customise via `emptyHint`).
 *  - When `targetId` is set, lists existing comments (newest-first) with
 *    avatar / author / relative time / hover-to-delete, plus a composer
 *    row (author input + textarea + Post button).
 *  - Author defaults to the reviewer from ProjectContext; user can override
 *    per-comment.
 *  - ⌘/Ctrl+Enter posts the comment.
 *  - All state lives in localStorage via comments-store.ts; this component
 *    re-renders automatically when the store changes (same-tab or cross-tab).
 */
export function CommentsSection({
  targetType,
  targetId,
  emptyHint,
}: {
  targetType: CommentTargetType
  targetId: string | null
  emptyHint?: string
}) {
  const { t, locale } = useI18n()
  const { reviewer } = useProject()
  const [author, setAuthor] = useState(reviewer)
  const [text, setText] = useState('')

  // Keep local author input in sync when the global reviewer changes
  // (e.g. user updates their name in the Project dialog).
  useEffect(() => {
    setAuthor(reviewer)
  }, [reviewer])

  const effectiveTargetId = targetId ?? ''
  const comments = useComments(targetType, effectiveTargetId)

  const canPost = effectiveTargetId !== '' && text.trim().length > 0

  const handlePost = () => {
    if (!canPost) return
    addComment(targetType, effectiveTargetId, author, text)
    setText('')
  }

  // --- Empty context: no material selected ---
  if (!effectiveTargetId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
          <Inbox className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
          {t('comments.noContext')}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[260px]">
          {emptyHint ?? t('comments.defaultEmptyHint')}
        </p>
      </div>
    )
  }

  // --- Comments list + composer ---
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
              <MessageSquare className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('comments.empty')}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('comments.emptyHint')}
            </p>
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="flex gap-2.5 group rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-1 px-1 py-1.5 transition-colors"
            >
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {(c.author || '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {c.author}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                    {formatTimeAgo(c.createdAt, locale)}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                  {c.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteComment(c.id)}
                className="opacity-0 group-hover:focus:opacity-100 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 shrink-0 self-start mt-0.5 p-1 -mr-1"
                aria-label={t('comments.deleteAria')}
                title={t('comments.deleteAria')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
        <Input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={t('comments.authorPh')}
          className="h-8 text-xs"
          aria-label={t('comments.authorAria')}
          maxLength={64}
        />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('comments.textPh')}
          className="text-xs min-h-[60px] max-h-[160px] resize-none"
          aria-label={t('comments.textAria')}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handlePost()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-400 hidden sm:flex items-center gap-1">
            <kbd className="font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">⌘</kbd>
            <span>+</span>
            <kbd className="font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">↵</kbd>
          </p>
          <span className="text-[10px] text-slate-400 ml-auto sm:hidden tabular-nums">
            {text.length}/2000
          </span>
          <Button
            size="sm"
            className="ml-auto sm:ml-0 h-8 gap-1.5"
            onClick={handlePost}
            disabled={!canPost}
          >
            <Send className="w-3 h-3" />
            {t('comments.post')}
          </Button>
        </div>
      </div>
    </div>
  )
}
