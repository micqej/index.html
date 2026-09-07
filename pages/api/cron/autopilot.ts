import type { NextApiRequest, NextApiResponse } from 'next'
import { runAutopilotBatch } from '../../../lib/autopilot'
import { publishDue } from '../../../lib/articles'
import { dbSafe } from '../../../lib/db'
import { getSiteSettings } from '../../../lib/siteSettings'
import { pruneEvents } from '../../../lib/stats'

// Vercel dnes dovolí funkcii bežať 300 s. Písanie článku po krokoch sa doň
// pohodlne zmestí; rozpočet 240 s necháva rezervu na dopísanie a uloženie.
export const config = { maxDuration: 300 }

/** Koľko hodín musí uplynúť od posledného článku, kým sa smie písať ďalší. */
const MIN_ODSTUP_H = Number(process.env.AUTOPILOT_MIN_HOURS || 68)

/** Koľko hotových článkov ešte čaká vo fronte na svoj dátum zverejnenia. */
async function cakaVoFronte(): Promise<number> {
  const rows = await dbSafe(
    sql => sql`select count(*)::int as n from articles where status = 'scheduled' and publish_at > now()`,
    [] as any[],
  )
  return rows?.[0]?.n ?? 0
}

async function hodinOdPoslednehoClanku(): Promise<number | null> {
  const rows = await dbSafe(
    sql => sql`select extract(epoch from (now() - max(created_at))) / 3600 as h from articles`,
    [] as any[],
  )
  const h = rows?.[0]?.h
  return h === null || h === undefined ? null : Number(h)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Tajomstvo je v databáze (Nastavenia → cronSecret), takže sa dá zmeniť bez
  // zásahu do hostingu. Premenná CRON_SECRET má prednosť, keby ju niekto nastavil.
  const secret = (process.env.CRON_SECRET || (await getSiteSettings()).cronSecret || '').trim()
  // ⚠️ Bez tajomstva bola routa v produkcii verejná a ktokoľvek vedel páliť
  // OpenAI kredit — preto ju bez neho rovno odmietame.
  if (!secret) return res.status(503).json({ ok: false, error: 'Tajomstvo pre cron nie je nastavené' })
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Neautorizované' })
  }

  // Koľko článkov najviac za jeden beh (?max=1). Default 1 = jeden článok,
  // aby dva zdroje spúšťania (Hetzner + záložný Vercel cron) nezaplavili blog.
  const max = Math.min(Math.max(Number(req.query.max) || 1, 1), 3)
  const force = req.query.force === '1'

  try {
    // Zverejňovanie beží VŽDY, aj keď sa dnes nič nepíše — inak by naplánované
    // články ostali visieť, lebo poistky nižšie beh predčasne ukončia.
    const published = await publishDue()

    // Údržba merania — surové udalosti staršie než rok sa zmažú, aby tabuľka
    // nerástla donekonečna. Beží pri každom cykle, je to jeden lacný DELETE.
    await pruneEvents(400).catch(() => 0)

    // Poistka 1: kým je vo fronte hotový článok s budúcim dátumom, nové sa
    // nepíšu. Obsah už je pripravený, netreba ho vyrábať dopredu.
    const fronta = await cakaVoFronte()
    if (!force && fronta > 0) {
      return res.status(200).json({
        ok: true, published, skipped: 'vo fronte sú pripravené články',
        detail: [`Čaká ${fronta} hotových článkov na svoj dátum.`],
      })
    }

    // Poistka 2: nech routu spustí ktokoľvek, článok pribudne najviac raz za
    // MIN_ODSTUP_H hodín. Obísť sa dá len cez ?force=1.
    const odstup = await hodinOdPoslednehoClanku()
    if (!force && odstup !== null && odstup < MIN_ODSTUP_H) {
      return res.status(200).json({
        ok: true,
        published,
        skipped: 'príliš skoro',
        detail: [`Od posledného článku ubehlo ${odstup.toFixed(1)} h, minimum je ${MIN_ODSTUP_H} h.`],
      })
    }

    const result = await runAutopilotBatch({ budgetMs: 240_000, maxArticles: max })
    return res.status(200).json({ ...result, published: (result.published || 0) + published })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message || 'Chyba' })
  }
}
