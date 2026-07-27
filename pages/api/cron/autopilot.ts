import type { NextApiRequest, NextApiResponse } from 'next'
import { runAutopilotBatch } from '../../../lib/autopilot'

// Vercel dnes dovolí funkcii bežať 300 s. Písanie článku po krokoch sa doň
// pohodlne zmestí; rozpočet 240 s necháva rezervu na dopísanie a uloženie.
export const config = { maxDuration: 300 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron posiela hlavičku Authorization: Bearer <CRON_SECRET> ak je nastavený.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Neautorizované' })
  }
  try {
    const result = await runAutopilotBatch({ budgetMs: 240_000, maxArticles: 3 })
    return res.status(200).json(result)
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || 'Chyba' })
  }
}
