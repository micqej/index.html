import { useState } from 'react'
import Nav from '../../components/Nav'
import Footer from '../../components/Footer'
import SEO from '../../components/SEO'
import { SparkIcon } from '../../components/Icons'
import { SITE_URL } from '../../lib/site'
import { attribution } from '../../components/Analytics'

const SERVICES = [
  'Cold Email Kampane',
  'SEO Optimalizácia',
  'Sociálne Médiá (Facebook/Instagram)',
  'Email Marketing',
  'Tvorba WordPress webu',
  'Tvorba Shoptet e-shopu',
  'Google Ads',
  'Facebook & Instagram Ads',
  'Nahadzovanie produktov',
  'Komplexný Growth',
]

export default function Kontakt() {
  const [selected, setSelected] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '', website: '' })
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const toggle = (s: string) => {
    setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function submit(e: any) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // priradenie dopytu k obsahu: z ktorej stránky človek prišiel na formulár
        body: JSON.stringify({ ...f, services: selected, ...attribution() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Nepodarilo sa odoslať. Skúste to znova.')
      setSent(true)
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <>
      <SEO
        title="Kontakt"
        description="Kontaktujte Monetico agentúru. Nezáväzná konzultácia zdarma. Cold email, SEO, sociálne médiá, tvorba webov na Slovensku."
        canonical={`${SITE_URL}/kontakt/`}
      />
      <Nav />
      <div className="contact-page">
        <div className="section-label">Spojte sa s nami</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(56px,8vw,120px)', letterSpacing: '-5px', lineHeight: '0.9' }}>KONTAKT</h1>
        <div className="contact-grid">
          <div>
            <p style={{ color: 'var(--muted)', marginBottom: '40px', fontSize: '15px', lineHeight: '1.75', maxWidth: '420px' }}>
              Napíšte nám a do 24 hodín sa ozveme. Prvá konzultácia je vždy zadarmo — bez záväzkov.
            </p>
            {sent ? (
              <div style={{ background: 'var(--y)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: 'var(--sh)', padding: '32px', maxWidth: '500px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '24px', color: 'var(--black)', letterSpacing: '-1px', marginBottom: '10px' }}>Správa odoslaná! ✓</h3>
                <p style={{ color: 'rgba(10,10,10,0.7)', fontSize: '14px' }}>Ozveme sa vám do 24 hodín.</p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={submit}>
                <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                <div className="form-group">
                  <label className="form-label">Meno a priezvisko *</label>
                  <input className="form-input" type="text" placeholder="Ján Novák" required value={f.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" placeholder="jan@firma.sk" required value={f.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefón</label>
                  <input className="form-input" type="tel" placeholder="+421 900 000 000" value={f.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">O čo máte záujem? (môžete vybrať viac)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {SERVICES.map(s => (
                      <label key={s} onClick={() => toggle(s)} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '11px 14px', border: `1px solid ${selected.includes(s) ? 'var(--acid)' : 'var(--border)'}`, background: selected.includes(s) ? 'var(--purple-lt)' : 'transparent', transition: 'all 0.2s', fontSize: '14px', color: selected.includes(s) ? 'var(--ink)' : 'var(--muted)' }}>
                        <span style={{ width: '18px', height: '18px', border: `2px solid ${selected.includes(s) ? 'var(--acid)' : 'var(--faint)'}`, background: selected.includes(s) ? 'var(--acid)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', color: 'var(--black)', fontWeight: 700, transition: 'all 0.2s' }}>
                          {selected.includes(s) ? '✓' : ''}
                        </span>
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Správa</label>
                  <textarea className="form-textarea" placeholder="Popíšte váš projekt alebo otázku..." value={f.message} onChange={e => set('message', e.target.value)} />
                </div>
                {err && <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{err}</div>}
                <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: 'flex-start', marginTop: '8px', opacity: busy ? 0.6 : 1 }}>{busy ? 'Odosielam…' : 'Odoslať správu →'}</button>
              </form>
            )}
          </div>
          <div>
            <div style={{ background: 'var(--purple)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: 'var(--sh)', padding: '28px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--y)', marginBottom: '16px' }}>Kontakt</div>
              <a href="mailto:info@monetico.sk" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '21px', letterSpacing: '-0.5px', display: 'block', marginBottom: '10px', color: '#fff' }}>info@monetico.sk</a>
              <a href="tel:+421908804366" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '21px', letterSpacing: '-0.5px', display: 'block', color: 'var(--y)' }}>+421 908 804 366</a>
            </div>
            <div style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: 'var(--sh)', padding: '28px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '16px' }}>Fakturačné údaje</div>
              {[['Spoločnosť','Brandrise s.r.o.'],['Adresa','Sokolovská 178/10, 040 11 Košice'],['IČO','53196449'],['DIČ','2121313865'],['IČ DPH','SK2121313865'],['Platca DPH','Áno']].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', gap: '16px', fontSize: '14px', lineHeight: '1.9' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--muted)', textTransform: 'uppercase', minWidth: '80px', paddingTop: '3px' }}>{k}</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--y)', border: '2px solid var(--ink)', borderRadius: '18px', boxShadow: 'var(--sh)', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--ink)', marginBottom: '16px' }}><SparkIcon size={14} /> Naše služby</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['Cold Email','SEO','Sociálne Médiá','Email Marketing','WordPress','Shoptet','Google & FB Ads'].map(s => (
                  <span key={s} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink)', background: 'var(--white)', border: '2px solid var(--ink)', padding: '7px 12px', borderRadius: '50px' }}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
