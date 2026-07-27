import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { tickJob, getJob } from '../../../lib/generate'

/**
 * Jeden krok generovania (osnova / úvod / sekcia / záver / dokončenie).
 * Admin volá tento endpoint dokola, kým `done` nie je true — vďaka tomu vidí
 * priebeh a žiadny request netrvá dlhšie než pár desiatok sekúnd.
 */
export const config = { maxDuration: 120 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const id = parseInt(String(req.body?.id ?? req.query.id), 10)
  if (!id) return res.status(400).json({ error: 'Chýba id úlohy' })
  try {
    if (req.method === 'GET') {
      const job = await getJob(id)
      if (!job) return res.status(404).json({ error: 'Úloha neexistuje' })
      return res.status(200).json({ job, done: job.status !== 'running' })
    }
    if (req.method !== 'POST') return res.status(405).end()
    const r = await tickJob(id)
    return res.status(200).json({
      done: r.done,
      message: r.message,
      progress: r.progress,
      status: r.job.status,
      error: r.job.error,
      article: r.job.status === 'done' ? { id: r.job.article_id, slug: r.job.slug } : null,
      job: { id: r.job.id, step: r.job.step, step_index: r.job.step_index, status: r.job.status },
    })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba kroku generovania' })
  }
}
