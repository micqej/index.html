import type { NextApiRequest, NextApiResponse } from 'next'
import { addMessage } from '../../lib/messages'
import { sendPush } from '../../lib/push'
import { sendNotifyEmail } from '../../lib/email'
import { dbReady } from '../../lib/db'

// Strop na funkciu — bez neho ju platforma nechá visieť 300 s (=zamrznutý admin).
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { name, email, phone, services, message, website } = req.body || {}
  if (website) return res.status(200).json({ ok: true }) // honeypot — bot
  if (!name && !email && !message) return res.status(400).json({ error: 'Vyplň aspoň meno alebo e-mail a správu.' })
  if (!dbReady()) return res.status(200).json({ ok: true, stored: false })

  const ip = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim()
  try {
    const svc = Array.isArray(services) ? services.slice(0, 20).map(String) : []
    const m = await addMessage({
      name: String(name || '').slice(0, 200),
      email: String(email || '').slice(0, 200),
      phone: String(phone || '').slice(0, 60),
      services: svc,
      message: String(message || '').slice(0, 5000),
      ip,
    })

    // Upozornenia — fire-safe, nezhodia odoslanie
    const label = m.name || m.email || 'Neznámy'
    await sendPush({
      title: 'Nová správa z webu',
      body: `${label}${svc.length ? ' · ' + svc.slice(0, 3).join(', ') : ''}`,
      url: '/admin/#spravy',
    }).catch(() => {})
    await sendNotifyEmail(
      `Nová správa z monetico.sk — ${label}`,
      `<h2>Nová správa z kontaktného formulára</h2>
       <p><b>Meno:</b> ${esc(m.name)}<br>
       <b>E-mail:</b> ${esc(m.email)}<br>
       <b>Telefón:</b> ${esc(m.phone)}<br>
       <b>Záujem:</b> ${esc(svc.join(', '))}</p>
       <p><b>Správa:</b><br>${esc(m.message).replace(/\n/g, '<br>')}</p>`
    ).catch(() => {})

    return res.status(200).json({ ok: true, stored: true })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}

function esc(s: string): string {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
}
