'use client'

import { useState } from 'react'
import { FolderKanban, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useProject } from '@/components/project-provider'
import { useI18n } from '@/components/i18n/provider'
import { toast } from 'sonner'

export function ProjectSwitcher() {
  const { t } = useI18n()
  const { project, setProject, reviewer, setReviewer, projects, addProject, removeProject } = useProject()
  const [open, setOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newReviewer, setNewReviewer] = useState(reviewer)

  const handleCreate = () => {
    const name = newProjectName.trim()
    if (!name) return
    if (projects.includes(name)) {
      toast.error('Project already exists')
      return
    }
    addProject(name)
    setProject(name)
    setNewProjectName('')
    toast.success(`Project "${name}" created and selected`)
  }

  const handleDelete = (name: string) => {
    removeProject(name)
    toast.success(`Project "${name}" deleted`)
  }

  const handleSaveReviewer = () => {
    setReviewer(newReviewer.trim() || 'anonymous')
    toast.success(`Reviewer set to "${newReviewer || 'anonymous'}"`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8" aria-label={t('project.switchAria')}>
                <FolderKanban className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-mono max-w-[80px] truncate">{project}</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('project.switchTip')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" /> {t('project.title')}
          </DialogTitle>
          <DialogDescription>
            {t('project.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4">
          {/* Project selector */}
          <div>
            <Label className="text-xs font-medium">{t('project.active')}</Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reviewer name */}
          <div>
            <Label className="text-xs font-medium">{t('project.reviewer')}</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newReviewer}
                onChange={(e) => setNewReviewer(e.target.value)}
                placeholder="your name"
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleSaveReviewer}>{t('project.set')}</Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{t('project.current')}: <span className="font-mono">{reviewer}</span></p>
          </div>

          {/* Create new project */}
          <div>
            <Label className="text-xs font-medium">{t('project.create')}</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Perovskite-2024"
                className="text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              <Button size="sm" onClick={handleCreate} disabled={!newProjectName.trim()}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Project list */}
          <div>
            <Label className="text-xs font-medium">{t('project.all', { n: projects.length })}</Label>
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
              {projects.map((p) => (
                <div key={p} className={`flex items-center justify-between p-1.5 rounded-md border text-xs ${p === project ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'}`}>
                  <span className="font-mono">{p}</span>
                  <div className="flex items-center gap-1">
                    {p === project && <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">{t('project.activeBadge')}</Badge>}
                    {p !== 'default' && (
                      <button onClick={() => handleDelete(p)} className="text-slate-400 hover:text-red-500" title={t('project.delete')}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
