import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { updateComment, deleteComment } from '../../../../lib/comments'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const id = parseInt(String(req.query.id), 10)
  if (!id) return res.status(400).json({ error: 'Neplatné id' })
  try {
    if (req.method === 'PUT') { await updateComment(id, req.body || {}); return res.status(200).json({ ok: true }) }
    if (req.method === 'DELETE') { await deleteComment(id); return res.status(200).json({ ok: true }) }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
