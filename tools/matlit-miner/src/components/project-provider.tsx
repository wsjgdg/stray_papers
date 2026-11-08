'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface ProjectContextValue {
  project: string
  setProject: (p: string) => void
  reviewer: string
  setReviewer: (r: string) => void
  projects: string[]
  addProject: (name: string) => void
  removeProject: (name: string) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

const PROJECT_KEY = 'matlit-project'
const REVIEWER_KEY = 'matlit-reviewer'
const PROJECTS_KEY = 'matlit-projects'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<string>('default')
  const [reviewer, setReviewerState] = useState<string>('anonymous')
  const [projects, setProjects] = useState<string[]>(['default'])

  // Hydrate from localStorage on mount
  useState(() => {
    if (typeof window === 'undefined') return
    try {
      const savedProject = localStorage.getItem(PROJECT_KEY)
      if (savedProject) setProjectState(savedProject)
      const savedReviewer = localStorage.getItem(REVIEWER_KEY)
      if (savedReviewer) setReviewerState(savedReviewer)
      const savedProjects = localStorage.getItem(PROJECTS_KEY)
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) setProjects(parsed)
      }
    } catch { /* ignore */ }
    return null
  })

  const setProject = useCallback((p: string) => {
    setProjectState(p)
    try { localStorage.setItem(PROJECT_KEY, p) } catch { /* ignore */ }
  }, [])

  const setReviewer = useCallback((r: string) => {
    setReviewerState(r)
    try { localStorage.setItem(REVIEWER_KEY, r) } catch { /* ignore */ }
  }, [])

  const addProject = useCallback((name: string) => {
    setProjects((prev) => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const removeProject = useCallback((name: string) => {
    if (name === 'default') return // Can't remove default
    setProjects((prev) => {
      const next = prev.filter((p) => p !== name)
      try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    // If current project is removed, switch to default
    setProjectState((curr) => {
      if (curr === name) {
        try { localStorage.setItem(PROJECT_KEY, 'default') } catch { /* ignore */ }
        return 'default'
      }
      return curr
    })
  }, [setProject])

  return (
    <ProjectContext.Provider value={{ project, setProject, reviewer, setReviewer, projects, addProject, removeProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
