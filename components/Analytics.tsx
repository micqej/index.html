import { useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * Vlastné meranie návštevnosti (bez cookies, bez cudzích služieb).
 *
 * Udalosti sa zbierajú do fronty a posielajú dávkovo cez sendBeacon —
 * jedno volanie namiesto piatich a nič nezdržuje vykreslenie stránky.
 * Návštevu identifikuje náhodné číslo v sessionStorage, ktoré zaniká
 * zatvorením karty, takže netreba súhlas s cookies.
 */

type Kind = 'view' | 'read' | 'cta' | 'form_open' | 'tel' | 'mail'

const KEY_SID = 'mn_sid'
const KEY_ENTRY = 'mn_entry'
const KEY_PREV = 'mn_prev'

function ss(key: string): string {
  try { return sessionStorage.getItem(key) || '' } catch { return '' }
}
function ssSet(key: string, val: string): void {
  try { sessionStorage.setItem(key, val) } catch { /* súkromné okno — nevadí */ }
}

/** Id návštevy — náhodné, nikam sa nepárujú osobné údaje. */
export function sessionId(): string {
  let sid = ss(KEY_SID)
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    ssSet(KEY_SID, sid)
  }
  return sid
}

/** Vstupná stránka návštevy a posledná stránka pred formulárom — pre priradenie dopytu. */
export function attribution(): { sid: string; entry: string; prev: string } {
  return { sid: sessionId(), entry: ss(KEY_ENTRY), prev: ss(KEY_PREV) }
}

let queue: { kind: Kind; path: string; meta?: any }[] = []
let timer: any = null

function flush(useBeacon = false): void {
  if (!queue.length) return
  const payload = JSON.stringify({
    sid: sessionId(),
    ref: document.referrer || '',
    url: location.href,
    events: queue,
  })
  queue = []
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/t/', new Blob([payload], { type: 'application/json' }))
    } else {
      fetch('/api/t/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
    }
  } catch { /* meranie nikdy nesmie spadnúť nahlas */ }
}

function track(kind: Kind, path: string, meta?: any): void {
  queue.push({ kind, path, meta })
  clearTimeout(timer)
  timer = setTimeout(() => flush(false), 2500)
}

export default function Analytics() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (location.pathname.startsWith('/admin')) return

    let path = location.pathname
    let seenAt = Date.now()
    let readSent = false
    if (!ss(KEY_ENTRY)) ssSet(KEY_ENTRY, path)

    const pageview = (p: string) => {
      // predchádzajúca stránka sa pamätá pre priradenie dopytu ku článku
      if (!p.startsWith('/kontakt')) ssSet(KEY_PREV, p)
      path = p; seenAt = Date.now(); readSent = false
      track('view', p)
    }
    pageview(path)

    // „Prečítal“ = viac než polovica stránky a aspoň 15 sekúnd na nej.
    const onScroll = () => {
      if (readSent) return
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      const pct = max > 0 ? (h.scrollTop / max) : 1
      if (pct >= 0.5 && Date.now() - seenAt > 15000) { readSent = true; track('read', path) }
    }

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a,button') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (href.startsWith('tel:')) return track('tel', path)
      if (href.startsWith('mailto:')) return track('mail', path)
      // klik smerom k obchodu: služby, cenník, kontakt, referencie
      if (/^\/(sluzby|cennik|kontakt|referencie)/.test(href)) {
        track('cta', path, { to: href.split('?')[0] })
      }
    }

    let formOpened = false
    const onFocus = (e: FocusEvent) => {
      if (formOpened) return
      const el = e.target as HTMLElement
      if (!el?.closest?.('form')) return
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        formOpened = true
        track('form_open', path)
      }
    }

    const onHide = () => { onScroll(); flush(true) }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', onFocus, true)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide() })

    const onRoute = (url: string) => { flush(false); formOpened = false; pageview(url.split('?')[0]) }
    router.events.on('routeChangeComplete', onRoute)

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', onFocus, true)
      window.removeEventListener('pagehide', onHide)
      router.events.off('routeChangeComplete', onRoute)
      flush(true)
    }
  }, [router.events])

  return null
}
