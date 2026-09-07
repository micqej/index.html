import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { sendNotifyEmail, notifyMissing, getNotifyState } from '../../../lib/email'
import { pushCount, vapidPublicKey } from '../../../lib/push'

/** Stav upozornení + skúšobné odoslanie. Koniec hádania, prečo e-mail neprišiel. */
export const config = { maxDuration: 30 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        missing: await notifyMissing(),
        last: await getNotifyState(),
        pushDevices: await pushCount(),
        pushReady: !!(await vapidPublicKey()),
      })
    }
    if (req.method === 'POST') {
      const r = await sendNotifyEmail(
        'Skúšobné upozornenie z monetico.sk',
        `<h2>Funguje to</h2><p>Toto je skúšobný e-mail z administrácie. Ak ti prišiel,
         budú ti chodiť aj upozornenia na nové správy z kontaktného formulára.</p>`
      )
      return res.status(200).json(r)
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: e.message || 'Chyba' })
  }
}
