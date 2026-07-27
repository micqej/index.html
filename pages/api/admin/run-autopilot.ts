import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { startNextArticleJob } from '../../../lib/autopilot'

// Len založí úlohu (max pár sekúnd) — písanie dobieha admin cez generate-tick.
export const config = { maxDuration: 30 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const r = await startNextArticleJob()
    return res.status(r.ok ? 200 : 400).json(r)
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: e.message || 'Chyba' })
  }
}
