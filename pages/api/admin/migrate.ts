import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { migrate } from '../../../lib/db'

/**
 * Ručná migrácia schémy. Schéma sa ZÁMERNE nevytvára pri každom requeste —
 * DDL na cold-starte bola jedna z príčin zamrznutého admina.
 * Po pridaní stĺpca/tabuľky do `migrate()` klikni v Nastaveniach na
 * „Skontrolovať databázu" (alebo POST sem).
 */
export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const tables = await migrate()
    return res.status(200).json({ ok: true, tables })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || 'Migrácia zlyhala' })
  }
}
