import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'

const ODKAZY = [
  { href: '/', text: 'Domov' },
  { href: '/blog/', text: 'Články' },
  { href: '/sluzby/', text: 'Služby' },
  { href: '/kontakt/', text: 'Kontakt' },
]

export default function Nav() {
  const [otvorene, setOtvorene] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const router = useRouter()

  // Po prechode na inú stránku menu zavri, inak ostane visieť nad novým obsahom.
  useEffect(() => {
    const zavri = () => setOtvorene(false)
    router.events.on('routeChangeComplete', zavri)
    return () => router.events.off('routeChangeComplete', zavri)
  }, [router.events])

  // Escape a klik mimo hlavičky. Zámerne BEZ celoobrazovkovej plachty —
  // tá po zavretí chytá kliky na celej stránke.
  useEffect(() => {
    if (!otvorene) return
    const naKlaves = (e: KeyboardEvent) => { if (e.key === 'Escape') setOtvorene(false) }
    const naKlik = (e: PointerEvent) => {
      if (nav.current && !nav.current.contains(e.target as Node)) setOtvorene(false)
    }
    document.addEventListener('keydown', naKlaves)
    document.addEventListener('pointerdown', naKlik)
    return () => {
      document.removeEventListener('keydown', naKlaves)
      document.removeEventListener('pointerdown', naKlik)
    }
  }, [otvorene])

  return (
    <nav className="nav" ref={nav}>
      <Link href="/" className="nav-logo">MONETICO</Link>

      <ul className="nav-links">
        <li><Link href="/">Domov</Link></li>
        <li><Link href="/blog/">Články</Link></li>
        <li><Link href="/sluzby/">Služby</Link></li>
        <li><Link href="/kontakt/" className="nav-cta">Kontakt →</Link></li>
      </ul>

      <button
        type="button"
        className="nav-burger"
        aria-label={otvorene ? 'Zavrieť menu' : 'Otvoriť menu'}
        aria-expanded={otvorene}
        aria-controls="mobilne-menu"
        onClick={() => setOtvorene(v => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          {otvorene ? (
            <>
              <line x1="4.5" y1="4.5" x2="15.5" y2="15.5" />
              <line x1="15.5" y1="4.5" x2="4.5" y2="15.5" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="17" y2="6" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14" x2="17" y2="14" />
            </>
          )}
        </svg>
      </button>

      <div id="mobilne-menu" className={otvorene ? 'mobile-menu is-open' : 'mobile-menu'}>
        {ODKAZY.map(o => (
          <Link key={o.href} href={o.href} onClick={() => setOtvorene(false)}>{o.text}</Link>
        ))}
      </div>
    </nav>
  )
}
