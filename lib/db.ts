import postgres from 'postgres'

/**
 * Lazy Postgres connection (works with any provider — Supabase, Neon, Hetzner…).
 * Returns null when no connection string is configured, so the whole
 * admin/autopilot stack degrades gracefully and the public site keeps running
 * on the static JSON posts.
 *
 * ⚠️ SERVERLESS PRAVIDLO (bolestivo naučené, 2026-07):
 * Vercel po odoslaní odpovede inštanciu ZMRAZÍ. Ak v tej chvíli visí rozrobená
 * výmena s Postgresom, server-side backend ostane sedieť v `active/ClientRead`
 * a Supavisor si k nemu drží klientsky socket. Ďalší request cez ten socket
 * NIKDY nedostane odpoveď — a keďže Vercel dnes dáva funkciám default 300 s,
 * request visí 5 minút (504) a admin sa tvári zamrznutý.
 * Preto má KAŽDÝ dotaz tvrdý časový strop v JS (`withTimeout`) a po timeoute /
 * chybe spojenia sa klient zahodí (`resetSql`), aby ďalší request otvoril čerstvé
 * spojenie. Nikdy nespoliehaj na to, že sa socket „nejako" vyrieši sám.
 */
type Sql = ReturnType<typeof postgres>
let _sql: Sql | null | undefined

/** Tvrdý strop na jeden dotaz. Radšej rýchla chyba než 5-minútový 504. */
export const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS || 8000)

function dbUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED
  )
}

export function getSql(): Sql | null {
  if (_sql !== undefined) return _sql
  const url = dbUrl()
  _sql = url
    ? postgres(url, {
        prepare: false,        // povinné pre Supabase transaction pooler (pgbouncer)
        ssl: 'require',
        max: 1,                // serverless: 1 spojenie na inštanciu (inak leakujú a saturujú pooler → 504)
        idle_timeout: 10,      // rýchlo zavri nečinné spojenia
        connect_timeout: 8,    // nezasekni sa keď je pooler plný — zlyhaj rýchlo
        max_lifetime: 60 * 5,  // recykluj spojenia, nech sa nehromadia staré
        fetch_types: false,    // o jeden round-trip menej pri cold-starte
        onnotice: () => {},    // NOTICE („relation already exists") nezaplavuje logy
      })
    : null
  return _sql
}

/** Zahodí klienta — ďalší dotaz si otvorí čerstvé spojenie. */
export function resetSql(): void {
  const s = _sql
  _sql = undefined
  if (s) { try { s.end({ timeout: 0 }).catch(() => {}) } catch { /* ignore */ } }
}

function isConnectionError(e: any): boolean {
  const code = String(e?.code || '')
  return (
    code === 'CONNECTION_CLOSED' || code === 'CONNECTION_DESTROYED' ||
    code === 'CONNECTION_ENDED' || code === 'CONNECT_TIMEOUT' ||
    code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT' ||
    code === 'DB_TIMEOUT' || code === '57P01' /* admin shutdown */
  )
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      const e: any = new Error(`Databáza neodpovedala do ${Math.round(ms / 1000)} s`)
      e.code = 'DB_TIMEOUT'
      reject(e)
    }, ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>
}

/**
 * Serializácia dotazov v rámci inštancie.
 *
 * ⚠️ TOTO BOLA HLAVNÁ PRÍČINA ZAMRZNUTÉHO ADMINA.
 * `/api/admin/stats` púšťal 5 dotazov cez `Promise.all`. Pri `max: 1` ich
 * postgres.js pipelinuje po JEDNOM spojení — a Supabase pooler (Supavisor)
 * v transaction móde takto zreťazené dotazy nezvláda: časť odpovedí sa
 * jednoducho nikdy nevráti. Keďže funkcia na Verceli beží defaultne 300 s,
 * request visel 5 minút (504) a spojenie ostalo trčať ako „active/ClientRead".
 * Overené lokálne: 2 z 5 paralelných dotazov nedobehli ani za 8 s; po
 * serializácii dobehnú všetky do ~1 s.
 */
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.then(() => undefined, () => undefined)
  return run
}

/**
 * Spusti dotaz s časovým stropom a jedným retry na chybu spojenia.
 * `fn` dostane živého klienta — po zlyhaní spojenia sa zavolá znova s novým.
 *
 *   const rows = await db(sql => sql`SELECT 1`)
 *
 * Vracia null keď DB nie je nakonfigurovaná (web beží na statických článkoch).
 */
export async function db<T>(fn: (sql: Sql) => Promise<T>, timeoutMs = DB_TIMEOUT_MS): Promise<T | null> {
  if (!getSql()) return null
  return serialize(async () => {
    const sql = getSql()
    if (!sql) return null
    try {
      return await withTimeout(fn(sql), timeoutMs)
    } catch (e: any) {
      if (!isConnectionError(e)) throw e
      // Spojenie je mŕtve alebo zamrznuté — zahoď ho a skús ešte raz s čerstvým.
      resetSql()
      const fresh = getSql()
      if (!fresh) throw e
      try {
        return await withTimeout(fn(fresh), timeoutMs)
      } catch (e2: any) {
        if (isConnectionError(e2)) resetSql()
        throw e2
      }
    }
  })
}

/** Ako `db()`, ale pri chybe vráti fallback namiesto vyhodenia (pre čítacie cesty). */
export async function dbSafe<T>(fn: (sql: Sql) => Promise<T>, fallback: T, timeoutMs = DB_TIMEOUT_MS): Promise<T> {
  try {
    const r = await db(fn, timeoutMs)
    return r === null ? fallback : r
  } catch {
    return fallback
  }
}

export function dbReady(): boolean {
  return !!getSql()
}

/**
 * Schéma sa NEVYTVÁRA za behu requestu.
 *
 * ⚠️ Toto bola tichá brzda admina: každý cold-start púšťal DDL (7 príkazov) a pri
 * zaseknutom pooleri sa na tom celý request zavesil. Tabuľky sú dávno vytvorené;
 * migrácie sa púšťajú RUČNE cez `/api/admin/migrate` (alebo cez Supabase SQL).
 * Ak sem pridáš nový stĺpec/tabuľku, pridaj ju do `migrate()` a raz zavolaj
 * ten endpoint — inak ti kód píše do stĺpca, ktorý v DB neexistuje.
 */
export async function ensureSchema(): Promise<boolean> {
  return dbReady()
}

/** Ručná migrácia — volaná len z /api/admin/migrate. Bezpečné spustiť opakovane. */
export async function migrate(): Promise<string[]> {
  const done: string[] = []
  await db(async sql => {
    await sql`CREATE TABLE IF NOT EXISTS articles (
      id            SERIAL PRIMARY KEY,
      slug          TEXT UNIQUE NOT NULL,
      title         TEXT NOT NULL,
      content       TEXT NOT NULL DEFAULT '',
      excerpt       TEXT NOT NULL DEFAULT '',
      meta_title    TEXT NOT NULL DEFAULT '',
      meta_desc     TEXT NOT NULL DEFAULT '',
      meta_keywords TEXT NOT NULL DEFAULT '',
      og_title      TEXT NOT NULL DEFAULT '',
      og_desc       TEXT NOT NULL DEFAULT '',
      category      TEXT NOT NULL DEFAULT 'Marketing',
      tags          JSONB NOT NULL DEFAULT '[]',
      image_url     TEXT NOT NULL DEFAULT '',
      image_credit  TEXT NOT NULL DEFAULT '',
      author        TEXT NOT NULL DEFAULT 'Monetico',
      status        TEXT NOT NULL DEFAULT 'draft',
      publish_at    TIMESTAMPTZ,
      reading_time  INTEGER NOT NULL DEFAULT 3,
      source        TEXT NOT NULL DEFAULT 'manual',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('articles')

    await sql`CREATE TABLE IF NOT EXISTS content_plan (
      id            SERIAL PRIMARY KEY,
      topic         TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'Marketing',
      status        TEXT NOT NULL DEFAULT 'pending',
      scheduled_for TIMESTAMPTZ,
      article_id    INTEGER,
      keywords      TEXT NOT NULL DEFAULT '',
      word_count    INTEGER,
      note          TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('content_plan')
    await sql`ALTER TABLE content_plan ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT ''`
    await sql`ALTER TABLE content_plan ADD COLUMN IF NOT EXISTS word_count INTEGER`
    await sql`ALTER TABLE content_plan ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''`

    await sql`CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    )`; done.push('settings')

    await sql`CREATE TABLE IF NOT EXISTS subscribers (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      source     TEXT NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('subscribers')

    // Ochrana newslettra pred botmi: normalizovaná adresa (gmail bez bodiek),
    // stav (ok/spam) a IP kvôli stropu na počet prihlásení za hodinu.
    await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS email_norm TEXT`
    await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok'`
    await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ip TEXT NOT NULL DEFAULT ''`
    await sql`UPDATE subscribers SET email_norm = CASE
      WHEN email LIKE '%@gmail.com' OR email LIKE '%@googlemail.com'
        THEN replace(split_part(split_part(email,'@',1),'+',1), '.', '') || '@gmail.com'
      ELSE split_part(split_part(email,'@',1),'+',1) || '@' || split_part(email,'@',2)
      END WHERE email_norm IS NULL`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_norm_idx ON subscribers (email_norm)`
    done.push('subscribers.email_norm+status+ip')

    await sql`CREATE TABLE IF NOT EXISTS comments (
      id         SERIAL PRIMARY KEY,
      slug       TEXT NOT NULL,
      author     TEXT NOT NULL DEFAULT 'Anonym',
      email      TEXT NOT NULL DEFAULT '',
      body       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      ip         TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('comments')
    await sql`CREATE INDEX IF NOT EXISTS comments_slug_idx ON comments (slug, status)`

    await sql`CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '',
      email      TEXT NOT NULL DEFAULT '',
      phone      TEXT NOT NULL DEFAULT '',
      services   JSONB NOT NULL DEFAULT '[]',
      message    TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'new',
      ip         TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('messages')

    await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      endpoint   TEXT UNIQUE NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('push_subscriptions')

    // Rozpracované generovanie článku (krok po kroku, aby sa zmestilo do limitu funkcie)
    await sql`CREATE TABLE IF NOT EXISTS gen_jobs (
      id          SERIAL PRIMARY KEY,
      plan_id     INTEGER,
      topic       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'Marketing Tipy',
      keywords    TEXT NOT NULL DEFAULT '',
      word_count  INTEGER NOT NULL DEFAULT 1200,
      status      TEXT NOT NULL DEFAULT 'running',
      step        TEXT NOT NULL DEFAULT 'outline',
      step_index  INTEGER NOT NULL DEFAULT 0,
      outline     JSONB NOT NULL DEFAULT '{}',
      sections    JSONB NOT NULL DEFAULT '[]',
      article_id  INTEGER,
      slug        TEXT NOT NULL DEFAULT '',
      error       TEXT NOT NULL DEFAULT '',
      auto        BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`; done.push('gen_jobs')
    await sql`CREATE INDEX IF NOT EXISTS gen_jobs_status_idx ON gen_jobs (status, updated_at)`
  }, 30000)
  return done
}
