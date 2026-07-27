import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { listSubscribers, subscribersCsv } from '../../../lib/subscribers'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"')
      return res.status(200).send(await subscribersCsv())
    }
    return res.status(200).json({ subscribers: await listSubscribers() })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
