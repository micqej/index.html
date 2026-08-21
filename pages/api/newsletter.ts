import type { NextApiRequest, NextApiResponse } from 'next'
import { addSubscriber, looksLikeBot, signupsFromIp } from '../../lib/subscribers'
import { dbReady } from '../../lib/db'
import { fireSubscriberWebhook, buildSubscriberPayload } from '../../lib/webhook'
import { SITE_URL } from '../../lib/site'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 15 }

/** Človek musí stránku najprv uvidieť a adresu napísať — pod 3 s to nestihne. */
const MIN_CAS_MS = 3_000
/** Formulár starší ako deň = otvorená karta z minulého týždňa alebo prehratý útok. */
const MAX_CAS_MS = 24 * 60 * 60 * 1000
/** Koľko prihlásení z jednej IP za hodinu ešte berieme vážne. */
const MAX_Z_IP = 3

function ipZiadosti(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for']
  const raw = Array.isArray(fwd) ? fwd[0] : (fwd || '')
  return String(raw).split(',')[0].trim() || (req.socket.remoteAddress || '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, source, name, website, ts } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Chýba email' })

  // Botom hovoríme to isté, čo človeku. Keby videli „odmietnuté", skúšali by ďalej.
  const tvarSaOk = () => res.status(200).json({ ok: true, stored: true })

  // 1) Návnada: pole `website` je v stránke skryté, človek doň nikdy nenapíše.
  if (typeof website === 'string' && website.trim() !== '') return tvarSaOk()

  // 2) Čas od načítania formulára. Bot, ktorý strieľa priamo na API, ho nepošle.
  const cas = Number(ts) || 0
  const ubehlo = cas > 0 ? Date.now() - cas : -1
  if (ubehlo < MIN_CAS_MS || ubehlo > MAX_CAS_MS) return tvarSaOk()

  if (!dbReady()) return res.status(200).json({ ok: true, stored: false })

  try {
    const src = source || 'web'
    const ip = ipZiadosti(req)

    // 3) Podozrivý tvar adresy alebo priveľa prihlásení z jednej IP → uložíme
    //    ako spam: nevidno ho v zozname, neputuje do CRM, nič sa nestráca.
    const podozrive = looksLikeBot(String(email)) || (await signupsFromIp(ip)) >= MAX_Z_IP
    const { created, email: clean } = await addSubscriber(String(email), src, {
      status: podozrive ? 'spam' : 'ok',
      ip,
    })

    // CRM webhook — len pri NOVOM a dôveryhodnom odberateľovi, fire-safe.
    if (created && !podozrive) {
      await fireSubscriberWebhook(buildSubscriberPayload(clean, src, new Date().toISOString(), SITE_URL, String(name || '')))
        .catch(() => {})
    }
    return res.status(200).json({ ok: true, stored: true })
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Neplatný email' })
  }
}
