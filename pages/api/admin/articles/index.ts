import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { listArticles, listArticlesLite, createArticle } from '../../../../lib/articles'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.method === 'GET') {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined
      // Zoznam bez tela článku — 162 článkov × 20 kB je zbytočných pár MB cez sieť
      if (!status && req.query.full !== '1') return res.status(200).json({ articles: await listArticlesLite() })
      return res.status(200).json({ articles: await listArticles(status) })
    }
    if (req.method === 'POST') {
      const a = await createArticle(req.body || {})
      return res.status(200).json({ article: a })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
