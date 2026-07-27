import webpush from 'web-push'
import { db, dbSafe } from './db'

interface Vapid { publicKey: string; privateKey: string }

async function vapid(): Promise<Vapid | null> {
  const rows = await dbSafe(sql => sql`SELECT value FROM settings WHERE key = 'push' LIMIT 1`, [] as any[])
  const v: any = rows[0]?.value
  if (!v) return null
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : v
    return o?.publicKey && o?.privateKey ? o : null
  } catch { return null }
}

export async function vapidPublicKey(): Promise<string> {
  return (await vapid())?.publicKey || ''
}

export async function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  if (!sub?.endpoint) return
  await db(sql => sql`INSERT INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = ${sub.keys.p256dh}, auth = ${sub.keys.auth}`)
}

export async function pushCount(): Promise<number> {
  const r = await dbSafe(sql => sql`SELECT count(*)::int AS c FROM push_subscriptions`, [] as any[])
  return r[0]?.c || 0
}

/** Pošle push notifikáciu na všetky uložené zariadenia (mŕtve odbery zmaže). */
export async function sendPush(payload: { title: string; body: string; url?: string }): Promise<{ sent: number; failed: number }> {
  const v = await vapid()
  if (!v) return { sent: 0, failed: 0 }
  webpush.setVapidDetails('mailto:info@monetico.sk', v.publicKey, v.privateKey)
  const subs = await dbSafe(sql => sql`SELECT endpoint, p256dh, auth FROM push_subscriptions`, [] as any[])
  let sent = 0, failed = 0
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
      sent++
    } catch (e: any) {
      failed++
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await dbSafe(sql => sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`, null as any)
      }
    }
  }))
  return { sent, failed }
}
