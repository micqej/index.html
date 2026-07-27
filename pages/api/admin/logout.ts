import type { NextApiRequest, NextApiResponse } from 'next'
import { clearSession } from '../../../lib/adminAuth'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 10 }

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  clearSession(res)
  return res.status(200).json({ ok: true })
}
