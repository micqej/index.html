import type { NextApiRequest, NextApiResponse } from 'next'
import { addSubscriber } from '../../lib/subscribers'
import { dbReady } from '../../lib/db'
import { fireSubscriberWebhook, buildSubscriberPayload } from '../../lib/webhook'
import { SITE_URL } from '../../lib/site'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, source, name } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Chýba email' })
  // Gracefully accept even if DB is not configured yet (no crash on the public site).
  if (!dbReady()) return res.status(200).json({ ok: true, stored: false })
  try {
    const src = source || 'web'
    const { created, email: clean } = await addSubscriber(String(email), src)
    // CRM webhook — len pri NOVOM odberateľovi, fire-safe (zlyhanie nezhodí signup)
    if (created) {
      await fireSubscriberWebhook(buildSubscriberPayload(clean, src, new Date().toISOString(), SITE_URL, String(name || '')))
        .catch(() => {})
    }
    return res.status(200).json({ ok: true, stored: true })
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Neplatný email' })
  }
}
