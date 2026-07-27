import { db, dbSafe } from './db'

export interface AutopilotSettings {
  autopilotEnabled: boolean
  autoPublish: boolean
  postsPerWeek: number
  publishDays: number[] // 0=Sun .. 6=Sat
  publishHour: number
  model: string
  temperature: number
  tone: string
  wordCount: number
  defaultCategory: string
  randomCategory: boolean      // náhodne vyberať kategóriu pre každý článok
  imageSource: 'pexels' | 'pixabay' | 'both'
  imageCount: number           // koľko fotiek na článok (1–3)
  autoInterlink: boolean
  linkCount: number            // koľko interných odkazov vložiť (0–3)
  titleMaxWords: number        // max počet slov v názve článku
  randomStyle: boolean         // náhodný štýl písania pre každý článok
  newsletterSubject: string
  businessContext: string      // čím sa firma reálne zaoberá — grounduje témy aj texty
}

export const DEFAULT_SETTINGS: AutopilotSettings = {
  autopilotEnabled: false,
  autoPublish: true,
  postsPerWeek: 2,
  publishDays: [1, 4],
  publishHour: 9,
  model: 'gpt-4o',
  temperature: 0.7,
  tone: 'Praktický, priateľský a odborný. Bez omáčky — konkrétne, použiteľné tipy pre slovenské firmy. Píš po slovensky.',
  wordCount: 1200,
  defaultCategory: 'Marketing Tipy',
  randomCategory: true,
  imageSource: 'both',
  imageCount: 2,
  autoInterlink: true,
  linkCount: 2,
  titleMaxWords: 8,
  randomStyle: true,
  newsletterSubject: 'Tipy pre rast — Monetico',
  businessContext:
    'Monetico je slovenská digitálna agentúra. Služby: tvorba webov a e-shopov, SEO, ' +
    'cold emailing, email marketing, správa sociálnych sietí, online reklama (Google/Meta) ' +
    'a automatizácia marketingu. Cieľová skupina: majitelia malých a stredných firiem a e-shopov na Slovensku.',
}

const KEY = 'autopilot'

/**
 * Nastavenia sa čítajú pri KAŽDOM generovaní aj pri každom API volaní.
 * Bez cache to bolo 5–8 zbytočných round-tripov na jeden request (a pri
 * zaseknutom pooleri 5× šanca na zamrznutie). TTL je krátke, takže zmena
 * v admine sa prejaví hneď (save cache aj tak invaliduje).
 */
let cache: { at: number; value: AutopilotSettings } | null = null
const TTL_MS = 30_000

export function invalidateSettings(): void { cache = null }

export async function getSettings(): Promise<AutopilotSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const rows = await dbSafe(sql => sql`SELECT value FROM settings WHERE key = ${KEY} LIMIT 1`, [] as any[])
  let value = DEFAULT_SETTINGS
  if (rows[0]) {
    const v: any = rows[0].value
    try {
      const obj = typeof v === 'string' ? JSON.parse(v) : v
      value = { ...DEFAULT_SETTINGS, ...obj }
    } catch { /* poškodený JSON → defaulty */ }
    cache = { at: Date.now(), value }
  } else if (rows.length === 0) {
    // Nič v DB (alebo DB nedostupná) — necachuj defaulty natvrdo dlho.
    cache = { at: Date.now(), value }
  }
  return value
}

export async function saveSettings(patch: Partial<AutopilotSettings>): Promise<AutopilotSettings> {
  invalidateSettings()
  const next = { ...(await getSettings()), ...patch }
  const r = await db(sql => sql`INSERT INTO settings (key, value) VALUES (${KEY}, ${sql.json(next as any)})
    ON CONFLICT (key) DO UPDATE SET value = ${sql.json(next as any)}`)
  if (r === null) throw new Error('DB nie je nastavená')
  invalidateSettings()
  return next
}
