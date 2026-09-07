import type { NextApiRequest, NextApiResponse } from 'next'
import { recordEvents, channelFrom } from '../../lib/stats'

// Zber meraní. Musí byť rýchly a nesmie nikdy zdržať návštevníka.
export const config = { maxDuration: 10 }

const BOT = /(bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|gtmetrix|monitor|preview|curl|wget|python-requests|axios|node-fetch)/i

function deviceFrom(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobi|iphone|android.+mobile|windows phone/i.test(ua)) return 'mobil'
  return 'počítač'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Odpovedz hneď — prehliadač nemá na čo čakať.
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).end()

  const ua = String(req.headers['user-agent'] || '')
  if (!ua || BOT.test(ua)) return res.status(204).end()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const events = Array.isArray(body.events) ? body.events : []
    if (!events.length) return res.status(204).end()

    // Admin a API sa nemerajú.
    const filtered = events.filter((e: any) => !String(e?.path || '').startsWith('/admin'))
    if (!filtered.length) return res.status(204).end()

    const { channel, ref } = channelFrom(String(body.ref || ''), String(body.url || ''))
    await recordEvents(filtered, {
      sid: String(body.sid || '').slice(0, 40) || 'x',
      channel, ref,
      device: deviceFrom(ua),
    })
    return res.status(204).end()
  } catch {
    // Chyba merania nesmie nič hlásiť návštevníkovi.
    return res.status(204).end()
  }
}
