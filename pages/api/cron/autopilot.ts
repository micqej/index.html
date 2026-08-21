import type { NextApiRequest, NextApiResponse } from 'next'
import { runAutopilotBatch } from '../../../lib/autopilot'
import { dbSafe } from '../../../lib/db'

// Vercel dnes dovolí funkcii bežať 300 s. Písanie článku po krokoch sa doň
// pohodlne zmestí; rozpočet 240 s necháva rezervu na dopísanie a uloženie.
export const config = { maxDuration: 300 }

/** Koľko hodín musí uplynúť od posledného článku, kým sa smie písať ďalší. */
const MIN_ODSTUP_H = Number(process.env.AUTOPILOT_MIN_HOURS || 40)

async function hodinOdPoslednehoClanku(): Promise<number | null> {
  const rows = await dbSafe(
    sql => sql`select extract(epoch from (now() - max(created_at))) / 3600 as h from articles`,
    [] as any[],
  )
  const h = rows?.[0]?.h
  return h === null || h === undefined ? null : Number(h)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron aj cron na Hetzneri posielajú Authorization: Bearer <CRON_SECRET>.
  // ⚠️ Bez nastaveného CRON_SECRET je routa verejná a ktokoľvek vie páliť
  // OpenAI kredit — preto ju bez tajomstva rovno odmietame.
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ ok: false, error: 'CRON_SECRET nie je nastavený' })
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Neautorizované' })
  }

  // Koľko článkov najviac za jeden beh (?max=1). Default 1 = jeden článok,
  // aby dva zdroje spúšťania (Hetzner + záložný Vercel cron) nezaplavili blog.
  const max = Math.min(Math.max(Number(req.query.max) || 1, 1), 3)
  const force = req.query.force === '1'

  try {
    // Poistka proti zahlteniu: nezáleží, kto routu zavolá, článok pribudne
    // najviac raz za MIN_ODSTUP_H hodín. Obísť sa dá len cez ?force=1.
    const odstup = await hodinOdPoslednehoClanku()
    if (!force && odstup !== null && odstup < MIN_ODSTUP_H) {
      return res.status(200).json({
        ok: true,
        skipped: 'príliš skoro',
        detail: [`Od posledného článku ubehlo ${odstup.toFixed(1)} h, minimum je ${MIN_ODSTUP_H} h.`],
      })
    }

    const result = await runAutopilotBatch({ budgetMs: 240_000, maxArticles: max })
    return res.status(200).json(result)
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || 'Chyba' })
  }
}
