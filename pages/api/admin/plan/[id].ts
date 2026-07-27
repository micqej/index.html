import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../../lib/adminAuth'
import { deletePlan, updatePlan } from '../../../../lib/plan'
import { generatePlanItemNow, retryPlanItem } from '../../../../lib/autopilot'

export const config = { maxDuration: 20 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdmin(req, res)) return
  const id = parseInt(String(req.query.id), 10)
  if (!id) return res.status(400).json({ error: 'Neplatné id' })
  try {
    if (req.method === 'DELETE') {
      await deletePlan(id)
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'PUT') {
      const { topic, category, scheduled_for, keywords, word_count } = req.body || {}
      const patch: any = {}
      if (topic !== undefined) patch.topic = topic
      if (category !== undefined) patch.category = category
      if (scheduled_for !== undefined) patch.scheduled_for = scheduled_for || null
      if (keywords !== undefined) patch.keywords = keywords
      if (word_count !== undefined) patch.word_count = word_count ? Number(word_count) : null
      const updated = await updatePlan(id, patch)
      if (!updated) return res.status(404).json({ error: 'Nenájdené' })
      return res.status(200).json({ plan: updated })
    }
    if (req.method === 'POST' && req.body?.action === 'generate') {
      // Vráti len ID úlohy — písanie beží po krokoch cez /api/admin/generate-tick
      const r = await generatePlanItemNow(id)
      return res.status(r.ok ? 200 : 400).json(r)
    }
    if (req.method === 'POST' && req.body?.action === 'retry') {
      await retryPlanItem(id)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Chyba' })
  }
}
