import { db, dbSafe } from './db'

export interface Comment {
  id: number
  slug: string
  author: string
  email: string
  body: string
  status: 'pending' | 'approved' | 'spam'
  ip: string
  created_at: string
}

function map(r: any): Comment {
  return { ...r, created_at: r.created_at ? new Date(r.created_at).toISOString() : '' }
}

/** Verejné: schválené komentáre k článku. */
export async function approvedComments(slug: string): Promise<Comment[]> {
  // NIKDY nevracaj email/ip do verejného API (únik osobných údajov)
  const rows = await dbSafe(sql => sql`SELECT id, slug, author, body, status, created_at FROM comments
    WHERE slug = ${slug} AND status = 'approved' ORDER BY created_at ASC`, [] as any[])
  return rows.map((r: any): Comment => ({
    id: r.id, slug: r.slug, author: r.author, body: r.body, status: r.status,
    email: '', ip: '', created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }))
}

/** Admin: všetky (alebo podľa stavu). */
export async function listComments(status?: string): Promise<Comment[]> {
  const rows = await dbSafe(sql => (status
    ? sql`SELECT * FROM comments WHERE status = ${status} ORDER BY created_at DESC`
    : sql`SELECT * FROM comments ORDER BY created_at DESC`), [] as any[])
  return rows.map(map)
}

export async function addComment(c: { slug: string; author: string; email: string; body: string; ip: string; status: string }): Promise<Comment> {
  const rows = await db(sql => sql`INSERT INTO comments (slug, author, email, body, ip, status)
    VALUES (${c.slug}, ${c.author}, ${c.email}, ${c.body}, ${c.ip}, ${c.status}) RETURNING *`)
  if (!rows) throw new Error('DB nie je nastavená')
  return map(rows[0])
}

export async function updateComment(id: number, patch: { status?: string; body?: string }): Promise<void> {
  const status = patch.status
  const body = patch.body
  if (status !== undefined) await db(sql => sql`UPDATE comments SET status = ${status} WHERE id = ${id}`)
  if (body !== undefined) await db(sql => sql`UPDATE comments SET body = ${body} WHERE id = ${id}`)
}

export async function deleteComment(id: number): Promise<void> {
  await db(sql => sql`DELETE FROM comments WHERE id = ${id}`)
}

export async function commentCounts(): Promise<{ pending: number; approved: number; spam: number }> {
  const rows = await dbSafe(sql => sql`SELECT status, COUNT(*)::int AS n FROM comments GROUP BY status`, [] as any[])
  const out: any = { pending: 0, approved: 0, spam: 0 }
  rows.forEach((r: any) => { out[r.status] = r.n })
  return out
}
