'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useI18n } from '@/components/i18n/provider'

function parseTags(s: string): string[] {
  return (s || '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
}

function joinTags(tags: string[]): string {
  return tags.join('; ')
}

export interface MaterialTagsProps {
  materialId: string
  tags: string
  onUpdated?: () => void
  compact?: boolean
}

export function MaterialTags({
  materialId,
  tags,
  onUpdated,
  compact = false,
}: MaterialTagsProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [tagList, setTagList] = useState<string[]>(parseTags(tags))

  // Keep local mirror in sync if the upstream `tags` prop changes
  useEffect(() => {
    setTagList(parseTags(tags))
  }, [tags])

  const updateMut = useMutation({
    mutationFn: (newTags: string) =>
      api(`/api/materials/${materialId}`, {
        method: 'PUT',
        body: JSON.stringify({ tags: newTags }),
      }),
    onSuccess: (_data, newTags) => {
      setTagList(parseTags(newTags))
      qc.invalidateQueries({ queryKey: ['materials'] })
      qc.invalidateQueries({ queryKey: ['material-tags'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onUpdated?.()
    },
    onError: (e) => toast.error(`${(e as Error).message}`),
  })

  const handleAdd = () => {
    const val = input.trim()
    if (!val) return
    if (tagList.includes(val)) {
      toast.error(t('materials.tags.exists', { tag: val }))
      return
    }
    const newTagsStr = joinTags([...tagList, val])
    updateMut.mutate(newTagsStr, {
      onSuccess: () => {
        toast.success(t('materials.tags.added', { tag: val }))
        setInput('')
      },
    })
  }

  const handleRemove = (tag: string) => {
    const newTagsStr = joinTags(tagList.filter((x) => x !== tag))
    updateMut.mutate(newTagsStr, {
      onSuccess: () => toast.success(t('materials.tags.removed', { tag })),
    })
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex flex-wrap gap-1 items-center min-h-[24px]">
        {!compact && <Tag className="w-3 h-3 text-slate-400 mr-0.5" />}
        {tagList.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">
            {t('materials.tags.empty')}
          </span>
        )}
        {tagList.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] gap-0.5 pl-1.5 pr-1 py-0 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className="rounded hover:bg-emerald-200 dark:hover:bg-emerald-800 p-0.5 transition-colors"
              aria-label={t('materials.tags.remove', { tag })}
              disabled={updateMut.isPending}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={t('materials.tags.placeholder')}
          className="h-7 text-xs flex-1"
          disabled={updateMut.isPending}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={handleAdd}
          disabled={!input.trim() || updateMut.isPending}
        >
          <Plus className="w-3 h-3 mr-0.5" />
          {t('materials.tags.add')}
        </Button>
      </div>
    </div>
  )
}

export default MaterialTags
