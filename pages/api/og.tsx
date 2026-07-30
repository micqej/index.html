import { ImageResponse } from 'next/og'

export const config = { runtime: 'edge' }

/* Brand paleta — musí sedieť so styles/globals.css */
const INK = '#0e0e0c'
const PURPLE = '#6b21d9'
const PURPLE_DK = '#4c1d95'
const YELLOW = '#f5e642'
const CREAM = '#f7f6f1'
const MID = '#e9e7df'

/** Fonty webu (Inter + Space Mono) sú subsetnuté v public/fonts a ťahajú sa z vlastnej domény. */
async function loadFonts(reqUrl: string) {
  const grab = (file: string) =>
    fetch(new URL(`/fonts/${file}`, reqUrl), { cache: 'force-cache' }).then((r) => {
      if (!r.ok) throw new Error(`font ${file}: ${r.status}`)
      return r.arrayBuffer()
    })
  const [i900, i700, m700] = await Promise.all([
    grab('inter-900.ttf'),
    grab('inter-700.ttf'),
    grab('mono-700.ttf'),
  ])
  return [
    { name: 'Inter', data: i900, weight: 900 as const, style: 'normal' as const },
    { name: 'Inter', data: i700, weight: 700 as const, style: 'normal' as const },
    { name: 'Space Mono', data: m700, weight: 700 as const, style: 'normal' as const },
  ]
}

const SERVICES = ['Weby', 'SEO', 'Cold email', 'Reklama']

/** Zvýrazní ten štítok služby, ktorý sedí s kategóriou článku; inak posledný. */
function activeServiceIndex(eyebrow: string) {
  const e = eyebrow.toLowerCase()
  const hit = SERVICES.findIndex((s) => e.includes(s.toLowerCase()))
  return hit >= 0 ? hit : SERVICES.length - 1
}

/** Nadpis článku: čím dlhší, tým menší — aby sa vždy zmestil na 3 riadky. */
function titleSize(len: number, narrow: boolean) {
  const scale = narrow ? 0.72 : 1
  if (len <= 24) return Math.round(96 * scale)
  if (len <= 38) return Math.round(80 * scale)
  if (len <= 55) return Math.round(66 * scale)
  if (len <= 75) return Math.round(56 * scale)
  return Math.round(46 * scale)
}

/**
 * Fotku článku načítame my a vložíme ako data URI.
 * Keby ju satori ťahal sám a nepodarilo sa, spadol by celý obrázok na 500.
 */
async function loadPhoto(raw: string | null): Promise<string | null> {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  try {
    const res = await fetch(url.toString(), { cache: 'force-cache' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 4_000_000) return null
    // po častiach, nech nepreťažíme zásobník volaní pri veľkej fotke
    let bin = ''
    const bytes = new Uint8Array(buf)
    const CHUNK = 8192
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
    }
    return `data:${type.split(';')[0]};base64,${btoa(bin)}`
  } catch {
    return null
  }
}

function MonoPill({ children, solid = false }: { children: string; solid?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'Space Mono',
        fontSize: 17,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: solid ? INK : 'rgba(255,255,255,0.72)',
        background: solid ? YELLOW : 'transparent',
        border: `2px solid ${solid ? INK : 'rgba(255,255,255,0.32)'}`,
        borderRadius: 50,
        padding: '9px 20px',
      }}
    >
      {children}
    </div>
  )
}

/** Kartička s grafom z heroa — dáva náhľadu vizuálny bod záujmu. */
function ResultsCard() {
  const bars = [
    { h: 46, c: MID },
    { h: 66, c: MID },
    { h: 58, c: MID },
    { h: 92, c: YELLOW },
    { h: 114, c: YELLOW },
    { h: 140, c: PURPLE },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 420,
          background: '#ffffff',
          border: `3px solid ${INK}`,
          borderRadius: 22,
          boxShadow: `9px 9px 0 ${INK}`,
          padding: 26,
          transform: 'rotate(2deg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'Space Mono',
              fontSize: 15,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: INK,
            }}
          >
            Výsledky klientov
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Space Mono',
              fontSize: 13,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: INK,
              background: YELLOW,
              border: `2px solid ${INK}`,
              borderRadius: 50,
              padding: '4px 12px',
            }}
          >
            ↗ Rast
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', height: 150, marginTop: 22, gap: 12 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ width: 48, height: b.h, background: b.c, borderRadius: 6 }} />
          ))}
        </div>

        <div style={{ display: 'flex', height: 2, background: INK, marginTop: 20 }} />

        <div style={{ display: 'flex', marginTop: 18, gap: 44 }}>
          {[
            { n: '120+', l: 'Projektov' },
            { n: '8 000', l: 'Emailov / mes.' },
          ].map((s) => (
            <div key={s.l} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: 'Inter', fontWeight: 900, fontSize: 30, color: INK, letterSpacing: -0.5 }}>
                {s.n}
              </div>
              <div
                style={{
                  fontFamily: 'Space Mono',
                  fontSize: 13,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: '#6b6b68',
                  marginTop: 5,
                }}
              >
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Žltý štítok vysunutý spod karty — rovnaký detail ako .hv-chip na webe */}
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          marginTop: -20,
          marginLeft: -26,
          fontFamily: 'Space Mono',
          fontSize: 17,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: INK,
          background: YELLOW,
          border: `2px solid ${INK}`,
          borderRadius: 50,
          padding: '10px 18px',
          boxShadow: `4px 4px 0 ${INK}`,
          transform: 'rotate(-3deg)',
        }}
      >
        42× ROI z emailov
      </div>
    </div>
  )
}

/**
 * Dynamický náhľadový obrázok pri zdieľaní (1200×630 PNG).
 * SVG sociálne siete (Messenger, FB, iMessage, LinkedIn) neukazujú — preto raster.
 *
 * Dva režimy:
 *  • bez ?title  → brandový hero (RAST ONLINE. TERAZ. + karta s grafom)
 *  • s ?title    → náhľad článku (nadpis cez celú šírku)
 */
export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawTitle = (searchParams.get('title') || '').trim().slice(0, 90)
  const isArticle = rawTitle.length > 0
  const eyebrow = searchParams.get('eyebrow')?.trim().slice(0, 40) || (isArticle ? 'Blog' : 'Digitálna agentúra')
  const activeService = activeServiceIndex(eyebrow)

  const [fonts, photo] = await Promise.all([
    loadFonts(req.url).catch(() => undefined), // radšej náhradný systémový font ako 500-ka
    isArticle ? loadPhoto(searchParams.get('img')) : Promise.resolve(null),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${PURPLE} 0%, ${PURPLE} 55%, ${PURPLE_DK} 100%)`,
          padding: '54px 64px',
          fontFamily: 'Inter',
        }}
      >
        {/* hlavička */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: YELLOW }} />
            <div
              style={{
                fontFamily: 'Inter',
                fontWeight: 900,
                fontSize: 34,
                color: '#ffffff',
                letterSpacing: 1.5,
              }}
            >
              MONETICO
            </div>
          </div>
          <MonoPill>{eyebrow}</MonoPill>
        </div>

        {/* telo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48 }}>
          {isArticle ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', maxWidth: photo ? 590 : 1010 }}>
                <div style={{ display: 'flex', width: 96, height: 8, background: YELLOW, marginBottom: 28 }} />
                <div
                  style={{
                    fontFamily: 'Inter',
                    fontWeight: 900,
                    fontSize: titleSize(rawTitle.length, !!photo),
                    color: '#ffffff',
                    lineHeight: 1.05,
                    letterSpacing: -1.5,
                  }}
                >
                  {rawTitle}
                </div>
              </div>
              {photo && (
                <div
                  style={{
                    display: 'flex',
                    width: 430,
                    height: 320,
                    border: `3px solid ${INK}`,
                    borderRadius: 22,
                    boxShadow: `9px 9px 0 ${INK}`,
                    background: CREAM,
                    overflow: 'hidden',
                    transform: 'rotate(2deg)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="" width={430} height={320} style={{ objectFit: 'cover' }} />
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontFamily: 'Inter',
                    fontWeight: 900,
                    fontSize: 112,
                    lineHeight: 1.0,
                    letterSpacing: -4,
                    color: '#ffffff',
                  }}
                >
                  RAST
                </div>
                <div
                  style={{
                    fontFamily: 'Inter',
                    fontWeight: 900,
                    fontSize: 112,
                    lineHeight: 1.0,
                    letterSpacing: -4,
                    color: 'rgba(255,255,255,0.38)',
                  }}
                >
                  ONLINE.
                </div>
                <div
                  style={{
                    fontFamily: 'Inter',
                    fontWeight: 900,
                    fontSize: 112,
                    lineHeight: 1.0,
                    letterSpacing: -4,
                    color: YELLOW,
                  }}
                >
                  TERAZ.
                </div>
              </div>
              <ResultsCard />
            </>
          )}
        </div>

        {/* pätička */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'Space Mono',
              fontSize: 22,
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            monetico.sk
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {SERVICES.map((s, i) => {
              const active = i === activeService
              return (
                <div
                  key={s}
                  style={{
                    display: 'flex',
                    fontFamily: 'Space Mono',
                    fontSize: 16,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: active ? INK : 'rgba(255,255,255,0.8)',
                    background: active ? YELLOW : 'transparent',
                    border: `2px solid ${active ? INK : 'rgba(255,255,255,0.28)'}`,
                    borderRadius: 50,
                    padding: '8px 16px',
                  }}
                >
                  {s}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts ? { fonts } : {}),
      headers: {
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  )
}
