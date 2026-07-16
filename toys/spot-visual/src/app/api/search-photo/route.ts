import { NextRequest, NextResponse } from 'next/server';

// ═══ 分类 → 英文搜索关键词 ═══
const CATEGORY_KEYWORDS: Record<string, string> = {
  '自然风光': 'landscape nature scenery',
  '自然风景': 'landscape nature scenery',
  '历史人文': 'historical architecture ancient building',
  '历史文化': 'historical architecture ancient building',
  '主题乐园': 'theme park amusement ride',
  '城市地标': 'city landmark skyscraper modern',
  '海滨度假': 'beach ocean coast tropical',
  '山岳景区': 'mountain peak hiking trail',
  '古镇村落': 'ancient village old town street',
  '宗教寺庙': 'temple shrine worship architecture',
  '美食小吃': 'food cuisine street asian',
  '轻运动': 'outdoor sports cycling running',
};

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const PEXELS_KEY = process.env.PEXELS_API_KEY || '';

interface CacheEntry {
  urls: string[];
  cursor: number;     // next index to return
  totalPages: number;
  source: 'unsplash' | 'pexels';
  fetching: boolean;  // prevent concurrent fetches for same query
}

// Server-side in-memory cache: query → cached results
const cache = new Map<string, CacheEntry>();

// Track all returned URLs globally to prevent duplicates
const usedUrls = new Set<string>();

/** Fetch a page of photo URLs from Unsplash */
async function fetchUnsplash(query: string, page: number): Promise<{ urls: string[]; totalPages: number }> {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=landscape`,
    { headers: UNSPLASH_KEY ? { 'Authorization': `Client-ID ${UNSPLASH_KEY}` } : {}, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = await res.json();
  return {
    urls: (data.results || []).map((r: { urls: { regular: string } }) => r.urls.regular),
    totalPages: data.total_pages || 1,
  };
}

/** Fetch a page of photo URLs from Pexels */
async function fetchPexels(query: string, page: number): Promise<{ urls: string[]; totalPages: number }> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=landscape`,
    { headers: PEXELS_KEY ? { 'Authorization': PEXELS_KEY } : {}, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = await res.json();
  return {
    urls: (data.photos || []).map((r: { src: { large: string } }) => r.src.large),
    totalPages: data.total_pages || 1,
  };
}

/** Get the next unique photo URL for a category */
async function getNextPhoto(category: string): Promise<{ url: string; source: string; exhausted: boolean }> {
  const query = CATEGORY_KEYWORDS[category] || 'scenic landscape travel';

  // Check cache
  let entry = cache.get(query);

  // If no cache, try to create one from Unsplash first
  if (!entry) {
    try {
      const result = await fetchUnsplash(query, 1);
      // Filter out already-used URLs
      const unique = result.urls.filter(u => !usedUrls.has(u));
      entry = { urls: unique, cursor: 0, totalPages: result.totalPages, source: 'unsplash', fetching: false };
      cache.set(query, entry);
    } catch {
      // Unsplash failed, try Pexels
      try {
        const result = await fetchPexels(query, 1);
        const unique = result.urls.filter(u => !usedUrls.has(u));
        entry = { urls: unique, cursor: 0, totalPages: result.totalPages, source: 'pexels', fetching: false };
        cache.set(query, entry);
      } catch {
        return { url: '', source: '', exhausted: true };
      }
    }
  }

  // Try to get a URL from current cache
  while (entry.cursor < entry.urls.length) {
    const url = entry.urls[entry.cursor];
    entry.cursor++;
    if (!usedUrls.has(url)) {
      usedUrls.add(url);
      return { url, source: entry.source, exhausted: false };
    }
  }

  // Cache exhausted, try next page
  const nextPage = Math.floor((entry.urls.length) / 30) + 1;
  if (nextPage > Math.min(entry.totalPages, 5)) {
    // Both sources exhausted for this query
    return { url: '', source: entry.source, exhausted: true };
  }

  // Prevent concurrent fetches
  if (entry.fetching) {
    return { url: '', source: entry.source, exhausted: true };
  }
  entry.fetching = true;

  try {
    let result;
    if (entry.source === 'unsplash') {
      result = await fetchUnsplash(query, nextPage);
    } else {
      result = await fetchPexels(query, nextPage);
    }
    const unique = result.urls.filter(u => !usedUrls.has(u));
    entry.urls.push(...unique);
    entry.totalPages = result.totalPages;
    entry.fetching = false;

    // If still nothing new, try the other source
    if (unique.length === 0 && entry.source === 'unsplash') {
      try {
        const pexelsResult = await fetchPexels(query, 1);
        const pexelsUnique = pexelsResult.urls.filter(u => !usedUrls.has(u));
        if (pexelsUnique.length > 0) {
          entry.urls.push(...pexelsUnique);
          entry.source = 'pexels';
          entry.totalPages = pexelsResult.totalPages;
        }
      } catch { /* ignore */ }
    } else if (unique.length === 0 && entry.source === 'pexels') {
      try {
        const unsplashResult = await fetchUnsplash(query, 1);
        const unsplashUnique = unsplashResult.urls.filter(u => !usedUrls.has(u));
        if (unsplashUnique.length > 0) {
          entry.urls.push(...unsplashUnique);
          entry.source = 'unsplash';
          entry.totalPages = unsplashResult.totalPages;
        }
      } catch { /* ignore */ }
    }

    // Retry getting from cache
    while (entry.cursor < entry.urls.length) {
      const url = entry.urls[entry.cursor];
      entry.cursor++;
      if (!usedUrls.has(url)) {
        usedUrls.add(url);
        return { url, source: entry.source, exhausted: false };
      }
    }

    return { url: '', source: entry.source, exhausted: true };
  } catch {
    entry.fetching = false;
    return { url: '', source: entry.source, exhausted: true };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('q') || '自然风光';
  const count = Math.min(parseInt(searchParams.get('n') || '1'), 10); // batch up to 10

  const results: { url: string; source: string; exhausted: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const result = await getNextPhoto(category);
    results.push(result);
    if (result.exhausted) break;
  }

  return NextResponse.json({ results });
}