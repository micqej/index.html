import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/adminAuth'
import { aiReady } from '../../../lib/aiContent'
import { getSettings } from '../../../lib/settings'
import { startJob } from '../../../lib/generate'

// Len založí úlohu — samotné písanie beží po krokoch cez /api/admin/generate-tick.
export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await aiReady())) return res.status(400).json({ error: 'OpenAI kľúč nie je nastavený (Integrácie).' })
  const { topic, category, keywords, wordCount } = req.body || {}
  if (!topic) return res.status(400).json({ error: 'Chýba téma' })
  try {
    const s = await getSettings()
    const job = await startJob({
      topic: String(topic).slice(0, 200),
      category: category || s.defaultCategory,
      keywords: keywords || '',
      wordCount: Number(wordCount) > 0 ? Number(wordCount) : s.wordCount,
    })
    return res.status(200).json({ jobId: job.id, job })
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Nepodarilo sa spustiť generovanie' })
  }
}
