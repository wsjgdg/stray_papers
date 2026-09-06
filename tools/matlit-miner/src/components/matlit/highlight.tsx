'use client'

/**
 * Highlights matching text in a string with <mark> tags.
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const q = query.trim()
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded px-0.5">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}
