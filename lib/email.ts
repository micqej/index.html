import nodemailer from 'nodemailer'
import { getSiteSettings } from './siteSettings'
import { dbSafe } from './db'

/**
 * E-mailové upozornenia cez vlastnú SMTP schránku (hostcreators).
 *
 * Prečo SMTP a nie externá služba: schránku na monetico.sk už máme, doména má
 * platné SPF/DKIM, nič sa neplatí navyše a nikam sa neposielajú dáta.
 *
 * ⚠️ Predtým táto funkcia pri chýbajúcom nastavení len ticho vrátila `false`
 * a volajúci to ešte zabalil do `.catch(() => {})`. Formulár teda fungoval,
 * správa sa uložila, e-mail nikdy neprišiel — a NIKDE sa nedalo zistiť prečo.
 * Preto teraz vraciame konkrétny dôvod a posledný výsledok ukladáme do
 * nastavení, aby admin vedel povedať „posledné upozornenie zlyhalo, lebo …“.
 */

export interface NotifyResult { ok: boolean; reason: string; skipped?: boolean }

export interface NotifyState {
  at: string
  ok: boolean
  reason: string
  to: string
}

const STATE_KEY = 'notify_state'

export async function getNotifyState(): Promise<NotifyState | null> {
  const rows = await dbSafe(sql => sql`SELECT value FROM settings WHERE key = ${STATE_KEY} LIMIT 1`, [] as any[])
  const v: any = rows[0]?.value
  if (!v) return null
  try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null }
}

async function saveState(state: NotifyState): Promise<void> {
  await dbSafe(sql => sql`INSERT INTO settings (key, value) VALUES (${STATE_KEY}, ${sql.json(state as any)})
    ON CONFLICT (key) DO UPDATE SET value = ${sql.json(state as any)}`, null as any)
}

interface SmtpConfig { host: string; port: number; user: string; pass: string; from: string; to: string }

/** Poskladá nastavenie z admina, s fallbackom na Vercel premenné. */
async function smtpConfig(): Promise<SmtpConfig> {
  const s = await getSiteSettings()
  const host = (s.smtpHost || process.env.SMTP_HOST || '').trim()
  const port = Number(s.smtpPort || process.env.SMTP_PORT || 465)
  const user = (s.smtpUser || process.env.SMTP_USER || '').trim()
  const pass = (s.smtpPass || process.env.SMTP_PASS || '').trim()
  const to = (s.notifyEmail || '').trim()
  // Odosielateľ MUSÍ byť na doméne, ktorú schránka smie posielať, inak to SPF
  // vyhodnotí ako podvrh a e-mail skončí v spame (alebo ho server odmietne).
  const from = (s.notifyFrom || '').trim() || user
  return { host, port, user, pass, from, to }
}

/** Čo chýba, aby upozornenia mohli fungovať. Prázdne pole = všetko je nastavené. */
export async function notifyMissing(): Promise<string[]> {
  const c = await smtpConfig()
  const missing: string[] = []
  if (!c.host) missing.push('SMTP server')
  if (!c.user) missing.push('e-mailová schránka (používateľ)')
  if (!c.pass) missing.push('heslo k schránke')
  if (!c.to) missing.push('adresa, kam upozornenia posielať')
  return missing
}

/**
 * Pošle upozorňovací e-mail. Vracia konkrétny dôvod neúspechu — volajúci ho
 * môže zobraziť. Výsledok sa vždy uloží, nech je v admine vidieť stav.
 */
export async function sendNotifyEmail(subject: string, html: string): Promise<NotifyResult> {
  const c = await smtpConfig()
  const missing = await notifyMissing()
  if (missing.length) {
    const reason = 'Nie je nastavené: ' + missing.join(', ') + ' (Integrácie → E-mailové upozornenia).'
    await saveState({ at: new Date().toISOString(), ok: false, reason, to: c.to })
    return { ok: false, reason, skipped: true }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.port === 465,        // 465 = SSL, 587 = STARTTLS
      requireTLS: c.port !== 465,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 12_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    await transporter.sendMail({ from: c.from, to: c.to, subject, html })
    transporter.close()
    await saveState({ at: new Date().toISOString(), ok: true, reason: '', to: c.to })
    return { ok: true, reason: '' }
  } catch (e: any) {
    const reason = translate(String(e?.message || e), e?.code)
    await saveState({ at: new Date().toISOString(), ok: false, reason, to: c.to })
    return { ok: false, reason }
  }
}

/** Najčastejšie chyby SMTP po slovensky, aby sa nemuseli googliť. */
function translate(msg: string, code?: string): string {
  const m = msg.toLowerCase()
  if (code === 'EAUTH' || m.includes('authentication failed') || m.includes('invalid login') || m.includes('535')) {
    return 'Server odmietol prihlásenie — skontroluj schránku a heslo. Používateľ je celá adresa (napr. web@monetico.sk), nie len meno.'
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || m.includes('timeout') || m.includes('econnrefused')) {
    return 'Nepodarilo sa spojiť so serverom. Over adresu servera a port — hostcreators používa smtp.hostcreators.sk, port 465 (SSL) alebo 587.'
  }
  if (m.includes('self signed') || m.includes('certificate')) {
    return 'Problém s certifikátom servera. Skús port 465 namiesto 587 (alebo naopak).'
  }
  if (m.includes('sender') || m.includes('from') || m.includes('550') || m.includes('553')) {
    return 'Server odmietol odosielateľa. Adresa v poli „Odosielateľ" musí patriť tej istej schránke, cez ktorú sa prihlasuješ.'
  }
  if (m.includes('recipient') || m.includes('554')) return 'Server odmietol príjemcu — skontroluj adresu, kam sa má upozornenie posielať.'
  return msg.slice(0, 300)
}
