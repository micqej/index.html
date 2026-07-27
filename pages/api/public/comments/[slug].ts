import type { NextApiRequest, NextApiResponse } from 'next'
import { approvedComments, addComment } from '../../../../lib/comments'
import { getSiteSettings } from '../../../../lib/siteSettings'
import { dbReady } from '../../../../lib/db'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 10 }

async function verifyRecaptcha(token: string, secret: string): Promise<boolean> {
  if (!secret) return true // recaptcha nie je nakonfigurovaná → preskoč
  if (!token) return false
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    })
    const d = await r.json()
    return !!d.success && (d.score === undefined || d.score >= 0.5)
  } catch { return false }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = String(req.query.slug || '')
  if (!slug) return res.status(400).json({ error: 'Chýba slug' })

  if (req.method === 'GET') {
    return res.status(200).json({ comments: await approvedComments(slug) })
  }

  if (req.method === 'POST') {
    const s = await getSiteSettings()
    if (!s.commentsEnabled) return res.status(403).json({ error: 'Komentáre sú vypnuté' })
    if (!dbReady()) return res.status(503).json({ error: 'Komentáre zatiaľ nie sú dostupné' })

    const { author, email, body, website, recaptchaToken } = req.body || {}
    // honeypot — boti vyplnia skryté pole "website"
    if (website) return res.status(200).json({ ok: true, status: 'spam' })

    const text = String(body || '').trim()
    if (text.length < 2 || text.length > 4000) return res.status(400).json({ error: 'Neplatný komentár' })
    const name = String(author || 'Anonym').trim().slice(0, 80) || 'Anonym'

    const ok = await verifyRecaptcha(String(recaptchaToken || ''), s.recaptchaSecret)
    if (!ok) return res.status(400).json({ error: 'Overenie zlyhalo. Skúste znova.' })

    // jednoduchá spam heuristika
    const links = (text.match(/https?:\/\//gi) || []).length
    const looksSpam = links >= 3
    const status = looksSpam ? 'spam' : (s.commentsModeration ? 'pending' : 'approved')

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket.remoteAddress || '')
    try {
      await addComment({ slug, author: name, email: String(email || '').slice(0, 160), body: text, ip, status })
      return res.status(200).json({ ok: true, status })
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Chyba' })
    }
  }

  return res.status(405).end()
}
