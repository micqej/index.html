import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { vapidPublicKey, saveSubscription, sendPush, pushCount } from '../../../lib/push'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.method === 'GET') {
      // verejný VAPID kľúč + počet prihlásených zariadení
      return res.status(200).json({ publicKey: await vapidPublicKey(), devices: await pushCount() })
    }
    if (req.method === 'POST') {
      const { action, subscription } = req.body || {}
      if (action === 'subscribe' && subscription?.endpoint) {
        await saveSubscription(subscription)
        return res.status(200).json({ ok: true })
      }
      if (action === 'test') {
        const r = await sendPush({ title: 'Test notifikácie', body: 'Funguje to! 🎉'.replace('🎉', ''), url: '/admin/' })
        return res.status(200).json(r)
      }
      return res.status(400).json({ error: 'Neznáma akcia' })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
