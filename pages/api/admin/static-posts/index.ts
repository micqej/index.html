import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { getAllPosts, getPostBySlug } from '../../../../lib/posts'
import { listArticles } from '../../../../lib/articles'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

/**
 * The 162 pôvodných článkov žije v statickom JSON exporte z WordPressu.
 * Tu ich admin vie nájsť a otvoriť — pri uložení sa „forknú" do DB (vlastný
 * editovateľný záznam s rovnakým slugom), ktorý potom na webe prepíše statický.
 * Už forknuté (slug existuje v DB) sa zo zoznamu vyfiltrujú.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (typeof req.query.slug === 'string') {
      const p = getPostBySlug(req.query.slug)
      if (!p) return res.status(404).json({ error: 'Nenájdené' })
      return res.status(200).json({ post: p })
    }
    const q = (typeof req.query.q === 'string' ? req.query.q : '').toLowerCase().trim()
    let dbSlugs = new Set<string>()
    try { dbSlugs = new Set((await listArticles()).map(a => a.slug)) } catch { /* DB off — ukáž všetko */ }
    let posts = getAllPosts().filter(p => !dbSlugs.has(p.slug))
    if (q) posts = posts.filter(p => p.title.toLowerCase().includes(q) || p.slug.includes(q))
    const total = posts.length
    const items = posts.slice(0, 60).map(p => ({
      slug: p.slug, title: p.title, category: p.categories[0] || '', date: p.date,
    }))
    return res.status(200).json({ posts: items, total })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
