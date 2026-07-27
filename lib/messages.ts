import { db, dbSafe } from './db'

export interface Message {
  id: number
  name: string
  email: string
  phone: string
  services: string[]
  message: string
  status: 'new' | 'read'
  created_at: string
}

function map(r: any): Message {
  return {
    ...r,
    services: Array.isArray(r.services) ? r.services : [],
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }
}

export async function addMessage(m: {
  name?: string; email?: string; phone?: string; services?: string[]; message?: string; ip?: string
}): Promise<Message> {
  const rows = await db(sql => sql`INSERT INTO messages (name, email, phone, services, message, ip)
    VALUES (${m.name || ''}, ${m.email || ''}, ${m.phone || ''}, ${sql.json((m.services || []) as any)},
            ${m.message || ''}, ${m.ip || ''})
    RETURNING *`)
  if (!rows) throw new Error('DB nie je nastavená')
  return map(rows[0])
}

export async function listMessages(): Promise<Message[]> {
  const rows = await dbSafe(sql => sql`SELECT * FROM messages ORDER BY created_at DESC`, [] as any[])
  return rows.map(map)
}

export async function unreadMessages(): Promise<number> {
  const r = await dbSafe(sql => sql`SELECT count(*)::int AS c FROM messages WHERE status = 'new'`, [] as any[])
  return r[0]?.c || 0
}

export async function setMessageStatus(id: number, status: 'new' | 'read'): Promise<void> {
  await db(sql => sql`UPDATE messages SET status = ${status} WHERE id = ${id}`)
}

export async function deleteMessage(id: number): Promise<void> {
  await db(sql => sql`DELETE FROM messages WHERE id = ${id}`)
}
