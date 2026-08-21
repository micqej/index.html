import { db, dbSafe } from './db'

/**
 * Gmail ignoruje bodky v mene schránky a všetko za „+". Boty to zneužívajú:
 * `o.f.e.di.nu620@gmail.com` a `ofedinu620@gmail.com` je JEDNA schránka, ale
 * v databáze to vyzerá ako dvaja odberatelia. Preto si popri adrese držíme aj
 * normalizovaný tvar a duplicitu strážime na ňom.
 */
export function normalizeEmail(email: string): string {
  const clean = email.trim().toLowerCase()
  const [meno, domena] = clean.split('@')
  if (!domena) return clean
  if (domena === 'gmail.com' || domena === 'googlemail.com') {
    return meno.split('+')[0].replace(/\./g, '') + '@gmail.com'
  }
  return meno.split('+')[0] + '@' + domena
}

/**
 * Rozpozná adresy vyrobené botom. Nie je to istota, preto sa takýto zápis
 * NEZAHADZUJE — uloží sa so stavom `spam`, takže ho nevidno v zozname, nejde
 * do CRM a neposiela sa mu newsletter. Keby to niekoho odfiltrovalo omylom,
 * v databáze je a dá sa vrátiť.
 */
export function looksLikeBot(email: string): boolean {
  const [meno, domena] = email.trim().toLowerCase().split('@')
  if (!meno || !domena) return true
  const bodky = (meno.match(/\./g) || []).length
  // 3 a viac bodiek v gmailovej adrese = trik na obídenie duplicity
  if ((domena === 'gmail.com' || domena === 'googlemail.com') && bodky >= 3) return true
  // adresa zložená len zo spoluhláskových zhlukov a čísel bez jedinej samohlásky v slabike
  if (/^[bcdfghjklmnpqrstvwxz]{6,}\d*$/.test(meno.replace(/[._-]/g, ''))) return true
  return false
}

/** Vráti { created } — true len ak išlo o NOVÉHO odberateľa (nie duplicitný email). */
export async function addSubscriber(email: string, source = 'web', opts: { status?: string; ip?: string } = {}): Promise<{ created: boolean; email: string }> {
  const clean = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('invalid email')
  const norm = normalizeEmail(clean)
  const status = opts.status || 'ok'
  const rows = await db(sql => sql`INSERT INTO subscribers (email, email_norm, source, status, ip)
    VALUES (${clean}, ${norm}, ${source}, ${status}, ${opts.ip || ''})
    ON CONFLICT (email_norm) DO NOTHING RETURNING id`)
  return { created: !!rows && rows.length > 0, email: clean }
}

/** Koľko prihlásení prišlo z tejto IP za poslednú hodinu (strop proti botom). */
export async function signupsFromIp(ip: string): Promise<number> {
  if (!ip) return 0
  const rows = await dbSafe(sql => sql`SELECT count(*)::int AS n FROM subscribers
    WHERE ip = ${ip} AND created_at > now() - interval '1 hour'`, [] as any[])
  return rows?.[0]?.n ?? 0
}

export async function listSubscribers(vratajSpam = false): Promise<{ id: number; email: string; source: string; status: string; created_at: string }[]> {
  const rows = vratajSpam
    ? await dbSafe(sql => sql`SELECT id, email, source, status, created_at FROM subscribers ORDER BY created_at DESC`, [] as any[])
    : await dbSafe(sql => sql`SELECT id, email, source, status, created_at FROM subscribers WHERE status = 'ok' ORDER BY created_at DESC`, [] as any[])
  return rows.map((r: any) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) as any
}

export async function subscribersCsv(): Promise<string> {
  const subs = await listSubscribers()
  const head = 'email,source,created_at'
  const body = subs.map(s => `${s.email},${s.source},${s.created_at}`).join('\n')
  return `${head}\n${body}\n`
}
