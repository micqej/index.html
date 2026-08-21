import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{ flexDirection: 'column', gap: 0, padding: '44px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 20, flexWrap: 'wrap' }}>
        <div className="footer-logo">MONETICO</div>
        <ul className="footer-links">
          <li><Link href="/ochrana-osobnych-udajov/">Ochrana osobných údajov</Link></li>
          <li><Link href="/obchodne-podmienky/">Obchodné podmienky</Link></li>
          <li><Link href="/blog/">Blog</Link></li>
          <li><Link href="/kontakt/">Kontakt</Link></li>
        </ul>
      </div>
      <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 28, paddingTop: 22, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Brandrise s.r.o. · Sokolovská 178/10, 040 11 Košice · DIČ: 2121313865 · IČ DPH: SK2121313865 · Platca DPH
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.5px' }}>
          2022–2026 © Monetico.sk. Všetky práva vyhradené · Vyrobili sme si sami :)
        </div>
      </div>
    </footer>
  )
}
