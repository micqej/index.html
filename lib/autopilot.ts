import { getSettings } from './settings'
import { nextPending, getPlan, markPlan } from './plan'
import { publishDue } from './articles'
import { suggestTopic, aiReady } from './aiContent'
import { CATEGORIES } from './categories'
import { quotaMessage } from './quota'
import { dbReady } from './db'
import { startJob, runJobToEnd, runningJobs, GenJob } from './generate'

export interface AutopilotResult {
  ok: boolean
  reason?: string
  skipped?: string
  created?: string
  createdCount?: number
  published?: number
  /** rozrobené úlohy, ktoré nestihol tento beh — dokončí ich ďalší */
  pendingJobs?: number
  detail?: string[]
}

function pickCategory(s: { randomCategory: boolean; defaultCategory: string }): string {
  if (!s.randomCategory) return s.defaultCategory
  return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]
}

/**
 * Jeden beh autopilota s ČASOVÝM ROZPOČTOM.
 *
 * ⚠️ Historická chyba: beh mal natvrdo `maxDuration: 60` a písal 1400-slovný
 * článok jedným volaním (~60–90 s). Platforma funkciu vždy zabila skôr, než sa
 * čokoľvek uložilo — v pláne ostávalo „pending" a nikde nebola chyba.
 * Teraz sa píše po krokoch a keď rozpočet dôjde, rozrobená úloha ostane v
 * `gen_jobs` a dokončí ju ďalší beh (cron alebo tlačidlo v admine).
 */
export async function runAutopilotBatch(opts: { budgetMs?: number; maxArticles?: number; force?: boolean } = {}): Promise<AutopilotResult> {
  const { budgetMs = 220_000, maxArticles = 5, force = false } = opts
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)

  if (!dbReady()) return { ok: false, reason: 'DB nie je nastavená' }
  const published = await publishDue()
  const s = await getSettings()
  if (!s.autopilotEnabled && !force) return { ok: true, skipped: 'vypnuté', published }
  if (!(await aiReady())) return { ok: false, reason: 'OPENAI_API_KEY nie je nastavený', published }

  const detail: string[] = []
  const slugs: string[] = []
  let lastErr = ''

  const finish = (job: GenJob | null, r: { done: boolean; message: string; job: GenJob }) => {
    if (r.job.status === 'done') { slugs.push(r.job.slug); detail.push(`✓ ${r.job.topic} → /${r.job.slug}/`) }
    else if (r.job.status === 'error') { lastErr = r.job.error; detail.push(`✗ ${r.job.topic}: ${r.job.error}`) }
    else detail.push(`… ${r.job.topic} (rozrobené, dokončí ďalší beh)`)
  }

  // 1) najprv dokonči, čo ostalo rozrobené z minulého behu
  for (const job of await runningJobs(maxArticles)) {
    if (left() < 30_000) break
    finish(job, await runJobToEnd(job.id, left() - 15_000))
    if (lastErr) break
  }

  // 2) splatné položky plánu
  while (!lastErr && slugs.length < maxArticles && left() > 45_000) {
    const item = await nextPending()
    if (!item) break
    const job = await startJob({
      topic: item.topic,
      category: item.category || pickCategory(s),
      keywords: item.keywords,
      wordCount: item.word_count && item.word_count > 0 ? item.word_count : s.wordCount,
      planId: item.id,
      auto: true,
    })
    finish(job, await runJobToEnd(job.id, left() - 15_000))
  }

  // 3) prázdna fronta → v deň publikovania si tému vymysli
  if (!lastErr && slugs.length === 0 && left() > 60_000) {
    const today = new Date().getDay()
    if (force || s.publishDays.includes(today)) {
      const category = pickCategory(s)
      try {
        const topic = await suggestTopic(category, s.model, [], s.businessContext)
        if (topic) {
          const job = await startJob({ topic, category, wordCount: s.wordCount, auto: true })
          finish(job, await runJobToEnd(job.id, left() - 10_000))
        }
      } catch (e: any) {
        lastErr = quotaMessage(e) || e.message || 'Nepodarilo sa navrhnúť tému'
      }
    } else {
      detail.push('Dnes nie je deň publikovania a plán je prázdny.')
    }
  }

  const stillRunning = (await runningJobs(10)).length
  if (lastErr && slugs.length === 0) return { ok: false, reason: lastErr, published, pendingJobs: stillRunning, detail }
  return { ok: true, created: slugs[0], createdCount: slugs.length, published, pendingJobs: stillRunning, detail }
}

/**
 * Manuálne „Vygenerovať článok teraz" z Prehľadu — LEN založí úlohu (rýchle).
 * Admin ju potom dopisuje krok po kroku a vidí priebeh; žiaden request nevisí.
 */
export async function startNextArticleJob(): Promise<{ ok: boolean; jobId?: number; topic?: string; reason?: string; published?: number }> {
  if (!dbReady()) return { ok: false, reason: 'DB nie je nastavená' }
  const published = await publishDue()
  const s = await getSettings()
  if (!(await aiReady())) return { ok: false, reason: 'OpenAI kľúč nie je nastavený (Integrácie).', published }

  // najprv dokonči rozrobené
  const running = await runningJobs(1)
  if (running[0]) return { ok: true, jobId: running[0].id, topic: running[0].topic, published }

  const item = await nextPending()
  if (item) {
    const job = await startJob({
      topic: item.topic, category: item.category || pickCategory(s), keywords: item.keywords,
      wordCount: item.word_count && item.word_count > 0 ? item.word_count : s.wordCount,
      planId: item.id, auto: true,
    })
    return { ok: true, jobId: job.id, topic: job.topic, published }
  }

  const category = pickCategory(s)
  try {
    const topic = await suggestTopic(category, s.model, [], s.businessContext)
    if (!topic) return { ok: false, reason: 'AI nevrátila tému', published }
    const job = await startJob({ topic, category, wordCount: s.wordCount, auto: true })
    return { ok: true, jobId: job.id, topic: job.topic, published }
  } catch (e: any) {
    return { ok: false, reason: quotaMessage(e) || e.message || 'Nepodarilo sa navrhnúť tému', published }
  }
}

/** Vygeneruje KONKRÉTNU položku plánu okamžite (tlačidlo „Generovať teraz"). */
export async function generatePlanItemNow(id: number): Promise<AutopilotResult & { jobId?: number }> {
  if (!dbReady()) return { ok: false, reason: 'DB nie je nastavená' }
  if (!(await aiReady())) return { ok: false, reason: 'OPENAI_API_KEY nie je nastavený' }
  const s = await getSettings()
  const item = await getPlan(id)
  if (!item) return { ok: false, reason: 'Položka plánu neexistuje' }
  if (item.status === 'done') return { ok: false, reason: 'Táto téma už bola vygenerovaná' }
  const job = await startJob({
    topic: item.topic,
    category: item.category || pickCategory(s),
    keywords: item.keywords,
    wordCount: item.word_count && item.word_count > 0 ? item.word_count : s.wordCount,
    planId: item.id,
    auto: true,
  })
  return { ok: true, jobId: job.id }
}

/** Vráti položky plánu späť do „pending" (napr. po oprave kľúča). */
export async function retryPlanItem(id: number): Promise<void> {
  await markPlan(id, 'pending', undefined, '')
}
