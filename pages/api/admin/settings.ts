import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { getSettings, saveSettings } from '../../../lib/settings'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.method === 'GET') return res.status(200).json({ settings: await getSettings() })
    if (req.method === 'POST') return res.status(200).json({ settings: await saveSettings(req.body || {}) })
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
