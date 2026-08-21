import OpenAI from 'openai'
import { resolveSecret } from './siteSettings'
import { sentenceCaseSk } from './text'
import { CATEGORIES } from './categories'

const CURRENT_YEAR = new Date().getFullYear()

async function client(): Promise<OpenAI> {
  const key = await resolveSecret('openai')
  if (!key) throw new Error('OPENAI_API_KEY nie je nastavený')
  // maxRetries 1: jeden pokus navyše je fajn, viac by prerástlo limit funkcie
  return new OpenAI({ apiKey: key, timeout: 90_000, maxRetries: 1 })
}

export async function aiReady(): Promise<boolean> {
  return !!(await resolveSecret('openai'))
}

/** Zoznam modelov dostupných na účte (pre výber v Nastaveniach). */
export async function listModels(): Promise<string[]> {
  const res = await (await client()).models.list()
  return res.data
    .map(m => m.id)
    .filter(id => /^(gpt|o[134])/.test(id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|search|computer)/.test(id))
    .sort()
}

async function chatJson(model: string, temperature: number, system: string, user: string): Promise<any> {
  const res = await (await client()).chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  const raw = res.choices[0]?.message?.content || '{}'
  try {
    return JSON.parse(raw)
  } catch {
    // model občas obalí JSON textom — vytiahni prvý objekt
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch { /* fall through */ } }
    throw new Error('AI vrátila neplatný JSON')
  }
}

const STRATEG_SYSTEM =
  'Si content stratég pre slovenskú digitálnu agentúru. Navrhuješ konkrétne, praktické a SEO-atraktívne ' +
  'názvy blogov po slovensky, ktoré priamo súvisia so službami firmy a pomáhajú jej získavať klientov.'

export async function suggestTopic(category: string, model = 'gpt-4o', avoid: string[] = [], businessContext = '', maxWords = 8): Promise<string> {
  const list = await suggestTopics(1, { category, model, avoid, businessContext, maxWords })
  return list[0] || ''
}

/** Navrhne `count` konkrétnych názvov článkov groundovaných na službách firmy. */
export async function suggestTopics(
  count: number,
  opts: { category?: string; model?: string; avoid?: string[]; businessContext?: string; maxWords?: number } = {}
): Promise<string[]> {
  const { category, model = 'gpt-4o', avoid = [], businessContext = '', maxWords = 8 } = opts
  const j = await chatJson(model, 0.9, STRATEG_SYSTEM, [
    businessContext ? `O firme: ${businessContext}` : '',
    `Navrhni ${count} konkrétnych, navzájom rozdielnych názvov blogových článkov` +
      (category ? ` do kategórie "${category}"` : ' naprieč relevantnými témami') + '.',
    'Témy musia priamo súvisieť so službami firmy a riešiť reálne problémy jej cieľovej skupiny.',
    'Miešaj how-to návody, trendy, časté chyby, porovnania a praktické checklisty.',
    'DÔLEŽITÉ — názvy píš v BEŽNOM SLOVENSKOM PRAVOPISE: veľké písmeno len na začiatku a vo vlastných menách. NIE každé slovo veľkým (to je anglický štýl a je zlé).',
    `Maximálne ${maxWords} slov na názov. Buď konkrétny a úderný.`,
    `Aktuálny rok je ${CURRENT_YEAR}. Ak v názve spomenieš rok, použi ${CURRENT_YEAR} — NIKDY starší rok.`,
    avoid.length ? 'Vyhni sa týmto už existujúcim názvom: ' + avoid.slice(0, 60).join('; ') : '',
    'Vráť JSON: { "topics": ["názov 1", "názov 2", ...] }. Len názvy, bez čísel a úvodzoviek v texte.',
  ].filter(Boolean).join('\n'))
  const arr: string[] = Array.isArray(j.topics) ? j.topics : []
  return arr.map(t => sentenceCaseSk(String(t).trim().replace(/^["'\d.\s-]+/, '').slice(0, 140))).filter(Boolean).slice(0, count)
}

export interface PlannedTopic { title: string; category: string; keywords: string }

/**
 * Bohatší návrh do plánu: pre každý článok vráti názov + KATEGÓRIU + SEO kľúčové
 * slová. Keď je `category` zadaná, použije ju pre všetky; keď nie (mix), AI vyberie
 * vhodnú kategóriu z povoleného zoznamu pre každý článok zvlášť.
 */
export async function planTopics(
  count: number,
  opts: { category?: string; model?: string; avoid?: string[]; businessContext?: string; maxWords?: number } = {}
): Promise<PlannedTopic[]> {
  const { category, model = 'gpt-4o', avoid = [], businessContext = '', maxWords = 8 } = opts
  const j = await chatJson(model, 0.9, STRATEG_SYSTEM, [
    businessContext ? `O firme: ${businessContext}` : '',
    `Navrhni ${count} konkrétnych, navzájom rozdielnych blogových článkov.`,
    category
      ? `Všetky do kategórie "${category}".`
      : `Ku každému priraď najvhodnejšiu kategóriu PRESNE z tohto zoznamu (rôzne, nie stále tú istú): ${CATEGORIES.join(', ')}.`,
    'Témy musia priamo súvisieť so službami firmy a riešiť reálne problémy jej cieľovej skupiny.',
    'Miešaj how-to návody, trendy, časté chyby, porovnania a praktické checklisty.',
    `Názvy v BEŽNOM SLOVENSKOM PRAVOPISE (veľké písmeno len na začiatku a vo vlastných menách), max ${maxWords} slov.`,
    `Aktuálny rok je ${CURRENT_YEAR}. Ak spomenieš rok, použi ${CURRENT_YEAR}.`,
    'Ku každému pridaj 3–5 SEO kľúčových slov (na aké výrazy má článok cieliť).',
    avoid.length ? 'Vyhni sa týmto názvom: ' + avoid.slice(0, 60).join('; ') : '',
    'Vráť JSON: { "items": [ { "title": "...", "category": "...", "keywords": "slovo1, slovo2, slovo3" } ] }.',
  ].filter(Boolean).join('\n'))
  const arr: any[] = Array.isArray(j.items) ? j.items : []
  const valid = new Set(CATEGORIES)
  return arr.slice(0, count).map(it => {
    const cat = category || (valid.has(it.category) ? it.category : CATEGORIES[0])
    return {
      title: sentenceCaseSk(String(it.title || '').trim().replace(/^["'\d.\s-]+/, '').slice(0, 140)),
      category: cat,
      keywords: String(it.keywords || '').trim().slice(0, 200),
    }
  }).filter(t => t.title)
}

/* ────────────────────────────────────────────────────────────────────────────
 * PÍSANIE ČLÁNKU — po častiach
 *
 * ⚠️ Prečo nie „napíš celý článok jedným volaním":
 *   1) 1400 slov po slovensky = ~3500 tokenov výstupu ≈ 60–90 s. Funkcia to
 *      nestihne a Vercel ju zabije → článok sa NIKDY neuloží (presne to sa dialo).
 *   2) Model, ktorý má naraz vyrobiť celý článok, píše vatu. Osnova + písanie
 *      sekcie po sekcii dá konkrétnejší a dlhší text.
 * Každý krok nižšie je samostatné, krátke volanie (10–25 s) a jeho výsledok sa
 * hneď ukladá do `gen_jobs` — keď to spadne, pokračuje sa tam, kde sa skončilo.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Spoločné pravidlá kvality — bez nich model píše „v dnešnej uponáhľanej dobe". */
function qualityRules(): string[] {
  return [
    'Píš výhradne po slovensky, s korektnou diakritikou, oslovuj čitateľa vykaním.',
    'ZAKÁZANÉ frázy a vata: „v dnešnej dobe", „v dnešnej uponáhľanej dobe", „je dôležité si uvedomiť", „netreba zabúdať", „v neposlednom rade", „svet marketingu sa neustále mení", „dúfame, že vám tento článok pomohol".',
    'Každé tvrdenie musí byť konkrétne: čísla, konkrétne nástroje, konkrétne sumy v eurách, časové rámce, príklady zo slovenského prostredia (malé firmy, e-shopy, remeselníci, lokálne služby).',
    'Žiadne prázdne zovšeobecnenia typu „kvalitný obsah je základ" bez toho, aby si hneď povedal AKO na to.',
    `Aktuálny rok je ${CURRENT_YEAR} — ak spomenieš rok, použi ${CURRENT_YEAR}, nikdy starší.`,
    'Nepoužívaj emotikony. Nepoužívaj markdown. Nepíš <h1>, <html> ani <body>.',
  ]
}

export interface OutlineSection { h2: string; brief: string; points: string[] }
export interface Outline {
  title: string
  angle: string
  intro_brief: string
  sections: OutlineSection[]
  faq: { q: string; a: string }[]
  image_query: string
}

export interface OutlineOpts {
  topic: string
  category: string
  keywords?: string
  wordCount: number
  model: string
  temperature: number
  businessContext?: string
  style?: string
  tone?: string
  maxTitleWords?: number
  /** názvy existujúcich článkov — nech neopakuje to isté dokola */
  existingTitles?: string[]
}

/** KROK 1 — osnova. Krátke volanie, definuje o čom presne článok bude. */
export async function planOutline(o: OutlineOpts): Promise<Outline> {
  const sectionCount = Math.max(3, Math.min(7, Math.round(o.wordCount / 250)))
  const system = [
    'Si skúsený slovenský SEO stratég a copywriter pre digitálnu agentúru Monetico.',
    o.businessContext ? `O firme (drž sa toho): ${o.businessContext}` : '',
    ...qualityRules(),
    'Vraciaš vždy validný JSON.',
  ].filter(Boolean).join('\n')

  const user = [
    `Priprav osnovu SEO článku na tému: "${o.topic}".`,
    `Kategória: ${o.category}. Cieľová dĺžka celého článku: ~${o.wordCount} slov.`,
    o.keywords ? `Cieľové SEO kľúčové slová: ${o.keywords}.` : '',
    o.style ? `Štýl článku: ${o.style}` : '',
    o.tone ? `Tón: ${o.tone}` : '',
    `Navrhni PRESNE ${sectionCount} sekcií. Každá sekcia musí riešiť INÚ vec — žiadne prekrývanie.`,
    'Sekcie majú mať praktický, konkrétny obsah (postup, čísla, chyby, príklady), nie teoretický úvod dokola.',
    `Názov (title) v bežnom slovenskom pravopise, max ${o.maxTitleWords || 8} slov, bez úvodzoviek.`,
    o.existingTitles?.length ? 'Na blogu už máme tieto články — nepíš to isté znova: ' + o.existingTitles.slice(0, 25).join('; ') : '',
    'Vráť JSON:',
    '{',
    '  "title": "finálny názov článku",',
    '  "angle": "jednou vetou: aký konkrétny uhol pohľadu a pre koho",',
    '  "intro_brief": "čo presne má obsahovať úvod (problém čitateľa, nie definícia pojmu)",',
    '  "sections": [ { "h2": "nadpis sekcie", "brief": "čo presne v tejto sekcii povedať", "points": ["konkrétny bod 1","bod 2","bod 3"] } ],',
    '  "faq": [ { "q": "častá otázka", "a": "krátka konkrétna odpoveď (2-3 vety)" } ],',
    '  "image_query": "2-3 ANGLICKÉ slová na vyhľadanie fotky vo fotobanke"',
    '}',
    'FAQ maj 3 otázky — reálne otázky, ktoré ľudia googlia.',
  ].filter(Boolean).join('\n')

  const j = await chatJson(o.model, o.temperature, system, user)
  const sections: OutlineSection[] = (Array.isArray(j.sections) ? j.sections : []).slice(0, 8).map((s: any) => ({
    h2: String(s.h2 || '').trim(),
    brief: String(s.brief || '').trim(),
    points: Array.isArray(s.points) ? s.points.map((x: any) => String(x)).slice(0, 6) : [],
  })).filter((s: OutlineSection) => s.h2)
  if (!sections.length) throw new Error('AI nevrátila osnovu článku')
  return {
    title: sentenceCaseSk(String(j.title || o.topic).trim()),
    angle: String(j.angle || ''),
    intro_brief: String(j.intro_brief || ''),
    sections,
    faq: (Array.isArray(j.faq) ? j.faq : []).slice(0, 4).map((f: any) => ({ q: String(f.q || ''), a: String(f.a || '') })).filter((f: any) => f.q && f.a),
    image_query: String(j.image_query || o.topic),
  }
}

export interface SectionOpts {
  outline: Outline
  index: number            // -1 = úvod, sections.length = záver
  category: string
  wordsPerSection: number
  model: string
  temperature: number
  businessContext?: string
  tone?: string
  style?: string
  keywords?: string
  /** interné odkazy, ktoré má sekcia použiť (už vybrané pre túto sekciu) */
  links?: { title: string; slug?: string; url?: string; note?: string }[]
}

/** KROK 2 — jedna sekcia (alebo úvod / záver). Vracia čisté HTML. */
export async function writeSection(o: SectionOpts): Promise<string> {
  const isIntro = o.index === -1
  const isOutro = o.index >= o.outline.sections.length
  const sec = !isIntro && !isOutro ? o.outline.sections[o.index] : null

  const system = [
    'Si skúsený slovenský copywriter. Píšeš JEDNU časť dlhšieho článku — nie celý článok.',
    o.businessContext ? `O firme: ${o.businessContext}` : '',
    ...qualityRules(),
    'Nikdy neopakuj obsah iných sekcií a nepíš úvodné ani záverečné zhrnutie, ak to nie je výslovne žiadané.',
    'Vraciaš vždy validný JSON s jediným kľúčom "html".',
  ].filter(Boolean).join('\n')

  const linkHint = o.links?.length
    ? 'Prirodzene vlož tieto odkazy (len tam, kde vo vete naozaj dávajú zmysel, formát <a href="ADRESA">text</a>):\n' +
      o.links.map(l => {
        const adresa = l.url || `/${l.slug}/`
        // pri vlastnom nástroji dopĺňame, ČO vie — nech to nie je holý odkaz
        return l.note
          ? `- ${adresa} — ${l.title}: ${l.note}. Spomeň ho ako nástroj, cez ktorý kampane reálne posielame, `
            + 'jednou–dvoma vetami a konkrétne (čo rieši), nie ako reklamný slogan. Najviac raz v celom článku.'
          : `- ${adresa} — ${l.title}`
      }).join('\n')
    : ''

  const common = [
    `Článok: "${o.outline.title}" (${o.category}). Uhol: ${o.outline.angle}`,
    'Osnova celého článku (pre kontext, NEPÍŠ ju znova): ' + o.outline.sections.map(s => s.h2).join(' | '),
    o.tone ? `Tón: ${o.tone}` : '',
    o.style ? `Štýl: ${o.style}` : '',
    o.keywords ? `SEO kľúčové slová článku (zapracuj prirodzene, nenacpávaj): ${o.keywords}` : '',
    linkHint,
  ].filter(Boolean)

  let task: string[]
  if (isIntro) {
    task = [
      `Napíš ÚVOD článku, ~${Math.round(o.wordsPerSection * 0.6)} slov, 2 odseky.`,
      `Čo má úvod obsahovať: ${o.outline.intro_brief}`,
      'Začni konkrétnou situáciou alebo číslom, nie definíciou pojmu. Neopakuj názov článku ako prvú vetu.',
      'Bez nadpisu — vráť len <p> odseky.',
    ]
  } else if (isOutro) {
    task = [
      `Napíš ZÁVER, ~${Math.round(o.wordsPerSection * 0.5)} slov.`,
      'Formát: <h2>Zhrnutie</h2> + 1 odsek so zhrnutím v 3 konkrétnych bodoch (<ul>) + 1 odsek s jemnou výzvou na akciu smerom na Monetico.',
      'Žiadne frázy typu „dúfame, že vám článok pomohol".',
      o.outline.faq.length
        ? 'Za záver pridaj FAQ: <h2>Časté otázky</h2> a pre každú otázku <h3>otázka</h3><p>odpoveď</p>. Otázky a odpovede rozviň do 2–3 viet: ' +
          o.outline.faq.map(f => `${f.q} → ${f.a}`).join(' | ')
        : '',
    ]
  } else {
    task = [
      `Napíš SEKCIU č. ${o.index + 1}: "${sec!.h2}", ~${o.wordsPerSection} slov.`,
      `Čo v nej povedať: ${sec!.brief}`,
      sec!.points.length ? 'Konkrétne body, ktoré musia zaznieť: ' + sec!.points.join('; ') : '',
      'Formát: <h2>nadpis sekcie</h2>, potom 2–4 odseky <p>. Ak sa hodí, jeden <ul> so 3–5 konkrétnymi bodmi alebo <h3> podnadpis.',
      'Aspoň jeden konkrétny príklad, číslo alebo postup krok-za-krokom.',
    ]
  }

  const j = await chatJson(o.model, o.temperature, system, [...common, '', ...task.filter(Boolean), '', 'Vráť JSON: { "html": "..." }'].join('\n'))
  return cleanHtml(String(j.html || ''))
}

/** Odstráni to, čo model občas pribalí napriek zákazu. */
export function cleanHtml(html: string): string {
  return html
    .replace(/```html|```/g, '')
    .replace(/<\/?(html|body|head|article|main)[^>]*>/gi, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
    .trim()
}

export interface SeoOpts {
  title: string
  category: string
  keywords?: string
  bodyPreview: string
  model: string
}

/** KROK 3 — SEO meta k hotovému textu (krátke, lacné volanie). */
export async function writeSeo(o: SeoOpts): Promise<{
  excerpt: string; meta_title: string; meta_desc: string; meta_keywords: string
  og_title: string; og_desc: string; tags: string[]
}> {
  const j = await chatJson(o.model, 0.4,
    'Si SEO špecialista. Píšeš po slovensky, stručne a konkrétne. Vraciaš validný JSON.',
    [
      `Článok: "${o.title}" (kategória ${o.category}).`,
      o.keywords ? `Cieľové kľúčové slová: ${o.keywords}` : '',
      'Začiatok článku:',
      o.bodyPreview.replace(/<[^>]+>/g, ' ').slice(0, 1500),
      '',
      'Vráť JSON:',
      '{',
      '  "excerpt": "1–2 vety zhrnutie, max 200 znakov, láka na prečítanie",',
      '  "meta_title": "SEO title do 60 znakov (môže sa líšiť od názvu)",',
      '  "meta_desc": "SEO meta description do 155 znakov, s výzvou",',
      '  "meta_keywords": "5–8 kľúčových slov oddelených čiarkou",',
      '  "og_title": "titulok na sociálne siete",',
      '  "og_desc": "popis na sociálne siete do 150 znakov",',
      '  "tags": ["tag1","tag2","tag3"]',
      '}',
    ].filter(Boolean).join('\n'))
  return {
    excerpt: String(j.excerpt || '').slice(0, 300),
    meta_title: String(j.meta_title || o.title).slice(0, 120),
    meta_desc: String(j.meta_desc || j.excerpt || '').slice(0, 300),
    meta_keywords: String(j.meta_keywords || o.keywords || ''),
    og_title: String(j.og_title || j.meta_title || o.title).slice(0, 150),
    og_desc: String(j.og_desc || j.meta_desc || '').slice(0, 300),
    tags: Array.isArray(j.tags) ? j.tags.map((t: any) => String(t)).slice(0, 8) : [],
  }
}
