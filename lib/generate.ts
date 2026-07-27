import { db, dbSafe } from './db'
import { getSettings, AutopilotSettings } from './settings'
import { planOutline, writeSection, writeSeo, Outline, cleanHtml } from './aiContent'
import { imagesForArticle, ImageResult } from './images'
import { linkPool, embedImages } from './links'
import { SERVICE_LINKS, WRITING_STYLES } from './text'
import { createArticle, listArticlesLite } from './articles'
import { markPlan } from './plan'
import { quotaMessage } from './quota'

/**
 * Generovanie článku ako STAVOVÁ ÚLOHA rozložená na kroky.
 *
 * Jeden krok = jedno krátke volanie OpenAI (10–25 s), ktoré sa hneď uloží.
 * Preto sa nič nestratí, keď funkcia spadne alebo ju platforma zabije, a admin
 * môže ukazovať priebeh („píšem sekciu 3 z 5") namiesto zamrznutého spinnera.
 */

export type JobStep = 'outline' | 'sections' | 'finish'
export type JobStatus = 'running' | 'done' | 'error'

export interface GenJob {
  id: number
  plan_id: number | null
  topic: string
  category: string
  keywords: string
  word_count: number
  status: JobStatus
  step: JobStep
  step_index: number
  outline: Outline | null
  sections: string[]
  article_id: number | null
  slug: string
  error: string
  auto: boolean
  created_at: string
  updated_at: string
}

/** jsonb sa v závislosti od zápisu vráti ako objekt alebo ako string — zvládni oboje. */
function json<T>(v: any, fallback: T): T {
  if (v === null || v === undefined) return fallback
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
  return v as T
}

function map(r: any): GenJob {
  const outline = json<any>(r.outline, null)
  return {
    ...r,
    outline: outline && Array.isArray(outline.sections) ? outline : null,
    sections: json<string[]>(r.sections, []),
    error: r.error || '',
    slug: r.slug || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
  }
}

export async function startJob(input: {
  topic: string; category: string; keywords?: string; wordCount?: number; planId?: number | null; auto?: boolean
}): Promise<GenJob> {
  const s = await getSettings()
  const rows = await db(sql => sql`INSERT INTO gen_jobs (plan_id, topic, category, keywords, word_count, auto)
    VALUES (${input.planId ?? null}, ${input.topic}, ${input.category},
            ${input.keywords || ''}, ${input.wordCount || s.wordCount || 1200}, ${!!input.auto})
    RETURNING *`)
  if (!rows) throw new Error('DB nie je nastavená')
  if (input.planId) await markPlan(input.planId, 'generating')
  return map(rows[0])
}

export async function getJob(id: number): Promise<GenJob | null> {
  const rows = await dbSafe(sql => sql`SELECT * FROM gen_jobs WHERE id = ${id} LIMIT 1`, [] as any[])
  return rows[0] ? map(rows[0]) : null
}

/** Bežiace úlohy (najstaršia prvá) — na pokračovanie po páde/cronom. */
export async function runningJobs(limit = 5): Promise<GenJob[]> {
  const rows = await dbSafe(sql => sql`SELECT * FROM gen_jobs WHERE status = 'running' ORDER BY created_at LIMIT ${limit}`, [] as any[])
  return rows.map(map)
}

export async function recentJobs(limit = 10): Promise<GenJob[]> {
  const rows = await dbSafe(sql => sql`SELECT id, plan_id, topic, category, status, step, step_index, slug,
    article_id, error, auto, created_at, updated_at,
    COALESCE(jsonb_array_length(sections), 0) AS done_sections,
    COALESCE(jsonb_array_length(outline->'sections'), 0) AS total_sections
    FROM gen_jobs ORDER BY id DESC LIMIT ${limit}`, [] as any[])
  return rows as any
}

/**
 * ⚠️ jsonb sa MUSÍ posielať cez `sql.json()`. Keď sa pošle obyčajný string,
 * Postgres ho uloží ako jsonb *string* (`"{...}"`), pri čítaní späť vypadne
 * text namiesto objektu a kód spadne na `outline.sections is undefined`.
 */
async function saveOutline(id: number, outline: Outline): Promise<void> {
  await db(sql => sql`UPDATE gen_jobs SET outline = ${sql.json(outline as any)}, step = 'sections', step_index = 0, updated_at = now() WHERE id = ${id}`)
}

async function saveSection(id: number, sections: string[], nextStep: JobStep, stepIndex: number): Promise<void> {
  await db(sql => sql`UPDATE gen_jobs SET sections = ${sql.json(sections as any)}, step = ${nextStep}, step_index = ${stepIndex}, updated_at = now() WHERE id = ${id}`)
}

async function saveDone(id: number, articleId: number, slug: string): Promise<void> {
  await db(sql => sql`UPDATE gen_jobs SET status = 'done', step = 'finish', article_id = ${articleId}, slug = ${slug}, error = '', updated_at = now() WHERE id = ${id}`)
}

async function saveError(id: number, message: string): Promise<void> {
  await db(sql => sql`UPDATE gen_jobs SET status = 'error', error = ${message.slice(0, 500)}, updated_at = now() WHERE id = ${id}`)
}

export async function failJob(id: number, message: string, planId?: number | null): Promise<void> {
  await saveError(id, message)
  if (planId) await markPlan(planId, 'error', undefined, message)
}

export interface TickResult {
  job: GenJob
  done: boolean
  /** ľudský popis toho, čo sa práve spravilo (do admin UI) */
  message: string
  progress: { current: number; total: number }
}

function totalSteps(job: GenJob): number {
  const secs = job.outline?.sections.length ?? 5
  return 1 /*outline*/ + 1 /*intro*/ + secs + 1 /*outro*/ + 1 /*finish*/
}

function currentStep(job: GenJob): number {
  if (job.step === 'outline') return 0
  if (job.step === 'sections') return 1 + job.step_index
  return totalSteps(job) - 1
}

/** Vyberie interné odkazy pre danú sekciu (rozloží ich po článku, nie všetky do jednej). */
function linksForSection(all: { title: string; slug: string }[], index: number, sectionCount: number, linkCount: number) {
  if (!linkCount || !all.length) return []
  // odkazy dávaj do prostredných sekcií, max 1 na sekciu
  const targets: number[] = []
  for (let i = 0; i < linkCount; i++) targets.push(Math.min(sectionCount - 1, Math.floor((i + 1) * sectionCount / (linkCount + 1))))
  const pos = targets.indexOf(index)
  if (pos === -1) return []
  const link = all[pos % all.length]
  return link ? [link] : []
}

/**
 * Spraví JEDEN krok úlohy. Nikdy nehádže — chybu zapíše do úlohy a vráti ju,
 * aby admin videl konkrétny dôvod namiesto „Chyba".
 */
export async function tickJob(id: number): Promise<TickResult> {
  let job = await getJob(id)
  if (!job) throw new Error('Úloha neexistuje')
  if (job.status !== 'running') {
    return { job, done: true, message: job.status === 'done' ? 'Hotovo' : (job.error || 'Chyba'), progress: { current: totalSteps(job), total: totalSteps(job) } }
  }

  const s = await getSettings()
  try {
    if (job.step === 'outline') {
      const existing = await listArticlesLite().catch(() => [])
      const outline = await planOutline({
        topic: job.topic,
        category: job.category,
        keywords: job.keywords,
        wordCount: job.word_count,
        model: s.model,
        temperature: s.temperature,
        businessContext: s.businessContext,
        tone: s.tone,
        style: s.randomStyle ? WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)] : '',
        maxTitleWords: s.titleMaxWords || 8,
        existingTitles: existing.map(a => a.title),
      })
      await saveOutline(id, outline)
      job = (await getJob(id))!
      return { job, done: false, message: `Osnova hotová — ${outline.sections.length} sekcií`, progress: { current: currentStep(job), total: totalSteps(job) } }
    }

    if (job.step === 'sections') {
      const outline = job.outline!
      const sectionCount = outline.sections.length
      // index -1 = úvod (uložený ako prvý prvok), 0..n-1 sekcie, n = záver
      const idx = job.step_index          // 0 = úvod, 1..n = sekcie, n+1 = záver
      const writeIndex = idx - 1          // -1 úvod, 0..n-1 sekcie, n záver
      const links = s.autoInterlink && s.linkCount > 0
        ? [...SERVICE_LINKS, ...(await linkPool(job.category, undefined, 8).catch(() => []))]
        : []
      const html = await writeSection({
        outline,
        index: writeIndex,
        category: job.category,
        wordsPerSection: Math.max(180, Math.round(job.word_count / Math.max(1, sectionCount))),
        model: s.model,
        temperature: s.temperature,
        businessContext: s.businessContext,
        tone: s.tone,
        keywords: job.keywords,
        links: writeIndex >= 0 && writeIndex < sectionCount
          ? linksForSection(links, writeIndex, sectionCount, s.autoInterlink ? s.linkCount : 0)
          : [],
      })
      const sections = [...job.sections, html]
      const nextIndex = idx + 1
      const finished = writeIndex >= sectionCount   // práve sme dopísali záver
      await saveSection(id, sections, finished ? 'finish' : 'sections', finished ? job.step_index : nextIndex)
      job = (await getJob(id))!
      const label = writeIndex === -1 ? 'Úvod hotový'
        : writeIndex >= sectionCount ? 'Záver hotový'
        : `Sekcia ${writeIndex + 1}/${sectionCount}: ${outline.sections[writeIndex].h2}`
      return { job, done: false, message: label, progress: { current: currentStep(job), total: totalSteps(job) } }
    }

    // finish — SEO, fotky, uloženie
    const outline = job.outline!
    const body = job.sections.map(cleanHtml).join('\n')
    const seo = await writeSeo({
      title: outline.title, category: job.category, keywords: job.keywords, bodyPreview: body, model: s.model,
    })
    const imgCount = Math.max(1, Math.min(3, s.imageCount || 1))
    const { images } = await imagesForArticle(outline.image_query, job.category, s.imageSource, imgCount)
    const hero: ImageResult | undefined = images[0]
    const withImages = images.length ? embedImages(body, images) : body

    const created = await createArticle({
      title: outline.title,
      content: withImages,
      excerpt: seo.excerpt,
      meta_title: seo.meta_title,
      meta_desc: seo.meta_desc,
      meta_keywords: job.keywords || seo.meta_keywords,
      og_title: seo.og_title,
      og_desc: seo.og_desc,
      category: job.category,
      tags: seo.tags,
      image_url: hero?.url || '',
      image_credit: hero?.credit || '',
      status: job.auto ? (s.autoPublish ? 'published' : 'draft') : 'draft',
      publish_at: new Date().toISOString(),
      source: 'ai',
    })
    await saveDone(id, created.id, created.slug)
    if (job.plan_id) await markPlan(job.plan_id, 'done', created.id, images.length ? '' : 'Bez fotky — fotobanka nič nenašla')
    const j2 = (await getJob(id))!
    return {
      job: j2, done: true,
      message: `Hotovo — „${created.title}"` + (images.length ? '' : ' (bez fotky — skontroluj Pexels/Pixabay kľúč)'),
      progress: { current: totalSteps(j2), total: totalSteps(j2) },
    }
  } catch (e: any) {
    const msg = quotaMessage(e) || e?.message || 'Neznáma chyba generovania'
    await failJob(id, msg, job.plan_id)
    const j2 = (await getJob(id)) || job
    return { job: j2, done: true, message: `Chyba: ${msg}`, progress: { current: currentStep(j2), total: totalSteps(j2) } }
  }
}

/**
 * Dobehne úlohu do konca v rámci časového rozpočtu (pre cron / „vygeneruj teraz").
 * Keď rozpočet dôjde, úloha ostane rozrobená a dokončí ju ďalší beh — nič sa nestráca.
 */
export async function runJobToEnd(id: number, budgetMs: number): Promise<TickResult> {
  const started = Date.now()
  let last = await tickJob(id)
  while (!last.done && Date.now() - started < budgetMs) {
    last = await tickJob(id)
  }
  return last
}
