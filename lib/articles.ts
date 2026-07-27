import { db, dbSafe } from './db'
import type { Post } from './posts'

export interface Article {
  id: number
  slug: string
  title: string
  content: string
  excerpt: string
  meta_title: string
  meta_desc: string
  meta_keywords: string
  og_title: string
  og_desc: string
  category: string
  tags: string[]
  image_url: string
  image_credit: string
  author: string
  status: 'draft' | 'scheduled' | 'published'
  publish_at: string | null
  reading_time: number
  source: string
  created_at: string
  updated_at: string
}

const DIA: Record<string, string> = {
  á: 'a', ä: 'a', č: 'c', ď: 'd', é: 'e', í: 'i', ĺ: 'l', ľ: 'l', ň: 'n',
  ó: 'o', ô: 'o', ŕ: 'r', š: 's', ť: 't', ú: 'u', ý: 'y', ž: 'z',
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[áäčďéíĺľňóôŕšťúýž]/g, c => DIA[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

export function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

export async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  const start = base || 'clanok'
  // Jeden dotaz namiesto slučky N dotazov (a bez rizika nekonečného cyklu).
  const rows = await dbSafe(sql => (excludeId
    ? sql`SELECT slug FROM articles WHERE (slug = ${start} OR slug LIKE ${start + '-%'}) AND id <> ${excludeId}`
    : sql`SELECT slug FROM articles WHERE (slug = ${start} OR slug LIKE ${start + '-%'})`), [] as any[])
  const taken = new Set(rows.map((r: any) => r.slug))
  if (!taken.has(start)) return start
  for (let n = 2; n < 500; n++) if (!taken.has(`${start}-${n}`)) return `${start}-${n}`
  return `${start}-${Date.now()}`
}

function rowToArticle(r: any): Article {
  return {
    ...r,
    tags: Array.isArray(r.tags) ? r.tags : [],
    publish_at: r.publish_at ? new Date(r.publish_at).toISOString() : null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
  }
}

export async function listArticles(status?: string): Promise<Article[]> {
  const rows = await dbSafe(sql => (status
    ? sql`SELECT * FROM articles WHERE status = ${status} ORDER BY COALESCE(publish_at, created_at) DESC`
    : sql`SELECT * FROM articles ORDER BY COALESCE(publish_at, created_at) DESC`), [] as any[])
  return rows.map(rowToArticle)
}

/** Zoznam pre admin tabuľku — bez `content` (telo článku je 10–30 kB a v zozname sa nepoužíva). */
export async function listArticlesLite(): Promise<Omit<Article, 'content'>[]> {
  const rows = await dbSafe(sql => sql`SELECT id, slug, title, excerpt, meta_title, meta_desc, meta_keywords,
      og_title, og_desc, category, tags, image_url, image_credit, author, status, publish_at,
      reading_time, source, created_at, updated_at
    FROM articles ORDER BY COALESCE(publish_at, created_at) DESC`, [] as any[])
  return rows.map(rowToArticle)
}

export async function getArticle(id: number): Promise<Article | null> {
  const rows = await dbSafe(sql => sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`, [] as any[])
  return rows[0] ? rowToArticle(rows[0]) : null
}

export async function createArticle(a: Partial<Article>): Promise<Article> {
  const base = slugify(a.slug || a.title || 'clanok')
  const slug = await uniqueSlug(base)
  const tags = a.tags || []
  const rows = await db(sql => sql`INSERT INTO articles
    (slug, title, content, excerpt, meta_title, meta_desc, meta_keywords, og_title, og_desc,
     category, tags, image_url, image_credit, author, status, publish_at, reading_time, source)
    VALUES (${slug}, ${a.title || ''}, ${a.content || ''}, ${a.excerpt || ''},
     ${a.meta_title || a.title || ''}, ${a.meta_desc || ''}, ${a.meta_keywords || ''},
     ${a.og_title || a.title || ''}, ${a.og_desc || a.meta_desc || ''},
     ${a.category || 'Marketing'}, ${sql.json(tags as any)}, ${a.image_url || ''}, ${a.image_credit || ''},
     ${a.author || 'Monetico'}, ${a.status || 'draft'}, ${a.publish_at || null},
     ${a.reading_time || readingTime(a.content || '')}, ${a.source || 'manual'})
    RETURNING *`)
  if (!rows) throw new Error('DB nie je nastavená')
  return rowToArticle(rows[0])
}

export async function updateArticle(id: number, a: Partial<Article>): Promise<Article | null> {
  const current = await getArticle(id)
  if (!current) return null
  const slug = a.slug && a.slug !== current.slug
    ? await uniqueSlug(slugify(a.slug), id)
    : current.slug
  const merged = { ...current, ...a, slug }
  const tags = merged.tags || []
  const rows = await db(sql => sql`UPDATE articles SET
    slug = ${merged.slug}, title = ${merged.title}, content = ${merged.content},
    excerpt = ${merged.excerpt}, meta_title = ${merged.meta_title}, meta_desc = ${merged.meta_desc},
    meta_keywords = ${merged.meta_keywords}, og_title = ${merged.og_title}, og_desc = ${merged.og_desc},
    category = ${merged.category}, tags = ${sql.json(tags as any)}, image_url = ${merged.image_url},
    image_credit = ${merged.image_credit}, author = ${merged.author}, status = ${merged.status},
    publish_at = ${merged.publish_at}, reading_time = ${merged.reading_time}, updated_at = now()
    WHERE id = ${id} RETURNING *`)
  return rows && rows[0] ? rowToArticle(rows[0]) : null
}

export async function deleteArticle(id: number): Promise<void> {
  await dbSafe(sql => sql`DELETE FROM articles WHERE id = ${id}`, null as any)
}

/** Move scheduled articles whose time has come to published. Returns count published. */
export async function publishDue(): Promise<number> {
  const rows = await dbSafe(sql => sql`UPDATE articles SET status = 'published', updated_at = now()
    WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= now() RETURNING id`, [] as any[])
  return rows.length
}

function articleToPost(a: Article): Post {
  return {
    id: `db-${a.id}`,
    title: a.title,
    slug: a.slug,
    url: `/${a.slug}/`,
    original_url: '',
    date: (a.publish_at || a.created_at || '').slice(0, 10),
    author: a.author,
    categories: a.category ? [a.category] : [],
    tags: a.tags || [],
    content: a.content,
    excerpt: a.excerpt,
    meta_title: a.meta_title,
    meta_desc: a.meta_desc,
    meta_keywords: a.meta_keywords,
    og_title: a.og_title,
    og_desc: a.og_desc,
    reading_time: a.reading_time,
    image: a.image_url || '',
    image_credit: a.image_credit || '',
  }
}

/** Published DB articles mapped to the public Post shape (for the blog). */
export async function getPublishedPosts(): Promise<Post[]> {
  const rows = await dbSafe(sql => sql`SELECT * FROM articles
    WHERE status = 'published' AND (publish_at IS NULL OR publish_at <= now())
    ORDER BY COALESCE(publish_at, created_at) DESC`, [] as any[])
  return rows.map(rowToArticle).map(articleToPost)
}
