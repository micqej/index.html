import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { listPlan, addPlan } from '../../../../lib/plan'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.method === 'GET') return res.status(200).json({ plan: await listPlan() })
    if (req.method === 'POST') {
      const { topic, category, scheduled_for } = req.body || {}
      if (!topic) return res.status(400).json({ error: 'Chýba téma' })
      return res.status(200).json({ item: await addPlan(topic, category || 'Marketing Tipy', scheduled_for) })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
