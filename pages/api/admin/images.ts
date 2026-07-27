import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { searchImages } from '../../../lib/images'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  const source = (typeof req.query.source === 'string' ? req.query.source : 'both') as any
  if (!q) return res.status(400).json({ error: 'Chýba q' })
  try {
    return res.status(200).json({ images: await searchImages(q, source, 12) })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
