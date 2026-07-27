import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { listComments } from '../../../../lib/comments'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    return res.status(200).json({ comments: await listComments(status) })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
