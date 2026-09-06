// Lightweight, dependency-free language detector for paper titles & abstracts.
// Uses Unicode block heuristics — fast and good enough for the most common
// non-English academic languages (zh / ja / ko / ru / ar).

const RANGES: Array<{ lang: string; test: (ch: number) => boolean }> = [
  // CJK Unified Ideographs (Chinese + shared with Japanese)
  { lang: 'zh', test: (c) => c >= 0x4e00 && c <= 0x9fff },
  // Hiragana + Katakana (Japanese-only)
  { lang: 'ja', test: (c) => (c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff) },
  // Hangul Syllables (Korean)
  { lang: 'ko', test: (c) => c >= 0xac00 && c <= 0xd7af },
  // Cyrillic (Russian + others)
  { lang: 'ru', test: (c) => c >= 0x0400 && c <= 0x04ff },
  // Arabic
  { lang: 'ar', test: (c) => c >= 0x0600 && c <= 0x06ff },
]

/**
 * Detect the dominant non-English language of a text snippet.
 * Returns an ISO 639-1 code: 'zh' | 'ja' | 'ko' | 'ru' | 'ar' | 'en'.
 * Priority order: ja > zh (Japanese wins if Hiragana/Katakana present),
 * then ko, ru, ar, en.
 */
export function detectLanguage(text: string): string {
  if (!text) return 'en'
  // Count hits per language
  const counts: Record<string, number> = {}
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code === undefined) continue
    for (const range of RANGES) {
      if (range.test(code)) {
        counts[range.lang] = (counts[range.lang] || 0) + 1
        break
      }
    }
  }
  // Japanese wins if it has any Hiragana/Katakana (very specific)
  if ((counts.ja || 0) > 0) return 'ja'
  if ((counts.zh || 0) > 0) return 'zh'
  if ((counts.ko || 0) > 0) return 'ko'
  if ((counts.ru || 0) > 0) return 'ru'
  if ((counts.ar || 0) > 0) return 'ar'
  return 'en'
}

/**
 * Returns true if the text contains any non-English characters
 * (i.e. detectLanguage !== 'en').
 */
export function isNonEnglish(text: string): boolean {
  return detectLanguage(text) !== 'en'
}

/**
 * Human-readable language label for a code.
 */
export function languageLabel(code: string): string {
  const map: Record<string, string> = {
    en: 'English',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ru: 'Russian',
    ar: 'Arabic',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
  }
  return map[code] || code.toUpperCase()
}
