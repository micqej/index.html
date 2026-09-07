import { db, dbSafe } from './db'

/**
 * Vlastná analytika — prvá strana, bez cookies, bez cudzích služieb.
 *
 * Prečo nie iba GA4:
 *  1) blokovače reklám zahodia 20–30 % návštev, takže čísla v GA sú nižšie než realita
 *  2) z GA sa nedá v admine ukázať „ktorý článok priniesol dopyt“ bez ďalšieho API a OAuth
 *  3) toto beží na vlastnej doméne, takže nič neblokuje a dáta ostávajú v našej DB
 *
 * Súkromie: neukladáme IP ani nič, čím sa dá človek identifikovať. `sid` je
 * náhodné číslo v sessionStorage prehliadača, ktoré zaniká zatvorením karty —
 * preto na to netreba súhlas s cookies.
 */

export type EventKind =
  | 'view'        // zobrazenie stránky
  | 'read'        // dočítal (50 % obsahu + aspoň 15 s)
  | 'cta'         // klik na službu / výzvu
  | 'form_open'   // klikol do formulára
  | 'lead'        // odoslal dopyt  (zapisuje server, nie prehliadač)
  | 'newsletter'  // prihlásil sa na odber (zapisuje server)
  | 'tel'         // klik na telefón
  | 'mail'        // klik na e-mail

export interface IncomingEvent {
  kind: EventKind
  path: string
  meta?: Record<string, any>
}

export interface EventContext {
  sid: string
  channel: string
  device: string
  ref: string
}

const KINDS: EventKind[] = ['view', 'read', 'cta', 'form_open', 'lead', 'newsletter', 'tel', 'mail']

/** Orež cestu na rozumný tvar — bez parametrov, bez kotvy, vždy s lomkou na konci. */
export function cleanPath(raw: string): string {
  let p = String(raw || '/').split('?')[0].split('#')[0].trim()
  if (!p.startsWith('/')) p = '/' + p
  if (!p.endsWith('/')) p += '/'
  return p.slice(0, 300)
}

/** Z odkazujúcej adresy urob kanál, ktorý dáva zmysel v prehľade. */
export function channelFrom(ref: string, url: string): { channel: string; ref: string } {
  const q = (() => { try { return new URL(url).searchParams } catch { return new URLSearchParams() } })()
  const utm = (q.get('utm_source') || '').toLowerCase()
  const host = (() => { try { return ref ? new URL(ref).hostname.replace(/^www\./, '') : '' } catch { return '' } })()

  if (q.get('gclid') || utm === 'google_ads' || (q.get('utm_medium') || '').toLowerCase() === 'cpc') return { channel: 'reklama', ref: utm || 'google ads' }
  if (utm) return { channel: 'kampaň', ref: utm }
  if (!host) return { channel: 'priamo', ref: '' }
  if (/(^|\.)(google|bing|duckduckgo|seznam|ecosia|yahoo)\./.test(host)) return { channel: 'vyhľadávanie', ref: host }
  if (/(facebook|instagram|linkedin|tiktok|youtube|twitter|x\.com|t\.co|pinterest)/.test(host)) return { channel: 'sociálne siete', ref: host }
  if (/(chatgpt|openai|perplexity|claude|gemini|copilot)/.test(host)) return { channel: 'AI vyhľadávače', ref: host }
  if (/monetico\.sk$/.test(host)) return { channel: 'priamo', ref: '' }
  return { channel: 'odkaz z webu', ref: host }
}

/** Zapíše dávku udalostí jedným INSERT-om. Nikdy nehádže — meranie nesmie zhodiť web. */
export async function recordEvents(events: IncomingEvent[], ctx: EventContext): Promise<number> {
  const clean = events.filter(e => e && KINDS.includes(e.kind)).slice(0, 30)
  if (!clean.length) return 0
  try {
    // ⚠️ `meta` sa MUSÍ posielať cez sql.json(). Keď sa pošle hotový reťazec,
    // Postgres ho uloží ako jsonb *string* a `meta->>'prev'` potom vracia NULL —
    // dopyt sa nepriradí k článku a v tabuľke stránok vyjde všade nula.
    await db(sql => sql`INSERT INTO stat_events ${sql(
      clean.map(e => ({
        sid: ctx.sid.slice(0, 40),
        path: cleanPath(e.path),
        kind: e.kind,
        ref: ctx.ref.slice(0, 120),
        channel: ctx.channel.slice(0, 40),
        device: ctx.device.slice(0, 20),
        meta: sql.json((e.meta || {}) as any),
      })) as any,
      'sid', 'path', 'kind', 'ref', 'channel', 'device', 'meta',
    )}`)
    return clean.length
  } catch {
    return 0
  }
}

/**
 * Serverová udalosť (dopyt, newsletter) — spoľahlivejšia než klik v prehliadači,
 * lebo po odoslaní formulára sa stránka prekresľuje a beacon sa nemusí stihnúť.
 *
 * ⚠️ Kanál a zariadenie sa doťahujú z už zapísaných udalostí tej istej návštevy.
 * Bez toho by každý dopyt vyšiel ako „priamo / neznáme“ a tabuľka „odkiaľ ľudia
 * prišli“ by tvrdila, že z Googlu nechodia žiadne dopyty.
 */
export async function recordServerEvent(kind: EventKind, path: string, ctx: Partial<EventContext>, meta: Record<string, any> = {}): Promise<void> {
  const sid = ctx.sid || 'server-' + Math.random().toString(36).slice(2, 10)
  let channel = ctx.channel || ''
  let device = ctx.device || ''
  let ref = ctx.ref || ''
  if (!channel || !device) {
    const prev = await dbSafe(sql => sql`SELECT channel, device, ref FROM stat_events
      WHERE sid = ${sid} ORDER BY id LIMIT 1`, [] as any[])
    if (prev[0]) {
      channel = channel || prev[0].channel
      device = device || prev[0].device
      ref = ref || prev[0].ref
    }
  }
  await recordEvents([{ kind, path, meta }], {
    sid,
    channel: channel || 'priamo',
    device: device || 'neznáme',
    ref,
  })
}

/* ── Čítanie pre admin ───────────────────────────────────────────────────── */

export interface Overview {
  views: number; visits: number; reads: number; ctas: number; formOpens: number
  leads: number; newsletters: number; conversion: number
}

export async function overview(days: number): Promise<Overview> {
  const r = await dbSafe(sql => sql`
    SELECT
      count(*) FILTER (WHERE kind = 'view')::int        AS views,
      count(DISTINCT sid)::int                          AS visits,
      count(DISTINCT sid) FILTER (WHERE kind = 'read')::int       AS reads,
      count(DISTINCT sid) FILTER (WHERE kind = 'cta')::int        AS ctas,
      count(DISTINCT sid) FILTER (WHERE kind = 'form_open')::int  AS form_opens,
      count(*) FILTER (WHERE kind = 'lead')::int        AS leads,
      count(*) FILTER (WHERE kind = 'newsletter')::int  AS newsletters
    FROM stat_events WHERE ts > now() - (${days} || ' days')::interval`, [] as any[])
  const x: any = r[0] || {}
  const visits = x.visits || 0
  return {
    views: x.views || 0, visits, reads: x.reads || 0, ctas: x.ctas || 0,
    formOpens: x.form_opens || 0, leads: x.leads || 0, newsletters: x.newsletters || 0,
    conversion: visits ? Math.round(((x.leads || 0) / visits) * 1000) / 10 : 0,
  }
}

/** Denný priebeh — návštevy a dopyty na graf. */
export async function trend(days: number): Promise<{ day: string; visits: number; leads: number }[]> {
  const r = await dbSafe(sql => sql`
    SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
           count(DISTINCT sid)::int AS visits,
           count(*) FILTER (WHERE kind = 'lead')::int AS leads
    FROM stat_events WHERE ts > now() - (${days} || ' days')::interval
    GROUP BY 1 ORDER BY 1`, [] as any[])
  return r as any
}

/**
 * Stránky zoradené podľa toho, čo je naozaj dôležité — koľko z nich vzišlo
 * dopytov, nie koľko mali návštev.
 */
export async function pages(days: number, limit = 50): Promise<any[]> {
  const r = await dbSafe(sql => sql`
    WITH ev AS (SELECT * FROM stat_events WHERE ts > now() - (${days} || ' days')::interval),
    -- dopyt priraď stránke, z ktorej človek na formulár prišiel (meta.prev),
    -- inak vstupnej stránke návštevy (meta.entry)
    lead_src AS (
      SELECT COALESCE(NULLIF(meta->>'prev',''), NULLIF(meta->>'entry',''), path) AS path, count(*)::int AS leads
      FROM ev WHERE kind = 'lead' GROUP BY 1
    )
    SELECT e.path,
      count(*) FILTER (WHERE e.kind = 'view')::int AS views,
      count(DISTINCT e.sid)::int AS visits,
      count(DISTINCT e.sid) FILTER (WHERE e.kind = 'read')::int AS reads,
      count(DISTINCT e.sid) FILTER (WHERE e.kind = 'cta')::int AS ctas,
      COALESCE(l.leads, 0) AS leads
    FROM ev e LEFT JOIN lead_src l ON l.path = e.path
    GROUP BY e.path, l.leads
    ORDER BY COALESCE(l.leads,0) DESC, visits DESC
    LIMIT ${limit}`, [] as any[])
  return r as any
}

/** Lievik pre celý web alebo pre jednu stránku. */
export async function funnel(days: number, path?: string): Promise<{ step: string; sessions: number }[]> {
  const r = await dbSafe(sql => {
    const base = path
      ? sql`SELECT * FROM stat_events WHERE ts > now() - (${days} || ' days')::interval
            AND sid IN (SELECT sid FROM stat_events WHERE path = ${path} AND ts > now() - (${days} || ' days')::interval)`
      : sql`SELECT * FROM stat_events WHERE ts > now() - (${days} || ' days')::interval`
    return sql`
      WITH ev AS (${base})
      SELECT
        -- návšteva = návšteva, ktorá naozaj videla aspoň jednu stránku.
        -- (count cez všetky udalosti by rátal aj serverom zapísaný dopyt bez zobrazenia)
        count(DISTINCT sid) FILTER (WHERE kind = 'view')::int      AS navsteva,
        count(DISTINCT sid) FILTER (WHERE kind = 'read')::int       AS precital,
        count(DISTINCT sid) FILTER (WHERE kind = 'cta')::int        AS klik,
        count(DISTINCT sid) FILTER (WHERE kind = 'form_open')::int  AS formular,
        count(DISTINCT sid) FILTER (WHERE kind = 'lead')::int       AS dopyt
      FROM ev`
  }, [] as any[])
  const x: any = r[0] || {}
  return [
    { step: 'Návšteva', sessions: x.navsteva || 0 },
    { step: 'Prečítal obsah', sessions: x.precital || 0 },
    { step: 'Klik na službu', sessions: x.klik || 0 },
    { step: 'Otvoril formulár', sessions: x.formular || 0 },
    { step: 'Odoslal dopyt', sessions: x.dopyt || 0 },
  ]
}

export async function breakdown(days: number, column: 'channel' | 'device' | 'ref'): Promise<{ name: string; visits: number; leads: number }[]> {
  const col = column === 'channel' ? 'channel' : column === 'device' ? 'device' : 'ref'
  const r = await dbSafe(sql => sql`
    SELECT COALESCE(NULLIF(${sql(col)}, ''), '—') AS name,
           count(DISTINCT sid)::int AS visits,
           count(*) FILTER (WHERE kind = 'lead')::int AS leads
    FROM stat_events WHERE ts > now() - (${days} || ' days')::interval
    GROUP BY 1 ORDER BY visits DESC LIMIT 12`, [] as any[])
  return r as any
}

/** Zmaže staré surové udalosti — DB nemá rásť donekonečna. */
export async function pruneEvents(keepDays = 400): Promise<number> {
  const r = await dbSafe(sql => sql`DELETE FROM stat_events WHERE ts < now() - (${keepDays} || ' days')::interval RETURNING 1`, [] as any[])
  return r.length
}
