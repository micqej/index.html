import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { overview, trend, pages, funnel, breakdown } from '../../../lib/stats'

export const config = { maxDuration: 25 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  const path = typeof req.query.path === 'string' && req.query.path ? req.query.path : undefined
  try {
    // Dotazy zámerne za sebou — paralelne cez jedno pooled spojenie sa
    // odpovede strácajú (pozri komentár v lib/db.ts).
    return res.status(200).json({
      days,
      overview: await overview(days),
      funnel: await funnel(days, path),
      trend: await trend(days),
      pages: await pages(days, 60),
      channels: await breakdown(days, 'channel'),
      devices: await breakdown(days, 'device'),
      refs: await breakdown(days, 'ref'),
      path: path || null,
    })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
