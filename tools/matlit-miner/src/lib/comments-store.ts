'use client'

import { useState, useEffect } from 'react'

/**
 * Lightweight per-browser comments / annotations store (C2).
 *
 * Persisted in localStorage as a JSON array under `matlit-comments`.
 *
 * Layout of an entry:
 *   { id, targetType, targetId, author, text, createdAt }
 *
 * `targetType` discriminates between materials and individual papers so the
 * same store can back both the material-level comments panel (header button)
 * and any future paper-drawer integration.
 *
 * Because comments live entirely in the browser, they are NOT shared across
 * users / machines — this is intentional for the demo. A real collaborative
 * variant would replace these functions with API calls without changing the
 * hook signature.
 */

export type CommentTargetType = 'material' | 'paper'

export interface Comment {
  id: string
  targetType: CommentTargetType
  targetId: string
  author: string
  text: string
  createdAt: number
}

const KEY = 'matlit-comments'
const CHANGE_EVENT = 'matlit:comments-changed'

function isComment(x: unknown): x is Comment {
  if (typeof x !== 'object' || x === null) return false
  const c = x as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    (c.targetType === 'material' || c.targetType === 'paper') &&
    typeof c.targetId === 'string' &&
    typeof c.author === 'string' &&
    typeof c.text === 'string' &&
    typeof c.createdAt === 'number'
  )
}

function readAll(): Comment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isComment)
  } catch {
    return []
  }
}

function writeAll(comments: Comment[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(comments))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function genId(): string {
  // Compact, sortable, collision-resistant id (no external dep).
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Return all comments for a given target, newest-first.
 * Pass an empty `targetId` to get an empty list (used by the header button
 * before the user has selected any material).
 */
export function getCommentsFor(targetType: CommentTargetType, targetId: string): Comment[] {
  if (!targetId) return []
  return readAll()
    .filter((c) => c.targetType === targetType && c.targetId === targetId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Append a new comment. Returns the created entry, or null if input was empty. */
export function addComment(
  targetType: CommentTargetType,
  targetId: string,
  author: string,
  text: string,
): Comment | null {
  if (!targetId) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  const c: Comment = {
    id: genId(),
    targetType,
    targetId,
    author: author.trim() || 'anonymous',
    text: trimmed,
    createdAt: Date.now(),
  }
  const all = readAll()
  all.push(c)
  writeAll(all)
  return c
}

/** Remove a single comment by id. */
export function deleteComment(id: string): void {
  if (!id) return
  const all = readAll()
  const next = all.filter((c) => c.id !== id)
  if (next.length === all.length) return
  writeAll(next)
}

/** Total comment count for a target. Returns 0 when targetId is empty. */
export function countComments(targetType: CommentTargetType, targetId: string): number {
  if (!targetId) return 0
  return readAll().reduce(
    (n, c) => (c.targetType === targetType && c.targetId === targetId ? n + 1 : n),
    0,
  )
}

/**
 * Reactive view of comments for a single target.
 *
 * Re-reads on:
 *  - the custom `matlit:comments-changed` event (this tab, after add/delete)
 *  - the native `storage` event (other tabs editing the same localStorage key)
 */
export function useComments(targetType: CommentTargetType, targetId: string): Comment[] {
  const [comments, setComments] = useState<Comment[]>([])
  useEffect(() => {
    const refresh = () => setComments(getCommentsFor(targetType, targetId))
    refresh()
    window.addEventListener(CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [targetType, targetId])
  return comments
}

/**
 * Reactive count — useful for header badges that need to update whenever
 * comments are added/removed anywhere in the app.
 */
export function useCommentCount(targetType: CommentTargetType, targetId: string): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const refresh = () => setN(countComments(targetType, targetId))
    refresh()
    window.addEventListener(CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [targetType, targetId])
  return n
}
