import type { NextApiRequest, NextApiResponse } from 'next'
import { checkPin, setSession, adminConfigured } from '../../../lib/adminAuth'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 10 }

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!adminConfigured()) return res.status(500).json({ error: 'ADMIN_PIN nie je nastavený' })
  const { pin, password } = req.body || {}
  if (!checkPin(String(pin ?? password ?? ''))) return res.status(401).json({ error: 'Nesprávny PIN' })
  setSession(res)
  return res.status(200).json({ ok: true })
}
