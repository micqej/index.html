import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { listModels } from '../../../lib/aiContent'

/** Modely reálne dostupné na účte — nech sa v Nastaveniach nevyberá naslepo. */
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  try {
    return res.status(200).json({ models: await listModels() })
  } catch (e: any) {
    return res.status(200).json({ models: [], error: e.message || 'Nepodarilo sa načítať modely' })
  }
}
