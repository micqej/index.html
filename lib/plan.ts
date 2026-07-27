import { db, dbSafe } from './db'

export interface PlanItem {
  id: number
  topic: string
  category: string
  status: 'pending' | 'generating' | 'done' | 'error'
  scheduled_for: string | null
  article_id: number | null
  keywords: string
  word_count: number | null
  note: string
  created_at: string
}

function map(r: any): PlanItem {
  return {
    ...r,
    keywords: r.keywords || '',
    word_count: r.word_count ?? null,
    note: r.note || '',
    scheduled_for: r.scheduled_for ? new Date(r.scheduled_for).toISOString() : null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }
}

export async function listPlan(): Promise<PlanItem[]> {
  const rows = await dbSafe(sql => sql`SELECT * FROM content_plan ORDER BY status='done', COALESCE(scheduled_for, created_at)`, [] as any[])
  return rows.map(map)
}

export interface PlanExtra { keywords?: string; word_count?: number | null }

export async function addPlan(topic: string, category: string, scheduled_for?: string | null, extra: PlanExtra = {}): Promise<PlanItem> {
  const rows = await db(sql => sql`INSERT INTO content_plan (topic, category, scheduled_for, keywords, word_count)
    VALUES (${topic}, ${category}, ${scheduled_for || null}, ${extra.keywords || ''}, ${extra.word_count ?? null}) RETURNING *`)
  if (!rows) throw new Error('DB nie je nastavená')
  return map(rows[0])
}

export async function updatePlan(id: number, patch: Partial<Pick<PlanItem, 'topic' | 'category' | 'scheduled_for' | 'keywords' | 'word_count'>>): Promise<PlanItem | null> {
  const rows = await db(async sql => {
    const cur: any = (await sql`SELECT * FROM content_plan WHERE id = ${id} LIMIT 1`)[0]
    if (!cur) return null
    const topic: string = patch.topic ?? cur.topic
    const category: string = patch.category ?? cur.category
    const scheduled: string | null = (patch.scheduled_for !== undefined ? patch.scheduled_for : cur.scheduled_for) || null
    const keywords: string = patch.keywords ?? cur.keywords ?? ''
    const word_count: number | null = (patch.word_count !== undefined ? patch.word_count : cur.word_count) ?? null
    return await sql`UPDATE content_plan SET
      topic = ${topic}, category = ${category}, scheduled_for = ${scheduled},
      keywords = ${keywords}, word_count = ${word_count}
      WHERE id = ${id} RETURNING *`
  })
  if (!rows || !rows[0]) return null
  return map(rows[0])
}

export async function getPlan(id: number): Promise<PlanItem | null> {
  const rows = await dbSafe(sql => sql`SELECT * FROM content_plan WHERE id = ${id} LIMIT 1`, [] as any[])
  return rows[0] ? map(rows[0]) : null
}

export async function deletePlan(id: number): Promise<void> {
  await dbSafe(sql => sql`DELETE FROM content_plan WHERE id = ${id}`, null as any)
}

/** Najneskorší naplánovaný dátum medzi ešte nespracovanými položkami (pre bezkolízne plánovanie). */
export async function lastPendingDate(): Promise<Date | null> {
  const rows = await dbSafe(sql => sql`SELECT max(scheduled_for) AS d FROM content_plan WHERE status = 'pending' AND scheduled_for IS NOT NULL`, [] as any[])
  return rows[0]?.d ? new Date(rows[0].d) : null
}

export async function nextPending(): Promise<PlanItem | null> {
  const rows = await dbSafe(sql => sql`SELECT * FROM content_plan WHERE status = 'pending'
    AND (scheduled_for IS NULL OR scheduled_for <= now())
    ORDER BY scheduled_for NULLS LAST, created_at LIMIT 1`, [] as any[])
  return rows[0] ? map(rows[0]) : null
}

/**
 * Označí položku. `note` nesie DÔVOD zlyhania — bez neho sa téma tvárila
 * „pending" donekonečna a nikto nevedel, že generovanie padá (presne to sa
 * dialo celý júl 2026: 14 tém čakalo a nikto nevedel prečo).
 */
export async function markPlan(id: number, status: PlanItem['status'], articleId?: number, note = ''): Promise<void> {
  await dbSafe(sql => sql`UPDATE content_plan SET status = ${status}, article_id = ${articleId || null}, note = ${note.slice(0, 500)} WHERE id = ${id}`, null as any)
}
