export interface ImageResult {
  url: string
  thumb: string
  credit: string
  source: 'pexels' | 'pixabay'
}

import { resolveSecret } from './siteSettings'

/** Fetch s tvrdým časovým stropom — Pexels/Pixabay nesmú zavesiť generovanie. */
async function fetchJson(url: string, init: RequestInit = {}, ms = 7000): Promise<any | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(url, { ...init, signal: ac.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function searchPexels(query: string, count: number): Promise<ImageResult[]> {
  const key = await resolveSecret('pexels')
  if (!key) return []
  const data = await fetchJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
    { headers: { Authorization: key } }
  )
  return ((data?.photos || []) as any[]).map(p => ({
    url: p.src?.large2x || p.src?.large || p.src?.original,
    thumb: p.src?.medium || p.src?.small,
    credit: `Foto: ${p.photographer} / Pexels`,
    source: 'pexels' as const,
  })).filter(i => i.url)
}

async function searchPixabay(query: string, count: number): Promise<ImageResult[]> {
  const key = await resolveSecret('pixabay')
  if (!key) return []
  const data = await fetchJson(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&per_page=${Math.max(3, count)}&safesearch=true`
  )
  return ((data?.hits || []) as any[]).slice(0, count).map(h => ({
    url: h.largeImageURL || h.webformatURL,
    thumb: h.webformatURL || h.previewURL,
    credit: `Foto: ${h.user} / Pixabay`,
    source: 'pixabay' as const,
  })).filter(i => i.url)
}

/**
 * ⚠️ Fotobanky rozumejú LEN po anglicky.
 * Predtým fallback hľadal doslova „Marketing Tipy" / „O eshopoch" → 0 výsledkov
 * → článok vyšiel bez jedinej fotky a nikde nebolo vidieť prečo.
 */
const CATEGORY_QUERY: Record<string, string> = {
  'Marketing Tipy': 'marketing team office',
  'Podnikanie': 'small business owner',
  'O eshopoch': 'online shopping ecommerce',
  'Ako na to': 'workspace laptop notes',
  'Analýza': 'business analytics charts',
  'Email': 'email marketing laptop',
  'SEO': 'seo search engine laptop',
  'WordPress': 'website development screen',
  'O weboch': 'web design desk',
  'Sociálne siete': 'social media phone',
}

const GENERIC_QUERIES = ['business meeting laptop', 'modern office workspace', 'marketing strategy desk']

/** Odstráni diakritiku a slovenské slová, ktoré fotobanke nič nepovedia. */
function asciiQuery(q: string): string {
  return q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function searchImages(
  query: string,
  source: 'pexels' | 'pixabay' | 'both' = 'both',
  count = 8
): Promise<ImageResult[]> {
  const tasks: Promise<ImageResult[]>[] = []
  if (source === 'pexels' || source === 'both') tasks.push(searchPexels(query, count))
  if (source === 'pixabay' || source === 'both') tasks.push(searchPixabay(query, count))
  const results = (await Promise.all(tasks)).flat()
  // dedup podľa URL, nech sa v článku neopakuje tá istá fotka
  const seen = new Set<string>()
  return results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url)).slice(0, count)
}

/**
 * Fotky pre článok — skúša postupne viac dopytov, kým niečo nájde:
 * AI dopyt → kategória (anglicky) → generický záber.
 * Vracia aj `tried`, aby admin vedel POVEDAŤ, prečo fotky nie sú.
 */
export async function imagesForArticle(
  aiQuery: string,
  category: string,
  source: 'pexels' | 'pixabay' | 'both',
  count: number
): Promise<{ images: ImageResult[]; usedQuery: string; tried: string[] }> {
  const candidates = [
    asciiQuery(aiQuery),
    CATEGORY_QUERY[category] || '',
    ...GENERIC_QUERIES,
  ].filter(Boolean)
  const tried: string[] = []
  for (const q of candidates) {
    tried.push(q)
    const images = await searchImages(q, source, count)
    if (images.length) return { images, usedQuery: q, tried }
  }
  return { images: [], usedQuery: '', tried }
}

export async function firstImage(
  query: string,
  source: 'pexels' | 'pixabay' | 'both' = 'both'
): Promise<ImageResult | null> {
  const imgs = await searchImages(query, source, 3)
  return imgs[0] || null
}
