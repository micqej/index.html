import type { NextApiRequest, NextApiResponse } from 'next'
import { isAuthed, adminConfigured } from '../../../lib/adminAuth'
import { dbReady } from '../../../lib/db'
import { getSiteSettings } from '../../../lib/siteSettings'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authed = isAuthed(req)
  const base = { authed, configured: adminConfigured(), db: dbReady() }
  if (!authed) return res.status(200).json({ ...base, ai: false, pexels: false, pixabay: false })
  // jeden DB read namiesto troch (rýchlejšie načítanie admina)
  const s = await getSiteSettings().catch(() => null)
  const has = (db: string | undefined, env?: string) => !!((db && db.trim()) || env)
  return res.status(200).json({
    ...base,
    ai: has(s?.openaiKey, process.env.OPENAI_API_KEY),
    pexels: has(s?.pexelsKey, process.env.PEXELS_API_KEY),
    pixabay: has(s?.pixabayKey, process.env.PIXABAY_API_KEY),
  })
}
