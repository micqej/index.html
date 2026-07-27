import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { setMessageStatus, deleteMessage } from '../../../../lib/messages'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const id = parseInt(String(req.query.id), 10)
  if (!id) return res.status(400).json({ error: 'Neplatné id' })
  try {
    if (req.method === 'PUT') {
      await setMessageStatus(id, req.body?.status === 'new' ? 'new' : 'read')
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'DELETE') {
      await deleteMessage(id)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
