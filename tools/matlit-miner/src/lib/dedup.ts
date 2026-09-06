// Paper deduplication utilities
// Supports DOI-based and title-similarity-based deduplication.

/**
 * Normalize a title for comparison: lowercase, remove special chars, collapse spaces.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate Jaccard similarity between two normalized titles.
 * Returns 0-1 where 1 = identical.
 */
export function titleSimilarity(title1: string, title2: string): number {
  const n1 = normalizeTitle(title1)
  const n2 = normalizeTitle(title2)
  if (n1 === n2) return 1
  const words1 = new Set(n1.split(' '))
  const words2 = new Set(n2.split(' '))
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Check if two papers are duplicates.
 * @param doi1 First paper DOI
 * @param title1 First paper title
 * @param doi2 Second paper DOI
 * @param title2 Second paper title
 * @param threshold Title similarity threshold (0-1, default 0.85)
 * @returns true if papers are considered duplicates
 */
export function isDuplicate(
  doi1: string,
  title1: string,
  doi2: string,
  title2: string,
  threshold = 0.85,
): boolean {
  // 1. Exact DOI match (strongest signal)
  if (doi1 && doi2 && doi1.toLowerCase() === doi2.toLowerCase()) return true
  // 2. Title similarity above threshold
  if (title1 && title2) {
    const sim = titleSimilarity(title1, title2)
    if (sim >= threshold) return true
  }
  return false
}

/**
 * Deduplicate an array of papers, keeping the first occurrence.
 * @param papers Array of { doi, title, ... }
 * @param threshold Title similarity threshold (0-1)
 * @returns Deduplicated array
 */
export function deduplicatePapers<T extends { doi: string; title: string }>(
  papers: T[],
  threshold = 0.85,
): T[] {
  const result: T[] = []
  for (const paper of papers) {
    const isDup = result.some(existing =>
      isDuplicate(existing.doi, existing.title, paper.doi, paper.title, threshold)
    )
    if (!isDup) result.push(paper)
  }
  return result
}
