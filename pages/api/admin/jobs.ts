import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { recentJobs } from '../../../lib/generate'

/** Posledné generovania vrátane dôvodu zlyhania — koniec hádania „prečo nič nevzniklo". */
export const config = { maxDuration: 15 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    return res.status(200).json({ jobs: await recentJobs(12) })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
