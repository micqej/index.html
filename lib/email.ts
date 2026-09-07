import { Resend } from 'resend'
import { getSiteSettings } from './siteSettings'
import { db, dbSafe } from './db'

/**
 * E-mailové upozornenia cez Resend.
 *
 * ⚠️ Predtým táto funkcia pri chýbajúcom kľúči len ticho vrátila `false` a volajúci
 * to ešte zabalil do `.catch(() => {})`. Výsledok: formulár fungoval, správa sa
 * uložila, e-mail nikdy neprišiel — a NIKDE sa nedalo zistiť prečo.
 * Teraz vraciame konkrétny dôvod a posledný výsledok ukladáme do nastavení,
 * takže admin vie povedať „posledné upozornenie zlyhalo, lebo …“.
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

/** Čo chýba, aby upozornenia mohli fungovať. Prázdne pole = všetko je nastavené. */
export async function notifyMissing(): Promise<string[]> {
  const s = await getSiteSettings()
  const key = (s.resendKey && s.resendKey.trim()) || process.env.RESEND_API_KEY || ''
  const to = (s.notifyEmail && s.notifyEmail.trim()) || ''
  const missing: string[] = []
  if (!key) missing.push('Resend API kľúč')
  if (!to) missing.push('adresa, kam upozornenia posielať')
  return missing
}

/**
 * Pošle upozorňovací e-mail. Vracia konkrétny dôvod neúspechu — volajúci ho môže
 * zalogovať alebo zobraziť. Výsledok sa vždy uloží, nech je v admine vidieť stav.
 */
export async function sendNotifyEmail(subject: string, html: string): Promise<NotifyResult> {
  const s = await getSiteSettings()
  const key = (s.resendKey && s.resendKey.trim()) || process.env.RESEND_API_KEY || ''
  const to = (s.notifyEmail && s.notifyEmail.trim()) || ''
  const from = (s.resendFrom && s.resendFrom.trim()) || 'Monetico <onboarding@resend.dev>'

  const missing = await notifyMissing()
  if (missing.length) {
    const reason = 'Nie je nastavené: ' + missing.join(' a ') + ' (Integrácie → E-mailové upozornenia).'
    await saveState({ at: new Date().toISOString(), ok: false, reason, to })
    return { ok: false, reason, skipped: true }
  }

  try {
    const resend = new Resend(key)
    const r: any = await resend.emails.send({ from, to, subject, html })
    // Resend nehádže výnimku pri odmietnutí — chybu vracia v tele odpovede.
    if (r?.error) {
      const reason = translate(String(r.error?.message || r.error))
      await saveState({ at: new Date().toISOString(), ok: false, reason, to })
      return { ok: false, reason }
    }
    await saveState({ at: new Date().toISOString(), ok: true, reason: '', to })
    return { ok: true, reason: '' }
  } catch (e: any) {
    const reason = translate(String(e?.message || e))
    await saveState({ at: new Date().toISOString(), ok: false, reason, to })
    return { ok: false, reason }
  }
}

/** Najčastejšie chyby Resendu po slovensky, aby sa nemuseli googliť. */
function translate(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('testing emails to your own')) {
    return 'Resend v skúšobnom režime pošle e-mail LEN na adresu, ktorou si sa registroval. ' +
      'Buď nastav rovnakú adresu, alebo si v Resende over vlastnú doménu a zmeň odosielateľa.'
  }
  if (m.includes('api key is invalid') || m.includes('unauthorized') || m.includes('401')) {
    return 'Resend API kľúč je neplatný — skontroluj ho v Integráciách (má tvar re_…).'
  }
  if (m.includes('domain is not verified') || m.includes('not verified')) {
    return 'Doména odosielateľa nie je v Resende overená. Nechaj odosielateľa „Monetico <onboarding@resend.dev>“, kým doménu neoveríš.'
  }
  if (m.includes('rate') && m.includes('limit')) return 'Resend dočasne obmedzil počet odoslaných e-mailov. Skús o chvíľu.'
  return msg.slice(0, 300)
}
