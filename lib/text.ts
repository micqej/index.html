/** Skratky, ktoré ostávajú VEĽKÝMI aj uprostred názvu. */
const KEEP_CAPS = new Set(['SEO', 'AI', 'B2B', 'B2C', 'CRM', 'PPC', 'SEM', 'DPH', 'EU', 'UX', 'UI', 'CTA', 'ROI', 'KPI', 'PR', 'SMS', 'API'])
/** Vlastné mená/značky, ktoré ostávajú s veľkým začiatočným písmenom. */
const KEEP_WORDS = new Set(['google', 'meta', 'facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'wordpress', 'shopify', 'woocommerce', 'gmail', 'slovensko', 'slovensku', 'slovenska', 'slovenskej', 'košice', 'monetico', 'chatgpt', 'openai', 'pinterest', 'mailchimp'])

/**
 * Prevedie „Americký Title Case" na bežný slovenský pravopis názvu:
 * veľké len prvé slovo + vlastné mená/skratky, ostatné malé.
 * Napr. „Ako Zvýšiť Viditeľnosť Vašich Webových Stránok" → „Ako zvýšiť viditeľnosť vašich webových stránok".
 */
export function sentenceCaseSk(input: string): string {
  if (!input) return input
  let first = false
  return input.trim().split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok) || !tok) return tok
    const bare = tok.replace(/[^A-Za-zÀ-žÁ-ž0-9-]/g, '')
    if (bare && bare === bare.toUpperCase() && KEEP_CAPS.has(bare.toUpperCase())) { first = true; return tok }
    if (KEEP_WORDS.has(bare.toLowerCase())) { first = true; return tok.charAt(0).toUpperCase() + tok.slice(1) }
    if (!first) { first = true; return tok.charAt(0).toUpperCase() + tok.slice(1) }
    return tok.charAt(0).toLowerCase() + tok.slice(1)
  }).join('')
}

/** Naše služby — pre kontextové interné prelinkovanie (téma → relevantná služba). */
export const SERVICE_LINKS: { title: string; slug: string }[] = [
  { title: 'cold emailing (oslovenie nových klientov)', slug: 'sluzby/cold-email' },
  { title: 'SEO optimalizácia', slug: 'sluzby/seo' },
  { title: 'tvorba textov a článkov', slug: 'sluzby/texty-a-clanky' },
  { title: 'správa sociálnych sietí', slug: 'sluzby/socialne-media' },
  { title: 'email marketing', slug: 'sluzby/email-marketing' },
  { title: 'tvorba webov a e-shopov', slug: 'sluzby/tvorba-webov' },
]

/**
 * Vlastné nástroje, na ktoré sa v článkoch odkazuje. Nie sú to podstránky webu,
 * preto majú absolútnu adresu. Použijú sa LEN keď téma naozaj sedí — inak by
 * sa Colldly spomínalo aj v článku o SEO.
 */
export interface ProductLink { title: string; url: string; note: string; keywords: string[] }

export const PRODUCT_LINKS: ProductLink[] = [
  {
    title: 'Colldly',
    url: 'https://colldly.com',
    note:
      'náš vlastný nástroj na cold emailing: rozposielanie z viacerých schránok s rotáciou a zahrievaním, ' +
      'automatické sekvencie a nadväzujúce e-maily, sledovanie otvorení, klikov a odpovedí, ' +
      'strážene denných limitov a vyraďovanie kontaktov, ktoré odpovedali alebo sa odhlásili',
    keywords: [
      'cold email', 'cold-email', 'coldemail', 'cold mailing', 'coldmailing', 'studen',
      'oslovenie', 'oslovovanie', 'outreach', 'akvizíc', 'akvizic',
      'email marketing', 'e-mail marketing', 'emailov', 'e-mailov', 'newsletter',
      'doručiteľnos', 'dorucitelnos', 'schránk', 'schrank', 'sekvenc', 'kampan',
    ],
  },
]

/** Vyberie nástroje, ktoré k téme naozaj patria (téma + kategória + kľúčové slová). */
export function productLinksFor(...texty: (string | undefined)[]): ProductLink[] {
  const hay = texty.filter(Boolean).join(' ').toLowerCase()
  return PRODUCT_LINKS.filter(p => p.keywords.some(k => hay.includes(k)))
}

/** Náhodné štýly písania (keď je v nastaveniach zapnutý náhodný štýl). */
export const WRITING_STYLES: string[] = [
  'Praktický návod krok za krokom s konkrétnymi tipmi.',
  'Príbehový/rozprávačský — začni reálnou situáciou z praxe firmy.',
  'Dátový a analytický — opri sa o čísla, princípy a príklady.',
  'Konverzačný a priateľský, akoby si radil kamarátovi-podnikateľovi.',
  'Mýty vs. fakty — vyvráť časté omyly k téme.',
]
