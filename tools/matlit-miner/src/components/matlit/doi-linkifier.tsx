'use client'

import { doiUrl } from '@/lib/api-client'

/**
 * Detects DOI patterns in text and renders them as clickable links.
 * Matches patterns like: 10.xxxx/xxxxx or doi:10.xxxx/xxxxx or https://doi.org/10.xxxx/xxxxx
 */
const DOI_REGEX = /(https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,}\/[^\s"'<>]+)/g

export function linkifyDois(text: string): Array<{ type: 'text' | 'link'; content: string }> {
  const parts: Array<{ type: 'text' | 'link'; content: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  DOI_REGEX.lastIndex = 0
  while ((match = DOI_REGEX.exec(text)) !== null) {
    // Add preceding text
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    // Add the DOI link
    const doi = match[2] // Just the DOI part (10.xxxx/xxxxx)
    parts.push({ type: 'link', content: doi })
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts
}

/**
 * Renders text with DOIs as clickable links.
 */
export function TextWithDoiLinks({ text }: { text: string }) {
  const parts = linkifyDois(text)
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={doiUrl(part.content)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
          >
            {part.content}
          </a>
        ) : (
          <span key={i}>{part.content}</span>
        ),
      )}
    </>
  )
}
