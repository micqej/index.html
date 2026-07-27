import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { getArticle, updateArticle, deleteArticle } from '../../../../lib/articles'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const id = parseInt(String(req.query.id), 10)
  if (!id) return res.status(400).json({ error: 'Neplatné id' })
  try {
    if (req.method === 'GET') {
      const a = await getArticle(id)
      return a ? res.status(200).json({ article: a }) : res.status(404).json({ error: 'Nenájdené' })
    }
    if (req.method === 'PUT') {
      const a = await updateArticle(id, req.body || {})
      return a ? res.status(200).json({ article: a }) : res.status(404).json({ error: 'Nenájdené' })
    }
    if (req.method === 'DELETE') {
      await deleteArticle(id)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
