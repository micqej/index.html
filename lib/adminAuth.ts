import crypto from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'

const COOKIE = 'monetico_admin'

function adminPin(): string {
  return process.env.ADMIN_PIN || process.env.ADMIN_PASSWORD || ''
}

export function adminConfigured(): boolean {
  return !!adminPin()
}

function expectedToken(): string {
  const pin = adminPin()
  return crypto.createHmac('sha256', pin + '::monetico-admin').update('session').digest('hex')
}

export function checkPin(pin: string): boolean {
  const real = adminPin()
  if (!real) return false
  // constant-time compare
  const a = Buffer.from(pin)
  const b = Buffer.from(real)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function isAuthed(req: NextApiRequest): boolean {
  if (!adminConfigured()) return false
  const cookies = parseCookies(req.headers.cookie)
  return cookies[COOKIE] === expectedToken()
}

export function setSession(res: NextApiResponse): void {
  const maxAge = 60 * 60 * 24 * 30 // 30 days
  // Secure len v produkcii — na http://localhost prehliadač Secure cookie zahodí
  // a admin sa lokálne nedá ani prihlásiť (=nedá sa ladiť).
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${expectedToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  )
}

export function clearSession(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Guard for API routes. Returns true if request is allowed to proceed. */
export function requireAdmin(req: NextApiRequest, res: NextApiResponse): boolean {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Neautorizované' })
    return false
  }
  return true
}
